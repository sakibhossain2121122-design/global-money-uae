This document records the initial migration-006 implementation. See [the wallet/admin audit](customer-wallet-admin-audit.md) for additive migration 007 and current funded-reservation/review behavior.

# Admin Control System — pre-launch only

Branch: `feature/admin-control-system`, extending draft PR #14. No merge or deployment is part of this change.

## Delivered controls

- Admin payment accounts: create disabled, edit, enable/disable **directory display**, irreversible archive. Only enabled, unarchived AED account records are exposed to authenticated customers. Android fetches this directory from the server and warns against transferring funds. Payment method execution remains disabled.
- Bangladesh banks: create disabled, edit, enable/disable; case-insensitive unique names, BD-only database constraint, authenticated enabled directory.
- Receipts: Android image picker from Add Money history; authenticated request owner only, pending/under-review requests only, three receipts per request. JSON fields `media_type` and `content_base64`, JPEG/PNG input only, 1 MB decoded limit, bounded HTTP body, signature validation, decoder pixel cap, canonical PNG re-encoding and metadata removal. No filenames, public object URLs, HTML, SVG or document uploads. Bytes stay in PostgreSQL; list APIs expose metadata only. Admin/reviewer retrieval and review are audited. Review cannot verify payment or credit funds. Receipt review is separate from request status.
- Send Money: request intake and customer history, owned beneficiary validation, per-customer idempotency, admin/reviewer review with expected status and row lock. Only pending/under_review/rejected/cancelled are legal. Android explicitly distinguishes request submission from transfers.
- Holds: request intake creates an **unfunded proposed record**, not a financial reservation. Rejection/cancellation or explicit admin release marks it released. Reopening a request does not reactivate a released record. No hold activation endpoint exists.
- Ledger architecture: customer/held wallet buckets, unique hold-operation journal references, pure bigint double-entry hold/release planner with conservation and insufficient-funds tests. Existing deferred currency balance constraints and database denial triggers remain intact. No wallet or ledger data is seeded. A future executor needs separate approval, trusted ledger-derived funds, wallet locks, state transitions and atomic idempotent posting; the planner is not an executor.
- KYC: capability boundary and admin status explain that compliance approval is required. Identity-document paths remain blocked, with no document table, accepted document fields, provider integration, or override switch.
- Roles: admin manages configuration, users/roles, audits and proposed holds; reviewer handles requests and receipts; support handles tickets; customers own their records. Authorization reads current DB roles on every request. Role changes revoke target sessions; admins cannot change their own role. Public registration cannot assign roles. Audit/event records reject update/delete.

## API additions

Authenticated directories: `GET /v1/payment-accounts`, `/v1/payout-banks`.

Receipt upload: `POST /v1/add-money-requests/:id/receipts`.
Admin review: `GET /v1/admin/receipts`, `GET|PATCH /v1/admin/receipts/:id` (`status`: reviewed/rejected, optional note).

Send requests: `GET|POST /v1/send-money-requests`; POST fields: amount_aed decimal string, beneficiary_id, idempotency_key, optional note. Admin `GET /v1/admin/send-money-requests`, `PATCH /v1/admin/send-money-requests/:id` uses status, expected_status, optional note.

Config: `PATCH /v1/admin/payment-accounts` uses id plus editable account fields, enabled boolean, or archive:true. `POST|PATCH /v1/admin/payout-banks` uses name, plus id/enabled for PATCH. Create defaults disabled.

Administration: `PATCH /v1/admin/user-role` (id, role), `GET /v1/admin/audit-logs`, `/v1/admin/wallet-holds`, `/v1/admin/kyc`; `POST /v1/admin/wallet-holds/:id/release` with empty JSON object.

## Migrations and operational boundaries

The runner now registers existing 005 and new 006, in one advisory-locked transaction. Integration tests exercise clean install, repeat runs and upgrade from 003 with preserved request history. Use a restricted application DB role, TLS, encrypted storage/backups and a separately approved receipt retention policy before any production rollout. Do not store identity documents as receipts. No licenses, balances, exchange rates or actual transactions were fabricated.

Payments, remittance transfers, wallet credits/debits and identity-document intake remain disabled in code; ledger writes remain independently denied by PostgreSQL. Do not remove denial triggers to exercise this application.

## Verification (2026-11-14)

- Backend TypeScript typecheck: pass.
- Unit/security tests: pass, including bigint reservation conservation and inverse release.
- PostgreSQL 17 integration suites: pass against an isolated `global_money_test` container. Covers existing account lifecycle/Add Money behavior, clean/repeated migrations, historical upgrade, authorization, receipt decoder rejection, idempotency, concurrent request reviews, hold release, role/session revocation, immutable audits and independently denied ledger posting.
- Read-only payment-method HTTP regression tests: pass; payment execution remains disabled.
- Admin TypeScript + Vite production build: pass (local artifact only).
- Android dependency-free project checks: pass (XML, resources, manifest, wrapper integrity).
- Android `testDebugUnitTest lintDebug assembleDebug`: attempted, blocked while downloading Gradle 8.9 with connection refused. No configured Android SDK was available in this workspace. Kotlin compilation, Android unit tests, lint and APK assembly remain unverified and must run in Android CI before merge. No production or staging service was modified.

Changes remain local on the requested feature branch; PR #14 is still an open draft and was not merged. No production deployment was performed.
