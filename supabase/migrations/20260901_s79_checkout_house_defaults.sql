-- s79 Tools-wave satellite: org-level checkout HOUSE DEFAULTS (fully additive).
-- The O/M-authored baseline for the Checkouts ritual: house declare % + the
-- tip-out position list (which positions, their ORDER, per-position %).
-- SEED-EVERY-CHECKOUT semantics live client-side: when a row exists it is the
-- standing baseline each run — a user's day-of edits apply to that checkout
-- only and never persist. Orgs without a row keep the legacy behavior
-- (device-remembered prefs, canonical trio seed).

CREATE TABLE IF NOT EXISTS public.org_checkout_defaults (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  declare_pct numeric NOT NULL,
  -- Ordered array of {title text, pct numeric-fraction} — order IS the display order.
  tip_outs jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Sealed: RLS on, zero policies (deny-all by design) — access is DEFINER-only.
ALTER TABLE public.org_checkout_defaults ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.get_checkout_defaults(p_actor_id uuid)
RETURNS TABLE(declare_pct numeric, tip_outs jsonb)
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
DECLARE v_org uuid;
BEGIN
  SELECT u.organization_id INTO v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Invalid actor'; END IF;
  RETURN QUERY
    SELECT d.declare_pct, d.tip_outs
    FROM public.org_checkout_defaults d
    WHERE d.organization_id = v_org;
END; $$;

CREATE OR REPLACE FUNCTION public.set_checkout_defaults(p_actor_id uuid, p_declare_pct numeric, p_tip_outs jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
DECLARE v_role text; v_org uuid; v_item jsonb; v_title text; v_pct numeric;
BEGIN
  SELECT u.role, u.organization_id INTO v_role, v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Invalid actor'; END IF;
  IF v_role NOT IN ('manager','owner') THEN RAISE EXCEPTION 'Only managers or owners can edit checkout defaults'; END IF;
  IF p_declare_pct IS NULL OR p_declare_pct < 0 OR p_declare_pct > 1 THEN
    RAISE EXCEPTION 'Invalid checkout defaults';
  END IF;
  IF p_tip_outs IS NULL OR jsonb_typeof(p_tip_outs) <> 'array' OR jsonb_array_length(p_tip_outs) > 20 THEN
    RAISE EXCEPTION 'Invalid checkout defaults';
  END IF;
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_tip_outs) LOOP
    v_title := v_item->>'title';
    v_pct := (v_item->>'pct')::numeric;
    IF v_title IS NULL OR length(btrim(v_title)) = 0 OR length(v_title) > 40
       OR v_pct IS NULL OR v_pct < 0 OR v_pct > 1 THEN
      RAISE EXCEPTION 'Invalid checkout defaults';
    END IF;
  END LOOP;
  INSERT INTO public.org_checkout_defaults (organization_id, declare_pct, tip_outs, updated_by, updated_at)
  VALUES (v_org, p_declare_pct, p_tip_outs, p_actor_id, now())
  ON CONFLICT (organization_id) DO UPDATE
    SET declare_pct = EXCLUDED.declare_pct,
        tip_outs = EXCLUDED.tip_outs,
        updated_by = EXCLUDED.updated_by,
        updated_at = now();
END; $$;

GRANT EXECUTE ON FUNCTION public.get_checkout_defaults(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_checkout_defaults(uuid, numeric, jsonb) TO anon, authenticated, service_role;
