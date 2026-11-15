ALTER TABLE payment_methods
  ADD COLUMN IF NOT EXISTS add_money_request_enabled BOOLEAN NOT NULL DEFAULT TRUE;

CREATE UNIQUE INDEX IF NOT EXISTS payout_banks_active_name
  ON payout_banks (lower(btrim(name)))
  WHERE archived_at IS NULL;
