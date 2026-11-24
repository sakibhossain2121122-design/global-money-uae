GLOBAL MONEY UAE customer wallet and admin workflow audit

Branch: feature/customer-wallet-admin-review, based on the existing feature/admin-control-system checkout, including its previously uncommitted implementation. Existing migrations 001–006 are preserved; 007 is an additive upgrade. No production or staging database was modified.

| Requested capability | Audit finding | Implemented behavior |
|---|---|---|
| Authenticated AED wallet | Previously returned unavailable/null only | Owner-scoped balance from base ledger, plus available/held totals from reservation journals. No wallet returns null; no balances or funding entries are seeded. |
| Add Money and verification | Intake, receipts and basic reviews existed | Reviewed receipt required for approval; approval is a review decision only, never a wallet credit or proof of external payment. |
| bKash, Nagad, Rocket, Upay, Bank | Validated saved beneficiaries and request intake existed | Inline Android recipient/number entry, provider selection, amount entry, immutable recipient snapshot, displayed and server-confirmed configured fee. |
| Approve/Reject | Basic rejection/review existed | Admin/reviewer approval and processing states, expected-state concurrency checks, self-approval prevention, funded reservation requirement for Send Money approval. |
| History | Original transaction view remained unavailable/read-only; separate request histories existed | Additional owner-scoped request history, fee/recipient snapshots and Pending, Processing, Approved, Rejected, Successful filters. Legacy under_review displays as Processing. Successful has no manual write path and remains empty until a separately approved settlement integration. Original transactions view is retained. |
| Reservation/rejection release | Proposed holds and a pure planner existed | Automatically reserve amount plus confirmed fee when an existing wallet is present; insufficient funds roll back the entire request. Unprovisioned wallets accept review-only proposals, not spendable funds. Reject/cancel atomically reverses any funded hold once. |
| Double-entry/RBAC/audits | Base balanced ledger and financial posting denial triggers existed | Immutable AED reservation journals contain equal-and-opposite available and held entries, unique per request/operation. Customer-row locks serialize all reservations and releases for that customer. Original funding/settlement ledger denial triggers remain untouched. |
| Admin configuration | Payment accounts, BD banks, internal rates and customer roles/status existed | Adds payment method request enable/disable, fee rules, country enable/disable and reservation journal visibility. Customer suspension and role changes preserve session revocation. |
| Red/white Android home | Green/navy theme and unavailable balance placeholder | Red/white theme, authenticated available/held wallet card, refresh, request actions and history. Unknown balances remain a dash, with no sample funds. |

The API still rejects real payments, remittances, transfers, wallet credits/debits and identity-document uploads. No admin button, receipt, review note or configured rate can execute a payout or create a balance. SQL and HTTP both reject Successful without an independently verified settlement integration; no such integration or bypass switch is supplied.

Reservation accounting is separate from the blocked funding/settlement journal tables. Each reservation journal represents exactly two signed AED entries into the customer's available and held wallet buckets, with a zero-sum database constraint. It cannot mint money: the SECURITY DEFINER function first locks the customer, reads actual posted funding entries and existing reservation deltas, checks sufficient available funds, then atomically records the hold and audit. The function uses a fixed search path, denies inactive actors, and is not executable by PUBLIC. Reservation tables grant no PUBLIC write permissions. Direct funding/settlement postings stay denied by the pre-existing triggers.

Unfunded requests stay proposed and cannot be approved for Send Money. Rejected/cancelled reservations release atomically. A released request is not silently re-funded on reopening: any subsequent approval still requires a reserved hold. There is no settlement/debit executor. Ordinary deployments with no legally funded ledger therefore cannot reserve or approve actual funds; they retain review-only request functionality.

New authenticated APIs: GET /v1/wallet, /v1/request-options, /v1/request-history. New admin APIs: GET/POST /v1/admin/payment-methods, /v1/admin/fees, /v1/admin/countries and GET /v1/admin/reservation-journals. Existing request PATCH paths now accept approved and processing as review states, but never successful. Nonzero fees require an exact expected_fee_aed confirmation and are snapshotted; changed fees return 409 before any reservation.

Runtime DB permissions must be applied by a trusted database owner, never by the application. If gm_app exists during migration, 007 grants the added control/configuration/request table privileges, customer role-column update, audit/event reads and appends, required sequence usage, SELECT on reservation_journals and EXECUTE on reserve_request. It does not grant direct reservation-journal INSERT. The foundation privileges from deployment.md (including SELECT on ledger_entries/wallets) must already be installed. Wallet insertion is performed inside the owner-controlled reservation function. Do not grant runtime ownership, CREATE on public, INSERT into reservation_journals, funding/settlement writes, audit/event mutation or arbitrary SQL access. If a different runtime role is used, explicitly grant the reservation function and SELECT privileges to that role after owner review. The earlier deployment guide predates role-management and receipt features; use least privilege for these additional tables/columns (including customers.role and payment_methods.request_enabled).

Validation includes clean and repeated migrations, an upgrade preserving historical requests, all original account/Add Money regressions, role boundaries, receipt decoding, ledger conservation, fee confirmation, ownership, stale reviews, concurrent overspend prevention, one-time rejection release, approval without credit, and SQL/API rejection of fabricated settlement. Synthetic funding fixtures exist only inside the explicitly disposable _test integration database, with denial triggers restored before assertions. No real customer funds or transactions are fabricated.

Android CI now selects only the confirmed staging origin, explicitly provisions SDK 35 and Build Tools 34.0.0, and verifies the Gradle distribution SHA-256. The debug APK is not a production release. Emulator/device and live provider settlement tests are outside this implementation; real payment and identity-document collection remain disabled.

Validation results for this implementation:

| Check | Result |
|---|---|
| Backend TypeScript typecheck | Pass |
| Backend unit/security tests | 11 pass |
| Read-only payment-method HTTP regressions | 2 pass |
| PostgreSQL integration suites | All 4 pass, including 10 wallet/security subtests plus the suite wrapper (52 Node test records across all integration suites) |
| Admin TypeScript/Vite build | Pass |
| Android project integrity checks | Pass |
| Android unit tests | 8 pass, 0 skipped/failures |
| Android lint | Pass: 0 errors, 3 warnings (2 dependency updates, 1 dataExtractionRules recommendation) |
| Android assembleDebug | Pass, staging-only APK |
| APK signature and heuristic credential scan | Pass; debug signature, no detected credential patterns; configured API origin is https://global-money-uae-staging.onrender.com |

APK SHA-256: e36ac430e12930e61f714c21185078c9f871a9dcb32deb6a7e40bc00b142d557. Local build artifact: android/app/build/outputs/apk/debug/app-debug.apk (generated, not committed). Full Android reports are under android/app/build/reports. No live payment/provider/device acceptance test or production deployment is claimed. An initial permissions test exposed a missing schema-USAGE grant in the isolated probe role; the probe was corrected to test function EXECUTE permission independently, and final runtime/PUBLIC privilege tests pass.
