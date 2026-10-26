# Inquiry schedule history v1 — frozen synthetic development contract

Status: coordinator draft for independent review. Development may start only after this contract is reviewed and frozen. The slice is staff-only, synthetic, and does not approve a clinic follow-up policy or production activation.

## Purpose and boundary

The existing schedule command stores an immutable receipt for every accepted current-owner command, including a no-op. This slice exposes a bounded, read-only journal of the **current actor's own receipts for the currently owned inquiry**. It helps that owner understand recent deadline-command outcomes without exposing another staff member's activity.

This is not a complete inquiry audit, staff-performance record, contact history, patient timeline, booking history, or proof that follow-up occurred. It does not change an inquiry, create or replay a command, send a message, reassign ownership, update status, select a patient, hold a resource, or confirm an appointment.

## Authorization and privacy

- The server derives actor and clinic from the verified session. The actor must be an active `reception`, `manager`, or `dentist` member, must currently own the inquiry, and may read only receipts whose stored actor is that same actor.
- A missing, foreign, no-longer-owned, or other-owner inquiry is indistinguishable as 404. Manager role does not permit reading another owner's schedule-command journal.
- The response echoes only the requested inquiry ID plus timestamps, `changed`, and `event_version`. It omits actor/clinic IDs, request and correlation keys, normalized payloads, contact data, names, source/status, follow-up attestations, clinical content, audit/outbox internals, and all records from previous owners.
- All authenticated responses use `Cache-Control: no-store`. No history, token, or private response is stored in browser persistence, analytics, logs, or the service-worker cache. In-memory data is cleared on logout, expiry, denial, clinic/session change, offline transition, and transport disposal.

## API and ordering

`GET /api/v1/inquiries/:id/follow-up-schedule/history` accepts one UUID path identifier and no query parameters. It returns the strict `InquiryScheduleHistorySchema`:

- `inquiry_id`: the authorized path ID;
- `items`: zero to 50 immutable command outcomes containing `previous_follow_up_at`, `follow_up_at`, `changed`, `recorded_at`, and `event_version: 1`;
- `truncated`: true only when at least one additional authorized receipt exists; when true exactly 50 items are returned.

Items are newest first by exact PostgreSQL timestamp, then by the private request key descending only as an unexposed deterministic tie-breaker. Timestamps preserve up to PostgreSQL microsecond precision and the four-digit UTC range already frozen by the schedule contract. `changed` must equal whether the previous and requested instants differ; a no-op remains a truthful journal entry.

The read does not depend on either write-activation switch. Stable public outcomes are 200 including empty history, 400 for invalid path/query, 401 unauthenticated, 403 absent active staff authority, 404 absent/foreign/no-longer-owned inquiry, and sanitized 503 for unavailable or malformed trusted results. Database errors and hidden receipt fields never reach the client.

## UI behavior

The authorized inquiry detail adds an explicit **“Historique des échéances”** disclosure. It loads on demand and labels itself **“Vos actions récentes uniquement”**. Each row says whether the deadline changed, shows stacked previous and resulting values (including “Sans date”), and shows the recorded time in a named timezone. These are historical command outcomes; the freshly read inquiry detail remains authoritative for the current deadline. The history cannot resolve an uncertain submission, which continues through the existing exact-key verification flow. It never names another staff member or claims contact, completion, urgency, booking, or an exhaustive audit.

Loading, empty, partial `50+`, offline, denied, expired, missing/reassigned, unavailable, retry, and success states are distinct. `50+` is labelled as the current actor's command outcomes, including no-ops. A denied, expired, or missing/reassigned read clears the selected private inquiry, the history, and any pending schedule verification; active requests are aborted and late responses ignored. Selection changes also abort/reset the history, and the response `inquiry_id` must match the selected inquiry before rendering. The history is not editable, exportable, replayable, or available offline. Keyboard focus, reduced motion, both themes, 44px mobile targets, responsive reflow, and 200% zoom remain acceptance checks.

## Verification and activation

Tests must cover direct SQL and HTTP tenant/owner/role denial, previous-owner exclusion, no-op and changed entries, exact microsecond ordering, private tie-break ordering, 50/51 truncation, malformed/private-field rejection, no-store, empty and sanitized error states, cleanup boundaries, and responsive browser behavior. PostgreSQL CI must apply the additive read function and pgTAP assertions before merge.

This slice performs no hosted migration, real contact processing, external delivery, production deployment, or clinical action. Hosted identity/revocation, legal retention review, physical-device PWA and clinic operating policy remain separate release gates.

Sources: [master workflows](03_MASTER_WORKFLOWS.md) require follow-up traceability; [module PRD](04_MODULE_PRD.md) calls for owner/due/action in M01; [schedule contract](INQUIRY_SCHEDULE_V1_CONTRACT.md) defines immutable receipts; [security](09_SECURITY_SAFETY.md) and [ADR-003](adr/ADR-003_DEVELOPMENT_AND_RELEASE_GATES.md) require tenant-safe development and separate activation gates.
