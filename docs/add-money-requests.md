# Add Money requests and review

This feature records requests only. It does not process payments, accept receipts
or identity documents, adjust balances, credit wallets, or remit money. A customer
note is never proof of payment. The only statuses are pending, under_review,
rejected and cancelled; none represents paid, verified, approved or credited.

## Database and migration history

Inspected main at 6e493cf: migration 001 defines accounts, audit logs and posting
denial triggers; 002 adds display-only payment methods; 003_admin_controls.sql
adds service_requests and service_request_events with the four review statuses.
No historical migration was edited. New migration 004 adds an optional payment
method reference and per-customer UUID idempotency key to service_requests, with
unique indexes for retry keys and identical active requests, and an event index.
Legacy rows without keys/references and their events remain intact. Both migration
entrypoints now use the same authoritative registry in backend/src/migrate.ts.

`npm --prefix backend run migrate` uses DATABASE_URL. Apply only through the
normal reviewed migration process; this task applies migrations only to a local
disposable test database. No production schema or data was accessed or changed.

## Customer endpoints

All require an active bearer session. Responses are JSON with Cache-Control:
no-store. Public registration cannot assign roles. Existing account, beneficiary,
support, rate and transaction endpoints keep their behavior.

- GET /v1/add-money-request-methods: existing AED method metadata (id/name/country/
  currency). A reference does not enable a payment method for real transactions.
  The older /v1/payment-methods still reports enabled:false.
- POST /v1/add-money-requests: amount_aed (decimal string, 0.01–1000000.00,
  at most two decimal places), payment_method_id (existing AED method), optional
  note (trimmed, at most 500 characters), idempotency_key (UUID).
- GET /v1/add-money-requests: latest 100 owned Add Money requests.
- GET /v1/add-money-requests/:id: owned request details; returns 404 for missing,
  another customer's, or a different request type's identifier.

Submission example:

```json
{"amount_aed":"25.50","payment_method_id":"adcb","note":"Please review","idempotency_key":"00000000-0000-4000-8000-000000000001"}
```

First submission returns 201 and {id,status,postingEnabled:false}. An identical
retry with the same customer/key returns 200 and the same request/current status,
without another audit event. A changed payload with a reused key returns 409.
An identical pending/under_review request with a new key also returns 409.
Key scope is per authenticated customer. Unknown fields (including status,
customer_id, receipt, currency or wallet credit) and multipart uploads are rejected.
Customers cannot change status, edit or delete requests. Notes have no upload
capability; clients must not include payment credentials, documents or receipts.

Android freezes the submitted payload on an uncertain result and retries it with
the same key. Definitive 400/409/422 responses allow correction; the UI advises
checking history on conflicts. Sensitive drafts remain in memory and clear on
logout/session loss. The active-request database constraint also protects against
accidental duplicates after app restarts.

## Administrator endpoints

Every call rechecks the active user's admin role on the server.

- GET /v1/admin/add-money-requests: latest 100 Add Money requests, including review
  metadata. Other request types are not included.
- PATCH /v1/admin/add-money-requests/:id: {status,expected_status,note?}. Both
  statuses must be one of the four permitted values. A row lock plus expected
  status prevents lost updates: a stale review returns 409 and requires refresh.
  Changes between all four statuses are supported. Reopening a terminal request
  can return 409 if another identical active request exists.
- GET /v1/admin/add-money-requests/:id/events: ordered review history with actor,
  previous/new status, optional review note and time. Customers cannot read it.

Each creation or status change inserts service_request_events and audit_logs in
its database transaction. A no-op PATCH adds no event and does not alter a note.
Admin notes, reviewer identifiers and review events are excluded from customer
history/details. The Admin Panel refreshes requests after updates and displays
conflicts without silently retrying with a newer status.

## Review and validation

The feature branch includes the previously verified CI/Kotlin syntax fixes absent
from main; these restore compilation without removing the newer authentication
error handling. Android CI runs on pull requests and executes tests, lint and APK
assembly. The configured API origin is a repository variable; validation locally
uses https://example.invalid and never contacts production.

Backend unit tests, read-only HTTP tests, original integration tests and new
request integration tests pass. Upgrade tests preserve 003 request/event rows,
apply 004, and re-run migrations idempotently. Concurrency tests verify one request
per retry key and one winning admin review. No ledger, journal or transaction rows
are created; direct posting still fails. Typecheck, admin build, workflow lint,
Android project checks, eight Android unit tests, lint and APK assembly pass.
A 390px Chromium check against the real local API verifies existing admin tabs,
request review, audit events and customer-visible statuses.

Source push and hosted CI remain dependent on repository write access. No hosted
CI success or published PR should be inferred from local build success.
