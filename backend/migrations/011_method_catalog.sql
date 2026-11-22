ALTER TABLE payment_methods ADD COLUMN catalog_visible boolean NOT NULL DEFAULT true;

INSERT INTO payment_methods
  (id, name, country, currency, display_order, enabled, add_money_request_enabled)
VALUES
  ('bd_bkash', 'bKash', 'BD', 'BDT', 1, false, false),
  ('bd_nagad', 'Nagad', 'BD', 'BDT', 2, false, false),
  ('bd_rocket', 'Rocket', 'BD', 'BDT', 3, false, false),
  ('bd_upay', 'Upay', 'BD', 'BDT', 4, false, false),
  ('bd_bank', 'Bank Transfer', 'BD', 'BDT', 5, false, false)
ON CONFLICT (id) DO NOTHING;
