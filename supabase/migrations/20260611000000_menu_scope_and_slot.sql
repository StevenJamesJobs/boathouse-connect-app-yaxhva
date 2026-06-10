-- ============================================================================
-- D4 Part B (1/4): org-level menu_category_scope + per-menu slot on the trees.
--
-- Shared (default) = ONE category tree at slot 0 drives both menus (the
-- McLoone's seasonal model; 'both' items kept). Per-Menu = each menu owns an
-- independent tree (slot 1 = Menu 1 / 'winter', slot 2 = Menu 2 / 'summer').
--
-- The slot-0 tree is ALWAYS preserved, so switching scope is lossless: forward
-- materializes slot 1+2 (next migration), backward just flips the org flag.
-- Existing rows backfill to slot 0 → day-one behavior is unchanged.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- organizations.menu_category_scope
-- ---------------------------------------------------------------------------
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS menu_category_scope text NOT NULL DEFAULT 'shared';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'organizations_menu_category_scope_check'
  ) THEN
    ALTER TABLE public.organizations
      ADD CONSTRAINT organizations_menu_category_scope_check
      CHECK (menu_category_scope IN ('shared', 'per_menu'));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- menu_slot on both category tables (0 = shared, 1 = Menu 1, 2 = Menu 2)
-- ---------------------------------------------------------------------------
ALTER TABLE public.menu_categories
  ADD COLUMN IF NOT EXISTS menu_slot smallint NOT NULL DEFAULT 0;
ALTER TABLE public.menu_subcategories
  ADD COLUMN IF NOT EXISTS menu_slot smallint NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------------
-- Recreate uniqueness/order indexes to include menu_slot, so per-menu trees
-- can legitimately repeat names + system_keys across slots.
-- (ux_menu_subcategories_cat_name stays — category_id already implies slot.)
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS public.ux_menu_categories_org_name;
CREATE UNIQUE INDEX ux_menu_categories_org_name
  ON public.menu_categories (organization_id, menu_slot, lower(display_name));

DROP INDEX IF EXISTS public.ux_menu_categories_org_syskey;
CREATE UNIQUE INDEX ux_menu_categories_org_syskey
  ON public.menu_categories (organization_id, menu_slot, system_key) WHERE system_key IS NOT NULL;

DROP INDEX IF EXISTS public.ux_menu_subcategories_org_syskey;
CREATE UNIQUE INDEX ux_menu_subcategories_org_syskey
  ON public.menu_subcategories (organization_id, menu_slot, system_key) WHERE system_key IS NOT NULL;

DROP INDEX IF EXISTS public.ix_menu_categories_org_order;
CREATE INDEX ix_menu_categories_org_order
  ON public.menu_categories (organization_id, menu_slot, display_order);

