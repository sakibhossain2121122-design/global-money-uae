-- Additive: preserve existing 003 request/event records and all financial denial triggers.
ALTER TABLE service_requests ADD COLUMN payment_method_id text REFERENCES payment_methods(id);
ALTER TABLE service_requests ADD COLUMN idempotency_key uuid;
CREATE UNIQUE INDEX service_requests_idempotency ON service_requests(customer_id,idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX service_requests_active_duplicate ON service_requests(customer_id,amount_aed,payment_method_id,(coalesce(customer_note,'')))
 WHERE request_type='add_money' AND status IN ('pending','under_review') AND idempotency_key IS NOT NULL;
CREATE INDEX service_request_events_request ON service_request_events(request_id,id);
ALTER TABLE service_requests ADD CONSTRAINT new_add_money_payload CHECK (
 idempotency_key IS NULL OR (request_type='add_money' AND payment_method_id IS NOT NULL AND amount_aed<=1000000 AND length(coalesce(customer_note,''))<=500)
);
