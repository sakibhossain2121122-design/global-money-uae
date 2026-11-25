-- New forward migration for reconstructed 1.5.0. No money, customers or rates seeded.
ALTER TABLE payment_methods ADD COLUMN staging_enabled boolean NOT NULL DEFAULT false;
CREATE TABLE staging_payment_accounts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 payment_method_id text NOT NULL REFERENCES payment_methods(id),
 label text NOT NULL CHECK(length(label) BETWEEN 1 AND 100),
 test_reference text NOT NULL CHECK(test_reference ~ '^TEST-[A-Z0-9-]{3,60}$'),
 enabled boolean NOT NULL DEFAULT false,
 updated_by uuid NOT NULL REFERENCES customers(id),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE payout_banks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 100),
 code text NOT NULL UNIQUE CHECK(code ~ '^[A-Z0-9_]{2,30}$'),
 enabled boolean NOT NULL DEFAULT false,
 updated_by uuid NOT NULL REFERENCES customers(id),
 updated_at timestamptz NOT NULL DEFAULT now()
);
-- TRUNCATE is not covered by row UPDATE/DELETE triggers in the base.
CREATE TRIGGER audit_no_truncate BEFORE TRUNCATE ON audit_logs
 FOR EACH STATEMENT EXECUTE FUNCTION deny_audit_mutation();
CREATE TRIGGER reference_history_no_truncate BEFORE TRUNCATE ON transaction_reference_history
 FOR EACH STATEMENT EXECUTE FUNCTION deny_audit_mutation();
CREATE TRIGGER request_events_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON service_request_events
 FOR EACH STATEMENT EXECUTE FUNCTION deny_audit_mutation();
CREATE TRIGGER support_replies_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON support_replies
 FOR EACH STATEMENT EXECUTE FUNCTION deny_audit_mutation();
-- Trigger-only registry/history writers do not need mutable runtime grants.
ALTER FUNCTION sync_test_reference_registry() SECURITY DEFINER;
ALTER FUNCTION sync_test_reference_registry() SET search_path = pg_catalog, public;
ALTER FUNCTION record_test_reference_history() SECURITY DEFINER;
ALTER FUNCTION record_test_reference_history() SET search_path = pg_catalog, public;
