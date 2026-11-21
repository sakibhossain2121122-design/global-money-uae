CREATE TABLE send_money_review_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  request_id uuid NOT NULL REFERENCES send_money_requests(request_id),
  actor_id uuid NOT NULL REFERENCES customers(id),
  kind text NOT NULL CHECK (kind IN ('recipient', 'reconciliation', 'reconciliation_resolution')),
  status text NOT NULL,
  note text NOT NULL CHECK (length(btrim(note)) BETWEEN 1 AND 500),
  evidence_reference text CHECK (evidence_reference IS NULL OR length(btrim(evidence_reference)) BETWEEN 1 AND 120),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (kind = 'recipient' AND status IN ('under_review', 'admin_reviewed', 'rejected')
      AND (status <> 'admin_reviewed' OR evidence_reference IS NOT NULL))
    OR (kind = 'reconciliation' AND status IN ('unverified', 'under_review', 'disputed', 'reported_failed'))
    OR (kind = 'reconciliation_resolution' AND status = 'pending_approval'
      AND evidence_reference IS NOT NULL)
  )
);
CREATE INDEX send_money_review_events_request ON send_money_review_events (request_id, kind, id DESC);

CREATE TABLE send_money_reconciliation_approvals (
  resolution_event_id bigint PRIMARY KEY REFERENCES send_money_review_events(id),
  approver_id uuid NOT NULL REFERENCES customers(id),
  note text NOT NULL CHECK (length(btrim(note)) BETWEEN 1 AND 500),
  evidence_reference text NOT NULL CHECK (length(btrim(evidence_reference)) BETWEEN 1 AND 120),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION deny_audit_event_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Audit history is append-only';
END $$;
CREATE TRIGGER send_money_review_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON send_money_review_events
  FOR EACH STATEMENT EXECUTE FUNCTION deny_audit_event_change();
CREATE TRIGGER send_money_resolution_approval_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON send_money_reconciliation_approvals
  FOR EACH STATEMENT EXECUTE FUNCTION deny_audit_event_change();
CREATE TRIGGER send_money_reference_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON send_money_reference_events
  FOR EACH STATEMENT EXECUTE FUNCTION deny_audit_event_change();
CREATE TRIGGER add_money_receipt_events_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON add_money_receipt_events
  FOR EACH STATEMENT EXECUTE FUNCTION deny_audit_event_change();

CREATE FUNCTION protect_money_request_events() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM service_requests WHERE id=OLD.request_id AND request_type IN ('add_money','send_money'))
    OR (TG_OP='UPDATE' AND EXISTS (SELECT 1 FROM service_requests WHERE id=NEW.request_id AND request_type IN ('add_money','send_money')))
  THEN RAISE EXCEPTION 'Financial request history is append-only'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER money_request_events_append_only BEFORE UPDATE OR DELETE ON service_request_events
  FOR EACH ROW EXECUTE FUNCTION protect_money_request_events();
CREATE FUNCTION protect_send_money_event_truncation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM service_request_events e JOIN service_requests r ON r.id=e.request_id WHERE r.request_type IN ('add_money','send_money'))
  THEN RAISE EXCEPTION 'Financial request history is append-only'; END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER send_money_request_events_no_truncate BEFORE TRUNCATE ON service_request_events
  FOR EACH STATEMENT EXECUTE FUNCTION protect_send_money_event_truncation();

CREATE FUNCTION protect_send_money_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.request_id,NEW.customer_id,NEW.wallet_id,NEW.wallet_currency,NEW.wallet_kind,NEW.request_type,
      NEW.beneficiary_id,NEW.beneficiary_name,NEW.beneficiary_provider,NEW.beneficiary_account,
      NEW.beneficiary_bank,NEW.amount_minor,NEW.idempotency_key,NEW.created_at)
    IS DISTINCT FROM
     (OLD.request_id,OLD.customer_id,OLD.wallet_id,OLD.wallet_currency,OLD.wallet_kind,OLD.request_type,
      OLD.beneficiary_id,OLD.beneficiary_name,OLD.beneficiary_provider,OLD.beneficiary_account,
      OLD.beneficiary_bank,OLD.amount_minor,OLD.idempotency_key,OLD.created_at)
    OR (OLD.payout_reference IS NOT NULL AND NEW.payout_reference IS DISTINCT FROM OLD.payout_reference)
  THEN RAISE EXCEPTION 'Send Money request details are immutable'; END IF;
  IF OLD.hold_status='released' AND (NEW.hold_status<>'released' OR NEW.released_at IS DISTINCT FROM OLD.released_at)
  THEN RAISE EXCEPTION 'Released reservations cannot be reinstated'; END IF;
  IF OLD.hold_status='held' AND NEW.hold_status='released' AND (
       NOT EXISTS (
         SELECT 1 FROM send_money_reconciliation_approvals a
         JOIN send_money_review_events proposal ON proposal.id=a.resolution_event_id
         WHERE proposal.request_id=OLD.request_id AND proposal.kind='reconciliation_resolution'
           AND proposal.status='pending_approval' AND proposal.actor_id<>a.approver_id
       ) OR
       NOT EXISTS (SELECT 1 FROM service_requests WHERE id=OLD.request_id AND status='rejected')
     ) AND NOT (
       NEW.payout_reference IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM send_money_review_events
         WHERE request_id=OLD.request_id AND kind='reconciliation'
       )
       AND EXISTS (
         SELECT 1 FROM service_requests
         WHERE id=OLD.request_id AND status IN ('rejected','cancelled')
       )
     )
  THEN RAISE EXCEPTION 'Reservation release requires a two-administrator failed-payout resolution'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER send_money_snapshot_immutable BEFORE UPDATE ON send_money_requests
  FOR EACH ROW EXECUTE FUNCTION protect_send_money_snapshot();
