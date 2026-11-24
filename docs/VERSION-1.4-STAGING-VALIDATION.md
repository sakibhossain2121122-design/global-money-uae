# Version 1.4 staging-upgrade validation

Branch: `feature/premium-remittance-full-setup`.

This change is additive. It does not change Render/Netlify settings or production data. The migration seeds no customer, rate, balance, payment confirmation, beneficiary, or transaction fixtures. Payment methods are explicitly disabled by default; `fixture_only` is a database-enforced true-only field. Existing database triggers continue to reject all wallet ledger writes. Live-rate and payout adapter implementations fail closed.

## Implemented in source
- Additive PostgreSQL v004 schema for server-controlled payment account metadata, deposit request review metadata, independent settlement verification, date-wise rate history, service fee/limit configuration, support replies, and immutable audit records.
- Premium domain validation for supported UAE methods and synthetic-only receipt fixture keys; disabled live-rate and payout adapter boundaries; terminal request-state validation.
- Android Gradle version metadata set to 1.4.0 / code 14 and default API origin set to the existing staging API. Existing Android dashboard and bilingual labels remain intact.
- Responsive Admin Panel with in-memory admin session, RBAC check through `/v1/me`, customer status controls, support status controls, manually configured rate form, transaction date filtering, and clear disabled-service notices.
- Disposable database migration validation script.

## Not implemented / blocked
The repository currently has no API handlers for deposit requests, payment-account administration, KYC fixture review, send-money quotes, date-rate library, support replies, fee/limit management, or ledger account management. The schema/domain boundaries are not connected to network endpoints; this patch intentionally does not imply these workflows are available. Real receipt/document file storage is not implemented. No real or synthetic wallet posting is enabled. Live-rate provider credentials/authorization and payout provider authorization are absent. Android dashboard interactions for financial operations remain disabled.

## Validation status
Validation commands have not been executed in this GitHub-only environment. Run in CI or a local checkout:
- `cd backend && npm ci && npm test && npm run typecheck`
- `cd backend && TEST_DATABASE_URL=<disposable database ending _test> npm run test:migrations`
- `cd backend && TEST_DATABASE_URL=<disposable database ending _test> npm run test:integration`
- `cd admin && npm ci && npm run build`
- `cd android && ./gradlew test lint assembleDebug`

No APK or source archive has been generated here. APK SHA-256 is unavailable until an APK is built. Preserve prior APK artifacts; upload the newly built APK and source ZIP as CI artifacts after successful validation.
