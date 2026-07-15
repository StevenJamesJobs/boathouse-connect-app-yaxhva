-- Batch B2/B3 (recipes sub-cluster) — lock the recipe READS (the remaining hole) + the one
-- recipe table whose writes were still direct (wine_pairings). All 6 recipe tables' SELECT
-- policies were `is_active=true` with NO org filter, so the anon key could read ANY org's active
-- recipes. Writes for cocktails/libation/summer_libation/puree_syrup were already routed through
-- gated RPCs (insert/update/delete/reorder_*); only wine_pairings (edited via memory-game-editor)
-- and signature_recipes (no client access at all) remained. signature_recipes needs no RPC — its
-- policies just drop at teardown.
--
-- READ RPCs are member-gated and org-scoped, BUT accept an optional p_source_org so the games'
-- "use sample data" feature keeps working: an org with games_use_sample_data=true pulls recipe
-- content cross-org from the ONE designated public sample org (slug 'mcloones-boathouse'). The
-- RPC allows p_source_org ONLY when it is the actor's own org or that sample org — any other
-- value falls back to the actor's org, so arbitrary cross-org enumeration is blocked while the
-- intended shared-template read is preserved. Recipe content is non-sensitive template data.
--
-- All new fns SECURITY DEFINER + search_path pinned. Existing recipe write RPCs get search_path
-- pins here too (advisory hygiene). NOTE for B5: those existing write RPCs take p_organization_id
-- without verifying it equals the actor's org — a manager could write cross-org; harden later.

-- Resolve the effective, allowed source org for a recipe read.
CREATE OR REPLACE FUNCTION public._recipe_source_org(p_actor_id uuid, p_source_org uuid)
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_actor_org uuid; v_sample_org uuid;
BEGIN
  SELECT u.organization_id INTO v_actor_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_actor_org IS NULL THEN RETURN NULL; END IF;
  IF p_source_org IS NULL OR p_source_org = v_actor_org THEN RETURN v_actor_org; END IF;
  SELECT o.id INTO v_sample_org FROM public.organizations o WHERE o.slug = 'mcloones-boathouse';
  IF p_source_org = v_sample_org THEN RETURN p_source_org; END IF;
  RETURN v_actor_org;  -- arbitrary cross-org request → fall back to own org
END; $function$;

