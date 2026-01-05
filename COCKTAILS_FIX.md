
# Cocktails A-Z Editor - RLS Policy Fix

## Issue
Error 42501: "new row violates row-level security policy for table 'cocktails'"

## Solution
Update Supabase RLS policies for the `cocktails` table to allow manager role to INSERT and UPDATE.

## Required Policies
1. **SELECT**: Allow all authenticated users to read cocktails
2. **INSERT**: Allow users with role='manager' to create cocktails  
3. **UPDATE**: Allow users with role='manager' to update cocktails
4. **DELETE**: Allow users with role='manager' to delete cocktails
