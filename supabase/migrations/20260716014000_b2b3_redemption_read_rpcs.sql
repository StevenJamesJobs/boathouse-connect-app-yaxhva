-- B2/B3 session 47 Batch B-2: member-gated read RPCs for the redemption-config tables
-- (organization_redemption_settings + redemption_custom_options were world-readable via
-- `USING(true)` SELECT). Writes already gated by _can_manage_redemptions; pin their search_path.

-- Settings: one row for the actor's org, or EMPTY when absent (client keeps its REDEMPTION_DEFAULTS
-- fallback keyed on row absence). Member-gated (own org only; empty for unknown actor).
CREATE OR REPLACE FUNCTION public.get_redemption_settings(p_actor_id uuid)
RETURNS TABLE(
  redemptions_enabled boolean, food_enabled boolean, food_mode text,
  section_enabled boolean, section_cost integer, sidework_enabled boolean,
  sidework_cost integer, freeshift_enabled boolean, freeshift_cost integer
)
LANGUAGE sql SECURITY DEFINER SET search_path = public, extensions, pg_temp AS $$
  SELECT s.redemptions_enabled, s.food_enabled, s.food_mode,
         s.section_enabled, s.section_cost, s.sidework_enabled,
         s.sidework_cost, s.freeshift_enabled, s.freeshift_cost
  FROM public.organization_redemption_settings s
  WHERE s.organization_id = (SELECT u.organization_id FROM public.users u WHERE u.id = p_actor_id);
$$;

-- Custom options: active-only for everyone; managers/owners additionally see inactive when
-- p_include_inactive is true (the editor). Non-managers requesting inactive silently degrade to
-- active-only (redeem-settings has no route guard; inactive options are not sensitive).
CREATE OR REPLACE FUNCTION public.get_redemption_custom_options(p_actor_id uuid, p_include_inactive boolean DEFAULT false)
RETURNS TABLE(id uuid, label text, label_es text, cost integer, is_active boolean, display_order integer)
LANGUAGE sql SECURITY DEFINER SET search_path = public, extensions, pg_temp AS $$
  SELECT o.id, o.label, o.label_es, o.cost, o.is_active, o.display_order
  FROM public.redemption_custom_options o
  WHERE o.organization_id = (SELECT u.organization_id FROM public.users u WHERE u.id = p_actor_id)
    AND (
      o.is_active
      OR (p_include_inactive AND EXISTS (
        SELECT 1 FROM public.users u2
        WHERE u2.id = p_actor_id AND u2.organization_id = o.organization_id
          AND u2.role IN ('manager','owner')
      ))
    )
  ORDER BY o.display_order ASC;
$$;

GRANT EXECUTE ON FUNCTION
  public.get_redemption_settings(uuid),
  public.get_redemption_custom_options(uuid, boolean)
TO anon, authenticated;

-- Pin search_path on the existing (already _can_manage_redemptions-gated) write fns.
ALTER FUNCTION public.update_redemption_settings(uuid, uuid, boolean, boolean, text, boolean, integer, boolean, integer, boolean, integer) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.upsert_redemption_custom_option(uuid, uuid, uuid, text, integer, boolean, text) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.delete_redemption_custom_option(uuid, uuid, uuid) SET search_path = public, extensions, pg_temp;