CREATE OR REPLACE FUNCTION public.get_cocktails(p_actor_id uuid, p_source_org uuid DEFAULT NULL)
RETURNS TABLE(
  id uuid, name text, alcohol_type text, ingredients text, procedure text, procedure_es text,
  thumbnail_url text, display_order integer, glassware text, garnish text, is_active boolean,
  organization_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_src uuid;
BEGIN
  v_src := public._recipe_source_org(p_actor_id, p_source_org);
  IF v_src IS NULL THEN RETURN; END IF;
  RETURN QUERY
    SELECT c.id, c.name, c.alcohol_type, c.ingredients, c.procedure, c.procedure_es,
           c.thumbnail_url, c.display_order, c.glassware, c.garnish, c.is_active, c.organization_id
      FROM public.cocktails c
     WHERE c.organization_id = v_src AND c.is_active = true
     ORDER BY c.display_order;
END; $function$;

CREATE OR REPLACE FUNCTION public.get_libation_recipes(p_actor_id uuid, p_source_org uuid DEFAULT NULL)
RETURNS TABLE(
  id uuid, name text, price text, category text, glassware text, garnish text, ingredients jsonb,
  procedure text, procedure_es text, thumbnail_url text, display_order integer,
  subcategory_id uuid, is_featured boolean, is_active boolean, organization_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_src uuid;
BEGIN
  v_src := public._recipe_source_org(p_actor_id, p_source_org);
  IF v_src IS NULL THEN RETURN; END IF;
  RETURN QUERY
    SELECT r.id, r.name, r.price, r.category, r.glassware, r.garnish, r.ingredients, r.procedure,
           r.procedure_es, r.thumbnail_url, r.display_order, r.subcategory_id, r.is_featured,
           r.is_active, r.organization_id
      FROM public.libation_recipes r
     WHERE r.organization_id = v_src AND r.is_active = true
     ORDER BY r.category, r.display_order;
END; $function$;

CREATE OR REPLACE FUNCTION public.get_summer_libation_recipes(p_actor_id uuid, p_source_org uuid DEFAULT NULL)
RETURNS TABLE(
  id uuid, name text, price text, category text, glassware text, garnish text, ingredients jsonb,
  procedure text, procedure_es text, thumbnail_url text, display_order integer,
  subcategory_id uuid, is_featured boolean, is_active boolean, organization_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_src uuid;
BEGIN
  v_src := public._recipe_source_org(p_actor_id, p_source_org);
  IF v_src IS NULL THEN RETURN; END IF;
  RETURN QUERY
    SELECT r.id, r.name, r.price, r.category, r.glassware, r.garnish, r.ingredients, r.procedure,
           r.procedure_es, r.thumbnail_url, r.display_order, r.subcategory_id, r.is_featured,
           r.is_active, r.organization_id
      FROM public.summer_libation_recipes r
     WHERE r.organization_id = v_src AND r.is_active = true
     ORDER BY r.category, r.display_order;
END; $function$;

CREATE OR REPLACE FUNCTION public.get_puree_syrup_recipes(p_actor_id uuid, p_source_org uuid DEFAULT NULL)
RETURNS TABLE(
  id uuid, name text, category text, ingredients jsonb, procedure text, procedure_es text,
  thumbnail_url text, display_order integer, is_active boolean, organization_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_src uuid;
BEGIN
  v_src := public._recipe_source_org(p_actor_id, p_source_org);
  IF v_src IS NULL THEN RETURN; END IF;
  RETURN QUERY
    SELECT r.id, r.name, r.category, r.ingredients, r.procedure, r.procedure_es,
           r.thumbnail_url, r.display_order, r.is_active, r.organization_id
      FROM public.puree_syrup_recipes r
     WHERE r.organization_id = v_src AND r.is_active = true
     ORDER BY r.display_order;
END; $function$;

CREATE OR REPLACE FUNCTION public.get_wine_pairings(p_actor_id uuid, p_source_org uuid DEFAULT NULL)
RETURNS TABLE(
  id uuid, wine text, entree text, hint text, display_order integer, is_active boolean,
  organization_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_src uuid;
BEGIN
  v_src := public._recipe_source_org(p_actor_id, p_source_org);
  IF v_src IS NULL THEN RETURN; END IF;
  RETURN QUERY
    SELECT w.id, w.wine, w.entree, w.hint, w.display_order, w.is_active, w.organization_id
      FROM public.wine_pairings w
     WHERE w.organization_id = v_src AND w.is_active = true
     ORDER BY w.display_order;
END; $function$;

-- ── wine_pairings WRITES (manager/owner; org derived from actor — the ONE recipe table whose
--    writes were still direct in memory-game-editor). Matches that editor's ops: add/edit/
--    delete(hard)/toggle-active. ──
CREATE OR REPLACE FUNCTION public.insert_wine_pairing(
  p_user_id uuid, p_wine text, p_entree text, p_hint text DEFAULT NULL, p_display_order integer DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_role text; v_org uuid; v_order int; v_id uuid;
BEGIN
  SELECT u.role, u.organization_id INTO v_role, v_org FROM public.users u WHERE u.id = p_user_id;
  IF v_role IS NULL OR v_role NOT IN ('manager','owner') THEN
    RAISE EXCEPTION 'Only managers or owners can edit wine pairings';
  END IF;
  IF btrim(COALESCE(p_wine,'')) = '' OR btrim(COALESCE(p_entree,'')) = '' THEN
    RAISE EXCEPTION 'Wine and entree are required';
  END IF;
  v_order := COALESCE(p_display_order,
    (SELECT COALESCE(max(display_order),0)+1 FROM public.wine_pairings WHERE organization_id = v_org));
  INSERT INTO public.wine_pairings (wine, entree, hint, display_order, is_active, organization_id)
  VALUES (btrim(p_wine), btrim(p_entree), NULLIF(btrim(COALESCE(p_hint,'')),''), v_order, true, v_org)
  RETURNING id INTO v_id;
  RETURN v_id;
END; $function$;

CREATE OR REPLACE FUNCTION public.update_wine_pairing(
  p_user_id uuid, p_pairing_id uuid, p_wine text, p_entree text, p_hint text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_role text; v_org uuid; v_id uuid;
BEGIN
  SELECT u.role, u.organization_id INTO v_role, v_org FROM public.users u WHERE u.id = p_user_id;
  IF v_role IS NULL OR v_role NOT IN ('manager','owner') THEN
    RAISE EXCEPTION 'Only managers or owners can edit wine pairings';
  END IF;
  UPDATE public.wine_pairings
     SET wine = btrim(p_wine), entree = btrim(p_entree), hint = NULLIF(btrim(COALESCE(p_hint,'')),'')
   WHERE id = p_pairing_id AND organization_id = v_org
   RETURNING id INTO v_id;
  IF v_id IS NULL THEN RAISE EXCEPTION 'Wine pairing not found'; END IF;
  RETURN TRUE;
END; $function$;

CREATE OR REPLACE FUNCTION public.delete_wine_pairing(p_user_id uuid, p_pairing_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_role text; v_org uuid; v_n int;
BEGIN
  SELECT u.role, u.organization_id INTO v_role, v_org FROM public.users u WHERE u.id = p_user_id;
  IF v_role IS NULL OR v_role NOT IN ('manager','owner') THEN
    RAISE EXCEPTION 'Only managers or owners can edit wine pairings';
  END IF;
  DELETE FROM public.wine_pairings WHERE id = p_pairing_id AND organization_id = v_org;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN RAISE EXCEPTION 'Wine pairing not found'; END IF;
  RETURN TRUE;
END; $function$;

CREATE OR REPLACE FUNCTION public.set_wine_pairing_active(
  p_user_id uuid, p_pairing_id uuid, p_is_active boolean)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_role text; v_org uuid; v_id uuid;
BEGIN
  SELECT u.role, u.organization_id INTO v_role, v_org FROM public.users u WHERE u.id = p_user_id;
  IF v_role IS NULL OR v_role NOT IN ('manager','owner') THEN
    RAISE EXCEPTION 'Only managers or owners can edit wine pairings';
  END IF;
  UPDATE public.wine_pairings SET is_active = COALESCE(p_is_active, is_active)
   WHERE id = p_pairing_id AND organization_id = v_org
   RETURNING id INTO v_id;
  IF v_id IS NULL THEN RAISE EXCEPTION 'Wine pairing not found'; END IF;
  RETURN TRUE;
END; $function$;

GRANT EXECUTE ON FUNCTION public._recipe_source_org(uuid, uuid)              TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_cocktails(uuid, uuid)                   TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_libation_recipes(uuid, uuid)           TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_summer_libation_recipes(uuid, uuid)    TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_puree_syrup_recipes(uuid, uuid)        TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_wine_pairings(uuid, uuid)              TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.insert_wine_pairing(uuid, text, text, text, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_wine_pairing(uuid, uuid, text, text, text)     TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_wine_pairing(uuid, uuid)            TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_wine_pairing_active(uuid, uuid, boolean) TO anon, authenticated;

-- NOTE: search_path pins on the existing recipe write RPCs (insert/update/delete/reorder_* for
-- cocktails/libation/summer_libation/puree_syrup + their _translations) are deferred to the B8
-- hygiene pass — they need exact per-function signatures and are advisory-only, so they don't
-- belong in this lockdown migration.
