
CREATE TABLE IF NOT EXISTS company_payment_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_method_id TEXT NOT NULL
      REFERENCES payment_methods(id),
    account_holder TEXT NOT NULL,
    account_number TEXT,
    iban TEXT,
    instructions TEXT,
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    archived_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payout_banks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    country CHAR(2) NOT NULL DEFAULT 'BD',
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    archived_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_control_events (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    admin_id UUID REFERENCES customers(id),
    action TEXT NOT NULL,
    target_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
