ALTER TABLE customers DROP CONSTRAINT customers_role_check;
ALTER TABLE customers ADD CONSTRAINT customers_role_check CHECK(role IN ('customer','admin','reviewer','support'));
ALTER TABLE payout_banks ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE payout_banks ADD CONSTRAINT bangladesh_only CHECK(country='BD');
CREATE UNIQUE INDEX payout_banks_name ON payout_banks(lower(name)) WHERE archived_at IS NULL;
ALTER TABLE service_requests DROP CONSTRAINT new_add_money_payload;
ALTER TABLE service_requests ADD COLUMN beneficiary_id uuid REFERENCES beneficiaries(id);
ALTER TABLE service_requests ADD CONSTRAINT new_request_payload CHECK(idempotency_key IS NULL OR
(amount_aed<=1000000 AND length(coalesce(customer_note,''))<=500 AND
((request_type='add_money' AND payment_method_id IS NOT NULL) OR (request_type='send_money' AND beneficiary_id IS NOT NULL))));
CREATE TABLE receipts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid NOT NULL REFERENCES service_requests(id),
 customer_id uuid NOT NULL REFERENCES customers(id), content bytea NOT NULL CHECK(octet_length(content) BETWEEN 8 AND 1000000),
 media_type text NOT NULL CHECK(media_type IN ('image/jpeg','image/png')), sha256 text NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','reviewed','rejected')),
 review_note text CHECK(length(review_note)<=500), reviewed_by uuid REFERENCES customers(id), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(request_id,sha256)
);
-- Architectural reservation records only. They never represent spendable funds.
CREATE TABLE wallet_holds (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), customer_id uuid NOT NULL REFERENCES customers(id),
 request_id uuid NOT NULL UNIQUE REFERENCES service_requests(id), amount_minor bigint NOT NULL CHECK(amount_minor>0),
 currency char(3) NOT NULL DEFAULT 'AED' CHECK(currency='AED'), status text NOT NULL DEFAULT 'proposed' CHECK(status IN ('proposed','released')),
 created_at timestamptz NOT NULL DEFAULT now(), released_at timestamptz
);
-- No hold activation or financial posting until a separately approved migration/integration.
CREATE TRIGGER audit_immutable BEFORE UPDATE OR DELETE ON audit_logs FOR EACH STATEMENT EXECUTE FUNCTION deny_posting();
CREATE TRIGGER request_events_immutable BEFORE UPDATE OR DELETE ON service_request_events FOR EACH STATEMENT EXECUTE FUNCTION deny_posting();
CREATE TRIGGER admin_events_immutable BEFORE UPDATE OR DELETE ON admin_control_events FOR EACH STATEMENT EXECUTE FUNCTION deny_posting();
ALTER TABLE wallets DROP CONSTRAINT wallets_kind_check;
ALTER TABLE wallets ADD CONSTRAINT wallets_kind_check CHECK(kind IN ('customer','clearing','held'));
ALTER TABLE wallets DROP CONSTRAINT wallets_customer_id_currency_key;
ALTER TABLE wallets ADD CONSTRAINT wallet_customer_bucket UNIQUE(customer_id,currency,kind);
ALTER TABLE ledger_journals ADD COLUMN hold_id uuid REFERENCES wallet_holds(id);
ALTER TABLE ledger_journals ADD COLUMN operation text CHECK(operation IN ('hold','release'));
CREATE UNIQUE INDEX ledger_hold_operation ON ledger_journals(hold_id,operation) WHERE hold_id IS NOT NULL;
