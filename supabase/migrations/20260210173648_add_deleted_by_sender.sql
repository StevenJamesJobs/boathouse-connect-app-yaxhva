-- Add deleted_by_sender column to messages table for soft-deleting sent messages
ALTER TABLE messages ADD COLUMN IF NOT EXISTS deleted_by_sender boolean DEFAULT false;