CREATE FUNCTION protect_send_money_request_lifecycle() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.customer_id IS DISTINCT FROM OLD.customer_id OR NEW.request_type IS DISTINCT FROM OLD.request_type
     OR NEW.amount_aed IS DISTINCT FROM OLD.amount_aed OR NEW.payment_method_id IS DISTINCT FROM OLD.payment_method_id
     OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN RAISE EXCEPTION 'Send Money request details are immutable'; END IF;
  IF OLD.status IN ('rejected','cancelled') AND NEW.status<>OLD.status
  THEN RAISE EXCEPTION 'Closed Send Money requests cannot be reopened'; END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
    (OLD.status='pending' AND NEW.status IN ('under_review','rejected','cancelled')) OR
    (OLD.status='under_review' AND NEW.status IN ('rejected','cancelled'))
  ) THEN RAISE EXCEPTION 'Invalid Send Money request transition'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER send_money_request_lifecycle BEFORE UPDATE ON service_requests
  FOR EACH ROW WHEN (OLD.request_type='send_money')
  EXECUTE FUNCTION protect_send_money_request_lifecycle();
CREATE FUNCTION deny_send_money_record_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Send Money requests cannot be deleted';
END $$;
CREATE TRIGGER send_money_request_no_delete BEFORE DELETE ON send_money_requests
  FOR EACH ROW EXECUTE FUNCTION deny_send_money_record_delete();

CREATE FUNCTION enforce_send_money_reservation_balance() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE balance_minor numeric;
DECLARE other_holds numeric;
BEGIN
  IF NEW.hold_status<>'held' THEN RETURN NEW; END IF;
  PERFORM 1 FROM wallets WHERE id=NEW.wallet_id FOR UPDATE;
  SELECT COALESCE(sum(amount_minor),0) INTO balance_minor FROM ledger_entries WHERE wallet_id=NEW.wallet_id;
  SELECT COALESCE(sum(amount_minor),0) INTO other_holds FROM send_money_requests
    WHERE wallet_id=NEW.wallet_id AND hold_status='held' AND request_id<>NEW.request_id;
  IF balance_minor-other_holds<NEW.amount_minor THEN
    RAISE EXCEPTION 'Insufficient available wallet balance';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER send_money_reservation_balance BEFORE INSERT OR UPDATE OF hold_status ON send_money_requests
  FOR EACH ROW EXECUTE FUNCTION enforce_send_money_reservation_balance();

CREATE TRIGGER audit_logs_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON audit_logs
  FOR EACH STATEMENT EXECUTE FUNCTION deny_audit_event_change();
CREATE TRIGGER admin_control_events_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON admin_control_events
  FOR EACH STATEMENT EXECUTE FUNCTION deny_audit_event_change();

CREATE FUNCTION validate_send_money_resolution_approval() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE proposer uuid;
DECLARE payout_ref text;
DECLARE request_uuid uuid;
DECLARE service_status text;
DECLARE reconciliation_status text;
BEGIN
  SELECT e.actor_id,s.request_id,s.payout_reference,r.status INTO proposer,request_uuid,payout_ref,service_status
    FROM send_money_review_events e JOIN send_money_requests s ON s.request_id=e.request_id
    JOIN service_requests r ON r.id=s.request_id
    WHERE e.id=NEW.resolution_event_id AND e.kind='reconciliation_resolution' AND e.status='pending_approval';
  IF proposer IS NULL OR proposer=NEW.approver_id THEN
    RAISE EXCEPTION 'A different administrator must approve the resolution';
  END IF;
  IF lower(btrim(NEW.evidence_reference)) =
     (SELECT lower(btrim(evidence_reference)) FROM send_money_review_events WHERE id=NEW.resolution_event_id)
  THEN RAISE EXCEPTION 'Independent approval evidence is required'; END IF;
  IF lower(btrim(NEW.evidence_reference))=lower(btrim(payout_ref)) OR lower(btrim(
       (SELECT evidence_reference FROM send_money_review_events WHERE id=NEW.resolution_event_id)
     ))=lower(btrim(payout_ref))
  THEN RAISE EXCEPTION 'Payout reference cannot serve as independent evidence'; END IF;
  IF NOT EXISTS (SELECT 1 FROM customers WHERE id=NEW.approver_id AND role='admin' AND status='active')
  THEN RAISE EXCEPTION 'Active administrator approval required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM send_money_review_events WHERE id=NEW.resolution_event_id AND request_id=request_uuid)
  THEN RAISE EXCEPTION 'Resolution request mismatch'; END IF;
  SELECT status INTO reconciliation_status FROM send_money_review_events
    WHERE request_id=request_uuid AND kind='reconciliation' ORDER BY id DESC LIMIT 1;
  IF service_status NOT IN ('pending','under_review') OR reconciliation_status<>'reported_failed'
  OR payout_ref IS NULL OR lower(btrim(NEW.evidence_reference))=lower(btrim(payout_ref))
  THEN RAISE EXCEPTION 'Failed-payout resolution requirements are not met'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER send_money_resolution_two_person BEFORE INSERT ON send_money_reconciliation_approvals
  FOR EACH ROW EXECUTE FUNCTION validate_send_money_resolution_approval();