-- ---------------------------------------------------------------------------
-- Recreate the seed function with the slot-aware ON CONFLICT target. Seed data
-- is unchanged and still installs the slot-0 (shared) tree (menu_slot defaults
-- to 0). Idempotent + backfilled into signup_owner_with_org already.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.seed_org_menu_categories(p_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ws  uuid; v_lun uuid; v_din uuid; v_lib uuid; v_win uuid; v_hh uuid;
BEGIN
  INSERT INTO public.menu_categories
    (organization_id, display_name, system_key, filter_behavior, color, display_order)
  VALUES
    (p_org_id, 'Weekly Specials', 'cat.weekly_specials', 'weekly_specials', '#F44336', 0),
    (p_org_id, 'Lunch',           'cat.lunch',           'lunch',           '#4CAF50', 1),
    (p_org_id, 'Dinner',          'cat.dinner',          'dinner',          '#1976D2', 2),
    (p_org_id, 'Libations',       'cat.libations',       'category_match',  '#9C27B0', 3),
    (p_org_id, 'Wine',            'cat.wine',            'category_match',  '#E91E63', 4),
    (p_org_id, 'Happy Hour',      'cat.happy_hour',      'category_match',  '#FF9800', 5)
  ON CONFLICT (organization_id, menu_slot, system_key) WHERE system_key IS NOT NULL DO NOTHING;

  SELECT id INTO v_ws  FROM public.menu_categories WHERE organization_id = p_org_id AND menu_slot = 0 AND system_key = 'cat.weekly_specials';
  SELECT id INTO v_lun FROM public.menu_categories WHERE organization_id = p_org_id AND menu_slot = 0 AND system_key = 'cat.lunch';
  SELECT id INTO v_din FROM public.menu_categories WHERE organization_id = p_org_id AND menu_slot = 0 AND system_key = 'cat.dinner';
  SELECT id INTO v_lib FROM public.menu_categories WHERE organization_id = p_org_id AND menu_slot = 0 AND system_key = 'cat.libations';
  SELECT id INTO v_win FROM public.menu_categories WHERE organization_id = p_org_id AND menu_slot = 0 AND system_key = 'cat.wine';
  SELECT id INTO v_hh  FROM public.menu_categories WHERE organization_id = p_org_id AND menu_slot = 0 AND system_key = 'cat.happy_hour';

  -- Weekly Specials has no subcategories.
  INSERT INTO public.menu_subcategories
    (organization_id, category_id, display_name, system_key, is_cocktail_fed, display_order)
  VALUES
    -- Lunch
    (p_org_id, v_lun, 'Starters',   NULL, false, 0),
    (p_org_id, v_lun, 'Raw Bar',    NULL, false, 1),
    (p_org_id, v_lun, 'Soups',      NULL, false, 2),
    (p_org_id, v_lun, 'Tacos',      NULL, false, 3),
    (p_org_id, v_lun, 'Salads',     NULL, false, 4),
    (p_org_id, v_lun, 'Burgers',    NULL, false, 5),
    (p_org_id, v_lun, 'Sandwiches', NULL, false, 6),
    (p_org_id, v_lun, 'Sides',      NULL, false, 7),
    -- Dinner
    (p_org_id, v_din, 'Starters', NULL, false, 0),
    (p_org_id, v_din, 'Raw Bar',  NULL, false, 1),
    (p_org_id, v_din, 'Soups',    NULL, false, 2),
    (p_org_id, v_din, 'Tacos',    NULL, false, 3),
    (p_org_id, v_din, 'Salads',   NULL, false, 4),
    (p_org_id, v_din, 'Entrees',  NULL, false, 5),
    (p_org_id, v_din, 'Pasta',    NULL, false, 6),
    (p_org_id, v_din, 'Sides',    NULL, false, 7),
    -- Libations (first 5 are cocktail-fed -> system_key + is_cocktail_fed)
    (p_org_id, v_lib, 'Signature Cocktails', 'sub.signature_cocktails', true,  0),
    (p_org_id, v_lib, 'Martinis',            'sub.martinis',            true,  1),
    (p_org_id, v_lib, 'Sangria',             'sub.sangria',             true,  2),
    (p_org_id, v_lib, 'Low ABV',             'sub.low_abv',             true,  3),
    (p_org_id, v_lib, 'Zero ABV',            'sub.zero_abv',            true,  4),
    (p_org_id, v_lib, 'Draft Beer',          NULL,                      false, 5),
    (p_org_id, v_lib, 'Bottle & Cans',       NULL,                      false, 6),
    -- Wine
    (p_org_id, v_win, 'Sparkling',          NULL, false, 0),
    (p_org_id, v_win, 'Rose',               NULL, false, 1),
    (p_org_id, v_win, 'Chardonnay',         NULL, false, 2),
    (p_org_id, v_win, 'Pinot Grigio',       NULL, false, 3),
    (p_org_id, v_win, 'Sauvignon Blanc',    NULL, false, 4),
    (p_org_id, v_win, 'Interesting Whites', NULL, false, 5),
    (p_org_id, v_win, 'Cabernet Sauvignon', NULL, false, 6),
    (p_org_id, v_win, 'Pinot Noir',         NULL, false, 7),
    (p_org_id, v_win, 'Merlot',             NULL, false, 8),
    (p_org_id, v_win, 'Italian Reds',       NULL, false, 9),
    (p_org_id, v_win, 'Interesting Reds',   NULL, false, 10),
    -- Happy Hour
    (p_org_id, v_hh, 'Appetizers', NULL, false, 0),
    (p_org_id, v_hh, 'Drinks',     NULL, false, 1),
    (p_org_id, v_hh, 'Spirits',    NULL, false, 2)
  ON CONFLICT (category_id, lower(display_name)) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.seed_org_menu_categories(uuid) TO anon, authenticated;
