-- B2/B3 session 47 Batch C-2: host_sections/host_section_tiles had public SELECT (USING true) and
-- no write policies (writes already go through _can_manage_host DEFINER RPCs). Add member reads +
-- pin the 8 gated CRUD/reorder fns + the seeder.

-- Sections: by-id path returns the single row if it's in the actor's org (regardless of active --
-- editor + deep-links need it). List path: active-only for everyone; mgr/owner see inactive when
-- p_include_inactive (the editor).
CREATE OR REPLACE FUNCTION public.get_host_sections(p_actor_id uuid, p_id uuid DEFAULT NULL, p_include_inactive boolean DEFAULT false)
RETURNS SETOF public.host_sections
LANGUAGE sql SECURITY DEFINER SET search_path = public, extensions, pg_temp AS $$
  SELECT s.*
  FROM public.host_sections s
  WHERE s.organization_id = (SELECT u.organization_id FROM public.users u WHERE u.id = p_actor_id)
    AND (
      p_id IS NOT NULL AND s.id = p_id
    )
  UNION ALL
  SELECT s.*
  FROM public.host_sections s
  WHERE p_id IS NULL
    AND s.organization_id = (SELECT u.organization_id FROM public.users u WHERE u.id = p_actor_id)
    AND (
      s.is_active
      OR (p_include_inactive AND EXISTS (
        SELECT 1 FROM public.users u2
        WHERE u2.id = p_actor_id AND u2.organization_id = s.organization_id
          AND u2.role IN ('manager','owner')
      ))
    )
  ORDER BY display_order ASC;
$$;

-- Tiles: member; section must be in the actor's org.
CREATE OR REPLACE FUNCTION public.get_host_section_tiles(p_actor_id uuid, p_section_id uuid)
RETURNS SETOF public.host_section_tiles
LANGUAGE sql SECURITY DEFINER SET search_path = public, extensions, pg_temp AS $$
  SELECT t.*
  FROM public.host_section_tiles t
  WHERE t.section_id = p_section_id
    AND t.organization_id = (SELECT u.organization_id FROM public.users u WHERE u.id = p_actor_id)
  ORDER BY t.display_order ASC;
$$;

GRANT EXECUTE ON FUNCTION
  public.get_host_sections(uuid, uuid, boolean),
  public.get_host_section_tiles(uuid, uuid)
TO anon, authenticated;

-- Pin search_path on the existing gated write/seed fns.
ALTER FUNCTION public.create_host_section(uuid, uuid, text, text, text, text, text, text) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.update_host_section(uuid, uuid, text, text, text, text, text, text, boolean) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.delete_host_section(uuid, uuid) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.reorder_host_sections(uuid, uuid, uuid[]) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.create_host_section_tile(uuid, uuid, text, text, text, text, text) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.update_host_section_tile(uuid, uuid, text, text, text, text, text) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.delete_host_section_tile(uuid, uuid) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.reorder_host_section_tiles(uuid, uuid, uuid[]) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.seed_org_host_sections(uuid) SET search_path = public, extensions, pg_temp;
