# GLOBAL MONEY UAE

Android customer application and account platform foundation. Kotlin / Jetpack Compose / Material 3, Node.js 24 / TypeScript, PostgreSQL 17, and React / TypeScript administration.

Financial services are disabled. No provider integration, partnership, regulatory approval, usable wallet balance or remittance capability is claimed. Unavailable balances and rates display `—`. Identity documents must not be submitted.

## Source layout

- `android/`: emerald, navy, white and gold customer app; English/Bengali switch; registration, login, logout, profile, beneficiaries and support tickets connected to the API.
- `backend/`: validated APIs, scrypt password hashing, opaque revocable eight-hour sessions, authorization, bounded requests, rate limits, audit logging, migrations and tests.
- `admin/`: authenticated administration for user suspension/reactivation, support statuses, internal rate configuration and read-only transaction review.
- `docs/deployment.md`: secure setup, roles, service hosting and operational boundaries.
- `docs/API.md`: request contracts.
- `docs/PR.md`: prepared pull request description targeting `main`.
- `docs/test-results.md`: executed validation and limitations.

## Run locally

Use Node.js 24 and a local PostgreSQL 17 database. Copy `.env.example` to `.env` and replace placeholders. Never commit `.env`. Commands below run from repository root:

```sh
npm --prefix backend ci
# Migration uses a separate database-owner credential; use a fresh database.
node --env-file=.env backend/src/migrate.ts
node --env-file=.env backend/src/server.ts
```

API listens on `0.0.0.0:3000` (all interfaces, required for Railway healthchecks). In another terminal:

```sh
npm --prefix admin ci
npm --prefix admin run dev
```

The development admin server proxies `/v1` to the local API. Register an account through the Android client or API, then explicitly promote a verified administrator using the migration/owner DB connection:

```sql
UPDATE customers SET role='admin' WHERE email='your-administrator@example.com';
```

Public registration never accepts roles. There is no default administrator or seeded password. See deployment instructions before serving any real accounts.

## Tests

```sh
npm --prefix backend run typecheck
npm --prefix backend test
npm --prefix admin run build
python3 android/tools/check_project.py
```

Integration tests destroy the `public` schema of a **disposable** database whose name ends in `_test`:

```sh
cd backend
TEST_DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/global_money_test npm run test:integration
```

## Build the updated APK

Preserve a downloaded copy of your existing successful APK separately. This upgrade retains the original application ID `com.globalmoney.uae.demo` for update compatibility; that internal identifier is not a user-facing label. The version is now code 2 / name 1.1. Installing over an existing build requires the same signing key; do not uninstall a working app merely to test this source. Use a separate emulator/device if signatures differ.

Install Java 17 and Android SDK platform 35 / build tools 34.0.0, then:

```sh
cd android
./gradlew --no-daemon testDebugUnitTest lintDebug assembleDebug \
  -PAPI_BASE_URL=https://YOUR-API-DOMAIN
```

`API_BASE_URL` must be an HTTPS origin without a path or trailing slash. The API lives below `/v1`. Without this property the app still builds, but account calls fail closed with a connection notice. No fake login or success is shown. The backend and HTTPS domain must exist for connected flows to work.

APK: `android/app/build/outputs/apk/debug/app-debug.apk`.

The existing `.github/workflows/android.yml` is unchanged and continues to build/test/upload the debug APK on Android pushes or manual dispatch. To build a connected APK in that workflow without editing its steps, add this **non-secret** origin to `android/gradle.properties` on the feature branch:

```properties
API_BASE_URL=https://YOUR-API-DOMAIN
```

Run **GLOBAL MONEY UAE Android APK** with `feature/premium-upgrade` selected, then download `global-money-uae-debug-apk` promptly (the existing retention is three days). Do not replace the old working APK until you have tested the new artifact.

## Apply the delivery in Codespaces

The supplied patch is based on feature branch commit `127aa6a15778c15e1d694ceb51a991ee17da11a8`. It contains actual implementation files and deletions, not just a plan. Start with a clean worktree and retain your original APK outside the checkout:

```sh
git fetch origin
git switch feature/premium-upgrade
git pull --ff-only origin feature/premium-upgrade
# Upload premium-upgrade.patch to the Codespace, outside the checkout.
git apply --check /path/to/premium-upgrade.patch
git apply /path/to/premium-upgrade.patch
# Run validation above, review the changes, then:
git add .
git commit -m "Implement premium account platform with financial services disabled"
git push origin feature/premium-upgrade
gh pr create --base main --head feature/premium-upgrade \
  --title "Upgrade Android account experience and add secure platform foundation" \
  --body-file docs/PR.md --draft
```

If the feature branch has changed since the recorded base, resolve the patch against that branch before committing; do not reset remote history or overwrite newer work. The full source ZIP is also provided for inspection. Applying the patch handles removal of the old sample model and test automatically. Do not merge automatically.

## Boundaries

Sessions live only in client memory. Activity destruction, app process termination or browser reload requires login again; server sessions expire after eight hours, and logout revokes the token. Registration has no email verification or password recovery yet. Admin MFA, distributed rate limiting, pagination beyond the latest 100 rows, external monitoring and a reviewed privacy/retention policy remain deployment hardening work. Do not describe this foundation as a licensed financial service or a completed KYC integration.
