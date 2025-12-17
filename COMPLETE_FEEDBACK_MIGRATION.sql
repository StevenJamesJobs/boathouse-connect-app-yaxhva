
-- Complete Feedback System Migration
-- Run this in your Supabase SQL Editor

-- 1. Drop existing table if you want to start fresh (OPTIONAL - only if you want to reset)
-- DROP TABLE IF EXISTS public.feedback CASCADE;

-- 2. Create the feedback table
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

-- 3. Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_feedback_sender_id ON public.feedback(sender_id);
CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON public.feedback(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_is_deleted ON public.feedback(is_deleted);

-- 4. Enable Row Level Security
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

-- 5. Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Employees can insert their own feedback" ON public.feedback;
DROP POLICY IF EXISTS "Managers can view all feedback" ON public.feedback;
DROP POLICY IF EXISTS "Managers can delete feedback" ON public.feedback;

-- 6. Create RLS policy for employees to insert their own feedback
CREATE POLICY "Employees can insert their own feedback"
ON public.feedback
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = sender_id
);

-- 7. Create RLS policy for managers to view all feedback
CREATE POLICY "Managers can view all feedback"
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

-- 8. Create RLS policy for managers to update (soft delete) feedback
CREATE POLICY "Managers can delete feedback"
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

-- 9. Grant necessary permissions
GRANT SELECT, INSERT ON public.feedback TO authenticated;
GRANT UPDATE ON public.feedback TO authenticated;

-- 10. Verify the setup
SELECT 'Table created successfully' as status;
SELECT 'RLS enabled: ' || rowsecurity as rls_status FROM pg_tables WHERE tablename = 'feedback';
SELECT 'Policies created: ' || count(*) as policy_count FROM pg_policies WHERE tablename = 'feedback';
