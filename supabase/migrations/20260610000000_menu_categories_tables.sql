-- ============================================================================
-- D4: Owner-editable menu categories & subcategories.
--
-- Until now CATEGORIES/SUBCATEGORIES were hardcoded constants duplicated across
-- app/menu-editor.tsx and components/MenuDisplay.tsx. To make MyResto Connect a
-- real multi-tenant SaaS, each org owns its own editable category tree.
--
-- Locking ("decision A"): the 4 behavior-bearing built-ins carry a stable hidden
-- system_key; all special app logic keys off system_key (never the display name),
-- so owners can rename/reorder/hide them without breaking behavior, and they
-- cannot be hard-deleted.
--   * Lunch / Dinner    -> filter_behavior 'lunch'/'dinner' (boolean-flag tabs)
--   * Wine              -> system_key 'cat.wine' triggers the glass/bottle form
--   * Libations cocktail subs -> is_cocktail_fed=true, auto-injected from the
--                          libation_recipes / summer_libation_recipes tables.
--
-- The 'All' subcategory stays a MenuDisplay-only virtual pill — it is never
-- stored here.
--
-- Seed strings are the EXACT live McLoone's strings (verified against the DB),
-- so day-one rendering is unchanged. The seed is idempotent and backfilled for
-- every existing org.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.menu_categories (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  display_name    text NOT NULL,
  system_key      text,                                   -- NULL = owner-created; stable for built-ins
  filter_behavior text NOT NULL DEFAULT 'category_match', -- category_match | lunch | dinner | weekly_specials
  color           text NOT NULL DEFAULT '#607D8B',
  display_order   integer NOT NULL DEFAULT 0,
  is_hidden       boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.menu_subcategories (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  category_id     uuid NOT NULL REFERENCES public.menu_categories(id) ON DELETE CASCADE,
  display_name    text NOT NULL,
  system_key      text,                                   -- stable for cocktail-fed built-ins
  is_cocktail_fed boolean NOT NULL DEFAULT false,         -- replaces COCKTAIL_SUBCATEGORIES set
  display_order   integer NOT NULL DEFAULT 0,
  is_hidden       boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Indexes (must exist before the seed runs so ON CONFLICT targets resolve)
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS ux_menu_categories_org_name
  ON public.menu_categories (organization_id, lower(display_name));
CREATE UNIQUE INDEX IF NOT EXISTS ux_menu_categories_org_syskey
  ON public.menu_categories (organization_id, system_key) WHERE system_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_menu_categories_org_order
  ON public.menu_categories (organization_id, display_order);

CREATE UNIQUE INDEX IF NOT EXISTS ux_menu_subcategories_cat_name
  ON public.menu_subcategories (category_id, lower(display_name));
CREATE UNIQUE INDEX IF NOT EXISTS ux_menu_subcategories_org_syskey
  ON public.menu_subcategories (organization_id, system_key) WHERE system_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_menu_subcategories_cat_order
  ON public.menu_subcategories (category_id, display_order);

-- ---------------------------------------------------------------------------
-- RLS — blanket policy, security enforced in SECURITY DEFINER RPCs (app uses
-- custom auth, not Supabase Auth, so we never gate on `authenticated`).
-- ---------------------------------------------------------------------------
ALTER TABLE public.menu_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_subcategories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS menu_categories_all ON public.menu_categories;
CREATE POLICY menu_categories_all ON public.menu_categories
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS menu_subcategories_all ON public.menu_subcategories;
CREATE POLICY menu_subcategories_all ON public.menu_subcategories
  FOR ALL USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- Seed function: install the 6 default categories + their subcategories for an
-- org. Idempotent (ON CONFLICT DO NOTHING). Subcategory display_name strings
-- are the verified live McLoone's strings.
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
  ON CONFLICT (organization_id, system_key) WHERE system_key IS NOT NULL DO NOTHING;

  SELECT id INTO v_ws  FROM public.menu_categories WHERE organization_id = p_org_id AND system_key = 'cat.weekly_specials';
  SELECT id INTO v_lun FROM public.menu_categories WHERE organization_id = p_org_id AND system_key = 'cat.lunch';
  SELECT id INTO v_din FROM public.menu_categories WHERE organization_id = p_org_id AND system_key = 'cat.dinner';
  SELECT id INTO v_lib FROM public.menu_categories WHERE organization_id = p_org_id AND system_key = 'cat.libations';
  SELECT id INTO v_win FROM public.menu_categories WHERE organization_id = p_org_id AND system_key = 'cat.wine';
  SELECT id INTO v_hh  FROM public.menu_categories WHERE organization_id = p_org_id AND system_key = 'cat.happy_hour';

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

-- ---------------------------------------------------------------------------
-- One-time backfill: seed every existing org (McLoone's + any tenants).
-- ---------------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.organizations LOOP
    PERFORM public.seed_org_menu_categories(r.id);
  END LOOP;
END;
$$;
