-- s91 part B — the kitchen recipe book.
--
-- Shape (Steve, s91): one recipe row per MENU ITEM (fed once by trigger, never the other
-- way — name / cover / placement follow the Menu Editor and are read-only in the kitchen)
-- plus free-standing recipes in three more sections (prep / desserts / banquets) grouped
-- by org-editable groups seeded per org. Allergens: the four the menu already carries
-- (gluten / dairy / egg / nuts) write BACK to the menu item's free-of flags, and a flag
-- flipped on in the Menu Editor clears the allergen here. Saves are per user; a recipe
-- anyone saved survives its menu item's deletion as an "off the menu" recipe.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Tables
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.kitchen_recipe_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  section text NOT NULL CHECK (section IN ('prep','desserts','banquets')),
  name text NOT NULL,
  name_es text,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX kitchen_recipe_groups_org_section_idx ON public.kitchen_recipe_groups (organization_id, section);

CREATE TABLE public.kitchen_recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  section text NOT NULL CHECK (section IN ('menu','prep','desserts','banquets')),
  menu_item_id uuid REFERENCES public.menu_items(id) ON DELETE SET NULL,
  group_id uuid REFERENCES public.kitchen_recipe_groups(id) ON DELETE SET NULL,
  name text NOT NULL,
  name_es text,
  description text,
  description_es text,
  -- cover: the menu item's photo for menu-fed rows, else images[0]; images = the recipe's own (≤4)
  thumbnail_url text,
  images jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- menu snapshot (synced by trigger while the item lives; frozen once it leaves)
  category text,
  subcategory text,
  season text,
  is_special boolean NOT NULL DEFAULT false,
  menu_active boolean NOT NULL DEFAULT true,
  -- the recipe proper
  yield_text text,
  portions_text text,
  prep_minutes integer,
  cook_minutes integer,
  station text,
  shelf_life text,
  allergens text[] NOT NULL DEFAULT '{}',
  plating_notes text,
  plating_notes_es text,
  ingredients jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{amount, ingredient, prep}]
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,         -- [{title, title_es, text, text_es, images[]}]
  off_menu_at timestamptz,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX kitchen_recipes_item_uq ON public.kitchen_recipes (menu_item_id) WHERE menu_item_id IS NOT NULL;
CREATE INDEX kitchen_recipes_org_section_idx ON public.kitchen_recipes (organization_id, section);

CREATE TABLE public.kitchen_recipe_saves (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  recipe_id uuid NOT NULL REFERENCES public.kitchen_recipes(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, recipe_id)
);
CREATE INDEX kitchen_recipe_saves_recipe_idx ON public.kitchen_recipe_saves (recipe_id);

ALTER TABLE public.kitchen_recipe_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kitchen_recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kitchen_recipe_saves ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Normalizers + helpers (EXECUTE-revoked)
-- ─────────────────────────────────────────────────────────────────────────────
-- Libations and wine never feed the kitchen (the bar has its own books).
CREATE OR REPLACE FUNCTION public._kitchen_item_eligible(p_org uuid, p_category text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'extensions', 'pg_temp' AS $$
  SELECT lower(btrim(COALESCE(p_category, ''))) NOT IN ('libations', 'wine')
     AND NOT EXISTS (
       SELECT 1 FROM public.menu_categories c
        WHERE c.organization_id = p_org
          AND lower(c.display_name) = lower(btrim(COALESCE(p_category, '')))
          AND c.system_key IN ('cat.libations', 'cat.wine'));
$$;
-- ★ = the item's weekly-special flag, or a home in a weekly-specials category.
CREATE OR REPLACE FUNCTION public._kitchen_item_special(p_org uuid, p_category text, p_flag boolean)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'extensions', 'pg_temp' AS $$
  SELECT COALESCE(p_flag, false) OR EXISTS (
    SELECT 1 FROM public.menu_categories c
     WHERE c.organization_id = p_org
       AND lower(c.display_name) = lower(btrim(COALESCE(p_category, '')))
       AND c.filter_behavior = 'weekly_specials');
$$;

CREATE OR REPLACE FUNCTION public._kitchen_allergens_norm(p_allergens jsonb)
RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE(ARRAY(
    SELECT DISTINCT lower(btrim(a)) FROM jsonb_array_elements_text(COALESCE(p_allergens, '[]'::jsonb)) a
     WHERE lower(btrim(a)) IN ('gluten','dairy','egg','tree_nuts','peanuts','soy','fish','shellfish','sesame')), ARRAY[]::text[]);
$$;

CREATE OR REPLACE FUNCTION public._kitchen_ingredients_norm(p_ingredients jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE e jsonb; out jsonb := '[]'::jsonb;
BEGIN
  IF p_ingredients IS NULL THEN RETURN out; END IF;
  IF jsonb_typeof(p_ingredients) <> 'array' THEN RAISE EXCEPTION 'Ingredients must be a list'; END IF;
  FOR e IN SELECT * FROM jsonb_array_elements(p_ingredients) LOOP
    IF jsonb_typeof(e) <> 'object' OR btrim(COALESCE(e->>'ingredient', '')) = '' THEN CONTINUE; END IF;
    out := out || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'amount', NULLIF(left(btrim(COALESCE(e->>'amount', '')), 60), ''),
      'ingredient', left(btrim(e->>'ingredient'), 200),
      'ingredient_es', NULLIF(left(btrim(COALESCE(e->>'ingredient_es', '')), 200), ''),
      'prep', NULLIF(left(btrim(COALESCE(e->>'prep', '')), 200), ''),
      'prep_es', NULLIF(left(btrim(COALESCE(e->>'prep_es', '')), 200), ''))));
  END LOOP;
  IF jsonb_array_length(out) > 120 THEN RAISE EXCEPTION 'Up to 120 ingredients'; END IF;
  RETURN out;
