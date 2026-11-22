# Add Money requests and review

This feature records requests and receipts for admin review only. It does not
process payments, accept identity documents, credit wallets, or remit money.
A note or receipt is never proof of payment. Request statuses remain pending,
under_review, rejected and cancelled. A separate receipt status records an
admin's review; it does not authorize or perform a credit.

## Database and migration history

Inspected main at 6e493cf: migration 001 defines accounts, audit logs and posting
denial triggers; 002 adds display-only payment methods; 003_admin_controls.sql
adds service_requests and service_request_events with the four review statuses.
No historical migration was edited. New migration 004 adds an optional payment
method reference and per-customer UUID idempotency key to service_requests, with
unique indexes for retry keys and identical active requests, and an event index.
Migration 005 adds UAE payment accounts, Bangladesh payout banks and control
audit events. Migration 006 adds a separate Add Money request-availability flag
(defaulting existing methods to enabled) and prevents duplicate active payout
bank names. Migration 007 adds private receipt storage, receipt review events,
and future financial authorization and credit records; it leaves the posting
denial triggers intact. Legacy rows without keys/references and their events remain intact.
Both migration entrypoints use the registry in backend/src/migrate.ts.

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
- PUT /v1/add-money-requests/:id/receipt: raw JPG, PNG or PDF bytes, maximum
  5 MiB, with the corresponding content type. Only the owner of an open request
  can upload. File hashes are unique across requests; identical retries for the
  same request return the original receipt.

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
capability; clients must not include payment credentials or identity documents.
Receipts use the separate upload endpoint.

Android freezes the submitted payload on an uncertain result and retries it with
the same key. Definitive 400/409/422 responses allow correction; the UI advises
checking history on conflicts. Sensitive drafts remain in memory and clear on
logout/session loss. The active-request database constraint also protects against
accidental duplicates after app restarts.

## Administrator endpoints

Every call rechecks the active user's admin role on the server.

- GET /v1/admin/payment-methods and PATCH /v1/admin/payment-methods with
  `{id,add_money_request_enabled}` configure which AED methods may be chosen
  for request-only intake. This field is separate from actual payment status.
- GET /v1/admin/add-money-requests: latest 100 Add Money requests, including review
  metadata. Other request types are not included.
- PATCH /v1/admin/add-money-requests/:id: {status,expected_status,note?}. Both
  statuses must be one of the four permitted values. A row lock plus expected
  status prevents lost updates: a stale review returns 409 and requires refresh.
  Changes between all four statuses are supported. Reopening a terminal request
  can return 409 if another identical active request exists.
- GET /v1/admin/add-money-requests/:id/events: ordered review history with actor,
  previous/new status, optional review note and time. Customers cannot read it.
- GET /v1/admin/users/:id/wallet: selected customer's ledger-derived AED balance;
  no wallet returns null. Neither this route nor customer GET /v1/wallet enables posting.
- GET /v1/admin/add-money-requests/:id/receipt: private, audited receipt download.
- PATCH /v1/admin/add-money-requests/:id/receipt: expected/current receipt status,
  optional note, and for `verified`, the verified amount and payment reference.
  The admin assertion is not a payment or credit authorization.
- GET /v1/admin/add-money-requests/:id/receipt-events: receipt review audit history.

Uploads are validated by content signature and file parsing, but are not malware
scanned. Bytes live in the database and are returned only to an admin; deployment
must restrict database and backup access and ensure appropriate encryption at rest.
The panel displays images and renders PDF pages locally without an interactive
scripting layer.

Each creation or status change inserts service_request_events and audit_logs in
its database transaction. A no-op PATCH adds no event and does not alter a note.
Admin notes, reviewer identifiers and review events are excluded from customer
history/details. The Admin Panel refreshes requests after updates and displays
conflicts without silently retrying with a newer status.

UAE payment accounts and Bangladesh payout banks are admin-managed through
`/v1/admin/payment-accounts` and `/v1/admin/payout-banks`. Creation defaults to
disabled; PATCH changes administrative status, and DELETE soft-archives rather
than removing a record. Account data is validated, payout-bank country is fixed
to `BD`, and both `audit_logs` and `admin_control_events` record each change in
the same transaction. These records do not trigger customer payment, wallet
credit, or transfer behavior.

## Financial boundary

The prepared credit service requires a separate financial authorization bound to
the latest receipt review and uses balanced entries and unique request/reference
records in a single transaction. No authorization or credit API is exposed.
An unconditional application guard and the original database triggers continue
to deny posting. Any future enablement requires a separately reviewed financial
and payment-verification design; an admin receipt status alone is insufficient.
