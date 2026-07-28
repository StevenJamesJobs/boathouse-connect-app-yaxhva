-- B9: drop redundant / provably-unusable indexes (Steve-approved 2026-07-27).
-- Groups 1+2: exact duplicates or leading prefixes of retained UNIQUE indexes
-- (planner substitutes the UNIQUE index; upsert arbiters bind only to UNIQUEs,
-- all of which remain). Group 3: verified unusable by every SQL function and
-- edge function; idx_scan = 0 since stats reset 2025-11-21.

-- Group 1: exact duplicates of retained UNIQUE indexes
DROP INDEX IF EXISTS public.idx_users_username;                    -- dup of users_username_key
DROP INDEX IF EXISTS public.idx_org_subscriptions_org_id;          -- dup of unique_org_subscription
DROP INDEX IF EXISTS public.idx_notification_preferences_user_id;  -- dup of notification_preferences_user_id_key
DROP INDEX IF EXISTS public.idx_shade_dismissals_lookup;           -- dup of shade_dismissals_notification_type_item_id_key

-- Group 2: leading prefixes of retained UNIQUE composites
DROP INDEX IF EXISTS public.idx_exam_results_exam;                 -- prefix of exam_results_exam_id_user_id_key
DROP INDEX IF EXISTS public.idx_push_tokens_user_id;               -- prefix of push_tokens_user_id_token_key
DROP INDEX IF EXISTS public.idx_quiz_notification_dismissals_user; -- prefix of quiz_notification_dismissals_user_id_exam_id_key
DROP INDEX IF EXISTS public.idx_user_bartender_progress_user;      -- prefix of user_bartender_checklist_prog_user_id_checklist_item_id_com_key
DROP INDEX IF EXISTS public.idx_org_assistants_org_id;             -- prefix of organization_assistants_organization_id_assistant_key_key
DROP INDEX IF EXISTS public.idx_org_job_titles_org_id;             -- prefix of organization_job_titles_organization_id_title_key
DROP INDEX IF EXISTS public.idx_jta_org_id;                        -- prefix of job_title_assistants_organization_id_job_title_assistant_ke_key
DROP INDEX IF EXISTS public.idx_jta_org_job_title;                 -- prefix of the same 3-col UNIQUE

-- Group 3: no possible consumer in any current query path
DROP INDEX IF EXISTS public.idx_messages_parent;                   -- parent_message_id never a predicate; threads traverse thread_id
DROP INDEX IF EXISTS public.idx_notification_logs_is_read;         -- notification_logs is insert-only; is_read never queried
