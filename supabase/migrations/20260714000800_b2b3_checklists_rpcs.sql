-- Batch B2/B3 (checklists cluster) — lock 6 fully-public tables behind gated RPCs:
--   checklist_categories / checklist_items / user_checklist_progress  (host: opening/closing/
--   running_side_work) and their bartender_* / user_bartender_* twins. All 4 policies on each
--   were TO public USING(true) (names lie). The two families are structurally identical, so ONE
--   set of 8 RPCs serves both via a p_bartender discriminator (the table names it selects are
--   hardcoded literals, never client input — the dynamic SQL is injection-safe). Org is ALWAYS
--   derived from the actor. SECURITY DEFINER, search_path pinned, EXECUTE to anon+authenticated.
--   Reads: get_checklist_categories/items (member), get_my_checklist_progress (self).
--   Writes: set_checklist_progress (self upsert/delete), upsert/delete_checklist_category and
--   upsert/delete_checklist_item (manager/owner; deletes are SOFT is_active=false, matching the
--   old client). display_order is computed server-side (was a client max()+1, race-prone).

-- ── READS ────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_checklist_categories(
  p_actor_id uuid, p_bartender boolean, p_checklist_type text DEFAULT NULL)
RETURNS TABLE(id uuid, name text, display_order integer, checklist_type text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_org uuid; v_tbl text;
BEGIN
  SELECT u.organization_id INTO v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL THEN RETURN; END IF;
  v_tbl := CASE WHEN p_bartender THEN 'bartender_checklist_categories' ELSE 'checklist_categories' END;
  RETURN QUERY EXECUTE format(
    'SELECT c.id, c.name, c.display_order, c.checklist_type FROM public.%I c
      WHERE c.organization_id = $1 AND c.is_active = true
        AND ($2 IS NULL OR c.checklist_type = $2)
      ORDER BY c.display_order', v_tbl)
    USING v_org, p_checklist_type;
END; $function$;

CREATE OR REPLACE FUNCTION public.get_checklist_items(
  p_actor_id uuid, p_bartender boolean, p_checklist_type text DEFAULT NULL)
RETURNS TABLE(id uuid, category_id uuid, text text, display_order integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_org uuid; v_item_tbl text; v_cat_tbl text;
BEGIN
  SELECT u.organization_id INTO v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL THEN RETURN; END IF;
  v_item_tbl := CASE WHEN p_bartender THEN 'bartender_checklist_items'      ELSE 'checklist_items'      END;
  v_cat_tbl  := CASE WHEN p_bartender THEN 'bartender_checklist_categories' ELSE 'checklist_categories' END;
  RETURN QUERY EXECUTE format(
    'SELECT i.id, i.category_id, i.text, i.display_order FROM public.%I i
      WHERE i.organization_id = $1 AND i.is_active = true
        AND ($2 IS NULL OR EXISTS (
              SELECT 1 FROM public.%I c WHERE c.id = i.category_id AND c.checklist_type = $2))
      ORDER BY i.display_order', v_item_tbl, v_cat_tbl)
    USING v_org, p_checklist_type;
END; $function$;

CREATE OR REPLACE FUNCTION public.get_my_checklist_progress(
  p_actor_id uuid, p_bartender boolean, p_date date)
RETURNS TABLE(checklist_item_id uuid, completed boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_tbl text;
BEGIN
  IF p_actor_id IS NULL THEN RETURN; END IF;
  v_tbl := CASE WHEN p_bartender THEN 'user_bartender_checklist_progress' ELSE 'user_checklist_progress' END;
  RETURN QUERY EXECUTE format(
    'SELECT p.checklist_item_id, p.completed FROM public.%I p
      WHERE p.user_id = $1 AND p.completed_date = $2', v_tbl)
    USING p_actor_id, p_date;
END; $function$;

-- ── PROGRESS WRITE (self) ──────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_checklist_progress(
  p_actor_id uuid, p_bartender boolean, p_item_id uuid, p_completed boolean, p_date date)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_org uuid; v_prog_tbl text; v_item_tbl text; v_ok boolean;
BEGIN
  SELECT u.organization_id INTO v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Unknown user'; END IF;
  v_prog_tbl := CASE WHEN p_bartender THEN 'user_bartender_checklist_progress' ELSE 'user_checklist_progress' END;
  v_item_tbl := CASE WHEN p_bartender THEN 'bartender_checklist_items'         ELSE 'checklist_items'         END;

  -- The item must belong to the actor's org (blocks progress on another tenant's item).
  EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I i WHERE i.id = $1 AND i.organization_id = $2)', v_item_tbl)
    INTO v_ok USING p_item_id, v_org;
  IF NOT v_ok THEN RAISE EXCEPTION 'Checklist item not found'; END IF;

  IF p_completed THEN
    EXECUTE format(
      'INSERT INTO public.%I (user_id, checklist_item_id, completed, completed_date, organization_id)
         VALUES ($1, $2, true, $3, $4)
       ON CONFLICT (user_id, checklist_item_id, completed_date)
         DO UPDATE SET completed = true, updated_at = now()', v_prog_tbl)
      USING p_actor_id, p_item_id, p_date, v_org;
  ELSE
    EXECUTE format(
      'DELETE FROM public.%I WHERE user_id = $1 AND checklist_item_id = $2 AND completed_date = $3', v_prog_tbl)
      USING p_actor_id, p_item_id, p_date;
  END IF;
END; $function$;

-- ── CATEGORY WRITES (manager) ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.upsert_checklist_category(
  p_actor_id uuid, p_bartender boolean, p_checklist_type text, p_name text, p_category_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_role text; v_org uuid; v_tbl text; v_max int; v_id uuid;
BEGIN
  SELECT u.role, u.organization_id INTO v_role, v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_role IS NULL OR v_role NOT IN ('manager','owner') THEN
    RAISE EXCEPTION 'Only managers or owners can edit checklists';
  END IF;
  IF btrim(COALESCE(p_name, '')) = '' THEN RAISE EXCEPTION 'Category name is required'; END IF;
  v_tbl := CASE WHEN p_bartender THEN 'bartender_checklist_categories' ELSE 'checklist_categories' END;

  IF p_category_id IS NULL THEN
    IF btrim(COALESCE(p_checklist_type, '')) = '' THEN RAISE EXCEPTION 'Checklist type is required'; END IF;
    EXECUTE format('SELECT COALESCE(max(display_order),0) FROM public.%I WHERE organization_id=$1 AND checklist_type=$2', v_tbl)
      INTO v_max USING v_org, p_checklist_type;
    EXECUTE format(
      'INSERT INTO public.%I (checklist_type, name, display_order, organization_id, is_active)
         VALUES ($1, $2, $3, $4, true) RETURNING id', v_tbl)
      INTO v_id USING p_checklist_type, btrim(p_name), v_max + 1, v_org;
  ELSE
    EXECUTE format('UPDATE public.%I SET name=$1, updated_at=now() WHERE id=$2 AND organization_id=$3 RETURNING id', v_tbl)
      INTO v_id USING btrim(p_name), p_category_id, v_org;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Category not found'; END IF;
  END IF;
  RETURN v_id;
END; $function$;

CREATE OR REPLACE FUNCTION public.delete_checklist_category(
  p_actor_id uuid, p_bartender boolean, p_category_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_role text; v_org uuid; v_tbl text; v_id uuid;
BEGIN
  SELECT u.role, u.organization_id INTO v_role, v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_role IS NULL OR v_role NOT IN ('manager','owner') THEN
    RAISE EXCEPTION 'Only managers or owners can edit checklists';
  END IF;
  v_tbl := CASE WHEN p_bartender THEN 'bartender_checklist_categories' ELSE 'checklist_categories' END;
  -- Soft delete (matches the old client); child items are left as-is (they stop rendering
  -- because the viewer only shows items under an active category).
  EXECUTE format('UPDATE public.%I SET is_active=false, updated_at=now() WHERE id=$1 AND organization_id=$2 RETURNING id', v_tbl)
    INTO v_id USING p_category_id, v_org;
  IF v_id IS NULL THEN RAISE EXCEPTION 'Category not found'; END IF;
  RETURN TRUE;
END; $function$;

-- ── ITEM WRITES (manager) ──────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.upsert_checklist_item(
  p_actor_id uuid, p_bartender boolean, p_category_id uuid, p_text text, p_item_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_role text; v_org uuid; v_item_tbl text; v_cat_tbl text; v_max int; v_id uuid; v_cat_ok boolean;
BEGIN
  SELECT u.role, u.organization_id INTO v_role, v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_role IS NULL OR v_role NOT IN ('manager','owner') THEN
    RAISE EXCEPTION 'Only managers or owners can edit checklists';
  END IF;
  IF btrim(COALESCE(p_text, '')) = '' THEN RAISE EXCEPTION 'Item text is required'; END IF;
  v_item_tbl := CASE WHEN p_bartender THEN 'bartender_checklist_items'      ELSE 'checklist_items'      END;
  v_cat_tbl  := CASE WHEN p_bartender THEN 'bartender_checklist_categories' ELSE 'checklist_categories' END;

  -- Target category must belong to the actor's org.
  EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I c WHERE c.id=$1 AND c.organization_id=$2)', v_cat_tbl)
    INTO v_cat_ok USING p_category_id, v_org;
  IF NOT v_cat_ok THEN RAISE EXCEPTION 'Category not found'; END IF;

  IF p_item_id IS NULL THEN
    EXECUTE format('SELECT COALESCE(max(display_order),0) FROM public.%I WHERE category_id=$1', v_item_tbl)
      INTO v_max USING p_category_id;
    EXECUTE format(
      'INSERT INTO public.%I (category_id, text, display_order, organization_id, is_active)
         VALUES ($1, $2, $3, $4, true) RETURNING id', v_item_tbl)
      INTO v_id USING p_category_id, btrim(p_text), v_max + 1, v_org;
  ELSE
    EXECUTE format('UPDATE public.%I SET text=$1, category_id=$2, updated_at=now() WHERE id=$3 AND organization_id=$4 RETURNING id', v_item_tbl)
      INTO v_id USING btrim(p_text), p_category_id, p_item_id, v_org;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Item not found'; END IF;
  END IF;
  RETURN v_id;
END; $function$;

CREATE OR REPLACE FUNCTION public.delete_checklist_item(
  p_actor_id uuid, p_bartender boolean, p_item_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_role text; v_org uuid; v_tbl text; v_id uuid;
BEGIN
  SELECT u.role, u.organization_id INTO v_role, v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_role IS NULL OR v_role NOT IN ('manager','owner') THEN
    RAISE EXCEPTION 'Only managers or owners can edit checklists';
  END IF;
  v_tbl := CASE WHEN p_bartender THEN 'bartender_checklist_items' ELSE 'checklist_items' END;
  EXECUTE format('UPDATE public.%I SET is_active=false, updated_at=now() WHERE id=$1 AND organization_id=$2 RETURNING id', v_tbl)
    INTO v_id USING p_item_id, v_org;
  IF v_id IS NULL THEN RAISE EXCEPTION 'Item not found'; END IF;
  RETURN TRUE;
END; $function$;

GRANT EXECUTE ON FUNCTION public.get_checklist_categories(uuid, boolean, text)              TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_checklist_items(uuid, boolean, text)                   TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_checklist_progress(uuid, boolean, date)             TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_checklist_progress(uuid, boolean, uuid, boolean, date) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_checklist_category(uuid, boolean, text, text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_checklist_category(uuid, boolean, uuid)             TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_checklist_item(uuid, boolean, uuid, text, uuid)     TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_checklist_item(uuid, boolean, uuid)                 TO anon, authenticated;
