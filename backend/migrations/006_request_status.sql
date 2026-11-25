
ALTER TABLE deposit_requests
DROP CONSTRAINT deposit_requests_status_check;

ALTER TABLE deposit_requests
ADD CONSTRAINT deposit_requests_status_check
CHECK (
  status IN ('pending','under_review',
  'successful','rejected','cancelled')
  AND (status <> 'successful' OR fixture_only = true)
);

ALTER TABLE service_requests
DROP CONSTRAINT service_requests_status_check;

ALTER TABLE service_requests
ADD CONSTRAINT service_requests_status_check
CHECK (
  status IN ('pending','under_review',
  'successful','rejected','cancelled')
  AND (
    status <> 'successful'
    OR (
      request_type = 'send_money'
      AND idempotency_key IS NOT NULL
      AND idempotency_key LIKE 'synthetic:%'
    )
  )
);
