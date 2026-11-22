# Account API v1

Except for receipt upload and download, payloads and responses are JSON. JSON requests require `Content-Type: application/json` and have a 16 KiB limit. A successful login returns a cryptographically random bearer token; all subsequent account requests need `Authorization: Bearer TOKEN`. Tokens expire in eight hours. Errors return `{ "error": "..." }` with 400/401/403/404/413/415/429/500/503; never treat a failure as a completed account action.

| Method /v1 path | Body / result |
| --- | --- |
| POST auth/register | `{email,password,name,mobile_uae?}` → 202 with generic sign-in guidance; same response for existing email. New Android registrations require `mobile_uae`; old clients may omit it. When present it must match `+9715` followed by eight digits. The number is not verified and is not a login identifier. |
| POST auth/login | `{email,password}` → `{token,expiresIn}` |
| POST auth/logout | `{}` → revokes current token |
| GET me | current id, email, name, role |
| PATCH me | `{name}` |
| GET wallet | `balance` is the AED ledger balance; `heldBalance` is the sum of active Send Money reservations and `availableBalance` is the ledger balance minus those reservations. Amounts are decimal strings, or `null` when no customer wallet exists. `postingEnabled` is always `false`. |
| GET rates | `{pair:"AED/BDT",value:null,available:false}` |
| GET transactions | customer's stored statuses, latest 100; no seeded data |
| GET/POST beneficiaries | list or create `{name,provider,account,bank?}` |
| DELETE beneficiaries/:uuid | deletes only caller-owned record; idempotent |
| GET/POST support | list or create `{subject,message}` |
| GET kyc | `{status:"unavailable",documentsAccepted:false}` |
| GET admin/users | admin only: latest 100 account records without password hashes |
| GET admin/users/:uuid/wallet | admin only: the selected customer's ledger balance, active reservations and available balance; `null` values when no wallet exists |
| PATCH admin/users | admin only: `{id,status:"active"|"suspended"}`; suspension deletes sessions; own suspension prohibited |
| GET admin/support | admin only: latest 100 tickets |
| PATCH admin/support | admin only: `{id,status:"open"|"in_progress"|"closed"}` |
| GET admin/transactions | admin only: read-only status review |
| GET/PUT admin/rates | admin only: configure `{value:"30.123456"}` for AED/BDT; never customer-visible |

### Add Money receipts

Submit an Add Money request first using `POST /v1/add-money-requests`. The owner
can then `PUT /v1/add-money-requests/:uuid/receipt` with raw JPEG, PNG or PDF
bytes and the matching content type, up to 5 MiB. The server validates signatures
and parses the file; this is not malware scanning or proof of payment. Identical
retries for the same request are idempotent. One receipt is permitted per request,
and matching file hashes across requests return 409.

Admins can retrieve an attachment through `GET /v1/admin/add-money-requests/:uuid/receipt`,
record review through `PATCH` on that path with `{status,expected_status,note?,
verified_amount_aed?,payment_reference?}`, and read the audit trail through
`GET /v1/admin/add-money-requests/:uuid/receipt-events`. A `verified` review
requires an amount and reference. The recorded status is an admin assertion,
not financial authorization and not a credit. The panel renders PDF pages locally
without an interactive scripting layer. Receipt bytes are stored in the database, not public files;
database access, backups and encryption at rest must be restricted in deployment.

### Send Money requests and reservations

`POST /v1/send-money-requests` accepts `{amount_aed,beneficiary_id,idempotency_key,note?}`.
The authenticated customer must own the beneficiary and an AED wallet. The server
locks the wallet, checks its ledger balance less existing holds, and atomically
creates a review request and reservation. A repeat with the same key and payload
returns the existing request; a changed payload or an identical active request
returns 409. `GET /v1/send-money-requests` lists only the caller's requests.
For duplicate detection, equivalent Bangladesh mobile number formats are
normalized; bank account formatting is normalized within the named bank.
The recipient details are snapshotted for the request, so deleting a beneficiary
does not erase its existing request history. Restrict database and backup access.
The payout recipient is revalidated at submission: bKash, Nagad, Rocket and Upay
require a Bangladesh mobile number; Bank requires a bank name and at least six
alphanumeric account characters after removing spaces and hyphens. These are
format checks only; they do not prove account ownership or availability.

`GET /v1/admin/send-money-requests` lists requests for admins. `PATCH
/v1/admin/send-money-requests/:uuid` accepts `{status,expected_status,note?}`:
pending requests can enter `under_review`, and open requests can be `rejected`
or `cancelled`. A note is required for rejection or cancellation. Only those
admin actions release a hold; no customer cancellation or automatic expiry is
provided. Reviews and hold releases are atomic and audited. Concurrent changes
using an outdated expected status return 409.

