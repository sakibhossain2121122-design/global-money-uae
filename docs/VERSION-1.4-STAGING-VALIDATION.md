# Version 1.4 staging upgrade — continuation

Continued directly on `feature/premium-remittance-full-setup`; no additional branch was created.

## Additional implementation in this continuation
- Replaced the corrupted Android `AccountApi.kt` transport source with a compilable HTTPS-only implementation: validates an HTTPS origin, constrains route/method input, disables redirects, holds bearer tokens in memory, handles expired sessions and transport failures without exposing response secrets, and limits payment-method response reads.
- Added Android shared bilingual dashboard/status labels and verified catalog tests for the requested UAE payment and Bangladesh beneficiary options. Catalog entries are display metadata and do not enable payment execution.

## Current limitations
The server route handlers for deposits, KYC fixture review, payment account administration, admin wallet views, quote/fees, rate history, and threaded support replies have not been integrated into `server.ts`. Migration/domain interfaces are not yet production-ready financial workflows. Real file upload/storage and identity submission remain disabled. No wallet ledger writes, payment settlement, or payout can be invoked.

## Validation and artifacts
No shell/CI execution environment is available in this task, therefore backend tests, migration tests, Admin build, Android tests, lint, and APK build are not claimed as run. No APK/source ZIP artifact has been generated and an APK SHA-256 cannot yet be reported. Android version configuration is 1.4.0 (versionCode 14). Build in CI or a local checkout before distributing; preserve prior APK artifacts.
