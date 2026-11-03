CREATE TABLE customers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text NOT NULL UNIQUE,
 password_hash text NOT NULL, name text NOT NULL, role text NOT NULL DEFAULT 'customer' CHECK(role IN ('customer','admin')),
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended')),
 kyc_status text NOT NULL DEFAULT 'not_started' CHECK(kyc_status IN ('not_started','unavailable')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE sessions (token_hash text PRIMARY KEY, customer_id uuid NOT NULL REFERENCES customers(id), expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX sessions_customer ON sessions(customer_id);
CREATE TABLE beneficiaries (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), customer_id uuid NOT NULL REFERENCES customers(id), name text NOT NULL, provider text NOT NULL CHECK(provider IN ('bKash','Nagad','Rocket','Upay','Bank')), account text NOT NULL, bank text, created_at timestamptz NOT NULL DEFAULT now(), CHECK(provider <> 'Bank' OR bank IS NOT NULL));
CREATE TABLE wallets (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), customer_id uuid REFERENCES customers(id), currency char(3) NOT NULL CHECK(currency ~ '^[A-Z]{3}$'), kind text NOT NULL CHECK(kind IN ('customer','clearing')), UNIQUE(customer_id,currency));
CREATE TABLE transactions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), customer_id uuid NOT NULL REFERENCES customers(id), status text NOT NULL DEFAULT 'unavailable' CHECK(status IN ('unavailable','review_required')), created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE ledger_journals (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), idempotency_key text NOT NULL UNIQUE, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE ledger_entries (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), journal_id uuid NOT NULL REFERENCES ledger_journals(id), wallet_id uuid NOT NULL REFERENCES wallets(id), amount_minor bigint NOT NULL CHECK(amount_minor <> 0));
-- Defense in depth: posting stays disabled even if application code is bypassed.
CREATE FUNCTION deny_posting() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Service not yet available.'; END $$;
CREATE TRIGGER posting_disabled BEFORE INSERT OR UPDATE OR DELETE ON ledger_entries FOR EACH STATEMENT EXECUTE FUNCTION deny_posting();
CREATE TRIGGER journals_disabled BEFORE INSERT OR UPDATE OR DELETE ON ledger_journals FOR EACH STATEMENT EXECUTE FUNCTION deny_posting();
CREATE TABLE rates (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), pair text NOT NULL UNIQUE CHECK(pair = 'AED/BDT'), value numeric(16,6) NOT NULL CHECK(value > 0), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE support_tickets (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), customer_id uuid NOT NULL REFERENCES customers(id), subject text NOT NULL, message text NOT NULL, status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','closed')), created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE audit_logs (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, actor_id uuid REFERENCES customers(id), action text NOT NULL, target text, created_at timestamptz NOT NULL DEFAULT now());
-- No identity-document table, upload endpoint, provider claims, money seed data or balances.
-- A future authorized integration must retain this deferred invariant in addition
-- to atomically inserting both sides with a unique idempotency key.
CREATE FUNCTION check_journal_balance() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_journal uuid;
BEGIN
 IF TG_TABLE_NAME = 'ledger_journals' THEN target_journal = NEW.id; ELSE target_journal = NEW.journal_id; END IF;
 IF (SELECT count(*) FROM ledger_entries WHERE journal_id=target_journal) < 2
 OR EXISTS(SELECT w.currency FROM ledger_entries e JOIN wallets w ON w.id=e.wallet_id WHERE e.journal_id=target_journal GROUP BY w.currency HAVING sum(e.amount_minor) <> 0)
 THEN RAISE EXCEPTION 'Unbalanced journal'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER journal_balance AFTER INSERT ON ledger_entries DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_journal_balance();

CREATE CONSTRAINT TRIGGER journal_not_empty AFTER INSERT ON ledger_journals DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_journal_balance();
