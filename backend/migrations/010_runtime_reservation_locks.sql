CREATE FUNCTION public.lock_send_money_beneficiary(beneficiary_uuid uuid, customer_uuid uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  PERFORM 1 FROM public.beneficiaries
    WHERE id=beneficiary_uuid AND customer_id=customer_uuid FOR SHARE;
  RETURN FOUND;
END $$;

CREATE FUNCTION public.lock_send_money_wallet(wallet_uuid uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  PERFORM 1 FROM public.wallets WHERE id=wallet_uuid FOR UPDATE;
  RETURN FOUND;
END $$;

REVOKE ALL ON FUNCTION public.lock_send_money_beneficiary(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lock_send_money_wallet(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.enforce_send_money_reservation_balance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp AS $$
DECLARE balance_minor numeric;
DECLARE other_holds numeric;
BEGIN
  IF NEW.hold_status<>'held' THEN RETURN NEW; END IF;
  PERFORM 1 FROM public.wallets WHERE id=NEW.wallet_id FOR UPDATE;
  SELECT COALESCE(sum(amount_minor),0) INTO balance_minor FROM public.ledger_entries WHERE wallet_id=NEW.wallet_id;
  SELECT COALESCE(sum(amount_minor),0) INTO other_holds FROM public.send_money_requests
    WHERE wallet_id=NEW.wallet_id AND hold_status='held' AND request_id<>NEW.request_id;
  IF balance_minor-other_holds<NEW.amount_minor THEN
    RAISE EXCEPTION 'Insufficient available wallet balance';
  END IF;
  RETURN NEW;
END $$;
