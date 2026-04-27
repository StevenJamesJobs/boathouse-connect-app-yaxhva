-- ============================================
-- McLoone's Bucks Redemption Requests
-- Table: redemption_requests
-- RPCs: submit_redemption_request, approve_redemption_request, deny_redemption_request
-- ============================================

CREATE TABLE IF NOT EXISTS redemption_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_type TEXT NOT NULL CHECK (request_type IN ('food_beverage', 'section', 'side_work', 'side_work_free')),
  bucks_amount INTEGER NOT NULL CHECK (bucks_amount > 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied', 'expired')),

  menu_item_id UUID REFERENCES menu_items(id) ON DELETE SET NULL,
  weekly_special_id UUID REFERENCES weekly_specials(id) ON DELETE SET NULL,
  item_name_snapshot TEXT,

  shift_date DATE,
  shift_period TEXT CHECK (shift_period IN ('AM', 'PM')),
  comment TEXT,

  decided_by UUID REFERENCES users(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  decision_reason TEXT,

  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_redemption_requests_user_status ON redemption_requests(user_id, status);
CREATE INDEX idx_redemption_requests_status_created ON redemption_requests(status, created_at DESC);

ALTER TABLE redemption_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view redemption requests"
  ON redemption_requests FOR SELECT TO public
  USING (true);

CREATE POLICY "Anyone can insert redemption requests"
  ON redemption_requests FOR INSERT TO public
  WITH CHECK (true);

CREATE POLICY "Anyone can update redemption requests"
  ON redemption_requests FOR UPDATE TO public
  USING (true);

-- ============================================
-- RPC: submit_redemption_request
-- ============================================
CREATE OR REPLACE FUNCTION submit_redemption_request(
  p_user_id UUID,
  p_request_type TEXT,
  p_bucks_amount INTEGER,
  p_menu_item_id UUID,
  p_weekly_special_id UUID,
  p_item_name_snapshot TEXT,
  p_shift_date DATE,
  p_shift_period TEXT,
  p_comment TEXT
) RETURNS UUID AS $$
DECLARE
  v_balance INTEGER;
  v_pending_total INTEGER;
  v_available INTEGER;
  v_request_id UUID;
BEGIN
  IF p_bucks_amount IS NULL OR p_bucks_amount <= 0 THEN
    RAISE EXCEPTION 'Invalid bucks amount';
  END IF;

  SELECT COALESCE(mcloones_bucks, 0) INTO v_balance
  FROM users WHERE id = p_user_id;

  IF v_balance IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  -- Sum of currently pending requests (held but not yet deducted)
  SELECT COALESCE(SUM(bucks_amount), 0) INTO v_pending_total
  FROM redemption_requests
  WHERE user_id = p_user_id AND status = 'pending';

  v_available := v_balance - v_pending_total;

  IF v_available < p_bucks_amount THEN
    RAISE EXCEPTION 'Insufficient McLoone''s Bucks. Available: %, Required: %', v_available, p_bucks_amount;
  END IF;

  INSERT INTO redemption_requests (
    user_id, request_type, bucks_amount,
    menu_item_id, weekly_special_id, item_name_snapshot,
    shift_date, shift_period, comment
  ) VALUES (
    p_user_id, p_request_type, p_bucks_amount,
    p_menu_item_id, p_weekly_special_id, p_item_name_snapshot,
    p_shift_date, p_shift_period, p_comment
  ) RETURNING id INTO v_request_id;

  RETURN v_request_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- RPC: approve_redemption_request
-- Atomic: deduct bucks, write visible transaction, mark approved
-- ============================================
CREATE OR REPLACE FUNCTION approve_redemption_request(
  p_request_id UUID,
  p_manager_id UUID,
  p_reason TEXT
) RETURNS VOID AS $$
DECLARE
  v_req RECORD;
  v_manager_role TEXT;
  v_balance INTEGER;
  v_description TEXT;
BEGIN
  SELECT role INTO v_manager_role FROM users WHERE id = p_manager_id;
  IF v_manager_role <> 'manager' THEN
    RAISE EXCEPTION 'Only managers may approve redemption requests';
  END IF;

  SELECT * INTO v_req FROM redemption_requests WHERE id = p_request_id FOR UPDATE;
  IF v_req IS NULL THEN
    RAISE EXCEPTION 'Redemption request not found';
  END IF;

  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'Redemption request is not pending (status: %)', v_req.status;
  END IF;

  SELECT COALESCE(mcloones_bucks, 0) INTO v_balance FROM users WHERE id = v_req.user_id;
  IF v_balance < v_req.bucks_amount THEN
    RAISE EXCEPTION 'Employee balance insufficient at approval time';
  END IF;

  v_description := CASE v_req.request_type
    WHEN 'food_beverage'   THEN 'Redeemed: ' || COALESCE(v_req.item_name_snapshot, 'Menu Item')
    WHEN 'section'         THEN 'Redeemed: Choose Your Own Section'
    WHEN 'side_work'       THEN 'Redeemed: Choose Your Own Side Work'
    WHEN 'side_work_free'  THEN 'Redeemed: Side Work Free Shift'
    ELSE 'Redeemed'
  END;

  -- Deduct from balance
  UPDATE users
  SET mcloones_bucks = COALESCE(mcloones_bucks, 0) - v_req.bucks_amount
  WHERE id = v_req.user_id;

  -- Write visible (everyone-sees) transaction so it appears in Recent Awards
  INSERT INTO rewards_transactions (user_id, amount, description, is_visible, created_by)
  VALUES (v_req.user_id, -v_req.bucks_amount, v_description, true, p_manager_id);

  -- Mark request approved
  UPDATE redemption_requests
  SET status = 'approved',
      decided_by = p_manager_id,
      decided_at = now(),
      decision_reason = p_reason
  WHERE id = p_request_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- RPC: deny_redemption_request
-- No balance change, no rewards_transactions row.
-- ============================================
CREATE OR REPLACE FUNCTION deny_redemption_request(
  p_request_id UUID,
  p_manager_id UUID,
  p_reason TEXT
) RETURNS VOID AS $$
DECLARE
  v_req RECORD;
  v_manager_role TEXT;
BEGIN
  SELECT role INTO v_manager_role FROM users WHERE id = p_manager_id;
  IF v_manager_role <> 'manager' THEN
    RAISE EXCEPTION 'Only managers may deny redemption requests';
  END IF;

  SELECT * INTO v_req FROM redemption_requests WHERE id = p_request_id FOR UPDATE;
  IF v_req IS NULL THEN
    RAISE EXCEPTION 'Redemption request not found';
  END IF;

  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'Redemption request is not pending (status: %)', v_req.status;
  END IF;

  UPDATE redemption_requests
  SET status = 'denied',
      decided_by = p_manager_id,
      decided_at = now(),
      decision_reason = p_reason
  WHERE id = p_request_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
