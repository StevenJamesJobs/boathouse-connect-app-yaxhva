
-- =====================================================
-- SIMPLE RLS FIX FOR FEEDBACK TABLE
-- Use this if you cannot deploy Edge Functions
-- This is the simplest possible fix that should work
-- =====================================================

-- Drop all existing policies
DROP POLICY IF EXISTS "Employees can insert their own feedback" ON public.feedback;
DROP POLICY IF EXISTS "Managers can view all feedback" ON public.feedback;
DROP POLICY IF EXISTS "Managers can update feedback" ON public.feedback;
DROP POLICY IF EXISTS "Users can insert feedback" ON public.feedback;
DROP POLICY IF EXISTS "Anyone can insert feedback" ON public.feedback;
DROP POLICY IF EXISTS "Authenticated users can insert feedback" ON public.feedback;
DROP POLICY IF EXISTS "authenticated_users_can_insert_feedback" ON public.feedback;
DROP POLICY IF EXISTS "managers_can_view_all_feedback" ON public.feedback;
DROP POLICY IF EXISTS "users_can_view_own_feedback" ON public.feedback;
DROP POLICY IF EXISTS "managers_can_update_feedback" ON public.feedback;

-- Ensure RLS is enabled
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

-- Create the simplest possible INSERT policy
-- This allows ANY authenticated user to insert feedback
CREATE POLICY "allow_all_authenticated_insert"
  ON public.feedback
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Allow managers to view all feedback
CREATE POLICY "allow_managers_select"
  ON public.feedback
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.role = 'manager'
    )
  );

-- Allow users to view their own feedback
CREATE POLICY "allow_own_select"
  ON public.feedback
  FOR SELECT
  TO authenticated
  USING (sender_id = auth.uid());

-- Allow managers to update (for soft deletes)
CREATE POLICY "allow_managers_update"
  ON public.feedback
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.role = 'manager'
    )
  );

-- Grant permissions
GRANT ALL ON public.feedback TO authenticated;

-- Verify
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'feedback';
