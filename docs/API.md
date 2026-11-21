# Account API v1

Except for receipt upload and download, payloads and responses are JSON. JSON requests require `Content-Type: application/json` and have a 16 KiB limit. A successful login returns a cryptographically random bearer token; all subsequent account requests need `Authorization: Bearer TOKEN`. Tokens expire in eight hours. Errors return `{ "error": "..." }` with 400/401/403/404/413/415/429/500/503; never treat a failure as a completed account action.

| Method /v1 path | Body / result |
| --- | --- |
| POST auth/register | `{email,password,name}` → 202 with generic sign-in guidance; same response for existing email |
| POST auth/login | `{email,password}` → `{token,expiresIn}` |
| POST auth/logout | `{}` → revokes current token |
| GET me | current id, email, name, role |
| PATCH me | `{name}` |
| GET wallet | AED balance derived from ledger entries, as a decimal string; `null` when no customer wallet exists. `postingEnabled` is always `false`. |
| GET rates | `{pair:"AED/BDT",value:null,available:false}` |
| GET transactions | customer's stored statuses, latest 100; no seeded data |
| GET/POST beneficiaries | list or create `{name,provider,account,bank?}` |
| DELETE beneficiaries/:uuid | deletes only caller-owned record; idempotent |
| GET/POST support | list or create `{subject,message}` |
| GET kyc | `{status:"unavailable",documentsAccepted:false}` |
| GET admin/users | admin only: latest 100 account records without password hashes |
| GET admin/users/:uuid/wallet | admin only: the selected customer's ledger-derived AED balance; `null` when no wallet exists |
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

### Payment and payout administration

Every route below requires an active bearer session with the current `admin`
role. Administrative changes are written to `audit_logs` and
`admin_control_events` in the same transaction as the change.

| Method /v1 path | Body / result |
| --- | --- |
| GET admin/payment-methods | AED method metadata and `add_money_request_enabled` |
| PATCH admin/payment-methods | `{id,add_money_request_enabled:boolean}`; controls review-only request choices, not payment processing |
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
intake. `/v1/payment-methods` continues to return `enabled:false`, and no
administrative account or bank status authorizes collection, wallet credit, or
transfers. Account numbers and IBANs are returned only to an authorized admin;
the web panel masks them in its list.

POST and all other methods to `add-money`, `botim-money`, `payments`, `transfers`, `remittances`, `wallet/credit`, `wallet/debit`, and `kyc/documents` return 503 `Service not yet available.`. There is no financial enable flag. Other unsupported routes are 404 after authentication.

Passwords: 12–128 characters, stored as salted scrypt hashes. Names: 1–120 trimmed characters. Subject: 1–120; support message: 1–2000. Beneficiary providers: bKash, Nagad, Rocket, Upay, Bank. Mobile wallet account: Bangladesh `01[3-9]` plus eight digits or equivalent `+8801...`; bank account: 6–40 alphanumeric, spaces or hyphens with a bank name. Never include identity documents or secrets in support messages.

No customer role, wallet amount, transaction success, provider callback or KYC approval can be supplied through public registration or account mutations. Ownership uses the authenticated database customer ID, not a caller-supplied ID. UUIDs, statuses and rates are validated. SQL is parameterized. Request bodies, bearer tokens and raw database errors are not logged.
