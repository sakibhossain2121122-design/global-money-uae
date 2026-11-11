
CREATE TABLE IF NOT EXISTS service_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id),
  request_type TEXT NOT NULL
    CHECK (request_type IN ('add_money', 'send_money')),
  amount_aed NUMERIC(16,2) NOT NULL
    CHECK (amount_aed > 0),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending', 'under_review', 'rejected', 'cancelled'
    )),
  customer_note TEXT,
  admin_note TEXT,
  reviewed_by UUID REFERENCES customers(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS service_requests_customer
ON service_requests(customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS service_requests_status
ON service_requests(status, created_at DESC);

CREATE TABLE IF NOT EXISTS service_request_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  request_id UUID NOT NULL REFERENCES service_requests(id),
  actor_id UUID REFERENCES customers(id),
  previous_status TEXT,
  new_status TEXT NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

