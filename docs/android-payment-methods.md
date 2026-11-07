# Android read-only payment methods

Signed-in Home now includes **Payment Methods / পেমেন্ট পদ্ধতি**. It makes only `GET /v1/payment-methods` through the existing AccountApi, bearer session and single background executor. The existing protected backend endpoint is reused unchanged.

Each card shows name, two-letter country, currency and an optional HTTPS logo URL as noninteractive text. The app does not fetch or open external logos and never sends its bearer token to a logo host. There are no selection, deposit, credit or transfer requests. Every method has a client-side `enabled` getter that always returns false; the JSON provider flag is ignored, even if true or malformed. Each payment control is disabled and displays “Service not yet available” (with Bengali equivalent).

Loading uses the existing progress indicator and disables navigation/actions until completion. Empty arrays show an explicit empty state. Refresh clears prior results before requesting. A malformed/oversized response or HTTP failure shows the existing error notice and a retry option without publishing partial or stale data. HTTP 401 clears the existing bearer session and method metadata, returning to sign-in. Logout also clears method metadata. Parsing exceptions in completion handlers are now captured rather than escaping onto the UI thread.

The response must be a JSON array with at most 200 objects. Required fields are string `name`, `country` (two uppercase letters) and `currency` (three uppercase letters); metadata is bounded. `logo_url` is optional; blank/null/non-string/unsafe URL values are omitted. The payment response read is capped at 512 Ki characters. Unknown fields, including enabled/action instructions, never grant permissions.

Example response contract (test metadata only):

```json
[{"name":"Test bank","country":"AE","currency":"AED","logo_url":null,"enabled":false}]
```

No backend runtime code, SQL, migrations, financial balances or Android APK workflow is changed. Login, profile, beneficiary, history and support handlers remain in place. No tokens are logged or written to storage. Existing Add Money, BOTIM MONEY and send-money controls stay disabled; no wallet credit/debit, deposit, remittance or KYC functionality is introduced.

## Reproduce checks

With a complete JDK 17, SDK platform 35 and build tools 34.0.0:

```sh
cd android
./gradlew --no-daemon testDebugUnitTest lintDebug assembleDebug \
  -PAPI_BASE_URL=https://YOUR-VERIFIED-API-HOST
```

The existing GitHub Actions Android workflow still performs its original build/test/upload sequence and supplies its current API origin. The parser test dependency is test-only `org.json:json:20250517`; Android runtime uses its existing JSON implementation.

Backend read-only contract tests use Node.js 24 module mocking and the real HTTP router with a fake pool. They never connect to PostgreSQL, run migrations or write data:

```sh
npm --prefix backend run typecheck
npm --prefix backend test
npm --prefix backend run test:payment-methods
python3 android/tools/check_project.py
```

They check anonymous/malformed/expired-session access rejection, authenticated read-only responses, server-side forced-disabled flags, rejected POSTs and blocked money routes. The fake pool rejects non-SELECT SQL other than transaction delimiters. These are route contract tests, not live-database or deployed-service tests. The platform CI runs the new checks alongside its existing checks.

## Review and deployment boundary

Review branch: `feature/android-payment-methods`, based on main `6f2e2e0`. Do not merge or deploy automatically. Build artifacts are for review; no installed app or deployed service is changed by creating them. Device/Compose UI acceptance remains a separate release check. Existing authentication and API availability are prerequisites; the app cannot list metadata without a valid session.
