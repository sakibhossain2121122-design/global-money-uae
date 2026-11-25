-- Dedicated local/staging database only. No password is created or changed.
BEGIN;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='gm_app') THEN
  CREATE ROLE gm_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='gm_app' AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls))
 OR EXISTS(SELECT 1 FROM pg_auth_members WHERE member='gm_app'::regrole)
 OR EXISTS(SELECT 1 FROM pg_class WHERE relowner='gm_app'::regrole)
 OR EXISTS(SELECT 1 FROM pg_namespace WHERE nspowner='gm_app'::regrole)
 OR EXISTS(SELECT 1 FROM pg_database WHERE datdba='gm_app'::regrole)
 THEN RAISE EXCEPTION 'gm_app must be an unprivileged non-owner role without memberships'; END IF;
END $$;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO gm_app;
DO $$ DECLARE t record; cols text; BEGIN
 FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP
  SELECT string_agg(quote_ident(column_name),',') INTO cols FROM information_schema.columns WHERE table_schema='public' AND table_name=t.tablename;
  EXECUTE format('REVOKE SELECT (%s), INSERT (%s), UPDATE (%s), REFERENCES (%s) ON public.%I FROM gm_app, PUBLIC',cols,cols,cols,cols,t.tablename);
 END LOOP;
END $$;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM gm_app, PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM gm_app, PUBLIC;
GRANT SELECT ON customers,sessions,beneficiaries,wallets,ledger_journals,ledger_entries,transactions,rates,support_tickets,
 payment_methods,deposit_requests,service_requests,service_request_events,service_fees,support_replies,staging_payment_accounts,payout_banks TO gm_app;
GRANT INSERT(email,password_hash,name), UPDATE(name,status) ON customers TO gm_app;
GRANT INSERT(token_hash,customer_id,expires_at),DELETE ON sessions TO gm_app;
GRANT INSERT(customer_id,name,provider,account,bank),DELETE ON beneficiaries TO gm_app;
GRANT INSERT(customer_id,subject,message),UPDATE(status) ON support_tickets TO gm_app;
GRANT INSERT(pair,value),UPDATE(value,updated_at) ON rates TO gm_app;
GRANT INSERT(pair,value,source,effective_at) ON rate_history TO gm_app;
GRANT USAGE ON SEQUENCE rate_history_id_seq TO gm_app;
GRANT INSERT(actor_id,action,target) ON audit_logs TO gm_app;
GRANT SELECT(id,actor_id,action,target,created_at) ON audit_logs TO gm_app;
GRANT USAGE ON SEQUENCE audit_logs_id_seq TO gm_app;
GRANT UPDATE(name,display_order,staging_enabled,updated_at) ON payment_methods TO gm_app;
GRANT INSERT(customer_id,payment_method_id,amount_aed,customer_reference,receipt_fixture_key,fixture_only,idempotency_key),
 UPDATE(status,reviewed_by,reviewed_at,updated_at,transaction_reference,reference_updated_at,reference_updated_by) ON deposit_requests TO gm_app;
GRANT INSERT(customer_id,request_type,amount_aed,beneficiary_id,idempotency_key,customer_note),
 UPDATE(status,reviewed_by,reviewed_at,updated_at,transaction_reference,reference_updated_at,reference_updated_by) ON service_requests TO gm_app;
GRANT INSERT(request_id,actor_id,previous_status,new_status) ON service_request_events TO gm_app;
GRANT USAGE ON SEQUENCE service_request_events_id_seq TO gm_app;
GRANT INSERT(service,fixed_aed,percent,enabled,updated_by),UPDATE(fixed_aed,percent,enabled,updated_by,updated_at) ON service_fees TO gm_app;
GRANT INSERT(ticket_id,actor_id,message) ON support_replies TO gm_app;
GRANT INSERT(payment_method_id,label,test_reference,enabled,updated_by),UPDATE(payment_method_id,label,test_reference,enabled,updated_by,updated_at) ON staging_payment_accounts TO gm_app;
GRANT INSERT(name,code,enabled,updated_by),UPDATE(name,code,enabled,updated_by,updated_at) ON payout_banks TO gm_app;
COMMIT;