An admin may use `PUT /v1/admin/send-money-requests/:uuid/payout-reference` with
`{payout_reference}` to record a unique, **unverified** reference. An identical
retry is idempotent. This is not a payout or provider confirmation. Once a
reference or reconciliation report is recorded, the reservation cannot be
released by the current API. Reconciliation reports do not establish that a
payment failed or that funds can safely be released.

Admins can view the immutable recipient snapshot with
`GET /v1/admin/send-money-requests/:uuid/recipient` (the view is audited).
`POST /v1/admin/send-money-requests/:uuid/recipient-review` records
`{status,expected_event_id,note,evidence_reference?}` with status
`under_review`, `admin_reviewed`, or `rejected`. An `admin_reviewed` assertion
requires an evidence reference. It is not independent recipient verification
and cannot authorize a payout.

`POST /v1/admin/send-money-requests/:uuid/reconciliation` accepts the same
fields with status `unverified`, `under_review`, `disputed`, or
`reported_failed`. These are admin reports, not provider-confirmed outcomes.
They may also document a dispute discovered after an earlier release; the API
returns the current hold status and does not recreate a released hold.

For an open request with a payout reference and latest reconciliation status
`reported_failed`, an admin can propose reservation release through
`POST /v1/admin/send-money-requests/:uuid/reconciliation-resolution` with
`{action:"propose_failed",expected_event_id:"0",note,evidence_reference}`.
The proposal is append-only and does not release funds. A different active
admin must inspect independent evidence and submit
`{action:"approve_failed",expected_event_id:<proposal event ID>,note,evidence_reference}`.
The second evidence reference must differ from the proposer's and the payout
reference. Approval, final rejection status, audit event and reservation release
commit atomically; duplicate or concurrent approvals fail. The result is labeled
`admin_attested_failed_two_person`, not provider-confirmed, and releases only
the reservation—it does not post a ledger journal or mark payout success.
Admin evidence references are human-entered identifiers and are not technically
validated against provider systems. Do not approve without independently
checking authoritative evidence under an approved dual-control runbook.

For each review kind, `expected_event_id` is `"0"` initially, then the latest
event ID returned by the admin list or previous response. Concurrent stale
submissions return 409. `GET /v1/admin/send-money-requests/:uuid/events` returns
the request, recipient-review, reference and reconciliation histories.
Database triggers reject updates, deletes and truncation of financial request,
receipt-review, Send Money and audit histories; they prevent reopened requests,
deletion or reinstatement of released holds, changes to the recipient snapshot
or an existing payout reference, and releases without the required two-admin
approval. These triggers and runtime grants are defense in depth, not protection
against a database owner who can disable them.

Recipient reviews, references and reconciliation reports never authorize
execution or success. The payout-success endpoint remains 503: no provider
confirmation adapter or authorization exists. Before enabling one, require
provider-specific authenticated, replay-resistant confirmation bound to the
exact request, reference, destination, amount and outcome, plus separately
reviewed settlement and authorization rules. A reported failure alone must not
be treated as proof of non-payment or used to release a hold.

Reservations are not ledger postings. Ledger posting remains disabled by the
application and database triggers. Before enabling any debit or provider
integration, independently review authorization, settlement, reconciliation,
recipient verification, lock ordering and the interaction of every ledger
writer with active holds.

### Registration review

New accounts receive `pending`; existing records retain a null (unknown)
status. Authenticated `GET /v1/me` returns `registration_status`. Admin-only
`GET /v1/admin/registration-reviews` lists customers, and
`PATCH /v1/admin/registration-reviews` accepts `{id,expected_status,status,note,evidence_reference}`.
The expected status can be null for legacy accounts. Verified requires a
nonempty independent evidence reference. `GET /v1/admin/registration-reviews/:id/events`
returns append-only review history. A verified status is an admin attestation,
not technical verification of the evidence or identity documents; the reviewer
must check evidence independently. It does not enable financial services.

### Payment and payout administration

Every route below requires an active bearer session with the current `admin`
role. Administrative changes are written to `audit_logs` and
`admin_control_events` in the same transaction as the change.

