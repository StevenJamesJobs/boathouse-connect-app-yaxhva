-- B2/B3 session 47 Batch B-1: RPC surface for the org-config trio
-- (organization_job_titles / organization_assistants / job_title_assistants), all previously
-- full-CRUD public. Custom auth => auth.uid() NULL; actor id passed as p_actor_id.
-- Reads are MEMBER-gated (actor's own org only, empty if actor unknown -> quiet on logout races).
-- Writes are OWNER-ROLE-gated to match the organization-settings screen (role='owner'), org derived.
-- All SECURITY DEFINER + search_path pinned.

-- ============ READS (member: own org, incl. inactive + id) ============
CREATE OR REPLACE FUNCTION public.get_org_job_titles(p_actor_id uuid)
RETURNS TABLE(id uuid, title text, display_order integer, is_active boolean)
LANGUAGE sql SECURITY DEFINER SET search_path = public, extensions, pg_temp AS $$
  SELECT t.id, t.title, t.display_order, t.is_active
  FROM public.organization_job_titles t
  WHERE t.organization_id = (SELECT u.organization_id FROM public.users u WHERE u.id = p_actor_id)
  ORDER BY t.display_order ASC;
$$;

CREATE OR REPLACE FUNCTION public.get_org_assistants(p_actor_id uuid)
RETURNS TABLE(id uuid, assistant_key text, display_name text, is_active boolean)
LANGUAGE sql SECURITY DEFINER SET search_path = public, extensions, pg_temp AS $$
  SELECT a.id, a.assistant_key, a.display_name, a.is_active
  FROM public.organization_assistants a
  WHERE a.organization_id = (SELECT u.organization_id FROM public.users u WHERE u.id = p_actor_id)
  ORDER BY a.assistant_key ASC;
$$;

CREATE OR REPLACE FUNCTION public.get_job_title_assistants(p_actor_id uuid)
RETURNS TABLE(assistant_key text, job_title text)
LANGUAGE sql SECURITY DEFINER SET search_path = public, extensions, pg_temp AS $$
  SELECT j.assistant_key, j.job_title
  FROM public.job_title_assistants j
  WHERE j.organization_id = (SELECT u.organization_id FROM public.users u WHERE u.id = p_actor_id);
$$;

-- ============ JOB TITLE WRITES (owner-role) ============
CREATE OR REPLACE FUNCTION public.add_org_job_title(p_actor_id uuid, p_title text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp AS $$
DECLARE v_org uuid; v_id uuid; v_title text;
BEGIN
  SELECT organization_id INTO v_org FROM public.users WHERE id = p_actor_id AND role = 'owner';
  IF v_org IS NULL THEN RAISE EXCEPTION 'Not authorized'; END IF;
  v_title := trim(p_title);
  IF v_title IS NULL OR length(v_title) = 0 THEN RAISE EXCEPTION 'Title required'; END IF;
  INSERT INTO public.organization_job_titles (organization_id, title, display_order, is_active)
  VALUES (v_org, v_title,
    COALESCE((SELECT max(display_order) + 1 FROM public.organization_job_titles WHERE organization_id = v_org), 0),
    true)
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.set_org_job_title_active(p_actor_id uuid, p_id uuid, p_is_active boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp AS $$
DECLARE v_org uuid;
BEGIN
  SELECT organization_id INTO v_org FROM public.users WHERE id = p_actor_id AND role = 'owner';
  IF v_org IS NULL THEN RAISE EXCEPTION 'Not authorized'; END IF;
  UPDATE public.organization_job_titles SET is_active = p_is_active
  WHERE id = p_id AND organization_id = v_org;
END; $$;

CREATE OR REPLACE FUNCTION public.delete_org_job_title(p_actor_id uuid, p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp AS $$
DECLARE v_org uuid;
BEGIN
  SELECT organization_id INTO v_org FROM public.users WHERE id = p_actor_id AND role = 'owner';
  IF v_org IS NULL THEN RAISE EXCEPTION 'Not authorized'; END IF;
  DELETE FROM public.organization_job_titles WHERE id = p_id AND organization_id = v_org;
END; $$;

CREATE OR REPLACE FUNCTION public.reorder_org_job_titles(p_actor_id uuid, p_ordered_ids uuid[])
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp AS $$
DECLARE v_org uuid;
BEGIN
  SELECT organization_id INTO v_org FROM public.users WHERE id = p_actor_id AND role = 'owner';
  IF v_org IS NULL THEN RAISE EXCEPTION 'Not authorized'; END IF;
  UPDATE public.organization_job_titles t SET display_order = o.idx - 1
  FROM unnest(p_ordered_ids) WITH ORDINALITY AS o(id, idx)
  WHERE t.id = o.id AND t.organization_id = v_org;
END; $$;

-- Atomic replace for the onboarding wizard (delete leftover + insert selected in order).
CREATE OR REPLACE FUNCTION public.replace_org_job_titles(p_actor_id uuid, p_titles text[])
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp AS $$
DECLARE v_org uuid;
BEGIN
  SELECT organization_id INTO v_org FROM public.users WHERE id = p_actor_id AND role = 'owner';
  IF v_org IS NULL THEN RAISE EXCEPTION 'Not authorized'; END IF;
  DELETE FROM public.organization_job_titles WHERE organization_id = v_org;
  INSERT INTO public.organization_job_titles (organization_id, title, display_order, is_active)
  SELECT v_org, trim(x.title), x.idx - 1, true
  FROM unnest(p_titles) WITH ORDINALITY AS x(title, idx)
  WHERE trim(x.title) <> ''
  ON CONFLICT (organization_id, title) DO NOTHING;
END; $$;

-- ============ ASSISTANT WRITES (owner-role) ============
CREATE OR REPLACE FUNCTION public.set_org_assistant_active(p_actor_id uuid, p_id uuid, p_is_active boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp AS $$
DECLARE v_org uuid;
BEGIN
  SELECT organization_id INTO v_org FROM public.users WHERE id = p_actor_id AND role = 'owner';
  IF v_org IS NULL THEN RAISE EXCEPTION 'Not authorized'; END IF;
  UPDATE public.organization_assistants SET is_active = p_is_active
  WHERE id = p_id AND organization_id = v_org;
END; $$;

-- Enable/disable one job_title -> assistant_key mapping.
CREATE OR REPLACE FUNCTION public.set_job_title_assistant(p_actor_id uuid, p_assistant_key text, p_job_title text, p_enabled boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp AS $$
DECLARE v_org uuid;
BEGIN
  SELECT organization_id INTO v_org FROM public.users WHERE id = p_actor_id AND role = 'owner';
  IF v_org IS NULL THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF p_enabled THEN
    INSERT INTO public.job_title_assistants (organization_id, assistant_key, job_title)
    VALUES (v_org, p_assistant_key, p_job_title)
    ON CONFLICT (organization_id, job_title, assistant_key) DO NOTHING;
  ELSE
    DELETE FROM public.job_title_assistants
    WHERE organization_id = v_org AND assistant_key = p_assistant_key AND job_title = p_job_title;
  END IF;
END; $$;

-- Actor overload of the existing seeder (org derived + owner gate). Legacy 1-arg (p_org_id) kept
-- for old clients until teardown; the p_dummy makes the type signature distinct (uuid,boolean) and
-- PostgREST disambiguates by JSON key name (verified: {p_actor_id} resolves here, {p_org_id} to legacy).
CREATE OR REPLACE FUNCTION public.seed_default_job_title_assistants(p_actor_id uuid, p_dummy boolean DEFAULT true)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp AS $$
DECLARE v_org uuid;
BEGIN
  SELECT organization_id INTO v_org FROM public.users WHERE id = p_actor_id AND role = 'owner';
  IF v_org IS NULL THEN RAISE EXCEPTION 'Not authorized'; END IF;
  INSERT INTO public.job_title_assistants (organization_id, job_title, assistant_key)
  SELECT v_org, jt.title, m.assistant_key
  FROM public.organization_job_titles jt
  JOIN (VALUES
    ('server','server'), ('lead server','server'), ('manager','server'),
    ('bartender','bartender'), ('manager','bartender'), ('lead server','bartender'), ('banquet captain','bartender'),
    ('host','host'), ('manager','host'),
    ('busser','kitchen'), ('chef','kitchen'), ('cook','kitchen'), ('kitchen','kitchen'), ('manager','kitchen'), ('runner','kitchen'),
    ('server','check_outs'), ('lead server','check_outs'), ('manager','check_outs')
  ) AS m(std_title, assistant_key)
    ON lower(btrim(jt.title)) = m.std_title
  WHERE jt.organization_id = v_org
  ON CONFLICT (organization_id, job_title, assistant_key) DO NOTHING;
END; $$;

GRANT EXECUTE ON FUNCTION
  public.get_org_job_titles(uuid),
  public.get_org_assistants(uuid),
  public.get_job_title_assistants(uuid),
  public.add_org_job_title(uuid, text),
  public.set_org_job_title_active(uuid, uuid, boolean),
  public.delete_org_job_title(uuid, uuid),
  public.reorder_org_job_titles(uuid, uuid[]),
  public.replace_org_job_titles(uuid, text[]),
  public.set_org_assistant_active(uuid, uuid, boolean),
  public.set_job_title_assistant(uuid, text, text, boolean),
  public.seed_default_job_title_assistants(uuid, boolean)
TO anon, authenticated;
