-- Lock the built-in ("template") cocktail subcategories as always recipe-linked.
-- They carry a system_key (sub.signature_cocktails / martinis / sangria / low_abv
-- / zero_abv) and are structural to the Libations Recipes ↔ menu feed. Owners may
-- rename / reorder / hide them, but NOT unlink (or delete — already blocked).

-- Defensive: ensure every system-keyed Libations sub is linked (idempotent).
UPDATE public.menu_subcategories s
SET is_cocktail_fed = true
FROM public.menu_categories c
WHERE c.id = s.category_id
  AND c.system_key = 'cat.libations'
  AND s.system_key IS NOT NULL
  AND s.is_cocktail_fed IS DISTINCT FROM true;

-- Reject unlinking a template (system-keyed) sub at the RPC layer.
CREATE OR REPLACE FUNCTION public.manage_menu_subcategory_set_cocktail_fed(
  p_organization_id uuid, p_user_id uuid, p_subcategory_id uuid, p_is_cocktail_fed boolean
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE v_cat_syskey text; v_sub_syskey text;
BEGIN
  IF NOT public._is_org_owner(p_organization_id, p_user_id) THEN
    RETURN json_build_object('success', false, 'error', 'Only the organization owner can manage categories');
  END IF;
  SELECT c.system_key, s.system_key INTO v_cat_syskey, v_sub_syskey
    FROM public.menu_subcategories s
    JOIN public.menu_categories c ON c.id = s.category_id
    WHERE s.id = p_subcategory_id AND s.organization_id = p_organization_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Subcategory not found');
  END IF;
  IF v_cat_syskey IS DISTINCT FROM 'cat.libations' THEN
    RETURN json_build_object('success', false, 'error', 'Only Libations subcategories can be recipe-backed');
  END IF;
  IF v_sub_syskey IS NOT NULL THEN
    RETURN json_build_object('success', false, 'error', 'Template subcategories are always recipe-linked and cannot be unlinked');
  END IF;
  UPDATE public.menu_subcategories
    SET is_cocktail_fed = COALESCE(p_is_cocktail_fed, is_cocktail_fed), updated_at = now()
    WHERE id = p_subcategory_id AND organization_id = p_organization_id;
  RETURN json_build_object('success', true);
END;
$function$;
