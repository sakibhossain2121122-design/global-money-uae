
ALTER TABLE deposit_requests
  ADD COLUMN idempotency_key TEXT;

CREATE UNIQUE INDEX deposit_customer_idempotency
  ON deposit_requests(customer_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

ALTER TABLE service_requests
  ADD COLUMN idempotency_key TEXT,
  ADD COLUMN beneficiary_id UUID;

CREATE UNIQUE INDEX service_customer_idempotency
  ON service_requests(customer_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

ALTER TABLE beneficiaries
  ADD CONSTRAINT beneficiary_customer_unique
  UNIQUE (id, customer_id);

ALTER TABLE service_requests
  ADD CONSTRAINT service_beneficiary_owner_fk
  FOREIGN KEY (beneficiary_id, customer_id)
  REFERENCES beneficiaries(id, customer_id);

CREATE TABLE kyc_fixtures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id),
  fixture_type TEXT NOT NULL
    CHECK (fixture_type IN ('document','selfie')),
  fixture_key TEXT NOT NULL
    CHECK (fixture_key ~ '^synthetic:[a-z0-9_-]{1,80}$'),
  status TEXT NOT NULL DEFAULT 'under_review'
    CHECK (status IN ('under_review','rejected')),
  reviewed_by UUID REFERENCES customers(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (customer_id, fixture_key)
);

