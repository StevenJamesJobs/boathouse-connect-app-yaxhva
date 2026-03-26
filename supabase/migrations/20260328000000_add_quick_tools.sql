-- Add quick_tools column to users table for customizable profile dashboard shortcuts
ALTER TABLE users ADD COLUMN IF NOT EXISTS quick_tools JSONB DEFAULT NULL;

-- Create RPC to update quick tools (needed because of RLS with public role)
CREATE OR REPLACE FUNCTION update_quick_tools(user_id UUID, tools JSONB)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE users SET quick_tools = tools, updated_at = NOW() WHERE id = user_id;
END;
$$;
