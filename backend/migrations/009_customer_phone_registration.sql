ALTER TABLE customers
  ADD COLUMN phone_number text UNIQUE CHECK (phone_number ~ '^\+[1-9][0-9]{6,14}$'),
  ALTER COLUMN email DROP NOT NULL,
  ADD CONSTRAINT customer_sign_in_identifier CHECK (
    email IS NOT NULL OR (role = 'customer' AND phone_number IS NOT NULL)
  );

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gm_app') THEN
    GRANT INSERT(phone_number) ON customers TO gm_app;
  END IF;
END $$;
