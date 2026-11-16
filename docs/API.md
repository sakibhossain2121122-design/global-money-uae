# Account API v1

All payloads and responses are JSON. Requests with bodies require `Content-Type: application/json`. Body limit: 16 KiB. A successful login returns a cryptographically random bearer token; all subsequent account requests need `Authorization: Bearer TOKEN`. Tokens expire in eight hours. Errors return `{ "error": "..." }` with 400/401/403/404/413/415/429/500/503; never treat a failure as a completed account action.

| Method /v1 path | Body / result |
| --- | --- |
| POST auth/register | `{email,password,name}` → 202 with generic sign-in guidance; same response for existing email |
| POST auth/login | `{email,password}` → `{token,expiresIn}` |
| POST auth/logout | `{}` → revokes current token |
| GET me | current id, email, name, role |
| PATCH me | `{name}` |
| GET wallet | `{balance:null,currency:"AED",postingEnabled:false}` |
| GET rates | `{pair:"AED/BDT",value:null,available:false}` |
| GET transactions | customer's stored statuses, latest 100; no seeded data |
| GET/POST beneficiaries | list or create `{name,provider,account,bank?}` |
| DELETE beneficiaries/:uuid | deletes only caller-owned record; idempotent |
| GET/POST support | list or create `{subject,message}` |
| GET kyc | `{status:"unavailable",documentsAccepted:false}` |
| GET admin/users | admin only: latest 100 account records without password hashes |
| PATCH admin/users | admin only: `{id,status:"active"|"suspended"}`; suspension deletes sessions; own suspension prohibited |
| GET admin/support | admin only: latest 100 tickets |
| PATCH admin/support | admin only: `{id,status:"open"|"in_progress"|"closed"}` |
| GET admin/transactions | admin only: read-only status review |
| GET/PUT admin/rates | admin only: configure `{value:"30.123456"}` for AED/BDT; never customer-visible |

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
