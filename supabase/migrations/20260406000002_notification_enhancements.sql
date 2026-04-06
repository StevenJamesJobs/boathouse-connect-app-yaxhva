-- Add data column to custom_notifications for storing job_titles, destination metadata
ALTER TABLE custom_notifications ADD COLUMN IF NOT EXISTS data JSONB;

-- Add DELETE policy so managers can delete sent notifications
CREATE POLICY "Managers can delete custom notifications"
  ON custom_notifications FOR DELETE TO public
  USING (true);

-- Grant DELETE permission
GRANT DELETE ON custom_notifications TO authenticated;