| Method /v1 path | Body / result |
| --- | --- |
| GET admin/payment-methods | AED method metadata and `add_money_request_enabled` |
| PATCH admin/payment-methods | `{id,add_money_request_enabled:boolean}`; controls review-only request choices, not payment processing |
| GET admin/method-catalog | UAE and Bangladesh method names, logo URL metadata, display order and visibility |
| PATCH admin/method-catalog | `{id,name,logo_url,display_order,catalog_visible}`; display configuration only, audited |
| GET admin/payment-accounts | Latest 100 UAE account records, including archived status |
| POST admin/payment-accounts | `{payment_method_id,account_holder,account_number?,iban?,instructions?}`; new records start disabled |
| PATCH admin/payment-accounts | `{id,enabled:boolean}`; archived accounts cannot be changed |
| DELETE admin/payment-accounts/:uuid | Soft-archives the account and disables its administrative record |
| GET admin/payout-banks | Latest 100 Bangladesh payout bank records, including archived status |
| POST admin/payout-banks | `{name}`; country is fixed to `BD`, new records start disabled, active names must be unique |
| PATCH admin/payout-banks | `{id,enabled:boolean}`; only active `BD` records can be changed |
| DELETE admin/payout-banks/:uuid | Soft-archives the bank and disables its administrative record |

`add_money_request_enabled` is separate from the payment-method `enabled` flag.
The customer request-method list and request submission both enforce it; all
existing AED methods default to request-enabled to preserve current request
intake. `catalog_visible` hides a method from the customer catalogue and, for
AED methods, from new Add Money request choices. `/v1/payment-methods` returns
visible UAE and Bangladesh display metadata with `enabled:false`, and no
administrative account or bank status authorizes collection, wallet credit, or
transfers. Account numbers and IBANs are returned only to an authorized admin;
the web panel masks them in its list.

Logo URLs accept HTTPS without user information, query strings, fragments or
nonstandard ports. They are unverified admin-only metadata; the customer API
returns `logo_url:null` and Android does not fetch or display them. Authorized
official assets and a separate verification process are required before logo
rendering can be enabled.

POST and all other methods to `add-money`, `botim-money`, `payments`, `transfers`, `remittances`, `wallet/credit`, `wallet/debit`, and `kyc/documents` return 503 `Service not yet available.`. There is no financial enable flag. Other unsupported routes are 404 after authentication.

Passwords: 12–128 characters, stored as salted scrypt hashes. Names: 1–120 trimmed characters. Subject: 1–120; support message: 1–2000. Beneficiary providers: bKash, Nagad, Rocket, Upay, Bank. Mobile wallet account: Bangladesh `01[3-9]` plus eight digits or equivalent `+8801...`; bank account: 6–40 alphanumeric, spaces or hyphens with a bank name. Never include identity documents or secrets in support messages.

No customer role, wallet amount, transaction success, provider callback or KYC approval can be supplied through public registration or account mutations. Ownership uses the authenticated database customer ID, not a caller-supplied ID. UUIDs, statuses and rates are validated. SQL is parameterized. Request bodies, bearer tokens and raw database errors are not logged.

## Customer/mobile and payment detail integration

Registration creates an active customer without OTP or admin activation. It does **not** verify mobile ownership or identity. `POST /v1/auth/register` accepts the existing `name`, `email`, `password`, optional `mobile_uae` (`+9715XXXXXXXX`) and optional `identity_kind` (`passport` or `emirates_id`). Android requires the mobile number; legacy email clients remain supported. Duplicate email/mobile submissions return the same generic 202 response and never replace an account or create a session. Sign in separately.

`POST /v1/auth/login` accepts `password` and exactly one of `mobile_uae` or `email`. Both use the same password/session/rate-limit and suspended-account checks. No OTP field or identity document is accepted by the identity upload route. Identity type is a preference, not KYC approval.

`GET /v1/payment-methods/:id` requires an active session. A visible method returns its name/country/currency, request availability and enabled, unarchived company accounts (`id`, `account_holder`, `account_number`, `iban`, `instructions`, `qr_payload`). Hidden methods return 404; methods without enabled accounts return an empty list. `paymentsEnabled` and `postingEnabled` are always false. Details are reference information and do not authorize sending money. Android renders QR content locally and does not fetch remote images or execute QR actions.

Administrators create accounts disabled by default with `POST /v1/admin/payment-accounts`. Optional `qr_payload` is text of at most 512 characters, with no control characters. `PUT /v1/admin/payment-accounts/:id` replaces editable details using `payment_method_id`, `account_holder`, `account_number`, `iban`, `instructions`, and `qr_payload`; the method ID is immutable and enable state is preserved. Use the existing boolean-only PATCH to enable/disable a record and DELETE to archive it. All writes are audited; customers cannot edit account data. Method catalogue visibility and Add Money request availability remain separate controls from financial execution.
