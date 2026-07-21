-- S50 B5 teardown group C (2026-07-21): content-postings + messages +
-- notifications + exams cluster + shade — drop every legacy policy and revoke
-- table grants. All client access is via DEFINER RPCs (sessions 45-46). The
-- supabase_realtime publication is EMPTY (re-verified today) — no realtime
-- pairing needed. KEEPS the auto_delete_old_messages trigger.
-- ROLLBACK: re-CREATE from session50_manifests/restore_policies.sql;
--           re-GRANT from session50_manifests/restore_table_grants.sql.

-- content-postings (17)
DROP POLICY "Anon can view active announcements" ON public.announcements;
DROP POLICY "Only managers can delete announcements" ON public.announcements;
DROP POLICY "Only managers can insert announcements" ON public.announcements;
DROP POLICY "Only managers can update announcements" ON public.announcements;
DROP POLICY "Public can view active announcements" ON public.announcements;
DROP POLICY "Allow authenticated DELETE on special_features" ON public.special_features;
DROP POLICY "Allow authenticated INSERT on special_features" ON public.special_features;
DROP POLICY "Allow authenticated UPDATE on special_features" ON public.special_features;
DROP POLICY "Allow public SELECT on special_features" ON public.special_features;
DROP POLICY "Allow authenticated DELETE on upcoming_events" ON public.upcoming_events;
DROP POLICY "Allow authenticated INSERT on upcoming_events" ON public.upcoming_events;
DROP POLICY "Allow authenticated UPDATE on upcoming_events" ON public.upcoming_events;
DROP POLICY "Allow public SELECT on upcoming_events" ON public.upcoming_events;
DROP POLICY "Anyone can delete content images" ON public.content_images;
DROP POLICY "Anyone can insert content images" ON public.content_images;
DROP POLICY "Anyone can read content images" ON public.content_images;
DROP POLICY "Anyone can update content images" ON public.content_images;
-- messages (6)
DROP POLICY "Users can insert their own messages" ON public.messages;
DROP POLICY "Users can update their own messages" ON public.messages;
DROP POLICY "Users can view their sent messages" ON public.messages;
DROP POLICY "Users can insert message recipients" ON public.message_recipients;
DROP POLICY "Users can update their message recipient records" ON public.message_recipients;
DROP POLICY "Users can view their received messages" ON public.message_recipients;
-- notifications (4)
DROP POLICY "Everyone can view custom notifications" ON public.custom_notifications;
DROP POLICY "Managers can delete custom notifications" ON public.custom_notifications;
DROP POLICY "Managers can insert custom notifications" ON public.custom_notifications;
DROP POLICY "Users can manage their own notification preferences" ON public.notification_preferences;
-- exams cluster (10; exam_results policies dropped in group A)
DROP POLICY "Anyone can insert exams" ON public.exams;
DROP POLICY "Anyone can update exams" ON public.exams;
DROP POLICY "Anyone can view exams" ON public.exams;
DROP POLICY "Anyone can delete exam questions" ON public.exam_questions;
DROP POLICY "Anyone can insert exam questions" ON public.exam_questions;
DROP POLICY "Anyone can update exam questions" ON public.exam_questions;
DROP POLICY "Anyone can view exam questions" ON public.exam_questions;
DROP POLICY "Anyone can insert exam reward dismissals" ON public.exam_reward_dismissals;
DROP POLICY "Anyone can view exam reward dismissals" ON public.exam_reward_dismissals;
DROP POLICY "qnd_all" ON public.quiz_notification_dismissals;
-- shade (3)
DROP POLICY "Anyone can delete shade dismissals" ON public.shade_dismissals;
DROP POLICY "Anyone can insert shade dismissals" ON public.shade_dismissals;
DROP POLICY "Everyone can read shade dismissals" ON public.shade_dismissals;

REVOKE ALL ON public.announcements FROM anon, authenticated;
REVOKE ALL ON public.special_features FROM anon, authenticated;
REVOKE ALL ON public.upcoming_events FROM anon, authenticated;
REVOKE ALL ON public.content_images FROM anon, authenticated;
REVOKE ALL ON public.messages FROM anon, authenticated;
REVOKE ALL ON public.message_recipients FROM anon, authenticated;
REVOKE ALL ON public.custom_notifications FROM anon, authenticated;
REVOKE ALL ON public.notification_preferences FROM anon, authenticated;
REVOKE ALL ON public.exams FROM anon, authenticated;
REVOKE ALL ON public.exam_questions FROM anon, authenticated;
REVOKE ALL ON public.exam_reward_dismissals FROM anon, authenticated;
REVOKE ALL ON public.quiz_notification_dismissals FROM anon, authenticated;
REVOKE ALL ON public.shade_dismissals FROM anon, authenticated;
