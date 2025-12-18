
# Alternative Solution: Modify RLS Policies

If Edge Function deployment continues to be problematic, you can modify the RLS policies to allow employees to submit feedback directly.

## Option 1: Run SQL Migration (Recommended)

Go to your Supabase Dashboard SQL Editor and run this migration:

```sql
-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Employees can insert their own feedback" ON feedback;
DROP POLICY IF EXISTS "Users can view their own feedback" ON feedback;
DROP POLICY IF EXISTS "Managers can view all feedback" ON feedback;
DROP POLICY IF EXISTS "Managers can update feedback" ON feedback;
DROP POLICY IF EXISTS "Managers can delete feedback" ON feedback;

-- Recreate policies with proper permissions
-- 1. Allow employees to insert their own feedback
CREATE POLICY "Employees can insert their own feedback"
ON feedback
FOR INSERT
TO authenticated
WITH CHECK (sender_id = auth.uid());

-- 2. Allow users to view their own feedback
CREATE POLICY "Users can view their own feedback"
ON feedback
FOR SELECT
TO authenticated
USING (sender_id = auth.uid());

-- 3. Allow managers to view all feedback
CREATE POLICY "Managers can view all feedback"
ON feedback
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'manager'
  )
);

-- 4. Allow managers to update feedback
CREATE POLICY "Managers can update feedback"
ON feedback
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'manager'
  )
);

-- 5. Allow managers to soft delete feedback
CREATE POLICY "Managers can delete feedback"
ON feedback
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'manager'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'manager'
  )
);
```

## Option 2: Update Client Code

If you run the SQL migration above, you'll also need to update the employee tools page to insert directly into the database instead of calling the Edge Function.

The code change would be in `app/(portal)/employee/tools.tsx`:

Replace the Edge Function call with direct database insert:

```typescript
// Instead of:
const { data, error } = await supabase.functions.invoke('submit-feedback', {
  body: {
    title: feedbackTitle.trim(),
    description: feedbackDescription.trim(),
  },
});

// Use:
const { data, error } = await supabase
  .from('feedback')
  .insert({
    sender_id: user.id,
    title: feedbackTitle.trim(),
    description: feedbackDescription.trim(),
    is_deleted: false,
  })
  .select()
  .single();
```

## Which Solution to Use?

- **Edge Function (Current Implementation)**: More secure, better separation of concerns, but requires CLI deployment
- **RLS Policy Modification (Alternative)**: Simpler, no deployment needed, but less flexible for future changes

Choose based on your comfort level with the Supabase CLI and your security requirements.
