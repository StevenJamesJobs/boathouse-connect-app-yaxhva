-- s91d (2026-10-07, Steve's device round): the cover of a MENU-FED kitchen
-- recipe is two-way. The Kitchen Editor may set / replace / clear it; it lands
-- on the menu item (thumbnail_url + images[0]) and the feed trigger carries it
-- back. Same signature as s91b → CREATE OR REPLACE (no types.ts change: the
-- payload is jsonb; the new key is `cover_url`).

CREATE OR REPLACE FUNCTION public.update_kitchen_recipe(p_actor_id uuid, p_id uuid, p_payload jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions', 'pg_temp' AS $$
DECLARE v_org uuid; r public.kitchen_recipes; v_images jsonb; v_steps jsonb; v_allergens text[]; v_group uuid;
        v_cover text; v_m_images jsonb; v_m_thumb text; v_rest jsonb; v_new jsonb;
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

  -- s91d (the device round): the COVER of a menu-fed recipe is the menu item's
  -- own cover, two-way. A `cover_url` key in the payload sets it on the MENU
  -- ITEM (thumbnail_url + images[0] — the s90 storage shape A); the old cover
  -- stays among the menu's photos (demoted, like "make cover" in the Menu
  -- Editor); clearing it drops it from the menu. The feed trigger then carries
  -- the new cover back onto this row, so the UPDATE below reads it fresh.
  IF r.menu_item_id IS NOT NULL AND p_payload ? 'cover_url' THEN
    v_cover := NULLIF(btrim(COALESCE(p_payload->>'cover_url', '')), '');
    IF v_cover IS DISTINCT FROM r.thumbnail_url THEN
      SELECT m.images, m.thumbnail_url INTO v_m_images, v_m_thumb
        FROM public.menu_items m WHERE m.id = r.menu_item_id AND m.organization_id = v_org;
      IF FOUND THEN
        v_rest := COALESCE((SELECT jsonb_agg(d.u ORDER BY d.ord) FROM (
                    SELECT DISTINCT ON (u) u, ord FROM jsonb_array_elements_text(
                      CASE WHEN jsonb_typeof(v_m_images) = 'array' THEN v_m_images ELSE '[]'::jsonb END) WITH ORDINALITY AS t(u, ord)
                     WHERE btrim(u) <> '' AND u IS DISTINCT FROM v_cover
                       AND (v_cover IS NOT NULL OR u IS DISTINCT FROM v_m_thumb)
                     ORDER BY u, ord) d), '[]'::jsonb);
        v_new := CASE WHEN v_cover IS NULL THEN v_rest ELSE jsonb_build_array(v_cover) || v_rest END;
        v_new := public._images_norm(v_new, NULL);
        UPDATE public.menu_items m SET
          images = v_new,
          thumbnail_url = NULLIF(v_new->>0, ''),
          updated_at = now()
        WHERE m.id = r.menu_item_id AND m.organization_id = v_org;
      END IF;
    END IF;
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
