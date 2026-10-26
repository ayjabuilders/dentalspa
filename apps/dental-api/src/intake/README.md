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

## Synthetic follow-up attestations v1

`GET/POST /inquiries/:id/follow-ups` implement the frozen follow-up contract. The current inquiry owner must remain an active reception/manager/dentist member. Other staff cannot read or append this history. Owner transfer does not erase historical actors, but immediately prevents the former owner from retrieving an idempotency receipt. Both user-scoped RPCs use POST and independently recheck owner, tenant and role, including privileged database callers.

Writes reuse both existing default-off intake switches. Authorized history remains readable while writes are disabled. The record attests a manual action outside Dental Spa; it sends nothing and leaves inquiry ownership/status/deadline unchanged. Bodies accept only the frozen kind/channel codes; record time comes from the database. There is no correction, delete, backdating or clinical-content field.

The inquiry row lock serializes appends/retries with ownership updates. Idempotency scope is `(clinic, actor, inquiry, command, key)`. Authorization and activation precede receipt lookup; exact replay returns the saved immutable item. All record/audit/outbox/receipt writes share one transaction. The `InquiryFollowUpRecorded` v1 envelope uses inquiry aggregate identity and only follow-up/inquiry IDs, kind, channel and recorded time. Private tables expose no direct client grants. A trigger additionally rejects record UPDATE/DELETE; any later correction/retention mechanism needs a separate reviewed contract.

History fetches51 and returns50, ordered by recorded time and UUID descending, with explicit truncation. HTTP success and failure responses are `no-store`; sanitized disabled responses alone include `intake_disabled`. The dedicated follow-up providers preserve the existing intake repository interface and workflows.

Focused API/adapter/PGlite tests cover these boundaries and all three sink rollback failures. `supabase/tests/inquiry_follow_up.test.sql` supplies23 PostgreSQL assertions. Full local Supabase CI, independent-connection retry/ownership races and operational approval remain gates; embedded tests are not claims of those checks.

## Current-owner due worklist

`GET /inquiries/owner-worklist` returns three owner-scoped buckets at one database statement-start observation (`statement_timestamp()`), using one projection snapshot. Due timestamps equal to that observation belong to overdue; later timestamps belong to upcoming; null timestamps are undated. Each bucket fetches51 and returns50 with explicit truncation. Due buckets sort ascending by due time and UUID; undated sorts descending by creation time and UUID. The projection explicitly excludes contact fields. API validation retains PostgreSQL sub-millisecond comparisons and rejects invalid scope, membership, ordering and duplicate items in a trusted response.

`GET /inquiries/:id` independently resolves current ownership and returns the existing full inquiry schema, including authorized contact values, even outside the newest100 list. Missing, foreign and reassigned identifiers all return the same404. Both endpoints require active reception/manager/dentist membership and use user-scoped POST RPCs whose explicit tenant/owner checks also apply to privileged database callers. Neither read depends on command activation; both return no-store success/error responses. No inquiry, audit or outbox mutation occurs. Existing intake and follow-up routes are preserved.

The additive migration contains only lookup indexes and narrow read functions. Actual-migration embedded tests cover exact equality, one-microsecond classification, all ordering/truncation rules, owner reassignment, privileged denial and old-record detail. `supabase/tests/inquiry_owner_worklist.test.sql` supplies25 real-PostgreSQL assertions; the Docker-backed CI run remains the database gate. No hosted operation or clinic urgency policy is implied.
