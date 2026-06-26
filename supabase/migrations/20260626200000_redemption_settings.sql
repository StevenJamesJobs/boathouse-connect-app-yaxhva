-- Org-configurable redemption settings (Session 37).
--
-- Until now the redeem options (Food & Beverage = item price, Choose Your Own
-- Section = 10, Side Work = 5, Free Shift = 25) were HARDCODED in app/redeem.tsx
-- with no master on/off and no half-price mode. This adds:
--   * organization_redemption_settings — one row/org: the master toggle, the
--     F&B full/half mode, and each built-in option's enabled flag + bucks cost.
--   * redemption_custom_options — owner/manager-created extra options.
-- Managed by owner OR manager (they run the floor); employees read it so the
-- redeem screen + menu Redeem buttons reflect the org's live config.

-- ── settings: one row per org ──
CREATE TABLE IF NOT EXISTS public.organization_redemption_settings (
  organization_id     uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  redemptions_enabled boolean NOT NULL DEFAULT true,
  food_enabled        boolean NOT NULL DEFAULT true,
  food_mode           text    NOT NULL DEFAULT 'full' CHECK (food_mode IN ('full', 'half')),
  section_enabled     boolean NOT NULL DEFAULT true,
  section_cost        int     NOT NULL DEFAULT 10,
  sidework_enabled    boolean NOT NULL DEFAULT true,
  sidework_cost       int     NOT NULL DEFAULT 5,
  freeshift_enabled   boolean NOT NULL DEFAULT true,
  freeshift_cost      int     NOT NULL DEFAULT 25,
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- ── custom options: many per org ──
CREATE TABLE IF NOT EXISTS public.redemption_custom_options (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  label           text NOT NULL,
  cost            int  NOT NULL,
  is_active       boolean NOT NULL DEFAULT true,
  display_order   int  NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_redemption_custom_options_org
  ON public.redemption_custom_options (organization_id, display_order);

-- Anon-readable (app uses the anon key + custom auth; employees must read the
-- config). Writes go ONLY through the SECURITY DEFINER RPCs below.
ALTER TABLE public.organization_redemption_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.redemption_custom_options ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read redemption settings" ON public.organization_redemption_settings;
CREATE POLICY "read redemption settings" ON public.organization_redemption_settings FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "read redemption custom options" ON public.redemption_custom_options;
CREATE POLICY "read redemption custom options" ON public.redemption_custom_options FOR SELECT TO anon, authenticated USING (true);

-- ── manager/owner gate helper ──
CREATE OR REPLACE FUNCTION public._can_manage_redemptions(p_organization_id uuid, p_user_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = p_user_id
      AND u.organization_id = p_organization_id
      AND u.role IN ('manager', 'owner')
  );
$function$;

-- ── update the settings row (manager/owner only; upserts the default row) ──
CREATE OR REPLACE FUNCTION public.update_redemption_settings(
  p_user_id uuid,
  p_organization_id uuid,
  p_redemptions_enabled boolean,
  p_food_enabled boolean,
  p_food_mode text,
  p_section_enabled boolean,
  p_section_cost int,
  p_sidework_enabled boolean,
  p_sidework_cost int,
  p_freeshift_enabled boolean,
  p_freeshift_cost int
) RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $function$
BEGIN
  IF NOT public._can_manage_redemptions(p_organization_id, p_user_id) THEN
    RETURN json_build_object('ok', false, 'reason', 'not_authorized');
  END IF;
  IF p_food_mode NOT IN ('full', 'half') THEN
    RETURN json_build_object('ok', false, 'reason', 'invalid_food_mode');
  END IF;
  INSERT INTO public.organization_redemption_settings AS s (
    organization_id, redemptions_enabled, food_enabled, food_mode,
    section_enabled, section_cost, sidework_enabled, sidework_cost,
    freeshift_enabled, freeshift_cost, updated_at
  ) VALUES (
    p_organization_id, p_redemptions_enabled, p_food_enabled, p_food_mode,
    p_section_enabled, GREATEST(0, p_section_cost), p_sidework_enabled, GREATEST(0, p_sidework_cost),
    p_freeshift_enabled, GREATEST(0, p_freeshift_cost), now()
  )
  ON CONFLICT (organization_id) DO UPDATE SET
    redemptions_enabled = EXCLUDED.redemptions_enabled,
    food_enabled = EXCLUDED.food_enabled,
    food_mode = EXCLUDED.food_mode,
    section_enabled = EXCLUDED.section_enabled,
    section_cost = EXCLUDED.section_cost,
    sidework_enabled = EXCLUDED.sidework_enabled,
    sidework_cost = EXCLUDED.sidework_cost,
    freeshift_enabled = EXCLUDED.freeshift_enabled,
    freeshift_cost = EXCLUDED.freeshift_cost,
    updated_at = now();
  RETURN json_build_object('ok', true);
END;
$function$;

-- ── add or update a custom option (manager/owner only) ──
CREATE OR REPLACE FUNCTION public.upsert_redemption_custom_option(
  p_user_id uuid,
  p_organization_id uuid,
  p_id uuid,
  p_label text,
  p_cost int,
  p_is_active boolean
) RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $function$
DECLARE v_id uuid;
BEGIN
  IF NOT public._can_manage_redemptions(p_organization_id, p_user_id) THEN
    RETURN json_build_object('ok', false, 'reason', 'not_authorized');
  END IF;
  IF p_label IS NULL OR length(trim(p_label)) = 0 THEN
    RETURN json_build_object('ok', false, 'reason', 'label_required');
  END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.redemption_custom_options (organization_id, label, cost, is_active, display_order)
    VALUES (
      p_organization_id, trim(p_label), GREATEST(0, p_cost), COALESCE(p_is_active, true),
      COALESCE((SELECT max(display_order) + 1 FROM public.redemption_custom_options WHERE organization_id = p_organization_id), 0)
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.redemption_custom_options
       SET label = trim(p_label), cost = GREATEST(0, p_cost), is_active = COALESCE(p_is_active, true)
     WHERE id = p_id AND organization_id = p_organization_id
    RETURNING id INTO v_id;
  END IF;
  RETURN json_build_object('ok', true, 'id', v_id);
END;
$function$;

-- ── delete a custom option (manager/owner only) ──
CREATE OR REPLACE FUNCTION public.delete_redemption_custom_option(
  p_user_id uuid,
  p_organization_id uuid,
  p_id uuid
) RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $function$
BEGIN
  IF NOT public._can_manage_redemptions(p_organization_id, p_user_id) THEN
    RETURN json_build_object('ok', false, 'reason', 'not_authorized');
  END IF;
  DELETE FROM public.redemption_custom_options WHERE id = p_id AND organization_id = p_organization_id;
  RETURN json_build_object('ok', true);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.update_redemption_settings(uuid, uuid, boolean, boolean, text, boolean, int, boolean, int, boolean, int) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_redemption_custom_option(uuid, uuid, uuid, text, int, boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_redemption_custom_option(uuid, uuid, uuid) TO anon, authenticated;
