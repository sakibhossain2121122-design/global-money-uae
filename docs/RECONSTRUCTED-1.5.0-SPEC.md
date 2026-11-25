# GLOBAL MONEY UAE — Reconstructed Premium 1.5.0

Approved scope supplied by the user on 25 November 2026. This is new reconstruction work from `e76370a515763018314eb211a257127a91d04b7f`, not recovery of the lost original workspace. Branch: `feature/premium-ui-v1.5`. Android: versionName **1.5.0**, versionCode **15**, application ID `com.globalmoney.uae.demo`.

## Android acceptance requirements

Emerald/navy/white/gold visual system; splash and welcome; redesigned sign in and registration; dashboard with server-derived balance/rate states; Add Money and Send Money synthetic request forms; UAE categories BOTIM Money, e& money, ADCB, Emirates NBD, ADIB and additional banks; Bangladesh bKash, Nagad, Rocket, Upay and Bank; neutral initials instead of unlicensed logos; server-controlled staging method availability; history with Pending, Successful (Staging), Rejected and full request statuses; copy admin-authored TEST-prefixed TRX IDs; beneficiaries, support and editable profile; English/Bengali labels; Home/History/Support/Profile bottom navigation.

## Admin acceptance requirements

Customer suspension/reactivation; staging UAE payment account metadata; method enable/disable controls for synthetic requests only; Bangladesh bank catalogue; Add Money/Send Money review and rejection; TEST TRX editing; explicit manual staging rate and fee configuration; support status/replies; server RBAC; immutable audit and reference history. Account metadata accepts TEST-prefixed placeholders, never real banking credentials.

## Mandatory boundaries

Staging is visible throughout. All money requests are synthetic: successful means a staging review only. Real payment execution, wallet credit, payouts, transfers, identity uploads and posting remain disabled. No invented balance, rate, transaction or seed customer. Missing data displays unavailable/empty. Catalogue labels are descriptive metadata. Admin method switches cannot activate actual financial rails. No production deployment/database access, PR #26 merge or historic migration fabrication. Preserve other worktrees and APKs.

## Delivery

Implement native Android visuals and admin/backend contracts. Save tests/logs and a requirement coverage report. Build and verify APK version/package/signature/SHA-256, export screenshots and source/patch. Commit and push only this new branch; if push fails, immediately export the committed source ZIP and patch. Configure fixed-staging GitHub Actions APK builds and artifact retention. Provide a verified authenticated/mobile-accessible artifact URL where supported. Record any blocked build, screenshot, download or hosted validation explicitly.
