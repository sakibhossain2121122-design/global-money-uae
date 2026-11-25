ALTER TABLE deposit_requests
ADD COLUMN transaction_reference text,
ADD COLUMN reference_updated_at timestamptz,
ADD COLUMN reference_updated_by uuid;

ALTER TABLE service_requests
ADD COLUMN transaction_reference text,
ADD COLUMN reference_updated_at timestamptz,
ADD COLUMN reference_updated_by uuid;

ALTER TABLE deposit_requests
ADD CONSTRAINT deposit_test_reference_check
CHECK (
  transaction_reference IS NULL OR (
    fixture_only IS TRUE
    AND status = 'successful'
    AND transaction_reference ~ '^TEST-[A-Z0-9-]{3,60}$'
  )
);

ALTER TABLE service_requests
ADD CONSTRAINT service_test_reference_check
CHECK (
  transaction_reference IS NULL OR (
    request_type = 'send_money'
    AND status = 'successful'
    AND customer_note IS NOT DISTINCT FROM 'Synthetic request only'
    AND idempotency_key IS NOT NULL
    AND idempotency_key LIKE 'synthetic:%'
    AND transaction_reference ~ '^TEST-[A-Z0-9-]{3,60}$'
  )
);

CREATE UNIQUE INDEX deposit_transaction_reference_unique
ON deposit_requests(transaction_reference)
WHERE transaction_reference IS NOT NULL;

CREATE UNIQUE INDEX service_transaction_reference_unique
ON service_requests(transaction_reference)
WHERE transaction_reference IS NOT NULL;
