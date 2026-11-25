# Reconstructed 1.5.0 — validation and delivery

This release was newly reconstructed from `e76370a515763018314eb211a257127a91d04b7f` on `feature/premium-ui-v1.5`. It is not the recovered original 1.5.0 workspace. See [the approved specification](RECONSTRUCTED-1.5.0-SPEC.md).

## Implemented

Native Compose emerald/navy/white/gold splash, welcome and authentication; dashboard with unavailable balance and actual server-configured staging rate; Home/History/Support/Profile navigation; server-controlled synthetic Add Money methods, Send Money requests, Bangladesh beneficiary categories and bank catalogue, TRX copying, profile and threaded support; English/Bengali primary UI and neutral provider initials.

Admin customer management, staging payment-account placeholders, method switches, Bangladesh banks, synthetic request review/rejection and TEST-prefixed TRX editing, manual rate/fee configuration, ticket status/replies and immutable audit views. Method controls affect synthetic request availability only. No real financial rail is enabled. New account metadata only accepts TEST references, not real bank credentials.

Forward migration 009 adds these controls and strengthens immutable audit/event/reference history. Existing SQL migrations are unchanged. Both migration entrypoints share a checksum and structural integrity guard; legacy unchecksummed or incompatible history is rejected and requires explicit owner review. There is no automatic checksum backfill or approval switch. Never substitute another historical 004 migration. `backend/sql/gm-app-permissions.sql` provisions an unprivileged runtime role without setting a password; review its PUBLIC ACL revocation scope before running in a dedicated database.

## Actual local results

| Check | Result |
| --- | --- |
| Backend TypeScript typecheck | PASS |
| Existing backend security/domain unit suites | PASS (10 tests) |
| Original HTTP/integration regressions | PASS |
| Existing synthetic deposit/send/TRX lifecycle | PASS with API running as gm_app |
| PostgreSQL 17.6 fresh and repeat migrations | PASS |
| Unsupported legacy schema rejection | PASS, expected rejection |
| Integrity regressions (fresh/repeat, unchecksummed history, tamper/unknown versions, missing schema objects/changed functions, runtime permissions) | PASS, 5 test groups |
| New 1.5 API regressions (RBAC, method control, review/TRX, accounts/banks/pricing/support, audit and financial denial) | PASS, 4 test groups, using gm_app |
| Admin TypeScript/Vite build | PASS |
| Admin browser navigation/screenshots against actual local disposable API | PASS, 12 screenshots, no reported browser/API UI errors |
| Android project/wrapper/resource checks | PASS |
| Android unit tests | PASS, 12 tests |
| Android lintDebug and assembleDebug | PASS, JDK 17 / Gradle 8.9 / SDK 35 |
| Android screenshot instrumentation APK compilation | PASS |
| Native emulator screenshots / device acceptance | BLOCKED: no hardware accelerator, software guest did not reach a usable app session; normal adb server also could not write its read-only home directory |
| Hosted GitHub Actions | PASS — Android run 45655647407 and corrected platform run 45655975243 |
| Existing deployed staging backend supports the new 1.5 contracts | BLOCKED pending a separately reviewed backend rollout; no backend deployment or live database change was performed |

The native screenshot test is opt-in (`localScreenshots=true`), uses the real UI and a disposable local API through emulator host-loopback, and is excluded from the distributed application. It contains no fabricated balance, rate or transaction responses. Admin screenshots show actual synthetic request rows created by local regression tests, not real money transfers. The screenshot environment has no rate configured and no seeded balances or transactions.

## APK binary verification

- Application ID: `com.globalmoney.uae.demo`
- versionName: `1.5.0`; versionCode: `15`; min SDK 26 / target SDK 35.
- Export: `global-money-uae-1.5.0-premium-staging.apk`, 9,561,153 bytes.
- SHA-256: `b43a6f26454f4ba505f91c60153a869af15478186095a61c33812df20f388366`.
- apksigner: verified, Android debug certificate, RSA 2048, APK signature scheme v2.
- Signing certificate SHA-256: `1d998637972c4f90a07dec23e34625e50fed33f06bf144e4f3022c504c31a153`.
- Prior APK signing continuity: UNKNOWN because the original 1.5.0 APK/key is unavailable. The debug build is not a production-signed release.
- [Private Google Drive APK download](https://drive.google.com/file/d/1sLxCV7j4GvTmwTZx6_9WnRKwwfwjfuFJ/view?usp=drivesdk): upload and authenticated raw download readback succeeded; downloaded bytes match the local APK. Sign in to the connected Drive account on Android. Physical-phone installation is not claimed as tested.

The APK has a fixed staging HTTPS origin. The new `overview`, `staging-methods`, bank, support-reply and admin contracts exist in this source; they are not assumed to exist on the currently deployed staging API. Do not call this staging-ready until backend compatibility, legacy migration review and device acceptance are resolved. No production deployment/database access, wallet credit, payment, payout, identity upload or PR #26 merge occurred. Other worktrees and APKs were preserved.

## Reproduce without accessing production

Use Node 24, PostgreSQL 17, JDK 17 and Android SDK 35/build tools 34. In a disposable local database run the guarded migration owner connection, then the permission SQL. Run the API with a separate gm_app connection and enable only `SYNTHETIC_REQUESTS_ENABLED=true` for fixture request tests. Run `npm test`, `npm run typecheck`, `npm run test:payment-methods`, the integration scripts, and `test:integrity`. All destructive test setup requires a disposable `_test` database. The Actions workflows describe the isolated PostgreSQL and Android checks. Do not use those test commands against staging or production databases.

Before deployment, a database owner must review and explicitly remediate any unchecksummed historical schema outside the normal runner. Do not automatically stamp current checksums over unknown history. Keep the money-posting triggers and disabled adapters intact.

## Hosted verification update

The [Android workflow](https://github.com/sakibhossain2121122-design/global-money-uae/actions/runs/45655647407) passed for application commit `86ca4e93bb647cff06f2523d5b1d08ab0c238172` and published the reconstructed staging artifact. The [platform workflow](https://github.com/sakibhossain2121122-design/global-money-uae/actions/runs/45655975243) passed at `0e05c84b4bdf74a576ee67267e9ab4cbba19f96d` after correcting a test fixture to use the distinct gm_app password instead of the migration owner password. Separate SCRAM-authenticated local PostgreSQL 17 integrity tests also passed. No runtime/Android code changed in that fixture fix. This final documentation update records those results.

The Drive APK hash above identifies the locally built, readback-verified binary. The GitHub-built APK has its own debug signing identity and its own checksum inside the CI artifact; do not compare its bytes to the local APK hash. Neither build is a production-signed release.
