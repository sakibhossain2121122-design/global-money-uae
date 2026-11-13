# Add customer Add Money requests and audited admin review

Customers can submit and track AED Add Money requests, and administrators can
review them in the existing React Admin Panel. All financial posting stays
blocked: statuses are only pending, under_review, rejected and cancelled. No
receipts, document uploads, wallet credit, balance adjustments or remittances.

- Extend the existing service_requests/service_request_events schema with
  migration 004; preserve legacy rows and unify both migration entrypoints.
- Validate AED amounts, metadata references, optional notes and strict payloads.
  Authenticate ownership, deduplicate retries and identical active requests, and
  require an expected status for concurrent admin review.
- Record creation/review events and audit entries in the same transaction.
- Add the Admin Panel request tab, review notes, status changes and event history.
  Add Android submission, retry handling and request-status/history screens.
- Preserve Users, Support, Transactions, Rates, auth and existing Android flows.
  Include the CI/compiler repairs still missing from main.

Validation: backend typecheck; 10 unit tests; two read-only HTTP tests; 31
integration tests across existing/new suites; additive upgrade and migration
re-run checks; admin build; real API mobile browser check; workflow lint; Android
project checks, eight unit tests, lintDebug and assembleDebug. Hosted CI status
will be recorded after branch publication; local checks do not imply a CI pass.

API contracts and operational boundaries: docs/add-money-requests.md.

Review only. Do not merge, deploy, apply production migrations or enable financial
posting as part of this PR.
