-- s66: per-org Guides & Training categories — hideable, reorderable, translatable.
--
-- WHY A TABLE: `guides_and_training.category` is a plain text column with no
-- categories table, and `organizations` has no jsonb blob, so category ORDER and
-- VISIBILITY had nowhere to live. Custom categories were session-scoped for the
-- same reason. This fixes both.
--
-- MODELLED ON `menu_categories`, deliberately: same `system_key` /
-- `display_order` / `is_hidden` / `_es` shape, so the manage screen, the RPC
-- family and the mental model all match what already ships for menus.
--
-- ⚠️ `guides_and_training.category` STAYS a text column holding the NAME. A
-- rename therefore has to cascade, which manage_guide_category_rename does in a
-- single statement pair. Converting guides to a category_id FK would mean
-- backfilling live rows and rewriting every read/write path — far more risk for
-- no user-visible gain.

-- ── Table ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.guide_categories (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name            text NOT NULL,
  name_es         text,
  -- Non-null marks a built-in: hideable, renameable, but NEVER deletable.
  system_key      text,
  display_order   integer NOT NULL DEFAULT 0,
  is_hidden       boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Case-insensitive uniqueness: the name IS the join key to
-- guides_and_training.category, and 'Cheat Sheets' / 'cheat sheets' must not
-- both exist or the counts split.
CREATE UNIQUE INDEX IF NOT EXISTS guide_categories_org_lname_key
  ON public.guide_categories (organization_id, lower(name));
CREATE UNIQUE INDEX IF NOT EXISTS guide_categories_org_systemkey_key
  ON public.guide_categories (organization_id, system_key) WHERE system_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS guide_categories_org_order_idx
  ON public.guide_categories (organization_id, display_order);

-- Same posture as guides_and_training / menu_categories: RLS on, no permissive
-- policies, so the table is reachable only through the SECURITY DEFINER RPCs
-- below (auth.uid() is always NULL under this app's custom auth).
ALTER TABLE public.guide_categories ENABLE ROW LEVEL SECURITY;

-- ── Seed ─────────────────────────────────────────────────────────────────────
-- The 4 shipped defaults (as built-ins), then ADOPT any category already present
-- in this org's guides so nothing existing is orphaned.
CREATE OR REPLACE FUNCTION public.seed_org_guide_categories(p_org_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.guide_categories (organization_id, name, system_key, display_order)
  VALUES
    (p_org_id, 'Employee HandBooks', 'gcat.employee_handbooks', 0),
    (p_org_id, 'Full Menus',         'gcat.full_menus',         1),
    (p_org_id, 'Cheat Sheets',       'gcat.cheat_sheets',       2),
    (p_org_id, 'Events Flyers',      'gcat.events_flyers',      3)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.guide_categories (organization_id, name, display_order)
  SELECT p_org_id, d.category, 3 + row_number() OVER (ORDER BY d.category)
  FROM (
    SELECT DISTINCT g.category
    FROM public.guides_and_training g
    WHERE g.organization_id = p_org_id
      AND g.category IS NOT NULL AND btrim(g.category) <> ''
  ) d
  WHERE NOT EXISTS (
    SELECT 1 FROM public.guide_categories c
    WHERE c.organization_id = p_org_id AND lower(c.name) = lower(d.category)
  )
  ON CONFLICT DO NOTHING;
END $$;

-- ── Read ─────────────────────────────────────────────────────────────────────
-- Lazy-seeds on first read, so every org (including ones created later by
-- signup_owner_with_org) gets the starter kit without coupling this to the
-- signup path. Idempotent.
CREATE OR REPLACE FUNCTION public.get_guide_categories(
  p_actor_id uuid,
  p_include_hidden boolean DEFAULT false
)
RETURNS TABLE (
  id uuid, name text, name_es text, system_key text,
  display_order integer, is_hidden boolean
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org uuid;
BEGIN
  SELECT u.organization_id INTO v_org
  FROM public.users u
  WHERE u.id = p_actor_id AND u.is_active IS DISTINCT FROM false;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Not authorized'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.guide_categories c WHERE c.organization_id = v_org) THEN
    PERFORM public.seed_org_guide_categories(v_org);
  END IF;

  RETURN QUERY
  SELECT c.id, c.name, c.name_es, c.system_key, c.display_order, c.is_hidden
  FROM public.guide_categories c
  WHERE c.organization_id = v_org
    AND (p_include_hidden OR NOT c.is_hidden)
  ORDER BY c.display_order, c.name;
END $$;

-- ── Manage (manager/owner only, via the shared gate) ─────────────────────────
CREATE OR REPLACE FUNCTION public.manage_guide_category_create(p_actor_id uuid, p_name text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org uuid; v_id uuid; v_name text;
BEGIN
  v_org := public._require_content_manager(p_actor_id);
  v_name := btrim(p_name);
  IF v_name = '' THEN RAISE EXCEPTION 'Category name required'; END IF;
  IF EXISTS (SELECT 1 FROM public.guide_categories c
             WHERE c.organization_id = v_org AND lower(c.name) = lower(v_name)) THEN
    RAISE EXCEPTION 'Category already exists';
  END IF;
  INSERT INTO public.guide_categories (organization_id, name, display_order)
  VALUES (v_org, v_name,
          COALESCE((SELECT max(c.display_order) + 1 FROM public.guide_categories c
                    WHERE c.organization_id = v_org), 0))
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- Renaming cascades to the guides, because their `category` column stores the
-- NAME. Both statements run in the function's single implicit transaction, so a
-- failure cannot leave guides pointing at a category that no longer exists.
CREATE OR REPLACE FUNCTION public.manage_guide_category_rename(
  p_actor_id uuid, p_id uuid, p_new_name text
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org uuid; v_old text; v_new text;
BEGIN
  v_org := public._require_content_manager(p_actor_id);
  v_new := btrim(p_new_name);
  IF v_new = '' THEN RAISE EXCEPTION 'Category name required'; END IF;

  SELECT c.name INTO v_old FROM public.guide_categories c
  WHERE c.id = p_id AND c.organization_id = v_org;
  IF v_old IS NULL THEN RAISE EXCEPTION 'Not found in your organization'; END IF;
  IF v_old = v_new THEN RETURN; END IF;

  IF EXISTS (SELECT 1 FROM public.guide_categories c
             WHERE c.organization_id = v_org AND lower(c.name) = lower(v_new) AND c.id <> p_id) THEN
    RAISE EXCEPTION 'Category already exists';
  END IF;

  UPDATE public.guide_categories
     SET name = v_new, updated_at = now()
   WHERE id = p_id AND organization_id = v_org;

  UPDATE public.guides_and_training
     SET category = v_new, updated_at = now()
   WHERE organization_id = v_org AND lower(category) = lower(v_old);
END $$;

-- Built-ins can never be deleted (Boathouse's guides live in them); a custom
-- category can go only once it is empty, so no guide is ever orphaned.
CREATE OR REPLACE FUNCTION public.manage_guide_category_delete(p_actor_id uuid, p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org uuid; v_name text; v_sys text; v_n integer;
BEGIN
  v_org := public._require_content_manager(p_actor_id);
  SELECT c.name, c.system_key INTO v_name, v_sys FROM public.guide_categories c
  WHERE c.id = p_id AND c.organization_id = v_org;
  IF v_name IS NULL THEN RAISE EXCEPTION 'Not found in your organization'; END IF;
  -- ⚠️ This string is MATCHED BY THE CLIENT to show a localized message
  -- (guides-and-training-editor.tsx maps it to `builtin_locked`). Reworded it
  -- and a Spanish manager gets raw English. Kept byte-identical to what is
  -- deployed — an earlier version of this file drifted from live by a trailing
  -- "— hide it instead", which would have re-introduced exactly that.
  IF v_sys IS NOT NULL THEN RAISE EXCEPTION 'Built-in categories cannot be deleted'; END IF;

  SELECT count(*) INTO v_n FROM public.guides_and_training g
  WHERE g.organization_id = v_org AND lower(g.category) = lower(v_name);
  IF v_n > 0 THEN RAISE EXCEPTION 'Category still has guides'; END IF;

  DELETE FROM public.guide_categories WHERE id = p_id AND organization_id = v_org;
END $$;

CREATE OR REPLACE FUNCTION public.manage_guide_category_reorder(
  p_actor_id uuid, p_ordered_ids uuid[]
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org uuid;
BEGIN
  v_org := public._require_content_manager(p_actor_id);
  UPDATE public.guide_categories c
     SET display_order = x.ord - 1, updated_at = now()
    FROM unnest(p_ordered_ids) WITH ORDINALITY AS x(cid, ord)
   WHERE c.id = x.cid AND c.organization_id = v_org;
END $$;

CREATE OR REPLACE FUNCTION public.manage_guide_category_set_hidden(
  p_actor_id uuid, p_id uuid, p_is_hidden boolean
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org uuid;
BEGIN
  v_org := public._require_content_manager(p_actor_id);
  UPDATE public.guide_categories
     SET is_hidden = p_is_hidden, updated_at = now()
   WHERE id = p_id AND organization_id = v_org;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not found in your organization'; END IF;
END $$;

-- Matches the update_*_translations_actor family: COALESCE-keeps a NULL so a
-- caller that omits the field leaves it alone, while '' is a deliberate clear.
CREATE OR REPLACE FUNCTION public.update_guide_category_translations_actor(
  p_actor_id uuid, p_id uuid, p_name_es text
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org uuid;
BEGIN
  v_org := public._require_content_manager(p_actor_id);
  UPDATE public.guide_categories
     SET name_es = COALESCE(p_name_es, name_es), updated_at = now()
   WHERE id = p_id AND organization_id = v_org;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not found in your organization'; END IF;
END $$;

-- Backfill every existing org up front, so nothing waits on a first read.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.organizations LOOP
    PERFORM public.seed_org_guide_categories(r.id);
  END LOOP;
END $$;
