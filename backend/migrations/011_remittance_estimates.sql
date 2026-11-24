ALTER TABLE service_requests
  ADD COLUMN quoted_aed_bdt_rate numeric(16,6),
  ADD COLUMN estimated_bdt numeric(28,2),
  ADD CONSTRAINT service_request_bdt_estimate CHECK (
    (quoted_aed_bdt_rate IS NULL AND estimated_bdt IS NULL) OR
    (request_type='send_money' AND quoted_aed_bdt_rate IS NOT NULL AND quoted_aed_bdt_rate>0
     AND estimated_bdt IS NOT NULL AND estimated_bdt>=0
     AND estimated_bdt=round(amount_aed*quoted_aed_bdt_rate,2))
  );
