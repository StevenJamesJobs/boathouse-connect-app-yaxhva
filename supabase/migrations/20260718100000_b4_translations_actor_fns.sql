-- B4 Batch 2 (2026-07-18, session 48): actor-gated translations family.
--
-- The 11 legacy update_*_translations fns are SECURITY DEFINER with NO actor
-- argument — nine ignore p_organization_id entirely, two treat it as an
-- optional filter — so anyone with the anon key could overwrite any org's
-- Spanish content by uuid. This migration adds 11 distinctly-NAMED gated
-- versions (update_*_translations_actor): manager/owner gate, org derived from
-- the actor, target row must be in the actor's org (RAISE otherwise), COALESCE
-- vs unconditional-set semantics mirror each legacy fn exactly. The legacy
-- no-actor sigs are KEPT (shipped builds call them) and only search_path-pinned
-- here; they are REVOKEd at the adoption-gated teardown (see teardown prompt).
--
-- ROLLBACK:
--   DROP FUNCTION public.update_announcement_translations_actor(uuid, uuid, text, text);
--   DROP FUNCTION public.update_special_feature_translations_actor(uuid, uuid, text, text);
--   DROP FUNCTION public.update_upcoming_event_translations_actor(uuid, uuid, text, text);
--   DROP FUNCTION public.update_menu_item_translations_actor(uuid, uuid, text, text, text);
--   DROP FUNCTION public.update_menu_category_translations_actor(uuid, uuid, text);
--   DROP FUNCTION public.update_menu_subcategory_translations_actor(uuid, uuid, text);
--   DROP FUNCTION public.update_guide_translations_actor(uuid, uuid, text, text);
--   DROP FUNCTION public.update_libation_recipe_translations_actor(uuid, uuid, text);
--   DROP FUNCTION public.update_summer_libation_recipe_translations_actor(uuid, uuid, text);
--   DROP FUNCTION public.update_cocktail_translations_actor(uuid, uuid, text);
--   DROP FUNCTION public.update_puree_syrup_recipe_translations_actor(uuid, uuid, text);
--   DROP FUNCTION public._require_content_manager(uuid);
--   -- unpin: ALTER FUNCTION public.update_<x>_translations(<sig>) RESET search_path; (10 fns)

-- Shared gate: active manager/owner → returns their org id, else raises.
-- Not client-callable (EXECUTE revoked) — used inside DEFINER fns only.
CREATE OR REPLACE FUNCTION public._require_content_manager(p_actor_id uuid)
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE v_role text; v_org uuid; v_active boolean;
BEGIN
  SELECT u.role, u.organization_id, u.is_active INTO v_role, v_org, v_active
  FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL OR v_active IS DISTINCT FROM true OR v_role NOT IN ('manager','owner') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN v_org;
END $$;
REVOKE EXECUTE ON FUNCTION public._require_content_manager(uuid) FROM PUBLIC, anon, authenticated;

-- ============ COALESCE-merge family (null keeps the existing value) ============