END $$;

CREATE OR REPLACE FUNCTION public._kitchen_steps_norm(p_steps jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE e jsonb; imgs jsonb; out jsonb := '[]'::jsonb;
BEGIN
  IF p_steps IS NULL THEN RETURN out; END IF;
  IF jsonb_typeof(p_steps) <> 'array' THEN RAISE EXCEPTION 'Steps must be a list'; END IF;
  FOR e IN SELECT * FROM jsonb_array_elements(p_steps) LOOP
    IF jsonb_typeof(e) <> 'object' THEN CONTINUE; END IF;
    IF btrim(COALESCE(e->>'title', '')) = '' AND btrim(COALESCE(e->>'text', '')) = '' THEN CONTINUE; END IF;
    SELECT COALESCE(jsonb_agg(t.u ORDER BY t.ord), '[]'::jsonb) INTO imgs
      FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(e->'images') = 'array' THEN e->'images' ELSE '[]'::jsonb END)
           WITH ORDINALITY AS t(u, ord)
     WHERE btrim(t.u) <> '';
    IF jsonb_array_length(imgs) > 4 THEN RAISE EXCEPTION 'Up to 4 photos per step'; END IF;
    out := out || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'title', NULLIF(left(btrim(COALESCE(e->>'title', '')), 120), ''),
      'title_es', NULLIF(left(btrim(COALESCE(e->>'title_es', '')), 120), ''),
      'text', NULLIF(left(btrim(COALESCE(e->>'text', '')), 4000), ''),
      'text_es', NULLIF(left(btrim(COALESCE(e->>'text_es', '')), 4000), ''),
      'minutes', CASE WHEN (e->>'minutes') ~ '^[0-9]{1,4}$' THEN (e->>'minutes')::int ELSE NULL END,
      'images', imgs)));
  END LOOP;
  IF jsonb_array_length(out) > 60 THEN RAISE EXCEPTION 'Up to 60 steps'; END IF;
  RETURN out;
END $$;

-- Every storage URL a recipe owns (its own photos + step photos; never the menu cover).
CREATE OR REPLACE FUNCTION public._kitchen_recipe_urls(p_images jsonb, p_steps jsonb)
RETURNS SETOF text LANGUAGE sql IMMUTABLE AS $$
  SELECT u FROM jsonb_array_elements_text(COALESCE(p_images, '[]'::jsonb)) u WHERE btrim(u) <> ''
  UNION
  SELECT iu FROM jsonb_array_elements(COALESCE(p_steps, '[]'::jsonb)) s,
       LATERAL jsonb_array_elements_text(CASE WHEN jsonb_typeof(s->'images') = 'array' THEN s->'images' ELSE '[]'::jsonb END) iu
   WHERE btrim(iu) <> '';
$$;

