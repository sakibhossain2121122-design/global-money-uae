CREATE TABLE staging_identity_samples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL UNIQUE REFERENCES customers(id),
  identity_sample text NOT NULL CHECK (identity_sample IN ('passport-sample.txt', 'uae-id-sample.txt')),
  selfie_sample text NOT NULL CHECK (selfie_sample = 'selfie-sample.txt'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES customers(id),
  CHECK ((status = 'pending' AND reviewed_at IS NULL AND reviewed_by IS NULL)
      OR (status <> 'pending' AND reviewed_at IS NOT NULL AND reviewed_by IS NOT NULL))
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gm_app') THEN
    GRANT SELECT ON staging_identity_samples TO gm_app;
    GRANT INSERT(customer_id,identity_sample,selfie_sample) ON staging_identity_samples TO gm_app;
    GRANT UPDATE(status,reviewed_at,reviewed_by) ON staging_identity_samples TO gm_app;
  END IF;
END $$;
