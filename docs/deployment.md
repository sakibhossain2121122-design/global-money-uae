# Deployment and security boundaries

Deploy this as an account-platform staging foundation first. Real money posting, collection, BOTIM MONEY, remittance and identity-document intake remain disabled in application routes and database triggers. No environment variable enables those operations. Completing provider agreements and legal authorization also requires a separately reviewed integration, reconciliation, idempotency, monitoring and compliance implementation.

## Database

Use PostgreSQL 17 on a private network with encrypted storage, backups and verified restore procedures. Use certificate-verified TLS for remote connections (for example `sslmode=verify-full` and your provider's trusted CA); do not disable certificate verification. Keep database credentials in a secret manager or a service-owned environment file with mode 0600. Never expose the database publicly.

Run `backend/src/migrate.ts` with a dedicated migration owner. The runner holds an advisory transaction lock and applies pending numbered migrations once, atomically. Do not deploy edited initial migrations to a database that has already applied them; add a numbered forward migration and extend the runner for future releases.

For an existing runtime role, migration 011 must be applied before the new API
starts. Afterwards, the migration owner must grant the additional catalogue
columns below; the original Add Money grant remains in place. These privileges
do not grant permission to enable payments or modify the ledger.

```sql
GRANT UPDATE(name,logo_url,display_order,catalog_visible) ON payment_methods TO gm_app;
```

After migration 012, the migration owner must also grant:

```sql
GRANT INSERT(mobile_uae,registration_status), UPDATE(registration_status) ON customers TO gm_app;
GRANT SELECT, INSERT ON registration_review_events TO gm_app;
GRANT USAGE ON SEQUENCE registration_review_events_id_seq TO gm_app;
```

Create a separate runtime role using the owner connection. Set its password interactively with `\password gm_app` or your secret provisioning system; do not place it in source or shell history:

```sql
CREATE ROLE gm_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO gm_app;
GRANT SELECT ON customers, sessions, beneficiaries, wallets, ledger_journals,
 ledger_entries, transactions, rates, support_tickets TO gm_app;
GRANT INSERT(email,password_hash,name,mobile_uae,registration_status), UPDATE(name,status,registration_status) ON customers TO gm_app;
GRANT INSERT, DELETE ON sessions TO gm_app;
GRANT INSERT, DELETE ON beneficiaries TO gm_app;
GRANT INSERT ON support_tickets TO gm_app;
GRANT UPDATE(status) ON support_tickets TO gm_app;
GRANT INSERT, UPDATE ON rates TO gm_app;
GRANT INSERT(actor_id,action,target) ON audit_logs TO gm_app;
GRANT USAGE ON SEQUENCE audit_logs_id_seq TO gm_app;
GRANT SELECT ON payment_methods TO gm_app;
GRANT UPDATE(add_money_request_enabled,name,logo_url,display_order,catalog_visible,updated_at) ON payment_methods TO gm_app;
GRANT SELECT, INSERT, UPDATE ON company_payment_accounts, payout_banks TO gm_app;
GRANT INSERT(admin_id,action,target_id) ON admin_control_events TO gm_app;
GRANT USAGE ON SEQUENCE admin_control_events_id_seq TO gm_app;
GRANT SELECT, INSERT ON registration_review_events TO gm_app;
GRANT USAGE ON SEQUENCE registration_review_events_id_seq TO gm_app;
```

Do not grant runtime ownership, DDL, role changes, ledger writes, transaction writes, or audit update/delete access. The registration code deliberately omits role fields. Provision admins individually through the owner connection after verifying identity and secure access. There is no default password. Add an identity-aware gateway with administrator MFA before exposing administration outside a trusted network.

After applying migrations 008 through 010, use the migration owner to narrow the
runtime grants on request and audit tables. These grants let the API create and
review requests while withholding audit mutation, table ownership, `TRUNCATE`,
and ledger posting. Adapt role/database identifiers only after a reviewed
staging migration:

```sql
REVOKE ALL ON service_requests, service_request_events, add_money_receipts,
 add_money_receipt_events, audit_logs,
 admin_control_events, send_money_requests, send_money_reference_events,
 send_money_review_events, send_money_reconciliation_approvals FROM PUBLIC, gm_app;
GRANT SELECT ON service_requests, service_request_events, add_money_receipts,
 add_money_receipt_events, audit_logs,
 admin_control_events, send_money_requests, send_money_reference_events,
 send_money_review_events, send_money_reconciliation_approvals TO gm_app;
GRANT INSERT(customer_id,request_type,amount_aed,payment_method_id,customer_note,idempotency_key)
 ON service_requests TO gm_app;
GRANT UPDATE(status,admin_note,reviewed_by,reviewed_at,updated_at)
 ON service_requests TO gm_app;
GRANT INSERT(request_id,actor_id,previous_status,new_status,note)
 ON service_request_events TO gm_app;
GRANT INSERT(request_id,payment_method_id,content_type,content,sha256)
 ON add_money_receipts TO gm_app;
GRANT UPDATE(verification_status,verified_amount_aed,payment_reference,review_note,reviewed_by,reviewed_at)
 ON add_money_receipts TO gm_app;
GRANT INSERT(receipt_id,actor_id,verification_status,verified_amount_aed,payment_reference,note)
 ON add_money_receipt_events TO gm_app;
GRANT INSERT(request_id,customer_id,wallet_id,beneficiary_id,beneficiary_name,
 beneficiary_provider,beneficiary_account,beneficiary_bank,amount_minor,idempotency_key)
 ON send_money_requests TO gm_app;
GRANT UPDATE(hold_status,released_at,payout_reference) ON send_money_requests TO gm_app;
GRANT INSERT(request_id,actor_id,payout_reference) ON send_money_reference_events TO gm_app;
GRANT INSERT(request_id,actor_id,kind,status,note,evidence_reference)
 ON send_money_review_events TO gm_app;
GRANT INSERT(resolution_event_id,approver_id,note,evidence_reference)
 ON send_money_reconciliation_approvals TO gm_app;
GRANT INSERT(actor_id,action,target) ON audit_logs TO gm_app;
GRANT INSERT(admin_id,action,target_id) ON admin_control_events TO gm_app;
GRANT USAGE ON SEQUENCE service_request_events_id_seq,
 add_money_receipt_events_id_seq,
 send_money_reference_events_id_seq,send_money_review_events_id_seq,
 audit_logs_id_seq TO gm_app;
GRANT EXECUTE ON FUNCTION public.lock_send_money_beneficiary(uuid,uuid),
 public.lock_send_money_wallet(uuid) TO gm_app;
```

The example assumes a newly created role with no inherited privileges or
pre-existing column grants. Table-level revokes alone do not remove previously
granted column privileges; audit effective privileges and role memberships if
reusing a role.

Keep the migration owner credential out of the API environment; the API process
must connect only as `gm_app`. Verify in staging that `gm_app` is not an owner,
superuser, role member, or granted `UPDATE`, `DELETE`, or `TRUNCATE` on audit
events; test the ordinary API paths using that role before release. Database
owners and superusers can still disable triggers or alter grants. Restrict and
monitor those credentials, require MFA and change approval for owner access,
alert on DDL/role/grant changes, retain independent protected backups, and
periodically verify audit continuity. Triggers and role grants are defense in
depth, not tamper-proof storage.

Migration 010 uses narrowly scoped security-definer functions owned by the
migration owner to lock beneficiary and wallet rows without granting runtime
UPDATE permissions on those tables. Their search paths are fixed and table
references are schema-qualified; never grant untrusted users CREATE on public
or ownership of these functions or tables. The migration owner must own the
referenced tables and trigger function. Runtime access to beneficiary and wallet
data remains scoped by the API, not database row-level security. Test the exact
documented grants against a disposable database before staging.

Apply migration 010 and its function grants before starting this version of the
API. There is no automated down migration. For rollback, stop the API and use a
tested database restore and a matching application/grant configuration; the
previous API's direct row locks do not work with these restricted grants. Do not
grant broad wallet or beneficiary UPDATE privileges as a rollback shortcut.

## API and admin

Install Node.js 24, then `npm ci` in `backend` and `admin`. Run backend tests/type checks and `npm run build` in `admin`. Install under a dedicated non-root OS user. Run `node --env-file=/etc/global-money/api.env /srv/global-money/backend/src/server.ts` using systemd or another supervised service with restart limits, memory limits and graceful shutdown. `DATABASE_URL` must use the runtime role. Do not serve `.env`, source directories or database dumps from a web server.

The API binds to all interfaces, not loopback. Restrict its port with a host firewall or private network so only the HTTPS reverse proxy can reach it. Serve only `admin/dist` as static content, proxy `/v1/*` and `/health` to `127.0.0.1:3000`, and return `index.html` for admin navigation. One origin avoids cross-origin credential policies. Example Caddy routing (replace domain and static path):

```caddyfile
money.example.com {
    @api path /v1/* /health
    handle @api {
        reverse_proxy 127.0.0.1:3000
    }
    handle {
        root * /srv/global-money/admin/dist
        header {
            Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
            X-Content-Type-Options "nosniff"
            Referrer-Policy "no-referrer"
            Strict-Transport-Security "max-age=31536000"
            Cache-Control "no-store"
        }
        try_files {path} /index.html
        file_server
    }
}
```

Restrict admin access at the gateway. No permissive CORS or bearer tokens in URLs. The clients store bearer tokens only in memory, never cookies or localStorage, so there is no ambient browser cookie authentication. TLS and the CSP protect token transport and reduce XSS risk; CSP is not a substitute for a security review. Do not log Authorization headers at the proxy. Keep access logs minimal and restrict retention.

The API applies an in-memory 100 requests/minute peer-IP limit and 10 auth attempts/15 minutes. It does not trust forwarded IP headers. Behind a reverse proxy, requests conservatively share the proxy-IP bucket: configure real per-client limits at the gateway before broader rollout. These limits are not distributed; use shared rate limiting and abuse monitoring before scaling to multiple instances. Password hashing has a four-operation concurrency cap. Request headers/body timeouts and the JSON size cap bound resource use.

## Ledger and KYC architecture

A journal has a unique idempotency key; entries use signed integer minor units tied to currency-specific wallets. A deferred constraint checks at least two entries and zero sum per currency. There is no mutable stored balance. API and database triggers reject all journal/entry mutations; runtime role grants also omit financial writes. No wallets are credited or seeded. A future authorized posting service must atomically insert a complete balanced journal, use durable idempotency, preserve immutability, reconcile against providers and expose only confirmed balances. Do not remove the posting guards merely to demonstrate a balance.

Send Money requests reserve funds against the ledger-derived balance while
locking the customer wallet; a database trigger repeats the available-balance
check. The runtime role cannot write ledger entries. Any future posting service
must take the same wallet lock and account for active reservations before a
debit or credit; do not grant ledger writes to `gm_app`. Releasing a payout
reservation after a reported failure requires a pending failed-payout proposal,
a different active administrator, distinct evidence references and an atomic
one-time approval. These are human attestations, not provider verification.
There is no payout execution, settlement, or success endpoint. Do not treat
these reports as proof of provider state or enable credits/payouts without an
independently authenticated provider confirmation and separate financial
authorization.

`backend/src/kyc.ts` describes future Emirates ID/passport verification capabilities, with `documentsAccepted:false`. No upload storage, identity-number columns, approval callbacks or document endpoint exists. Future provider work requires explicit privacy, retention, encryption and authorization design before accepting real documents.

Before any identity-document feature is enabled, require explicit regulatory and
privacy approval, a documented lawful basis, a separately reviewed authenticated
private upload endpoint with strict streaming size/type/content validation and
malware scanning, and encryption in transit and at rest with managed keys.
Enforce least-privilege admin access with MFA, access and review audit events,
documented retention/deletion and legal-hold policies, backup expiry, incident
response, and a tested deletion process. Never put documents in source control,
public URLs or logs. Manual review must use an approved evidence workflow.
Registration review status is an administrative attestation only; it is not
identity-document verification and grants no financial authorization.

Mobile numbers collected during registration are unverified and may be
duplicated. They must not be used for authentication or marked verified from
an administrative registration review. Mobile login and OTP remain unavailable
until an authorized provider and a reviewed, replay-resistant ownership
verification and account-binding process are in place, including rate limits,
expiry, uniqueness, number reassignment and safe recovery for existing users.
Email/password login remains available during that migration.

## Operations and known limits

Run expired-session cleanup regularly using a privileged maintenance job (`DELETE FROM sessions WHERE expires_at < now()`), with database backups/retention governed by an approved policy. Audit records contain action, actor and target identifiers, not request bodies. Restrict audit reading to authorized operators. Monitor aggregate rejections without collecting secrets.

Registration currently has no email verification, password reset, account email change or MFA flow. Provide an approved recovery process and verified-email onboarding before inviting a broad customer audience. Admin user management is suspension/reactivation, not arbitrary role assignment. User and ticket lists show the latest 100 records without pagination. No emulator/device UI acceptance test is claimed. Review Bengali wording, accessibility and small-screen behavior on devices before release.
