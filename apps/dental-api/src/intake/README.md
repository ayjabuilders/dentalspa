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

## Administrative follow-up schedule

POST /api/v1/inquiries/:id/follow-up-schedule returns HTTP 200 for change, no-op and replay. It changes only follow_up_at; it creates no contact, notification, appointment or ownership change. Both ENABLE_INTAKE_COMMANDS and private.intake_command_settings remain default-off. Current active reception/manager/dentist ownership is rechecked after the inquiry row lock and before receipt replay, including privileged RPC calls.

The target-bound receipt key includes clinic, actor, inquiry and command. Receipts are append-only, including no-ops. Exact retries return the historical receipt after authority/activation checks, so consumers must refresh current detail/worklist. Different normalized input or a stale expected instant returns generic 409. The SQL parser accepts strict four-digit ISO years and at most six fractional digits, including ISO offsets beyond PostgreSQL's native parser range, and verifies normalized UTC remains 0001–9999. Receipts and payloads use six-digit UTC timestamps; the API compares microseconds without Date millisecond truncation.

One transaction persists deadline, receipt and minimal audit/outbox changes; no-op emits no event. Focused SQL/PGlite tests inject an outbox failure and verify rollback/recovery. Real PostgreSQL pgTAP and independent-connection lock contention remain CI/runtime gates; PGlite does not prove concurrent-session behavior. No hosted mutations or external delivery are part of this slice.

## Own schedule command history

GET /api/v1/inquiries/:id/follow-up-schedule/history is a read-only, no-store view of the currently authorized owner's own receipts. Active reception/manager/dentist authority and current ownership are rechecked in SQL while an inquiry share lock prevents concurrent reassignment. Actor, clinic, inquiry and command filters precede the 51-row limit; previous-owner receipts never enter the projection. Private request keys provide deterministic timestamp tie ordering but are not returned. No-op receipts are included. Neither write activation switch applies, and history cannot replay or resolve an uncertain command.

The adapter and service strictly validate minimized fields, exact microsecond ordering, truthful changed flags, target binding and partial-list size. PostgreSQL pgTAP remains the database CI gate; PGlite tests are not a substitute for full PostgreSQL verification. No hosted migration, delivery, clinical action or release activation is included.

## Owner-only literal inquiry search

POST /api/v1/inquiries/owner-search is a read returning HTTP 200/no-store with no idempotency key or activation switch. Active reception/manager/dentist membership is independently checked by SQL. Clinic, current owner and literal name filters precede the 51-row limit. Matching follows actual database collation; backslash is escaped before percent/underscore with explicit ESCAPE. Names must already have U+0020-only edge trimming, contain 2–80 Unicode code points and omit C0/DEL. Query/body logging is not added; existing access logs remain a field whitelist with no body.

The strict response echoes verified clinic/actor scope and includes only 50 bounded inquiry summaries. API validation rejects wrong scope, duplicates, bad ordering, private fields and impossible truncation. Results are navigation aids; selecting an item still requires fresh current-owner detail authorization. No patient identity or absence inference is made. Real PostgreSQL pgTAP CI remains required; local PGlite evidence is not hosted identity or production approval.
