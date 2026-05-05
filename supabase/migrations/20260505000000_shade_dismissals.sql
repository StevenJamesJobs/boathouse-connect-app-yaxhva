-- Notification shade dismissals: tracks which content items have been
-- dismissed from the notification shade by a manager. Dismissing an item
-- hides it from the shade for ALL users but does NOT deactivate/delete
-- the source item (announcement, event, etc.).

CREATE TABLE IF NOT EXISTS shade_dismissals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_type TEXT NOT NULL,
  item_id UUID NOT NULL,
  dismissed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  dismissed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE(notification_type, item_id)
);

CREATE INDEX idx_shade_dismissals_lookup
  ON shade_dismissals(notification_type, item_id);

ALTER TABLE shade_dismissals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone can read shade dismissals"
  ON shade_dismissals FOR SELECT
  USING (true);

CREATE POLICY "Managers can insert shade dismissals"
  ON shade_dismissals FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'manager'
    )
  );

GRANT SELECT, INSERT ON shade_dismissals TO authenticated;
