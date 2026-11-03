The Android app previously displayed a fabricated balance, sample transactions and simulated account actions. This change replaces them with a bilingual Compose account experience backed by authenticated APIs, while displaying `—` for unavailable balances/rates and keeping all financial services disabled.

Adds a Node.js/TypeScript API, PostgreSQL migrations, revocable hashed sessions, scrypt passwords, ownership/role checks, input validation, rate limits and audit records. Adds a React/TypeScript admin panel for account suspension, support management, internal rate configuration and read-only transaction review. Beneficiaries support bKash, Nagad, Rocket, Upay and Bank. KYC is a future capability boundary only; identity documents are rejected. Ledger journals/entries have minor-unit, per-currency balance and idempotency foundations, with database posting guards and no real posting routes.

The Android application ID and existing APK workflow remain unchanged. No merge or deployment is requested. Preserve the previously downloaded working APK until the new build passes device acceptance. API deployment and an HTTPS API_BASE_URL are required for connected Android account flows.

Validation and current build limitations are recorded in docs/test-results.md. Secure deployment instructions, runtime-role grants and known hardening work are in docs/deployment.md. This is an account and financial-platform foundation; no licensed operations, provider partnership, document verification or real payments are claimed.

Base: main
Head: feature/premium-upgrade
