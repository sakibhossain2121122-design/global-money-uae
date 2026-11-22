# Android payment-method cards

The authenticated customer catalogue is loaded from `GET /v1/payment-methods`.
Migration 011 adds display-only Bangladesh provider entries and a catalogue
visibility flag. Admins can edit names, URL metadata, ordering and visibility
via `admin/method-catalog`; changes are audited. Visibility is separate from
financial availability, and hidden UAE methods cannot be used for new
Add Money requests. Existing review-only request controls remain separate.

Android shows rounded text-fallback cards for configured methods. No official
logo assets or usage authorization have been verified, so it does not fetch,
open or display any logo URL; the customer API returns a null URL. URLs are
stored as admin-only metadata and must be
HTTPS with no user information, query, fragment or nonstandard port. No
partnership is implied. Authorized assets and a separate verification process
are required before images can be displayed. Payouts and real payments remain
unavailable; beneficiary selection and review requests remain unchanged.

Run backend tests, admin tests/build and Android `testDebugUnitTest`, `lintDebug`
and `assembleDebug` before publishing. Device/Compose instrumentation tests
require an Android device or emulator and are not run by the APK workflow.
