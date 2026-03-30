-- Add file attachment support to messages
-- Managers can attach files (PDF, DOC, XLS, etc.) to messages
-- Files are stored in the existing 'message-attachments' Supabase Storage bucket

ALTER TABLE messages ADD COLUMN IF NOT EXISTS file_url TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS file_name TEXT;
