# Deployment and security boundaries

Deploy this as an account-platform staging foundation first. Real money posting, collection, BOTIM MONEY, remittance and identity-document intake remain disabled in application routes and database triggers. No environment variable enables those operations. Completing provider agreements and legal authorization also requires a separately reviewed integration, reconciliation, idempotency, monitoring and compliance implementation.

## Database

Use PostgreSQL 17 on a private network with encrypted storage, backups and verified restore procedures. Use certificate-verified TLS for remote connections (for example `sslmode=verify-full` and your provider's trusted CA); do not disable certificate verification. Keep database credentials in a secret manager or a service-owned environment file with mode 0600. Never expose the database publicly.

Run `backend/src/migrate.ts` with a dedicated migration owner and a fresh database. The runner holds an advisory transaction lock and applies migration 001 once, atomically. Do not deploy edited initial migrations to a database that has already applied them; add a numbered forward migration and extend the runner for future releases.

Create a separate runtime role using the owner connection. Set its password interactively with `\password gm_app` or your secret provisioning system; do not place it in source or shell history:

```sql
CREATE ROLE gm_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO gm_app;
GRANT SELECT ON customers, sessions, beneficiaries, wallets, ledger_journals,
 ledger_entries, transactions, rates, support_tickets TO gm_app;
GRANT INSERT(email,password_hash,name), UPDATE(name,status) ON customers TO gm_app;
GRANT INSERT, DELETE ON sessions TO gm_app;
GRANT INSERT, DELETE ON beneficiaries TO gm_app;
GRANT INSERT ON support_tickets TO gm_app;
GRANT UPDATE(status) ON support_tickets TO gm_app;
GRANT INSERT, UPDATE ON rates TO gm_app;
GRANT INSERT(actor_id,action,target) ON audit_logs TO gm_app;
GRANT USAGE ON SEQUENCE audit_logs_id_seq TO gm_app;
```

Do not grant runtime ownership, DDL, role changes, ledger writes, transaction writes, or audit update/delete access. The registration code deliberately omits role fields. Provision admins individually through the owner connection after verifying identity and secure access. There is no default password. Add an identity-aware gateway with administrator MFA before exposing administration outside a trusted network.

## API and admin

Install Node.js 24, then `npm ci` in `backend` and `admin`. Run backend tests/type checks and `npm run build` in `admin`. Install under a dedicated non-root OS user. Run `node --env-file=/etc/global-money/api.env /srv/global-money/backend/src/server.ts` using systemd or another supervised service with restart limits, memory limits and graceful shutdown. `DATABASE_URL` must use the runtime role. Do not serve `.env`, source directories or database dumps from a web server.

The API intentionally binds to loopback. Put an HTTPS reverse proxy on the same host. Serve only `admin/dist` as static content, proxy `/v1/*` and `/health` to `127.0.0.1:3000`, and return `index.html` for admin navigation. One origin avoids cross-origin credential policies. Example Caddy routing (replace domain and static path):

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

`backend/src/kyc.ts` describes future Emirates ID/passport verification capabilities, with `documentsAccepted:false`. No upload storage, identity-number columns, approval callbacks or document endpoint exists. Future provider work requires explicit privacy, retention, encryption and authorization design before accepting real documents.

## Operations and known limits

Run expired-session cleanup regularly using a privileged maintenance job (`DELETE FROM sessions WHERE expires_at < now()`), with database backups/retention governed by an approved policy. Audit records contain action, actor and target identifiers, not request bodies. Restrict audit reading to authorized operators. Monitor aggregate rejections without collecting secrets.

Registration currently has no email verification, password reset, account email change or MFA flow. Provide an approved recovery process and verified-email onboarding before inviting a broad customer audience. Admin user management is suspension/reactivation, not arbitrary role assignment. User and ticket lists show the latest 100 records without pagination. No emulator/device UI acceptance test is claimed. Review Bengali wording, accessibility and small-screen behavior on devices before release.
