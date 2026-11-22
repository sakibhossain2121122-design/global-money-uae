ALTER TABLE customers ADD COLUMN mobile_uae text
  CHECK (mobile_uae IS NULL OR mobile_uae ~ '^\+9715[0-9]{8}$');
ALTER TABLE customers ADD COLUMN registration_status text
  CHECK (registration_status IS NULL OR registration_status IN ('pending', 'verified', 'rejected'));

CREATE TABLE registration_review_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES customers(id),
  actor_id uuid NOT NULL REFERENCES customers(id),
  previous_status text,
  new_status text NOT NULL CHECK (new_status IN ('pending', 'verified', 'rejected')),
  note text NOT NULL CHECK (length(btrim(note)) BETWEEN 1 AND 500),
  evidence_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (new_status <> 'verified' OR (evidence_reference IS NOT NULL AND length(btrim(evidence_reference)) BETWEEN 1 AND 120))
);
CREATE INDEX registration_review_customer ON registration_review_events(customer_id, id);
CREATE TRIGGER registration_review_append_only
  BEFORE UPDATE OR DELETE OR TRUNCATE ON registration_review_events
  FOR EACH STATEMENT EXECUTE FUNCTION deny_audit_event_change();
