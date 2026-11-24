ALTER TABLE payment_methods ADD COLUMN request_enabled boolean NOT NULL DEFAULT true;
-- Additive upgrade. No balances, funding entries or successful payouts are seeded.
ALTER TABLE service_requests DROP CONSTRAINT service_requests_status_check;
ALTER TABLE service_requests ADD CONSTRAINT service_requests_status_check CHECK(status IN ('pending','under_review','processing','approved','rejected','cancelled','successful'));
ALTER TABLE service_requests ADD COLUMN recipient_snapshot jsonb;
ALTER TABLE service_requests ADD COLUMN fee_aed numeric(16,2) NOT NULL DEFAULT 0 CHECK(fee_aed>=0);
ALTER TABLE wallet_holds DROP CONSTRAINT wallet_holds_status_check;
ALTER TABLE wallet_holds ADD CONSTRAINT wallet_holds_status_check CHECK(status IN ('proposed','reserved','released'));
CREATE TABLE service_countries(code char(2) PRIMARY KEY CHECK(code ~ '^[A-Z]{2}$'),name text NOT NULL CHECK(length(name) BETWEEN 1 AND 120),enabled boolean NOT NULL DEFAULT false,updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE fee_rules(provider text PRIMARY KEY CHECK(provider IN ('bKash','Nagad','Rocket','Upay','Bank')),flat_aed numeric(12,2) NOT NULL CHECK(flat_aed>=0 AND flat_aed<=10000),enabled boolean NOT NULL DEFAULT false,updated_at timestamptz NOT NULL DEFAULT now());
-- Each immutable reservation journal contains exactly two entries in AED, conserving value.
-- Funding/settlement journals remain independently blocked by the original denial triggers.
CREATE TABLE reservation_journals(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),request_id uuid NOT NULL REFERENCES service_requests(id),
 operation text NOT NULL CHECK(operation IN ('hold','release')),customer_id uuid NOT NULL REFERENCES customers(id),
 available_wallet uuid NOT NULL REFERENCES wallets(id),held_wallet uuid NOT NULL REFERENCES wallets(id),
 available_delta_minor bigint NOT NULL,held_delta_minor bigint NOT NULL,
 actor_id uuid NOT NULL REFERENCES customers(id),created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(available_wallet<>held_wallet),CHECK(available_delta_minor<>0),
 CHECK(available_delta_minor::numeric+held_delta_minor::numeric=0),
 CHECK((operation='hold' AND available_delta_minor<0) OR (operation='release' AND available_delta_minor>0)),
 UNIQUE(request_id,operation)
);
CREATE TRIGGER reservation_immutable BEFORE UPDATE OR DELETE ON reservation_journals FOR EACH STATEMENT EXECUTE FUNCTION deny_posting();
CREATE FUNCTION reserve_request(p_request uuid,p_actor uuid,p_operation text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE r public.service_requests; h public.wallet_holds; w uuid; hw uuid; funds numeric; needed bigint; role_name text;
BEGIN
 SELECT * INTO r FROM public.service_requests WHERE id=p_request;
 IF NOT FOUND OR r.request_type<>'send_money' THEN RAISE EXCEPTION 'Request not found' USING ERRCODE='23514'; END IF;
 -- All operations for a customer share this lock. Lock customer before request consistently.
 PERFORM 1 FROM public.customers WHERE id=r.customer_id FOR UPDATE;
 SELECT * INTO r FROM public.service_requests WHERE id=p_request FOR UPDATE;
 SELECT role INTO role_name FROM public.customers WHERE id=p_actor AND status='active';
 IF role_name IS NULL THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF p_operation='hold' AND p_actor<>r.customer_id OR p_operation='release' AND coalesce(role_name,'') NOT IN ('admin','reviewer') THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF p_operation NOT IN ('hold','release') THEN RAISE EXCEPTION 'Invalid operation' USING ERRCODE='23514'; END IF;
 SELECT * INTO h FROM public.wallet_holds WHERE request_id=r.id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Hold not found' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM public.reservation_journals WHERE request_id=r.id AND operation=p_operation) THEN RETURN; END IF;
 IF p_operation='hold' THEN
  IF h.status<>'proposed' OR r.status<>'pending' THEN RAISE EXCEPTION 'Invalid reservation state' USING ERRCODE='23514'; END IF;
  SELECT id INTO w FROM public.wallets WHERE customer_id=r.customer_id AND currency='AED' AND kind='customer' FOR UPDATE;
  IF w IS NULL THEN RAISE EXCEPTION 'Funded wallet unavailable' USING ERRCODE='23514'; END IF;
  SELECT coalesce(sum(amount_minor),0) INTO funds FROM public.ledger_entries WHERE wallet_id=w;
  SELECT funds+coalesce(sum(available_delta_minor),0) INTO funds FROM public.reservation_journals WHERE customer_id=r.customer_id;
  needed=((r.amount_aed+r.fee_aed)*100)::bigint;
  IF funds<needed THEN RAISE EXCEPTION 'Insufficient available funds' USING ERRCODE='23514'; END IF;
  INSERT INTO public.wallets(customer_id,currency,kind) VALUES(r.customer_id,'AED','held') ON CONFLICT(customer_id,currency,kind) DO NOTHING;
  SELECT id INTO hw FROM public.wallets WHERE customer_id=r.customer_id AND currency='AED' AND kind='held';
  INSERT INTO public.reservation_journals(request_id,operation,customer_id,available_wallet,held_wallet,available_delta_minor,held_delta_minor,actor_id) VALUES(r.id,'hold',r.customer_id,w,hw,-needed,needed,p_actor);
  UPDATE public.wallet_holds SET status='reserved',amount_minor=needed WHERE id=h.id;
 ELSE
  IF r.status NOT IN ('rejected','cancelled') THEN RAISE EXCEPTION 'Reject or cancel before releasing' USING ERRCODE='23514'; END IF;
  IF h.status='reserved' THEN
   INSERT INTO public.reservation_journals(request_id,operation,customer_id,available_wallet,held_wallet,available_delta_minor,held_delta_minor,actor_id)
   SELECT request_id,'release',customer_id,available_wallet,held_wallet,-available_delta_minor,-held_delta_minor,p_actor FROM public.reservation_journals WHERE request_id=r.id AND operation='hold';
  END IF;
  UPDATE public.wallet_holds SET status='released',released_at=now() WHERE id=h.id;
 END IF;
 INSERT INTO public.audit_logs(actor_id,action,target) VALUES(p_actor,'wallet.reservation.'||p_operation,r.id::text);
END $$;
REVOKE ALL ON reservation_journals FROM PUBLIC;
REVOKE ALL ON FUNCTION reserve_request(uuid,uuid,text) FROM PUBLIC;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='gm_app') THEN
 GRANT USAGE ON SCHEMA public TO gm_app;
 GRANT SELECT,INSERT,UPDATE ON payment_methods,company_payment_accounts,payout_banks,service_requests,receipts,wallet_holds,service_countries,fee_rules TO gm_app;
 GRANT SELECT,INSERT ON service_request_events,admin_control_events TO gm_app;
 GRANT SELECT ON audit_logs,reservation_journals TO gm_app;
 GRANT UPDATE(role) ON customers TO gm_app;
 GRANT USAGE ON SEQUENCE service_request_events_id_seq,admin_control_events_id_seq TO gm_app;
 GRANT EXECUTE ON FUNCTION reserve_request(uuid,uuid,text) TO gm_app;
END IF; END $$;
-- No API or manual SQL update may assert settlement. A future independently verified
-- provider integration requires separate review and migration before success is writable.
CREATE FUNCTION guard_request_success() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.status='successful' THEN RAISE EXCEPTION 'Independently verified settlement unavailable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER request_success_disabled BEFORE INSERT OR UPDATE ON service_requests FOR EACH ROW EXECUTE FUNCTION guard_request_success();
