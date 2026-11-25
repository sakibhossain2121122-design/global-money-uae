CREATE TABLE transaction_reference_registry (
  transaction_reference text PRIMARY KEY,
  request_type text NOT NULL
    CHECK (request_type IN ('deposit','send_money')),
  request_id uuid NOT NULL,
  UNIQUE (request_type,request_id),
  CHECK (
    transaction_reference ~ '^TEST-[A-Z0-9-]{3,60}$'
  )
);

INSERT INTO transaction_reference_registry
SELECT transaction_reference,'deposit',id
FROM deposit_requests
WHERE transaction_reference IS NOT NULL;

INSERT INTO transaction_reference_registry
SELECT transaction_reference,'send_money',id
FROM service_requests
WHERE transaction_reference IS NOT NULL;

CREATE TABLE transaction_reference_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  request_type text NOT NULL
    CHECK (request_type IN ('deposit','send_money')),
  request_id uuid NOT NULL,
  old_reference text,
  new_reference text NOT NULL,
  actor_id uuid NOT NULL REFERENCES customers(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    new_reference ~ '^TEST-[A-Z0-9-]{3,60}$'
  )
);

CREATE TRIGGER reference_history_immutable
BEFORE UPDATE OR DELETE
ON transaction_reference_history
FOR EACH ROW
EXECUTE FUNCTION deny_audit_mutation();

CREATE FUNCTION sync_test_reference_registry()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  kind text;
BEGIN
  kind := TG_ARGV[0];

  IF TG_OP = 'UPDATE' THEN
    IF OLD.transaction_reference IS NOT DISTINCT FROM
       NEW.transaction_reference THEN
      RETURN NEW;
    END IF;

    DELETE FROM transaction_reference_registry
    WHERE request_type = kind
      AND request_id = OLD.id;
  END IF;

  IF NEW.transaction_reference IS NOT NULL THEN
    INSERT INTO transaction_reference_registry
      (transaction_reference,request_type,request_id)
    VALUES
      (NEW.transaction_reference,kind,NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER deposit_reference_registry_sync
AFTER INSERT OR UPDATE OF transaction_reference
ON deposit_requests
FOR EACH ROW
EXECUTE FUNCTION sync_test_reference_registry('deposit');

CREATE TRIGGER send_reference_registry_sync
AFTER INSERT OR UPDATE OF transaction_reference
ON service_requests
FOR EACH ROW
EXECUTE FUNCTION sync_test_reference_registry('send_money');

CREATE FUNCTION record_test_reference_history()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  previous_ref text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    previous_ref := OLD.transaction_reference;

    IF previous_ref IS NOT DISTINCT FROM
       NEW.transaction_reference THEN
      RETURN NEW;
    END IF;
  END IF;

  IF NEW.transaction_reference IS NOT NULL THEN
    IF NEW.reference_updated_by IS NULL THEN
      RAISE EXCEPTION 'Reference actor required';
    END IF;

    INSERT INTO transaction_reference_history
      (request_type,request_id,old_reference,
       new_reference,actor_id)
    VALUES
      (TG_ARGV[0],NEW.id,previous_ref,
       NEW.transaction_reference,
       NEW.reference_updated_by);

  ELSIF previous_ref IS NOT NULL THEN
    RAISE EXCEPTION 'Reference removal denied';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER deposit_reference_history
AFTER INSERT OR UPDATE OF transaction_reference
ON deposit_requests
FOR EACH ROW
EXECUTE FUNCTION record_test_reference_history('deposit');

CREATE TRIGGER send_reference_history
AFTER INSERT OR UPDATE OF transaction_reference
ON service_requests
FOR EACH ROW
EXECUTE FUNCTION record_test_reference_history('send_money');

CREATE FUNCTION deny_referenced_request_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.transaction_reference IS NOT NULL THEN
    RAISE EXCEPTION 'Referenced request deletion denied';
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER deposit_reference_delete_guard
BEFORE DELETE ON deposit_requests
FOR EACH ROW
EXECUTE FUNCTION deny_referenced_request_delete();

CREATE TRIGGER send_reference_delete_guard
BEFORE DELETE ON service_requests
FOR EACH ROW
EXECUTE FUNCTION deny_referenced_request_delete();
