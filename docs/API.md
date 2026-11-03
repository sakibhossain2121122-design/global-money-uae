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

POST and all other methods to `add-money`, `botim-money`, `payments`, `transfers`, `remittances`, `wallet/credit`, `wallet/debit`, and `kyc/documents` return 503 `Service not yet available.`. There is no financial enable flag. Other unsupported routes are 404 after authentication.

Passwords: 12–128 characters, stored as salted scrypt hashes. Names: 1–120 trimmed characters. Subject: 1–120; support message: 1–2000. Beneficiary providers: bKash, Nagad, Rocket, Upay, Bank. Mobile wallet account: Bangladesh `01[3-9]` plus eight digits or equivalent `+8801...`; bank account: 6–40 alphanumeric, spaces or hyphens with a bank name. Never include identity documents or secrets in support messages.

No customer role, wallet amount, transaction success, provider callback or KYC approval can be supplied through public registration or account mutations. Ownership uses the authenticated database customer ID, not a caller-supplied ID. UUIDs, statuses and rates are validated. SQL is parameterized. Request bodies, bearer tokens and raw database errors are not logged.
