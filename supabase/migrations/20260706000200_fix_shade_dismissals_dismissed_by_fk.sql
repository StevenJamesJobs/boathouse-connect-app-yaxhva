-- shade_dismissals.dismissed_by referenced auth.users(id), but this app uses a
-- custom `public.users` table (no Supabase Auth), so user.id is never in
-- auth.users → every dismiss failed with FK 23503 once RLS was unblocked.
-- Repoint to public.users, matching custom_notifications.sent_by (the app-wide
-- pattern for actor ids from custom auth).
ALTER TABLE public.shade_dismissals DROP CONSTRAINT IF EXISTS shade_dismissals_dismissed_by_fkey;

-- Null any legacy values not present in public.users so the new FK applies cleanly.
UPDATE public.shade_dismissals sd
  SET dismissed_by = NULL
  WHERE dismissed_by IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = sd.dismissed_by);

ALTER TABLE public.shade_dismissals
  ADD CONSTRAINT shade_dismissals_dismissed_by_fkey
  FOREIGN KEY (dismissed_by) REFERENCES public.users(id) ON DELETE SET NULL;
