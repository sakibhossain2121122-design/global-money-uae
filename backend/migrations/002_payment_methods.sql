CREATE TABLE IF NOT EXISTS payment_methods (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  country CHAR(2) NOT NULL DEFAULT 'AE',
  currency CHAR(3) NOT NULL DEFAULT 'AED',
  logo_url TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO payment_methods
(id, name, display_order, enabled)
VALUES
('botim_money', 'BOTIM Money', 1, FALSE),
('e_money', 'e& money', 2, FALSE),
('adcb', 'ADCB Bank', 3, FALSE),
('emirates_nbd', 'Emirates NBD', 4, FALSE),
('adib', 'ADIB Bank', 5, FALSE)
ON CONFLICT (id) DO NOTHING;
