# Android customer app

See the root [README](../README.md) for API setup, Codespaces application, signing compatibility and APK instructions. The existing Gradle wrapper, tool versions, application ID and successful Android workflow are preserved.

```sh
./gradlew --no-daemon testDebugUnitTest lintDebug assembleDebug -PAPI_BASE_URL=https://YOUR-API-DOMAIN
```

Kotlin, Compose and Material 3; English/Bengali switch; authenticated account, profile, beneficiary and support workflows. No sample balances, sample transactions, simulated requests or guest authentication. Network success is required for saved account actions. Sessions are memory-only and API calls use HTTPS with redirects disabled. Backup and cleartext traffic are disabled; sensitive screens are excluded from screenshots.

Balance and customer rate remain `—`. Add Money, BOTIM MONEY, transfers, collection and identity-document uploads remain unavailable. The internal package suffix is retained to preserve upgrade compatibility and is never shown as application content.

`python3 tools/check_project.py` is an offline integrity/source check; it is not an APK build or an instrumented UI test. Bilingual UI copy is paired inline in the Compose screen; the checker verifies the presence of Bengali copy and resource integrity, not translation quality.
