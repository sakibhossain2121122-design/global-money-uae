-- Fail rather than silently reassign existing mobile numbers if legacy duplicates exist.
CREATE UNIQUE INDEX customers_mobile_uae_unique ON customers(mobile_uae) WHERE mobile_uae IS NOT NULL;
ALTER TABLE customers ADD COLUMN identity_kind text CHECK (identity_kind IN ('passport','emirates_id'));
-- QR content is rendered locally by clients. No remote image URLs or server-side fetching.
ALTER TABLE company_payment_accounts ADD COLUMN qr_payload text CHECK (length(qr_payload) BETWEEN 1 AND 512);
