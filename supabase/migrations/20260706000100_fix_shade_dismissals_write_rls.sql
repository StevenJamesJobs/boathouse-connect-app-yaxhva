-- shade_dismissals: fix write RLS for the app's custom-auth model.
--
-- The app has no Supabase Auth session (it authenticates against a custom `users`
-- table), so auth.uid() is always NULL. The previous INSERT policy required
-- auth.uid() = users.id AND role = 'manager', which therefore ALWAYS failed with
-- PostgREST 42501 — so dismissing from the shade never persisted. There was also
-- no DELETE policy, so restoring a dismissal (Recently Dismissed) would fail too.
--
-- Manager-gating for dismiss/restore lives in the UI (the shade "X" is
-- manager-only, and the whole Notification Center is a manager tool), so make the
-- write policies permissive to `public` — matching the app-wide "permissive RLS,
-- gate in the client" pattern (e.g. message_recipients).
DROP POLICY IF EXISTS "Managers can insert shade dismissals" ON public.shade_dismissals;
DROP POLICY IF EXISTS "Anyone can insert shade dismissals" ON public.shade_dismissals;
DROP POLICY IF EXISTS "Anyone can delete shade dismissals" ON public.shade_dismissals;

CREATE POLICY "Anyone can insert shade dismissals"
  ON public.shade_dismissals FOR INSERT TO public
  WITH CHECK (true);

CREATE POLICY "Anyone can delete shade dismissals"
  ON public.shade_dismissals FOR DELETE TO public
  USING (true);
