# M02.1 manual intake backend

This slice creates a manual inquiry only. There is no patient conversion, deduplication, booking or external integration. The source field is attribution.

## Activation and authorization

Both activation switches default off: API `ENABLE_INTAKE_COMMANDS=true` and trusted SQL setting `private.intake_command_settings.enabled=true`. Enabling only the API does not enable the database command. No endpoint grants browser users access to the setting. No hosted switch or migration has been applied by this implementation.

The API verifies the bearer subject and selected clinic via existing identity policy, then restricts intake to active reception/manager/dentist roles. User-scoped Supabase clients call `list_inquiries` and `create_inquiry`. SQL independently verifies `auth.uid()`, active membership, role and selected clinic; direct RPC cannot bypass these checks. Inquiries have select-only RLS; no direct authenticated table writes. Functions have fixed empty search_path and UTC timezone. Private idempotency/settings tables have RLS and no client grants.

## Transaction and normalization

The unique idempotency scope is `(clinic_id, actor_id, request_key)`. `INSERT ON CONFLICT` followed by a row lock serializes retries at normal PostgreSQL READ COMMITTED isolation. A differing normalized payload raises sanitized `PT409`; identical input returns the original inquiry. Inquiry creation, audit, outbox envelope and completed idempotency record share the function's transaction. On any error they all roll back. No exception text/contact data is copied to audit/outbox/logs.

Names and phones use the same whitespace trim as JS; email case is preserved and whitespace rejected. Name max length uses Unicode codepoints, matching locked Zod 4.6.7. Follow-up timestamps canonicalize to a PostgreSQL instant in UTC, so equivalent offsets compare equal regardless of session timezone. Database timestamp range/precision still applies. This slice has no edit or delete operation, so replay returns the original immutable inquiry. Do not add edits without explicitly preserving replay response semantics.

The HTTP layer maps SQLSTATE rather than provider message/status text. API/SQL activation rejection returns 503 with stable body `code: "intake_disabled"`; provider and malformed-result 503 responses omit that code. Unknown/database-constraint failures are sanitized 503 responses, never leaked SQL details. Command flag is an additional boundary, not a substitute for SQL authorization.

## Verification and limits

PGlite tests execute the real migration/RPC/RLS and cover input parity, disabled commands, active roles, tenant isolation, replay/conflict, per-actor/clinic uniqueness, rollback on outbox failure, UTC replay and bounded newest-first listing. Queued concurrent calls demonstrate uniqueness but PGlite serializes transactions; a real multi-connection contention test remains an activation gate. `supabase/tests/intake.test.sql` supplies full-stack pgTAP tests; it requires local Supabase/Docker and is not claimed executed by embedded tests.

Before activation: run full Supabase migrations/policy tests, concurrent retries across independent PostgreSQL connections, hosted identity/revocation checks, and product/privacy review. No credentials, real inquiry data or remote deployment are included.
