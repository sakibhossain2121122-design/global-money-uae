-- Version 1.4 staging foundation. Additive only: no customer records, balances,
-- rates, payment confirmations, or synthetic accounts are seeded here.
CREATE TABLE IF NOT EXISTS payment_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_method_id TEXT NOT NULL REFERENCES payment_methods(id),
  label TEXT NOT NULL,
  account_details_ciphertext TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID REFERENCES customers(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (length(account_details_ciphertext) >= 16)
);

CREATE TABLE IF NOT EXISTS deposit_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id),
  payment_method_id TEXT NOT NULL REFERENCES payment_methods(id),
  amount_aed NUMERIC(16,2) NOT NULL CHECK (amount_aed > 0),
  customer_reference TEXT NOT NULL CHECK (length(customer_reference) BETWEEN 1 AND 120),
  receipt_fixture_key TEXT,
  fixture_only BOOLEAN NOT NULL DEFAULT TRUE CHECK (fixture_only),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','under_review','rejected','cancelled')),
  admin_note TEXT,
  reviewed_by UUID REFERENCES customers(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS deposit_requests_customer_created
  ON deposit_requests(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS deposit_requests_status_created
  ON deposit_requests(status, created_at DESC);

-- Separate verification record captures independent evidence; it never posts funds.
CREATE TABLE IF NOT EXISTS settlement_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deposit_request_id UUID NOT NULL REFERENCES deposit_requests(id),
  verifier_id UUID NOT NULL REFERENCES customers(id),
  outcome TEXT NOT NULL CHECK (outcome IN ('unverified','mismatch','verified')),
  evidence_reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (outcome <> 'verified' OR evidence_reference IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS rate_history (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pair TEXT NOT NULL CHECK (pair = 'AED/BDT'),
  value NUMERIC(16,6) NOT NULL CHECK (value > 0),
  source TEXT NOT NULL DEFAULT 'admin_manual',
  effective_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  changed_by UUID REFERENCES customers(id)
);
CREATE INDEX IF NOT EXISTS rate_history_effective ON rate_history(effective_at DESC);
CREATE OR REPLACE FUNCTION record_rate_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO rate_history(pair,value,source,effective_at)
  VALUES(NEW.pair,NEW.value,'admin_manual',NEW.updated_at);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS rates_history_insert ON rates;
CREATE TRIGGER rates_history_insert AFTER INSERT OR UPDATE OF value ON rates
  FOR EACH ROW EXECUTE FUNCTION record_rate_history();

CREATE TABLE IF NOT EXISTS service_fees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service TEXT NOT NULL UNIQUE CHECK (service IN ('add_money','send_money')),
  fixed_aed NUMERIC(16,2) NOT NULL DEFAULT 0 CHECK (fixed_aed >= 0),
  percent NUMERIC(7,4) NOT NULL DEFAULT 0 CHECK (percent >= 0 AND percent <= 100),
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  updated_by UUID REFERENCES customers(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS service_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service TEXT NOT NULL UNIQUE CHECK (service IN ('add_money','send_money')),
  min_aed NUMERIC(16,2) NOT NULL CHECK (min_aed > 0),
  max_aed NUMERIC(16,2) NOT NULL CHECK (max_aed >= min_aed),
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  updated_by UUID REFERENCES customers(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS support_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES support_tickets(id),
  actor_id UUID NOT NULL REFERENCES customers(id),
  message TEXT NOT NULL CHECK (length(message) BETWEEN 1 AND 4000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Audit records are append-only for every application role.
CREATE OR REPLACE FUNCTION deny_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Audit records are immutable'; END $$;
DROP TRIGGER IF EXISTS audit_logs_immutable ON audit_logs;
CREATE TRIGGER audit_logs_immutable BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION deny_audit_mutation();

-- Methods remain server controlled and off until separately approved.
INSERT INTO payment_methods(id,name,display_order,enabled) VALUES
 ('botim_money','BOTIM Money',1,FALSE),('e_money','e& money',2,FALSE),
 ('adcb','ADCB',3,FALSE),('emirates_nbd','Emirates NBD',4,FALSE),
 ('adib','ADIB',5,FALSE),('additional_bank','Additional UAE bank',6,FALSE)
ON CONFLICT(id) DO NOTHING;
