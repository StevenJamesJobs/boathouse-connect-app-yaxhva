-- S50 B5 teardown group D (2026-07-21): org-config (job titles/assistants/
-- redemption/subscriptions/guides/host) + the legacy anon-dead trio
-- (weekly_specials/events/feedback) + push_tokens/notification_logs — drop
-- every remaining legacy policy and revoke table grants. notification_logs'
-- INSERT CHECK(true) was the anon log-spam hole; the send-push edge fn uses
-- the service role and is unaffected.
-- ROLLBACK: re-CREATE from session50_manifests/restore_policies.sql;
--           re-GRANT from session50_manifests/restore_table_grants.sql.

-- job titles / assistants trio (12)
DROP POLICY "public_delete_org_job_titles" ON public.organization_job_titles;
DROP POLICY "public_insert_org_job_titles" ON public.organization_job_titles;
DROP POLICY "public_read_org_job_titles" ON public.organization_job_titles;
DROP POLICY "public_update_org_job_titles" ON public.organization_job_titles;
DROP POLICY "public_delete_org_assistants" ON public.organization_assistants;
DROP POLICY "public_insert_org_assistants" ON public.organization_assistants;
DROP POLICY "public_read_org_assistants" ON public.organization_assistants;
DROP POLICY "public_update_org_assistants" ON public.organization_assistants;
DROP POLICY "public_delete_jta" ON public.job_title_assistants;
DROP POLICY "public_insert_jta" ON public.job_title_assistants;
DROP POLICY "public_read_jta" ON public.job_title_assistants;
DROP POLICY "public_update_jta" ON public.job_title_assistants;
-- redemption config (2)
DROP POLICY "read redemption custom options" ON public.redemption_custom_options;
DROP POLICY "read redemption settings" ON public.organization_redemption_settings;
-- subscriptions (1)
DROP POLICY "Allow read access to organization subscriptions" ON public.organization_subscriptions;
-- guides (5, incl. the duplicate SELECT)
DROP POLICY "Allow all to delete guides" ON public.guides_and_training;
DROP POLICY "Allow all to insert guides" ON public.guides_and_training;
DROP POLICY "Allow all to read active guides" ON public.guides_and_training;
DROP POLICY "Allow all to update guides" ON public.guides_and_training;
DROP POLICY "Everyone can view active guides" ON public.guides_and_training;
-- host (2)
DROP POLICY "host_sections_read" ON public.host_sections;
DROP POLICY "host_section_tiles_read" ON public.host_section_tiles;
-- legacy anon-dead trio (14)
DROP POLICY "Everyone can view weekly specials" ON public.weekly_specials;
DROP POLICY "Only managers can delete weekly specials" ON public.weekly_specials;
DROP POLICY "Only managers can insert weekly specials" ON public.weekly_specials;
DROP POLICY "Only managers can update weekly specials" ON public.weekly_specials;
DROP POLICY "Everyone can view events" ON public.events;
DROP POLICY "Only managers can delete events" ON public.events;
DROP POLICY "Only managers can insert events" ON public.events;
DROP POLICY "Only managers can update events" ON public.events;
DROP POLICY "Allow all authenticated users to insert feedback" ON public.feedback;
DROP POLICY "Employees can insert their own feedback" ON public.feedback;
DROP POLICY "Managers can delete feedback" ON public.feedback;
DROP POLICY "Managers can update feedback" ON public.feedback;
DROP POLICY "Managers can view all feedback" ON public.feedback;
DROP POLICY "Users can view their own feedback" ON public.feedback;
-- push/logs (4)
DROP POLICY "Users can manage their own push tokens" ON public.push_tokens;
DROP POLICY "System can insert notification logs" ON public.notification_logs;
DROP POLICY "Users can update their own notification logs" ON public.notification_logs;
DROP POLICY "Users can view their own notification logs" ON public.notification_logs;

REVOKE ALL ON public.organization_job_titles FROM anon, authenticated;
REVOKE ALL ON public.organization_assistants FROM anon, authenticated;
REVOKE ALL ON public.job_title_assistants FROM anon, authenticated;
REVOKE ALL ON public.redemption_custom_options FROM anon, authenticated;
REVOKE ALL ON public.organization_redemption_settings FROM anon, authenticated;
REVOKE ALL ON public.organization_subscriptions FROM anon, authenticated;
REVOKE ALL ON public.guides_and_training FROM anon, authenticated;
REVOKE ALL ON public.host_sections FROM anon, authenticated;
REVOKE ALL ON public.host_section_tiles FROM anon, authenticated;
REVOKE ALL ON public.weekly_specials FROM anon, authenticated;
REVOKE ALL ON public.events FROM anon, authenticated;
REVOKE ALL ON public.feedback FROM anon, authenticated;
REVOKE ALL ON public.push_tokens FROM anon, authenticated;
REVOKE ALL ON public.notification_logs FROM anon, authenticated;
