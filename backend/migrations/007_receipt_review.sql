CREATE TABLE add_money_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL UNIQUE REFERENCES service_requests(id),
  payment_method_id text NOT NULL REFERENCES payment_methods(id),
  content_type text NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'application/pdf')),
  content bytea NOT NULL CHECK (octet_length(content) BETWEEN 1 AND 5242880),
  sha256 char(64) NOT NULL UNIQUE,
  verification_status text NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending', 'under_review', 'rejected', 'verified')),
  verified_amount_aed numeric(16,2),
  payment_reference text,
  review_note text,
  reviewed_by uuid REFERENCES customers(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (verification_status <> 'verified' OR (verified_amount_aed IS NOT NULL AND verified_amount_aed > 0 AND payment_reference IS NOT NULL AND length(btrim(payment_reference)) > 0))
);

CREATE UNIQUE INDEX add_money_verified_reference ON add_money_receipts (payment_method_id, lower(btrim(payment_reference)))
  WHERE verification_status = 'verified';

CREATE TABLE add_money_receipt_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  receipt_id uuid NOT NULL REFERENCES add_money_receipts(id),
  actor_id uuid NOT NULL REFERENCES customers(id),
  verification_status text NOT NULL,
  verified_amount_aed numeric(16,2),
  payment_reference text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- No API creates financial authorizations in Phase 1.
CREATE TABLE wallet_credit_authorizations (
  request_id uuid PRIMARY KEY REFERENCES service_requests(id),
  receipt_id uuid NOT NULL UNIQUE REFERENCES add_money_receipts(id),
  receipt_event_id bigint NOT NULL UNIQUE REFERENCES add_money_receipt_events(id),
  approved_by uuid NOT NULL REFERENCES customers(id),
  evidence_reference text NOT NULL CHECK (length(btrim(evidence_reference)) > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE wallet_credit_records (
  request_id uuid PRIMARY KEY REFERENCES service_requests(id),
  journal_id uuid NOT NULL UNIQUE REFERENCES ledger_journals(id),
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  payment_method_id text NOT NULL REFERENCES payment_methods(id),
  payment_reference text NOT NULL CHECK (length(btrim(payment_reference)) > 0),
  created_by uuid NOT NULL REFERENCES customers(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX wallet_credit_record_reference ON wallet_credit_records (payment_method_id, lower(btrim(payment_reference)));
