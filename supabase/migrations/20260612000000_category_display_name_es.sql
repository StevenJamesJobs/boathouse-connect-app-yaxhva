-- Spanish display names for owner-editable menu categories & subcategories.
--
-- Today only UNRENAMED built-ins translate (via the static i18n name maps in
-- utils/menuCategoryLabels.ts). Owner-renamed built-ins and custom categories
-- show in English even in the Spanish UI. This adds an optional `display_name_es`
-- override per row, written via SECURITY DEFINER translation RPCs that mirror the
-- existing menu-item `update_menu_item_translations` pattern (org-scoped, reused
-- by utils/translateContent.ts saveTranslations / TRANSLATION_RPC_MAP).
--
-- Display-only: behavior/matching keys off system_key / filter_behavior /
-- is_cocktail_fed and is untouched. Per-menu orgs get a per-slot override for
-- free since each slot is its own row and the RPCs key by row id.

ALTER TABLE public.menu_categories    ADD COLUMN IF NOT EXISTS display_name_es text;
ALTER TABLE public.menu_subcategories ADD COLUMN IF NOT EXISTS display_name_es text;

-- Org-scoped Spanish-name writers (not owner-gated to match the existing
-- translation-RPC convention; the only caller is the owner-only category editor,
-- and saveTranslations passes p_id + p_organization_id only).
CREATE OR REPLACE FUNCTION public.update_menu_category_translations(
  p_id uuid,
  p_display_name_es text DEFAULT NULL,
  p_organization_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.menu_categories
    SET display_name_es = p_display_name_es, updated_at = now()
    WHERE id = p_id
      AND (p_organization_id IS NULL OR organization_id = p_organization_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_menu_subcategory_translations(
  p_id uuid,
  p_display_name_es text DEFAULT NULL,
  p_organization_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.menu_subcategories
    SET display_name_es = p_display_name_es, updated_at = now()
    WHERE id = p_id
      AND (p_organization_id IS NULL OR organization_id = p_organization_id);
END;
$$;
