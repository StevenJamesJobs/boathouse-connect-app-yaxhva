-- s66 hardening of the guide_categories surface, from the adversarial pass.
-- Applied via the Supabase MCP; this file is the repo record.
--
-- ⚠️ The three fixes here came out of verification, not planning. Worth reading
-- before adding anything to this surface:
--   1. A visibility flag that only the client honours is not a visibility flag.
--   2. A SECURITY DEFINER function taking a caller-supplied org id needs a gate
--      even when "nothing calls it directly".
--   3. A reorder that accepts a partial array corrupts ordering silently.

-- ── 1) HIDING MUST BE ENFORCED ON THE SERVER ────────────────────────────────
-- is_hidden shipped as a staff-visibility control, but get_guides had no
-- category gate — so a hidden category's guides were still delivered in full
-- (title, description, thumbnail_url, file_url) to every active employee, with
-- only a client-side Set.has() declining to RENDER them. file_url is enough to
-- have the storage broker sign the object, so "hidden" conveyed nothing at all.
--
-- Managers/owners still see everything: the editor must be able to manage a
-- hidden category's contents.
--
-- The category join is CASE-INSENSITIVE, matching every other server path (the
-- seed's adopt arm, the rename cascade, the delete guard, the unique index).
-- A guide whose category has NO row stays visible on purpose: dropping it would
-- silently hide content from an org that has not been seeded yet.
CREATE OR REPLACE FUNCTION public.get_guides(
  p_actor_id uuid,
  p_include_inactive boolean DEFAULT false
)
RETURNS SETOF public.guides_and_training
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
  SELECT g.*
  FROM public.guides_and_training g
  WHERE g.organization_id = (SELECT u.organization_id FROM public.users u WHERE u.id = p_actor_id)
    AND (
      g.is_active
      OR (p_include_inactive AND EXISTS (
        SELECT 1 FROM public.users u2
        WHERE u2.id = p_actor_id AND u2.organization_id = g.organization_id
          AND u2.role IN ('manager','owner')
      ))
    )
    AND (
      EXISTS (
        SELECT 1 FROM public.users u3
        WHERE u3.id = p_actor_id AND u3.organization_id = g.organization_id
          AND u3.role IN ('manager','owner')
      )
      OR NOT EXISTS (
        SELECT 1 FROM public.guide_categories c
        WHERE c.organization_id = g.organization_id
          AND lower(c.name) = lower(g.category)
          AND c.is_hidden
      )
    )
  ORDER BY g.category ASC, g.display_order ASC;
$$;

-- ── 2) seed_org_guide_categories had no authorization ───────────────────────
-- It is SECURITY DEFINER and takes the org id from the CALLER — the one path in
-- this surface where a caller-supplied id crossed org boundaries — and it
-- carried EXECUTE to anon/authenticated/PUBLIC. It exists only to be PERFORMed
-- by get_guide_categories, which is itself definer, so no client role needs it.
REVOKE EXECUTE ON FUNCTION public.seed_org_guide_categories(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.seed_org_guide_categories(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.seed_org_guide_categories(uuid) FROM authenticated;

-- ── 3) Reorder accepted partial / foreign-org payloads silently ─────────────
-- Ids from another org simply matched no rows, and a partial array left two
-- categories sharing a display_order. Reject anything that is not exactly this
-- org's full category set, once each.
CREATE OR REPLACE FUNCTION public.manage_guide_category_reorder(
  p_actor_id uuid, p_ordered_ids uuid[]
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org uuid; v_given integer; v_owned integer; v_total integer;
BEGIN
  v_org := public._require_content_manager(p_actor_id);

  v_given := coalesce(array_length(p_ordered_ids, 1), 0);
  SELECT count(DISTINCT c.id) INTO v_owned
    FROM public.guide_categories c
   WHERE c.organization_id = v_org AND c.id = ANY(p_ordered_ids);
  SELECT count(*) INTO v_total
    FROM public.guide_categories c WHERE c.organization_id = v_org;

  IF v_given <> v_owned OR v_owned <> v_total THEN
    RAISE EXCEPTION 'Reorder must list every category in your organization exactly once';
  END IF;

  UPDATE public.guide_categories c
     SET display_order = x.ord - 1, updated_at = now()
    FROM unnest(p_ordered_ids) WITH ORDINALITY AS x(cid, ord)
   WHERE c.id = x.cid AND c.organization_id = v_org;
END $$;

-- VERIFIED LIVE after applying:
--   staff 3 guides -> 1 after hiding a 2-guide category -> 3 after unhiding
--   manager unaffected (3 throughout); Boathouse still 50; 0 orphaned guides;
--   0 duplicate display_order; seed_org_guide_categories grants: NONE.