CREATE OR REPLACE FUNCTION public.update_announcement_translations_actor(
  p_actor_id uuid, p_id uuid, p_title_es text DEFAULT NULL, p_content_es text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp AS $$
DECLARE v_org uuid;
BEGIN
  v_org := public._require_content_manager(p_actor_id);
  UPDATE public.announcements
     SET title_es = COALESCE(p_title_es, title_es),
         content_es = COALESCE(p_content_es, content_es),
         updated_at = now()
   WHERE id = p_id AND organization_id = v_org;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not found in your organization'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.update_special_feature_translations_actor(
  p_actor_id uuid, p_id uuid, p_title_es text DEFAULT NULL, p_content_es text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp AS $$
DECLARE v_org uuid;
BEGIN
  v_org := public._require_content_manager(p_actor_id);
  UPDATE public.special_features
     SET title_es = COALESCE(p_title_es, title_es),
         content_es = COALESCE(p_content_es, content_es),
         updated_at = now()
   WHERE id = p_id AND organization_id = v_org;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not found in your organization'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.update_upcoming_event_translations_actor(
  p_actor_id uuid, p_id uuid, p_title_es text DEFAULT NULL, p_content_es text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp AS $$
DECLARE v_org uuid;
BEGIN
  v_org := public._require_content_manager(p_actor_id);
  UPDATE public.upcoming_events
     SET title_es = COALESCE(p_title_es, title_es),
         content_es = COALESCE(p_content_es, content_es),
         updated_at = now()
   WHERE id = p_id AND organization_id = v_org;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not found in your organization'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.update_menu_item_translations_actor(
  p_actor_id uuid, p_id uuid, p_name_es text DEFAULT NULL,
  p_description_es text DEFAULT NULL, p_location_es text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp AS $$
DECLARE v_org uuid;
BEGIN
  v_org := public._require_content_manager(p_actor_id);
  UPDATE public.menu_items
     SET name_es = COALESCE(p_name_es, name_es),
         description_es = COALESCE(p_description_es, description_es),
         location_es = COALESCE(p_location_es, location_es),
         updated_at = now()
   WHERE id = p_id AND organization_id = v_org;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not found in your organization'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.update_guide_translations_actor(
  p_actor_id uuid, p_id uuid, p_title_es text DEFAULT NULL, p_description_es text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp AS $$
DECLARE v_org uuid;
BEGIN
  v_org := public._require_content_manager(p_actor_id);
  UPDATE public.guides_and_training
     SET title_es = COALESCE(p_title_es, title_es),
         description_es = COALESCE(p_description_es, description_es),
         updated_at = now()
   WHERE id = p_id AND organization_id = v_org;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not found in your organization'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.update_libation_recipe_translations_actor(
  p_actor_id uuid, p_id uuid, p_procedure_es text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp AS $$
DECLARE v_org uuid;
BEGIN
  v_org := public._require_content_manager(p_actor_id);
  UPDATE public.libation_recipes
     SET procedure_es = COALESCE(p_procedure_es, procedure_es), updated_at = now()
   WHERE id = p_id AND organization_id = v_org;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not found in your organization'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.update_summer_libation_recipe_translations_actor(
  p_actor_id uuid, p_id uuid, p_procedure_es text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp AS $$
DECLARE v_org uuid;
BEGIN
  v_org := public._require_content_manager(p_actor_id);
  UPDATE public.summer_libation_recipes
     SET procedure_es = COALESCE(p_procedure_es, procedure_es), updated_at = now()
   WHERE id = p_id AND organization_id = v_org;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not found in your organization'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.update_cocktail_translations_actor(
  p_actor_id uuid, p_id uuid, p_procedure_es text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp AS $$
DECLARE v_org uuid;
BEGIN
  v_org := public._require_content_manager(p_actor_id);
  UPDATE public.cocktails
     SET procedure_es = COALESCE(p_procedure_es, procedure_es), updated_at = now()
   WHERE id = p_id AND organization_id = v_org;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not found in your organization'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.update_puree_syrup_recipe_translations_actor(
  p_actor_id uuid, p_id uuid, p_procedure_es text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp AS $$
DECLARE v_org uuid;
BEGIN
  v_org := public._require_content_manager(p_actor_id);
  UPDATE public.puree_syrup_recipes
     SET procedure_es = COALESCE(p_procedure_es, procedure_es), updated_at = now()
   WHERE id = p_id AND organization_id = v_org;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not found in your organization'; END IF;
END $$;

-- ============ Unconditional-set family (mirrors legacy: null CLEARS) ============

CREATE OR REPLACE FUNCTION public.update_menu_category_translations_actor(
  p_actor_id uuid, p_id uuid, p_display_name_es text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp AS $$
DECLARE v_org uuid;
BEGIN
  v_org := public._require_content_manager(p_actor_id);
  UPDATE public.menu_categories
     SET display_name_es = p_display_name_es, updated_at = now()
   WHERE id = p_id AND organization_id = v_org;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not found in your organization'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.update_menu_subcategory_translations_actor(
  p_actor_id uuid, p_id uuid, p_display_name_es text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp AS $$
DECLARE v_org uuid;
BEGIN
  v_org := public._require_content_manager(p_actor_id);
  UPDATE public.menu_subcategories
     SET display_name_es = p_display_name_es, updated_at = now()
   WHERE id = p_id AND organization_id = v_org;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not found in your organization'; END IF;
END $$;

-- ============ Pin the 10 unpinned legacy sigs (guide already pinned) ============
ALTER FUNCTION public.update_announcement_translations(uuid, text, text, uuid) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.update_special_feature_translations(uuid, text, text, uuid) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.update_upcoming_event_translations(uuid, text, text, uuid) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.update_menu_item_translations(uuid, text, text, text, uuid) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.update_menu_category_translations(uuid, text, uuid) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.update_menu_subcategory_translations(uuid, text, uuid) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.update_libation_recipe_translations(uuid, text, uuid) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.update_summer_libation_recipe_translations(uuid, text, uuid) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.update_cocktail_translations(uuid, text, uuid) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.update_puree_syrup_recipe_translations(uuid, text, uuid) SET search_path = public, extensions, pg_temp;
