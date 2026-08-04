-- s63c (Steve's History-tab design): read-only "Recently Sent" record for
-- managers/owners — every composer send (broadcast + job-title-targeted,
-- silent or push) in their org, newest first. DELIBERATELY not filtered by
-- the shade's job-title visibility rule: this is manager proof-of-send
-- tooling ("it went to Delivery — you're a Server"), same trust tier as the
-- dismissed list. System rows (redemption/leaderboard/retake) are excluded
-- by the notificationType filter. sender_name via LEFT JOIN (sent_by rows
-- survive user deletion as NULL).
-- NOTE: deployed LIVE via Supabase MCP apply_migration (s63_recent_sent_notifications);
-- this file is the repo record. Rehearsed: owner sees 8 composer sends w/
-- sender/targets; employee rejected 'Not authorized'.

CREATE OR REPLACE FUNCTION public.get_recent_sent_notifications(p_actor_id uuid, p_limit integer DEFAULT 40)
RETURNS TABLE(id uuid, title text, body text, created_at timestamptz, data jsonb, sender_name text)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE v_role text; v_org uuid;
BEGIN
  SELECT u.role, u.organization_id INTO v_role, v_org
    FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL OR v_role NOT IN ('manager','owner') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN QUERY
    SELECT n.id, n.title, n.body, n.created_at, n.data, u2.name
      FROM public.custom_notifications n
      LEFT JOIN public.users u2 ON u2.id = n.sent_by
     WHERE n.organization_id = v_org
       AND COALESCE(n.data->>'notificationType','') = 'custom'
     ORDER BY n.created_at DESC, n.id DESC
     LIMIT COALESCE(p_limit, 40);
END;
$$;
