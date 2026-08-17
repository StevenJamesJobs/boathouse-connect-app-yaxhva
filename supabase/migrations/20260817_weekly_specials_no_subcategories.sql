-- s72: Weekly Specials (filter_behavior='weekly_specials') never holds
-- subcategories — items land there via the menu editor's "Feature on" toggle
-- and keep their original category. Subcategories under it would fight that
-- flow, so creation is blocked server-side (the client hides the affordance;
-- this is the honest gate — a client-only block is not a gate).
CREATE OR REPLACE FUNCTION public.manage_menu_subcategory_create(p_organization_id uuid, p_user_id uuid, p_category_id uuid, p_display_name text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE v_id uuid; v_order integer; v_name text; v_slot smallint; v_fb text;
BEGIN
  IF NOT public._may_edit_menu_categories(p_organization_id, p_user_id) THEN
    RETURN json_build_object('success', false, 'error', 'Only the organization owner can manage categories');
  END IF;
  v_name := btrim(coalesce(p_display_name, ''));
  IF v_name = '' THEN
    RETURN json_build_object('success', false, 'error', 'Subcategory name is required');
  END IF;
  SELECT menu_slot, filter_behavior INTO v_slot, v_fb
    FROM public.menu_categories WHERE id = p_category_id AND organization_id = p_organization_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Category not found');
  END IF;
  IF v_fb = 'weekly_specials' THEN
    RETURN json_build_object('success', false, 'error', 'The specials category cannot hold subcategories');
  END IF;
  SELECT COALESCE(MAX(display_order) + 1, 0) INTO v_order
    FROM public.menu_subcategories WHERE category_id = p_category_id;
  INSERT INTO public.menu_subcategories (organization_id, category_id, display_name, display_order, menu_slot)
    VALUES (p_organization_id, p_category_id, v_name, v_order, v_slot)
    RETURNING id INTO v_id;
  RETURN json_build_object('success', true, 'id', v_id);
EXCEPTION WHEN unique_violation THEN
  RETURN json_build_object('success', false, 'error', 'A subcategory with that name already exists');
END;
$function$;
