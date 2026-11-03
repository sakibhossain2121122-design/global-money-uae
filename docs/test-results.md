# Premium Upgrade validation — 4 November 2026 (Asia/Dhaka)

Source branch: `feature/premium-upgrade`; original base: `127aa6a15778c15e1d694ceb51a991ee17da11a8`. Remote main and feature branch were not modified. GitHub push access was rejected with HTTP 403, so no PR was opened or merged. A prepared PR body is included in `docs/PR.md`.

| Check | Result |
| --- | --- |
| Backend TypeScript (`npm run typecheck`) | PASS |
| Backend security tests (`npm test`) | PASS: all 7 |
| PostgreSQL 17 API integration tests | PASS: all 19 reported tests (18 checks plus parent) |
| Admin TypeScript and Vite production build | PASS |
| Backend npm audit | PASS: zero vulnerabilities reported |
| Admin npm audit after upgrading Vite to 7.3.7 | PASS: zero vulnerabilities reported |
| Android offline source/XML/wrapper integrity checker | PASS |
| Android Kotlin compilation | PASS in the network-enabled Gradle attempt |
| Full Android testDebugUnitTest / lintDebug / assembleDebug | FAILED due to environment toolchain; no completed updated APK |
| Original Android APK workflow and Gradle wrapper | Unchanged from original base |

## Exact Android blockers

The network-enabled build reached `:app:compileDebugJavaWithJavac` after Kotlin compilation, then failed:

```text
Failed to transform core-for-system-modules.jar
Execution failed for JdkImageTransform
jlink executable /usr/lib/jvm/java-21-openjdk-amd64/bin/jlink does not exist.
```

This environment has a Java 21 runtime without the full JDK image tools. The Android SDK and Gradle were installed under writable `/workspace/scratch` directories for the attempt. An additional sandbox-only offline rerun could not open the Gradle daemon's local socket (`java.net.SocketException: Operation not permitted`); that failure is retained in the captured build log. Earlier cache and missing-SDK failures were resolved before the Kotlin compilation succeeded. Attempts to obtain a full JDK 17 were interrupted; a successful full build is not claimed.

Use a complete JDK 17 (`JAVA_HOME` pointing to that JDK, with `bin/jlink` present), Android SDK platform 35 and build tools 34.0.0 in Codespaces or the unchanged GitHub Actions workflow. Then run from `android`:

```sh
./gradlew --no-daemon testDebugUnitTest lintDebug assembleDebug -PAPI_BASE_URL=https://YOUR-API-DOMAIN
```

No Android unit-test suite, final lint pass, APK signing/install, emulator flow or device acceptance is claimed. The old sample arithmetic model/test was removed along with the sample UI. The offline checker is not a replacement for a full Android build. The working pre-existing APK was not overwritten, uninstalled or replaced.

## Integration coverage

Real disposable PostgreSQL 17 database, real HTTP API: registration validation, password/session handling, session hashes in storage, anonymous/customer/admin authorization, forbidden public role assignment, malformed/oversized input, Bengali UTF-8 input, profile persistence, null wallet/rates and empty history, beneficiary ownership/deletion, support ticket persistence/status update, internal-only rate configuration, disabled money/document endpoints, independent database posting guards, deferred per-currency ledger balance constraints, audit persistence, suspension revocation, expiry and logout.

## Content and restrictions

Android main UI and resources contain no user-facing demo labels, AED 2,450 balance, sample transaction history, simulated successes or guest login. The internal application/package identifier retains `.demo` solely for update compatibility. Balances and customer exchange rates display `—`. All money operations are unavailable; API and database guards remain enabled. No identity documents are accepted. No approvals or provider partnerships are claimed.

Backend registration has no email-verification/password-recovery flow yet; admin MFA/gateway hardening, multi-instance abuse controls, device testing and privacy/retention review remain prerequisites for broader use. See deployment instructions.
