
-- =====================================================
-- COMPREHENSIVE FEEDBACK TABLE FIX
-- This migration will completely reset and fix the feedback table and its RLS policies
-- =====================================================

-- Step 1: Drop all existing policies on the feedback table
DROP POLICY IF EXISTS "Employees can insert their own feedback" ON public.feedback;
DROP POLICY IF EXISTS "Managers can view all feedback" ON public.feedback;
DROP POLICY IF EXISTS "Managers can update feedback" ON public.feedback;
DROP POLICY IF EXISTS "Users can insert feedback" ON public.feedback;
DROP POLICY IF EXISTS "Anyone can insert feedback" ON public.feedback;
DROP POLICY IF EXISTS "Authenticated users can insert feedback" ON public.feedback;

-- Step 2: Disable RLS temporarily to ensure we can work with the table
ALTER TABLE public.feedback DISABLE ROW LEVEL SECURITY;

-- Step 3: Verify the table structure
-- If the table doesn't exist, create it
CREATE TABLE IF NOT EXISTS public.feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMP WITH TIME ZONE,
  CONSTRAINT feedback_title_not_empty CHECK (char_length(title) > 0),
  CONSTRAINT feedback_description_not_empty CHECK (char_length(description) > 0)
);

-- Step 4: Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_feedback_sender_id ON public.feedback(sender_id);
CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON public.feedback(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_is_deleted ON public.feedback(is_deleted) WHERE is_deleted = false;

-- Step 5: Re-enable RLS
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

-- Step 6: Create new, simplified RLS policies
-- Policy 1: Allow ALL authenticated users to INSERT feedback
-- This is the most permissive policy that should work for all employees
CREATE POLICY "authenticated_users_can_insert_feedback"
  ON public.feedback
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Policy 2: Allow managers to SELECT all feedback
CREATE POLICY "managers_can_view_all_feedback"
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

-- Policy 3: Allow users to view their own feedback
CREATE POLICY "users_can_view_own_feedback"
  ON public.feedback
  FOR SELECT
  TO authenticated
  USING (sender_id = auth.uid());

-- Policy 4: Allow managers to UPDATE feedback (for soft deletes)
CREATE POLICY "managers_can_update_feedback"
  ON public.feedback
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.role = 'manager'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.role = 'manager'
    )
  );

-- Step 7: Grant necessary permissions to authenticated users
GRANT SELECT, INSERT ON public.feedback TO authenticated;
GRANT UPDATE ON public.feedback TO authenticated;

-- Step 8: Verify the policies were created successfully
SELECT 
  schemaname, 
  tablename, 
  policyname, 
  permissive, 
  roles, 
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'feedback'
ORDER BY policyname;

-- Step 9: Test the setup by checking if we can see the table structure
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'feedback'
ORDER BY ordinal_position;

-- =====================================================
-- VERIFICATION QUERIES
-- Run these after the migration to verify everything works
-- =====================================================

-- Check if RLS is enabled
SELECT 
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables
WHERE tablename = 'feedback';

-- Check all policies
SELECT * FROM pg_policies WHERE tablename = 'feedback';

-- Check table permissions
SELECT 
  grantee, 
  privilege_type 
FROM information_schema.role_table_grants 
WHERE table_name = 'feedback';