REVOKE EXECUTE ON FUNCTION public._kitchen_item_eligible(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._kitchen_item_special(uuid, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._kitchen_allergens_norm(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._kitchen_ingredients_norm(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._kitchen_steps_norm(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._kitchen_recipe_urls(jsonb, jsonb) FROM PUBLIC, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. The one-way feed: menu_items → kitchen_recipes (insert / sync / leave)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._kitchen_feed_item()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions', 'pg_temp' AS $$
DECLARE v_eligible boolean; v_special boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- Saved by anyone → it stays as an off-the-menu recipe; otherwise it goes with the item.
    UPDATE public.kitchen_recipes r
       SET menu_item_id = NULL, off_menu_at = now(), menu_active = false, updated_at = now()
     WHERE r.menu_item_id = OLD.id
       AND EXISTS (SELECT 1 FROM public.kitchen_recipe_saves s WHERE s.recipe_id = r.id);
    INSERT INTO public.storage_pending_deletes (organization_id, bucket, file_url)
      SELECT r.organization_id, 'kitchen-recipes', u
        FROM public.kitchen_recipes r, LATERAL public._kitchen_recipe_urls(r.images, r.steps) u
       WHERE r.menu_item_id = OLD.id
      ON CONFLICT (bucket, file_url) DO NOTHING;
    DELETE FROM public.kitchen_recipes WHERE menu_item_id = OLD.id;
    RETURN OLD;
  END IF;

  IF NEW.organization_id IS NULL THEN RETURN NEW; END IF;
  v_eligible := public._kitchen_item_eligible(NEW.organization_id, NEW.category);
  v_special  := public._kitchen_item_special(NEW.organization_id, NEW.category, NEW.is_weekly_special);

  IF TG_OP = 'UPDATE' THEN
    IF NOT v_eligible THEN
      -- Moved into Libations / Wine: hide (kept in case it moves back).
      UPDATE public.kitchen_recipes SET menu_active = false, updated_at = now() WHERE menu_item_id = NEW.id;
      RETURN NEW;
    END IF;
    UPDATE public.kitchen_recipes r SET
      name = NEW.name, name_es = NEW.name_es,
      thumbnail_url = NEW.thumbnail_url,
      category = NEW.category, subcategory = NEW.subcategory, season = NEW.season,
      is_special = v_special, menu_active = COALESCE(NEW.is_active, true),
      display_order = COALESCE(NEW.display_order, 0),
      -- a free-of flag switched ON in the Menu Editor clears that allergen here
      allergens = ARRAY(SELECT a FROM unnest(r.allergens) a
                         WHERE NOT ((a = 'gluten' AND COALESCE(NEW.is_gluten_free, false))
                                 OR (a = 'dairy'  AND COALESCE(NEW.is_dairy_free, false))
                                 OR (a = 'egg'    AND COALESCE(NEW.is_egg_free, false))
                                 OR (a IN ('tree_nuts','peanuts') AND COALESCE(NEW.is_nut_free, false)))),
      updated_at = now()
    WHERE r.menu_item_id = NEW.id;
    IF FOUND THEN RETURN NEW; END IF;
  END IF;

  -- INSERT, or an UPDATE that brought an item back into the kitchen's scope.
  IF v_eligible THEN
    INSERT INTO public.kitchen_recipes
      (organization_id, section, menu_item_id, name, name_es, description, description_es, thumbnail_url,
       category, subcategory, season, is_special, menu_active, display_order, created_by)
    VALUES
      (NEW.organization_id, 'menu', NEW.id, NEW.name, NEW.name_es, NEW.description, NEW.description_es, NEW.thumbnail_url,
       NEW.category, NEW.subcategory, NEW.season, v_special, COALESCE(NEW.is_active, true),
       COALESCE(NEW.display_order, 0), NEW.created_by)
    ON CONFLICT (menu_item_id) WHERE menu_item_id IS NOT NULL DO NOTHING;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER kitchen_feed_item_ins AFTER INSERT ON public.menu_items
  FOR EACH ROW EXECUTE FUNCTION public._kitchen_feed_item();
CREATE TRIGGER kitchen_feed_item_upd AFTER UPDATE OF name, name_es, thumbnail_url, category, subcategory, season,
  is_weekly_special, is_active, display_order, is_gluten_free, is_dairy_free, is_egg_free, is_nut_free ON public.menu_items
  FOR EACH ROW EXECUTE FUNCTION public._kitchen_feed_item();
CREATE TRIGGER kitchen_feed_item_del BEFORE DELETE ON public.menu_items
  FOR EACH ROW EXECUTE FUNCTION public._kitchen_feed_item();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Groups: seeded per org (and on every new org)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.seed_kitchen_recipe_groups(p_org_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions', 'pg_temp' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.kitchen_recipe_groups WHERE organization_id = p_org_id) THEN RETURN; END IF;
  INSERT INTO public.kitchen_recipe_groups (organization_id, section, name, name_es, display_order) VALUES
    (p_org_id, 'prep', 'Sauces', 'Salsas', 0),
    (p_org_id, 'prep', 'Dressings', 'Aderezos', 1),
    (p_org_id, 'prep', 'Stocks, Broths & Bases', 'Fondos, caldos y bases', 2),
    (p_org_id, 'prep', 'Marinades', 'Marinadas', 3),
    (p_org_id, 'prep', 'Rubs', 'Adobos secos', 4),
    (p_org_id, 'prep', 'Garnishes', 'Guarniciones', 5),
    (p_org_id, 'desserts', 'Plated Desserts', 'Postres emplatados', 0),
    (p_org_id, 'desserts', 'Pastries', 'Pastelería', 1),
    (p_org_id, 'desserts', 'Bread', 'Pan', 2),
    (p_org_id, 'desserts', 'Doughs', 'Masas', 3),
    (p_org_id, 'banquets', 'Entrées', 'Platos principales', 0),
    (p_org_id, 'banquets', 'Appetizers', 'Aperitivos', 1),
    (p_org_id, 'banquets', 'Canapés', 'Canapés', 2),
    (p_org_id, 'banquets', 'Salads', 'Ensaladas', 3),
    (p_org_id, 'banquets', 'Sides', 'Acompañamientos', 4);
END $$;
REVOKE EXECUTE ON FUNCTION public.seed_kitchen_recipe_groups(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._kitchen_seed_on_org()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions', 'pg_temp' AS $$
BEGIN
  PERFORM public.seed_kitchen_recipe_groups(NEW.id);
  RETURN NEW;
END $$;
CREATE TRIGGER kitchen_seed_groups AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public._kitchen_seed_on_org();

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Read RPCs (any member of the org — the rail gates the surface by job title)
-- ─────────────────────────────────────────────────────────────────────────────
-- Books: menu1 · menu2 · specials · prep · desserts · banquets · saved
CREATE OR REPLACE FUNCTION public.get_kitchen_recipes(p_actor_id uuid, p_book text)
RETURNS TABLE(
  id uuid, section text, menu_item_id uuid, group_id uuid, group_name text, group_name_es text,
  name text, name_es text, thumbnail_url text, images jsonb,
  category text, subcategory text, season text, is_special boolean,
  station text, prep_minutes integer, cook_minutes integer,
  step_count integer, is_written boolean, is_saved boolean, off_menu boolean, display_order integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'extensions', 'pg_temp' AS $$
DECLARE v_org uuid;
BEGIN
  SELECT u.organization_id INTO v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL THEN RETURN; END IF;
  RETURN QUERY
    SELECT r.id, r.section, r.menu_item_id, r.group_id, g.name, g.name_es,
           r.name, r.name_es, r.thumbnail_url, r.images,
           r.category, r.subcategory, r.season, r.is_special,
           r.station, r.prep_minutes, r.cook_minutes,
           jsonb_array_length(r.steps)::int,
           (jsonb_array_length(r.steps) > 0 OR jsonb_array_length(r.ingredients) > 0),
           EXISTS (SELECT 1 FROM public.kitchen_recipe_saves s WHERE s.recipe_id = r.id AND s.user_id = p_actor_id),
           (r.section = 'menu' AND r.menu_item_id IS NULL),
           r.display_order
      FROM public.kitchen_recipes r
      LEFT JOIN public.kitchen_recipe_groups g ON g.id = r.group_id
     WHERE r.organization_id = v_org AND r.is_active
       AND CASE p_book
             WHEN 'menu1'    THEN r.section = 'menu' AND r.menu_item_id IS NOT NULL AND r.menu_active AND COALESCE(r.season, 'both') IN ('winter', 'both')
             WHEN 'menu2'    THEN r.section = 'menu' AND r.menu_item_id IS NOT NULL AND r.menu_active AND COALESCE(r.season, 'both') IN ('summer', 'both')
             WHEN 'specials' THEN r.section = 'menu' AND r.menu_item_id IS NOT NULL AND r.menu_active AND r.is_special
             WHEN 'saved'    THEN EXISTS (SELECT 1 FROM public.kitchen_recipe_saves s WHERE s.recipe_id = r.id AND s.user_id = p_actor_id)
             ELSE r.section = p_book
           END
     ORDER BY COALESCE(g.display_order, 0), r.display_order, r.name;
END $$;

CREATE OR REPLACE FUNCTION public.get_kitchen_hub(p_actor_id uuid)
RETURNS TABLE(book text, total integer, needs integer, thumbs jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'extensions', 'pg_temp' AS $$
DECLARE b text;
BEGIN
  FOREACH b IN ARRAY ARRAY['menu1','menu2','specials','prep','desserts','banquets','saved'] LOOP
    RETURN QUERY
      SELECT b, count(*)::int, count(*) FILTER (WHERE NOT k.is_written)::int,
             COALESCE((SELECT jsonb_agg(t.thumbnail_url) FROM (
                SELECT k2.thumbnail_url FROM public.get_kitchen_recipes(p_actor_id, b) k2
                 WHERE k2.thumbnail_url IS NOT NULL AND k2.thumbnail_url <> '' LIMIT 3) t), '[]'::jsonb)
        FROM public.get_kitchen_recipes(p_actor_id, b) k;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.get_kitchen_recipe(p_actor_id uuid, p_id uuid)
RETURNS TABLE(
  id uuid, section text, menu_item_id uuid, group_id uuid, group_name text, group_name_es text,
  name text, name_es text, description text, description_es text, thumbnail_url text, images jsonb,
  category text, subcategory text, season text, is_special boolean, menu_active boolean, off_menu boolean,
  yield_text text, portions_text text, prep_minutes integer, cook_minutes integer, station text, shelf_life text,
  allergens text[], plating_notes text, plating_notes_es text, ingredients jsonb, steps jsonb,
  is_saved boolean, save_count integer, display_order integer, updated_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'extensions', 'pg_temp' AS $$
DECLARE v_org uuid;
BEGIN
  SELECT u.organization_id INTO v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL THEN RETURN; END IF;
  RETURN QUERY
    SELECT r.id, r.section, r.menu_item_id, r.group_id, g.name, g.name_es,
           r.name, r.name_es, r.description, r.description_es, r.thumbnail_url, r.images,
           r.category, r.subcategory, r.season, r.is_special, r.menu_active, (r.section = 'menu' AND r.menu_item_id IS NULL),
           r.yield_text, r.portions_text, r.prep_minutes, r.cook_minutes, r.station, r.shelf_life,
           r.allergens, r.plating_notes, r.plating_notes_es, r.ingredients, r.steps,
           EXISTS (SELECT 1 FROM public.kitchen_recipe_saves s WHERE s.recipe_id = r.id AND s.user_id = p_actor_id),
           (SELECT count(*)::int FROM public.kitchen_recipe_saves s WHERE s.recipe_id = r.id),
           r.display_order, r.updated_at
      FROM public.kitchen_recipes r
      LEFT JOIN public.kitchen_recipe_groups g ON g.id = r.group_id
     WHERE r.id = p_id AND r.organization_id = v_org AND r.is_active;
END $$;

-- The Menu item Poster's "View Recipe" chip.
CREATE OR REPLACE FUNCTION public.get_kitchen_recipe_for_item(p_actor_id uuid, p_menu_item_id uuid)
RETURNS TABLE(id uuid, is_written boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'extensions', 'pg_temp' AS $$
  SELECT r.id, (jsonb_array_length(r.steps) > 0 OR jsonb_array_length(r.ingredients) > 0)
    FROM public.kitchen_recipes r
   WHERE r.menu_item_id = p_menu_item_id AND r.is_active
     AND r.organization_id = (SELECT u.organization_id FROM public.users u WHERE u.id = p_actor_id);
$$;

CREATE OR REPLACE FUNCTION public.get_kitchen_recipe_groups(p_actor_id uuid, p_section text DEFAULT NULL)
RETURNS TABLE(id uuid, section text, name text, name_es text, display_order integer, recipe_count integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'extensions', 'pg_temp' AS $$
  SELECT g.id, g.section, g.name, g.name_es, g.display_order,
         (SELECT count(*)::int FROM public.kitchen_recipes r WHERE r.group_id = g.id AND r.is_active)
    FROM public.kitchen_recipe_groups g
   WHERE g.organization_id = (SELECT u.organization_id FROM public.users u WHERE u.id = p_actor_id)
     AND g.is_active AND (p_section IS NULL OR g.section = p_section)
   ORDER BY g.section, g.display_order, g.name;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Write RPCs (kitchen recipe editors: owners / managers / granted titles)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_kitchen_recipe(p_actor_id uuid, p_section text, p_payload jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions', 'pg_temp' AS $$
DECLARE v_org uuid; v_id uuid; v_images jsonb; v_group uuid; v_max int;
BEGIN
  v_org := public._require_recipe_editor('kitchen', p_actor_id);
  IF p_section NOT IN ('prep','desserts','banquets') THEN
    RAISE EXCEPTION 'Menu recipes come from the Menu Editor';
  END IF;
  IF btrim(COALESCE(p_payload->>'name', '')) = '' THEN RAISE EXCEPTION 'Recipe name is required'; END IF;
  v_images := public._images_norm(p_payload->'images', NULL);
  v_group := NULLIF(p_payload->>'group_id', '')::uuid;
  IF v_group IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.kitchen_recipe_groups g WHERE g.id = v_group AND g.organization_id = v_org AND g.section = p_section) THEN
    RAISE EXCEPTION 'Group not found';
  END IF;
  SELECT COALESCE(max(r.display_order), -1) + 1 INTO v_max FROM public.kitchen_recipes r
   WHERE r.organization_id = v_org AND r.section = p_section AND r.group_id IS NOT DISTINCT FROM v_group;
  INSERT INTO public.kitchen_recipes
    (organization_id, section, group_id, name, name_es, description, description_es, thumbnail_url, images,
     yield_text, portions_text, prep_minutes, cook_minutes, station, shelf_life, allergens,
     plating_notes, plating_notes_es, ingredients, steps, display_order, created_by)
  VALUES
    (v_org, p_section, v_group,
     left(btrim(p_payload->>'name'), 160), NULLIF(left(btrim(COALESCE(p_payload->>'name_es','')), 160), ''),
     NULLIF(p_payload->>'description', ''), NULLIF(p_payload->>'description_es', ''),
     NULLIF(v_images->>0, ''), v_images,
     NULLIF(left(COALESCE(p_payload->>'yield_text',''), 80), ''), NULLIF(left(COALESCE(p_payload->>'portions_text',''), 80), ''),
     CASE WHEN (p_payload->>'prep_minutes') ~ '^[0-9]{1,4}$' THEN (p_payload->>'prep_minutes')::int END,
     CASE WHEN (p_payload->>'cook_minutes') ~ '^[0-9]{1,4}$' THEN (p_payload->>'cook_minutes')::int END,
     NULLIF(left(COALESCE(p_payload->>'station',''), 60), ''), NULLIF(left(COALESCE(p_payload->>'shelf_life',''), 80), ''),
     public._kitchen_allergens_norm(p_payload->'allergens'),
     NULLIF(p_payload->>'plating_notes', ''), NULLIF(p_payload->>'plating_notes_es', ''),
     public._kitchen_ingredients_norm(p_payload->'ingredients'), public._kitchen_steps_norm(p_payload->'steps'),
     v_max, p_actor_id)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.update_kitchen_recipe(p_actor_id uuid, p_id uuid, p_payload jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions', 'pg_temp' AS $$
DECLARE v_org uuid; r public.kitchen_recipes; v_images jsonb; v_steps jsonb; v_allergens text[]; v_group uuid;
BEGIN
  v_org := public._require_recipe_editor('kitchen', p_actor_id);
  SELECT * INTO r FROM public.kitchen_recipes k WHERE k.id = p_id AND k.organization_id = v_org AND k.is_active;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Recipe not found'; END IF;

  v_images := public._images_norm(p_payload->'images', NULL);
  v_steps := public._kitchen_steps_norm(p_payload->'steps');
  v_allergens := public._kitchen_allergens_norm(p_payload->'allergens');
  v_group := CASE WHEN p_payload ? 'group_id' THEN NULLIF(p_payload->>'group_id', '')::uuid ELSE r.group_id END;
  IF r.section <> 'menu' AND v_group IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.kitchen_recipe_groups g WHERE g.id = v_group AND g.organization_id = v_org AND g.section = r.section) THEN
    RAISE EXCEPTION 'Group not found';
  END IF;

  -- Allergens write back to the menu item's free-of flags (only ever clearing a claim).
  IF r.menu_item_id IS NOT NULL THEN
    UPDATE public.menu_items m SET
      is_gluten_free = CASE WHEN 'gluten' = ANY (v_allergens) THEN false ELSE m.is_gluten_free END,
      is_dairy_free  = CASE WHEN 'dairy'  = ANY (v_allergens) THEN false ELSE m.is_dairy_free  END,
      is_egg_free    = CASE WHEN 'egg'    = ANY (v_allergens) THEN false ELSE m.is_egg_free    END,
      is_nut_free    = CASE WHEN v_allergens && ARRAY['tree_nuts','peanuts'] THEN false ELSE m.is_nut_free END,
      updated_at = now()
    WHERE m.id = r.menu_item_id AND m.organization_id = v_org
      AND (('gluten' = ANY (v_allergens) AND COALESCE(m.is_gluten_free, false))
        OR ('dairy'  = ANY (v_allergens) AND COALESCE(m.is_dairy_free, false))
        OR ('egg'    = ANY (v_allergens) AND COALESCE(m.is_egg_free, false))
        OR (v_allergens && ARRAY['tree_nuts','peanuts'] AND COALESCE(m.is_nut_free, false)));
  END IF;

  -- Photos that left the recipe go to the storage sweep.
  INSERT INTO public.storage_pending_deletes (organization_id, bucket, file_url)
    SELECT v_org, 'kitchen-recipes', u FROM public._kitchen_recipe_urls(r.images, r.steps) u
     WHERE u NOT IN (SELECT n FROM public._kitchen_recipe_urls(v_images, v_steps) n)
    ON CONFLICT (bucket, file_url) DO NOTHING;

  UPDATE public.kitchen_recipes k SET
    -- name / cover / placement are the Menu Editor's for menu-fed rows
    name = CASE WHEN k.menu_item_id IS NOT NULL THEN k.name ELSE COALESCE(NULLIF(left(btrim(p_payload->>'name'), 160), ''), k.name) END,
    name_es = CASE WHEN k.menu_item_id IS NOT NULL THEN k.name_es ELSE NULLIF(left(btrim(COALESCE(p_payload->>'name_es','')), 160), '') END,
    thumbnail_url = CASE WHEN k.menu_item_id IS NOT NULL THEN k.thumbnail_url ELSE NULLIF(v_images->>0, '') END,
    group_id = CASE WHEN k.section = 'menu' THEN k.group_id ELSE v_group END,
    images = v_images,
    description = NULLIF(p_payload->>'description', ''), description_es = NULLIF(p_payload->>'description_es', ''),
    yield_text = NULLIF(left(COALESCE(p_payload->>'yield_text',''), 80), ''),
    portions_text = NULLIF(left(COALESCE(p_payload->>'portions_text',''), 80), ''),
    prep_minutes = CASE WHEN (p_payload->>'prep_minutes') ~ '^[0-9]{1,4}$' THEN (p_payload->>'prep_minutes')::int END,
    cook_minutes = CASE WHEN (p_payload->>'cook_minutes') ~ '^[0-9]{1,4}$' THEN (p_payload->>'cook_minutes')::int END,
    station = NULLIF(left(COALESCE(p_payload->>'station',''), 60), ''),
    shelf_life = NULLIF(left(COALESCE(p_payload->>'shelf_life',''), 80), ''),
    allergens = v_allergens,
    plating_notes = NULLIF(p_payload->>'plating_notes', ''), plating_notes_es = NULLIF(p_payload->>'plating_notes_es', ''),
    ingredients = public._kitchen_ingredients_norm(p_payload->'ingredients'),
    steps = v_steps,
    updated_at = now()
  WHERE k.id = p_id AND k.organization_id = v_org;
END $$;

CREATE OR REPLACE FUNCTION public.delete_kitchen_recipe(p_actor_id uuid, p_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions', 'pg_temp' AS $$
DECLARE v_org uuid; r public.kitchen_recipes;
BEGIN
  v_org := public._require_recipe_editor('kitchen', p_actor_id);
  SELECT * INTO r FROM public.kitchen_recipes k WHERE k.id = p_id AND k.organization_id = v_org;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Recipe not found'; END IF;
  IF r.section = 'menu' AND r.menu_item_id IS NOT NULL THEN
    RAISE EXCEPTION 'Menu recipes are removed from the Menu Editor';
  END IF;
  INSERT INTO public.storage_pending_deletes (organization_id, bucket, file_url)
    SELECT v_org, 'kitchen-recipes', u FROM public._kitchen_recipe_urls(r.images, r.steps) u
    ON CONFLICT (bucket, file_url) DO NOTHING;
  DELETE FROM public.kitchen_recipes WHERE id = p_id AND organization_id = v_org;
  RETURN TRUE;
END $$;

CREATE OR REPLACE FUNCTION public.reorder_kitchen_recipes(p_actor_id uuid, p_ordered_ids uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions', 'pg_temp' AS $$
DECLARE v_org uuid;
BEGIN
  v_org := public._require_recipe_editor('kitchen', p_actor_id);
  UPDATE public.kitchen_recipes r SET display_order = o.idx - 1, updated_at = now()
    FROM unnest(p_ordered_ids) WITH ORDINALITY AS o(id, idx)
   WHERE r.id = o.id AND r.organization_id = v_org AND r.section <> 'menu';
END $$;

CREATE OR REPLACE FUNCTION public.upsert_kitchen_recipe_group(p_actor_id uuid, p_section text, p_name text, p_group_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions', 'pg_temp' AS $$
DECLARE v_org uuid; v_id uuid; v_max int;
BEGIN
  v_org := public._require_recipe_editor('kitchen', p_actor_id);
  IF btrim(COALESCE(p_name, '')) = '' THEN RAISE EXCEPTION 'Group name is required'; END IF;
  IF p_group_id IS NULL THEN
    IF p_section NOT IN ('prep','desserts','banquets') THEN RAISE EXCEPTION 'Bad section'; END IF;
    SELECT COALESCE(max(display_order), -1) + 1 INTO v_max FROM public.kitchen_recipe_groups
     WHERE organization_id = v_org AND section = p_section;
    INSERT INTO public.kitchen_recipe_groups (organization_id, section, name, display_order)
    VALUES (v_org, p_section, left(btrim(p_name), 80), v_max) RETURNING id INTO v_id;
  ELSE
    UPDATE public.kitchen_recipe_groups SET name = left(btrim(p_name), 80), updated_at = now()
     WHERE id = p_group_id AND organization_id = v_org RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Group not found'; END IF;
  END IF;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.delete_kitchen_recipe_group(p_actor_id uuid, p_group_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions', 'pg_temp' AS $$
DECLARE v_org uuid; v_id uuid;
BEGIN
  v_org := public._require_recipe_editor('kitchen', p_actor_id);
  UPDATE public.kitchen_recipe_groups SET is_active = false, updated_at = now()
   WHERE id = p_group_id AND organization_id = v_org RETURNING id INTO v_id;
  IF v_id IS NULL THEN RAISE EXCEPTION 'Group not found'; END IF;
  -- Its recipes stay, ungrouped.
  UPDATE public.kitchen_recipes SET group_id = NULL, updated_at = now() WHERE group_id = p_group_id AND organization_id = v_org;
  RETURN TRUE;
END $$;

CREATE OR REPLACE FUNCTION public.reorder_kitchen_recipe_groups(p_actor_id uuid, p_ordered_ids uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions', 'pg_temp' AS $$
DECLARE v_org uuid;
BEGIN
  v_org := public._require_recipe_editor('kitchen', p_actor_id);
  UPDATE public.kitchen_recipe_groups g SET display_order = o.idx - 1, updated_at = now()
    FROM unnest(p_ordered_ids) WITH ORDINALITY AS o(id, idx)
   WHERE g.id = o.id AND g.organization_id = v_org;
END $$;

CREATE OR REPLACE FUNCTION public.update_kitchen_recipe_group_translations_actor(p_actor_id uuid, p_id uuid, p_name_es text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions', 'pg_temp' AS $$
DECLARE v_org uuid;
BEGIN
  v_org := public._require_recipe_editor('kitchen', p_actor_id);
  UPDATE public.kitchen_recipe_groups SET name_es = COALESCE(p_name_es, name_es), updated_at = now()
   WHERE id = p_id AND organization_id = v_org;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not found in your organization'; END IF;
END $$;

-- Saves: any member, their own folder.
CREATE OR REPLACE FUNCTION public.set_kitchen_recipe_saved(p_actor_id uuid, p_recipe_id uuid, p_saved boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions', 'pg_temp' AS $$
DECLARE v_org uuid;
BEGIN
  SELECT u.organization_id INTO v_org FROM public.users u WHERE u.id = p_actor_id AND u.is_active IS NOT DISTINCT FROM true;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.kitchen_recipes r WHERE r.id = p_recipe_id AND r.organization_id = v_org) THEN
    RAISE EXCEPTION 'Recipe not found';
  END IF;
  IF p_saved THEN
    INSERT INTO public.kitchen_recipe_saves (user_id, recipe_id, organization_id) VALUES (p_actor_id, p_recipe_id, v_org)
    ON CONFLICT (user_id, recipe_id) DO NOTHING;
  ELSE
    DELETE FROM public.kitchen_recipe_saves WHERE user_id = p_actor_id AND recipe_id = p_recipe_id;
    -- An off-the-menu recipe nobody saves any more goes for good (its photos to the sweep).
    INSERT INTO public.storage_pending_deletes (organization_id, bucket, file_url)
      SELECT v_org, 'kitchen-recipes', u FROM public.kitchen_recipes r, LATERAL public._kitchen_recipe_urls(r.images, r.steps) u
       WHERE r.id = p_recipe_id AND r.section = 'menu' AND r.menu_item_id IS NULL
         AND NOT EXISTS (SELECT 1 FROM public.kitchen_recipe_saves s WHERE s.recipe_id = r.id)
      ON CONFLICT (bucket, file_url) DO NOTHING;
    DELETE FROM public.kitchen_recipes r
     WHERE r.id = p_recipe_id AND r.section = 'menu' AND r.menu_item_id IS NULL
       AND NOT EXISTS (SELECT 1 FROM public.kitchen_recipe_saves s WHERE s.recipe_id = r.id);
  END IF;
  RETURN COALESCE(p_saved, false);
END $$;

GRANT EXECUTE ON FUNCTION public.get_kitchen_recipes(uuid, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_kitchen_hub(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_kitchen_recipe(uuid, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_kitchen_recipe_for_item(uuid, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_kitchen_recipe_groups(uuid, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_kitchen_recipe(uuid, text, jsonb) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_kitchen_recipe(uuid, uuid, jsonb) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_kitchen_recipe(uuid, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reorder_kitchen_recipes(uuid, uuid[]) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.upsert_kitchen_recipe_group(uuid, text, text, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_kitchen_recipe_group(uuid, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reorder_kitchen_recipe_groups(uuid, uuid[]) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_kitchen_recipe_group_translations_actor(uuid, uuid, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_kitchen_recipe_saved(uuid, uuid, boolean) TO anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Backfill: groups for every org, a recipe row for every eligible active item
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE o record;
BEGIN
  FOR o IN SELECT id FROM public.organizations LOOP
    PERFORM public.seed_kitchen_recipe_groups(o.id);
  END LOOP;
END $$;

INSERT INTO public.kitchen_recipes
  (organization_id, section, menu_item_id, name, name_es, description, description_es, thumbnail_url,
   category, subcategory, season, is_special, menu_active, display_order, created_by)
SELECT m.organization_id, 'menu', m.id, m.name, m.name_es, m.description, m.description_es, m.thumbnail_url,
       m.category, m.subcategory, m.season,
       public._kitchen_item_special(m.organization_id, m.category, m.is_weekly_special),
       COALESCE(m.is_active, true), COALESCE(m.display_order, 0), m.created_by
  FROM public.menu_items m
 WHERE m.organization_id IS NOT NULL
   AND COALESCE(m.is_active, true)
   AND public._kitchen_item_eligible(m.organization_id, m.category)
ON CONFLICT (menu_item_id) WHERE menu_item_id IS NOT NULL DO NOTHING;
