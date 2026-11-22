-- Reservations do not post ledger entries or authorize payouts.
ALTER TABLE service_requests ADD CONSTRAINT service_request_send_money_identity
  UNIQUE (id, customer_id, amount_aed, request_type);
ALTER TABLE wallets ADD CONSTRAINT wallet_send_money_identity
  UNIQUE (id, customer_id, currency, kind);

CREATE TABLE send_money_requests (
  request_id uuid PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES customers(id),
  wallet_id uuid NOT NULL,
  wallet_currency char(3) NOT NULL DEFAULT 'AED' CHECK (wallet_currency = 'AED'),
  wallet_kind text NOT NULL DEFAULT 'customer' CHECK (wallet_kind = 'customer'),
  request_type text NOT NULL DEFAULT 'send_money' CHECK (request_type = 'send_money'),
  beneficiary_id uuid NOT NULL,
  beneficiary_name text NOT NULL,
  beneficiary_provider text NOT NULL CHECK (beneficiary_provider IN ('bKash','Nagad','Rocket','Upay','Bank')),
  beneficiary_account text NOT NULL,
  beneficiary_bank text,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  amount_aed numeric(16,2) GENERATED ALWAYS AS ((amount_minor::numeric / 100)::numeric(16,2)) STORED,
  idempotency_key uuid NOT NULL,
  hold_status text NOT NULL DEFAULT 'held' CHECK (hold_status IN ('held','released')),
  payout_reference text CHECK (payout_reference IS NULL OR length(btrim(payout_reference)) BETWEEN 1 AND 120),
  created_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz,
  UNIQUE (customer_id, idempotency_key),
  FOREIGN KEY (request_id, customer_id, amount_aed, request_type)
    REFERENCES service_requests(id, customer_id, amount_aed, request_type),
  FOREIGN KEY (wallet_id, customer_id, wallet_currency, wallet_kind)
    REFERENCES wallets(id, customer_id, currency, kind),
  CHECK (beneficiary_provider <> 'Bank' OR (beneficiary_bank IS NOT NULL AND length(btrim(beneficiary_bank)) > 0)),
  CHECK ((hold_status = 'held' AND released_at IS NULL) OR (hold_status = 'released' AND released_at IS NOT NULL))
);

CREATE UNIQUE INDEX send_money_active_duplicate
  ON send_money_requests (
    customer_id, beneficiary_provider,
    (CASE WHEN beneficiary_provider = 'Bank' THEN lower(btrim(beneficiary_bank)) ELSE '' END),
    (CASE WHEN beneficiary_provider = 'Bank' THEN regexp_replace(lower(beneficiary_account), '[ -]', '', 'g')
      ELSE regexp_replace(beneficiary_account, '^\+88', '') END),
    amount_minor)
  WHERE hold_status = 'held';
CREATE UNIQUE INDEX send_money_payout_reference
  ON send_money_requests (beneficiary_provider, lower(btrim(payout_reference)))
  WHERE payout_reference IS NOT NULL;
CREATE INDEX send_money_wallet_holds ON send_money_requests (wallet_id) WHERE hold_status = 'held';

CREATE TABLE send_money_reference_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  request_id uuid NOT NULL REFERENCES send_money_requests(request_id),
  actor_id uuid NOT NULL REFERENCES customers(id),
  payout_reference text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
