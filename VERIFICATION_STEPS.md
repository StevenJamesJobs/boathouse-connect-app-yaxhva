
# Feedback System Verification Steps

## Step 1: Verify Table Structure

Run this SQL query in your Supabase SQL Editor:

```sql
-- Check if feedback table exists and its structure
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name = 'feedback'
ORDER BY ordinal_position;
```

Expected columns:
- id (uuid)
- sender_id (uuid)
- title (text)
- description (text)
- created_at (timestamp with time zone)
- is_deleted (boolean)
- deleted_at (timestamp with time zone)

## Step 2: Check if RLS is Enabled

```sql
-- Check if RLS is enabled on feedback table
SELECT 
    schemaname,
    tablename,
    rowsecurity
FROM pg_tables 
WHERE tablename = 'feedback';
```

Expected: rowsecurity should be TRUE

## Step 3: Check RLS Policies

```sql
-- Check RLS policies on feedback table
SELECT 
    policyname,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE tablename = 'feedback';
```

Expected policies:
1. A SELECT policy for managers
2. An INSERT policy for employees

## Step 4: Test Feedback Submission

If any of the above checks fail, run the complete migration below.

## Step 5: Test in the App

1. Log in as an employee
2. Go to Tools page
3. Click the Feedback button
4. Fill in Title and Description
5. Submit
6. Check for any errors in the console

7. Log in as a manager
8. Go to Messages
9. Click the Feedback tab
10. Verify the feedback appears

## If Issues Persist

Check the browser/app console for specific error messages and share them.
