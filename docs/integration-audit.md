# Android / Admin integration review

At validation time, work was uncommitted on `feature/admin-control-system`, based on `79108ea84ab0f12d0caec09c515c2a4921ddc4bc`. The environment initially had no checkout; a fresh clone had a clean working tree. Main was not edited. No commit, push, PR, deployment, production migration or production-data change was performed during implementation and validation.

## Audit and completed behavior

- Reviewed the existing backend routes, Android account/payment flows, Admin controls, runtime grants, migration runner and migrations 001–012. Existing features include active registration without OTP, administrator customer suspension/reactivation and session revocation, the five UAE payment methods, Add Money receipt upload/review/history, Send Money requests/reservations, and application/database posting denials.
- Added UAE mobile/password login with existing password hashing, session expiry, suspension checks and rate limiting. Android defaults to mobile login with email fallback for existing users. Registration still creates an active account immediately, returns the generic 202 response and requires a separate sign-in; it does not require administrator activation. Mobile/identity verification remains pending.
- Added optional persisted Passport/Emirates ID preference with Skip selected initially. Identity uploads remain disabled in Android and rejected by the API. A preference is not identity verification.
- Added migration 013 for unique non-null mobile identifiers, identity preference and optional QR content. Duplicate legacy mobile numbers abort the entire migration; no automatic reassignment/deletion occurs. Prior migrations are unchanged.
- Admin customer listings now include mobile, identity preference and registration review status alongside the existing active/suspended account controls.
- BOTIM Money, e& money, ADCB, Emirates NBD and ADIB remain in the existing catalogue. Android payment cards now open bilingual detail screens through an authenticated read-only API.
- Detail screens display enabled, unarchived account holder/name, account number, IBAN, instructions and locally rendered QR content. Hidden methods return 404. Disabled/archived accounts are omitted. QR data is never fetched as a remote image or executed as a payment action.
- Admin can create/edit account details and QR content, enable/disable records and archive them. New accounts start disabled. Editing details preserves enable state and method identity; customer edits are forbidden and successful changes are audited. Catalogue visibility, request availability and account visibility do not enable payment execution.
- Existing Add Money requests, bounded receipt uploads, receipt review and status tracking are preserved. Existing Send Money and ledger safeguards were not changed.
- Added Android pull-request CI triggering; the existing CI unit-test/lint/APK command and staging URL requirement remain.

## Validation

| Check | Result |
| --- | --- |
| Backend TypeScript | PASS |
| Backend security/unit tests, including additional security test file and payment-method read-only tests | PASS: 30 reported tests |
| PostgreSQL 17 integration suites | PASS: 58 reported tests across five programs, including targeted rerun of expanded migration/mobile/payment suite |
| Restricted runtime-role checks | PASS, including new registration and account APIs |
| Migration replay, legacy upgrades, duplicate-mobile rollback, no reassignment/deletion | PASS |
| Admin tests | PASS: 11 tests |
| Admin TypeScript / Vite production build | PASS |
| Android XML, bilingual resources, manifest and official Gradle wrapper checks | PASS |
| Android Kotlin and Java compilation with full JDK 17 | PASS |
| Android unit tests | PASS: 28 tests, zero failures/errors/skips |
| Android lintDebug / assembleDebug | PASS: build successful; debug APK produced; zero lint errors and five advisory warnings |

Integration tests used a newly created disposable Docker PostgreSQL 17 database named `global_money_test`, never a production connection. They verify ownership, idempotency, audit records, revocation, receipt review and immutable history, reservation/reconciliation safeguards, and continued application/database rejection of credits, debits and ledger posting. The new suite also verifies mobile login/duplicate protection and payment detail enable/disable/archive/catalogue behavior. Termux is not used.

The complete CI build command `testDebugUnitTest lintDebug assembleDebug` passed locally (53 actionable tasks). The APK is a debug verification build with a placeholder API origin, not a production-connected release.

Android uses a locally installed full Temurin JDK 17, SDK platform 35, build tools 34.0.0 and the official Gradle 8.9 wrapper. The initial system Java runtime lacked `jlink`; it was replaced for this build. The verification build uses `API_BASE_URL=https://staging.invalid` and does not connect to a live backend.

## Remaining restrictions and follow-up

At validation time, hosted GitHub Actions could not validate the uncommitted local changes and commit/push authorization was pending. Hosted CI must be checked for the subsequently authorized commit. No hosted CI result is claimed by this local validation report. No emulator/device installation or instrumented UI acceptance is claimed.

Production migration 013, runtime column grants and approved payment account configuration remain unapplied. Existing mobile duplicates, if any, must be reviewed with owners before a production migration; no production data was inspected. Secure KYC storage/review and real payment providers are intentionally outside the enabled feature set. Real payments, wallet credits, payouts and financial posting remain disabled at the existing application/database boundaries.
