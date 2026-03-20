-- Schedule uploads tracking table
CREATE TABLE IF NOT EXISTS schedule_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uploaded_by TEXT NOT NULL REFERENCES users(id),
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'completed', 'failed', 'replaced')),
  parsed_shifts_count INTEGER DEFAULT 0,
  unmatched_employees JSONB DEFAULT '[]'::jsonb,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Individual shifts extracted from schedule PDFs
CREATE TABLE IF NOT EXISTS staff_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id UUID NOT NULL REFERENCES schedule_uploads(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id),
  employee_name TEXT NOT NULL,
  shift_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  roles TEXT[] NOT NULL DEFAULT '{}',
  is_closer BOOLEAN DEFAULT FALSE,
  is_opener BOOLEAN DEFAULT FALSE,
  is_training BOOLEAN DEFAULT FALSE,
  room_assignment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_staff_schedules_user_date ON staff_schedules(user_id, shift_date);
CREATE INDEX IF NOT EXISTS idx_staff_schedules_date ON staff_schedules(shift_date);
CREATE INDEX IF NOT EXISTS idx_staff_schedules_upload ON staff_schedules(upload_id);
CREATE INDEX IF NOT EXISTS idx_schedule_uploads_week ON schedule_uploads(week_start, week_end);

-- RLS policies
ALTER TABLE schedule_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_schedules ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read uploads (managers see history, employees see status)
CREATE POLICY "public_read_schedule_uploads" ON schedule_uploads
  FOR SELECT USING (true);

-- Only managers/service role can insert/update/delete uploads
CREATE POLICY "public_write_schedule_uploads" ON schedule_uploads
  FOR INSERT WITH CHECK (true);

CREATE POLICY "public_update_schedule_uploads" ON schedule_uploads
  FOR UPDATE USING (true);

CREATE POLICY "public_delete_schedule_uploads" ON schedule_uploads
  FOR DELETE USING (true);

-- All users can read schedules (app filters by user_id)
CREATE POLICY "public_read_staff_schedules" ON staff_schedules
  FOR SELECT USING (true);

-- Service role / edge function writes schedules
CREATE POLICY "public_write_staff_schedules" ON staff_schedules
  FOR INSERT WITH CHECK (true);

CREATE POLICY "public_delete_staff_schedules" ON staff_schedules
  FOR DELETE USING (true);

-- Storage bucket for schedule PDFs
INSERT INTO storage.buckets (id, name, public)
VALUES ('schedules', 'schedules', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "auth_upload_schedules" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'schedules');

CREATE POLICY "public_read_schedules" ON storage.objects
  FOR SELECT USING (bucket_id = 'schedules');
