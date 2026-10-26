# Inquiry follow-up history v1 — frozen synthetic development contract

Status: coordinator-frozen contract for a bounded M02 Growth/Intake slice. It permits synthetic staff-only development after the reviewed intake foundation. It does not approve a clinic contact SOP, patient selection, booking, public messaging, or live patient use.

## Meaning

A follow-up record is an append-only staff attestation that an **external/manual contact action has already happened**. It is not a task due date, appointment, message sent by Dental Spa, verified delivery, patient identity evidence, clinical note or inquiry conversion. The original inquiry receipt, creator/owner, `new` status and `follow_up_at` remain unchanged. No free text, contact values, medical content, attachment or backdated occurrence time is accepted.

The v1 action vocabulary is deliberately narrow and synthetic:

- `contact_attempt`: the actor attempted contact; no successful exchange or delivery is claimed.
- `two_way_exchange`: the actor attests that a two-way exchange occurred; no identity verification or medical conclusion is implied.

The actor also selects the manually observed channel: `phone`, `email`, `in_person` or `other_manual`. No API integration, SMS, WhatsApp, Instagram or automatic delivery claim follows from that label. `recorded_at` is the authoritative database time of attestation, not the actual time of the external action. These labels require clinic/product approval before real use and may be replaced in a future version; old records retain their original code/version.

## Roles, tenancy and activation

- Only the inquiry's current `owner_user_id`, while an active member of the inquiry's clinic with `reception`, `manager` or `dentist` role, may list or record its follow-ups in v1. Manager role is operational access only; no clinical privilege is inferred. Other staff, patients, anonymous and cross-clinic IDs are denied without revealing the existence of foreign records.
- The verified session supplies actor and clinic; the path supplies inquiry ID. No request body may specify clinic, actor, inquiry status, contact value or event time.
- Writes require `ENABLE_INTAKE_COMMANDS=true` and the existing trusted private intake command switch; both default off. A direct database RPC must recheck authorization and activation. Read-only demo data is visibly synthetic and memory-only.
- No browser service-role credential, local/session storage of token or follow-up history, offline submission queue, or authenticated service-worker cache.

## HTTP and shared schemas

All authenticated responses use `Cache-Control: no-store`. The canonical Zod schemas in `packages/contracts/src/intake-follow-up.ts` define:

| Surface | Shape |
| --- | --- |
| `GET /api/v1/inquiries/:id/follow-ups` | `{items: FollowUpRecord[0..50], truncated: boolean}`; newest by `(recorded_at DESC, id DESC)`. Empty and truncated states are explicit. No query parameters. |
| `POST /api/v1/inquiries/:id/follow-ups` | Strict `{kind, channel}` plus UUID `Idempotency-Key` header; returns `{item, replayed:false}` with 201, or original immutable item with `replayed:true` and 200. No query parameters. |
| Record | `id`, `clinic_id`, `inquiry_id`, `actor_user_id`, `kind`, `channel`, `recorded_at`, `event_version: 1`. All identifiers are UUIDs and time is an offset-bearing ISO instant. |

Stable response categories: 400 invalid request/key, 401 unauthenticated, 403 unauthorized actor, 404 absent or foreign inquiry, 409 reused key with different canonical body, 503 `intake_disabled` for a disabled command or generic unavailable for other failures. Never return raw database errors or another tenant's data. A malformed successful repository response fails closed.

## Persistence, replay and audit

- An additive private/public schema migration creates a clinic-scoped append-only follow-up table and private idempotency receipt. Revalidate clinic, active owner/role and command switch inside a narrow security-definer RPC with fixed `search_path`; deny direct browser writes.
- Key scope is `(clinic, actor, inquiry, command, key)`. Exact replay returns the original immutable receipt, even if nonauthorization inquiry data later changes; changed normalized payload conflicts. Revalidate the actor's **current active clinic membership, permitted role, inquiry tenancy, and current ownership**, plus command activation, before replay lookup. Only then may replay bypass other mutable inquiry checks. A revoked actor or a former owner who remains a clinic member cannot retrieve a saved receipt.
- Each new record, audit entry, `InquiryFollowUpRecorded` v1 outbox event and idempotency outcome commit in one transaction. Event payload contains only follow-up/inquiry references, kind, channel and record time; it carries no patient contact or free text. Failure of any write rolls back all of them.
- History is append-only in v1. Wrong entries are not silently edited/deleted. A separately approved correction/supersession contract is required before real use.
- Unknown network outcomes retain the exact key/body for replay and then reconcile the authoritative history. Never show “recorded” before the validated server response. No optimistic inquiry-status, patient, booking or task transition.

## UI acceptance

The existing inquiry detail adds **“Consigner un suivi”** and an **“Historique du suivi”** with explicit empty/loading/partial states. The dialog binds to the inquiry ID opened, displays the selected inquiry and requires explicit kind/channel selection; no successful kind is preselected. Copy states that the action occurred outside this application and no message is sent. Connected and demo transports share the schema, show the returned actor/time, and clear sensitive in-memory state on session expiry/logout. Loading, denied, disabled, invalid, conflict, offline, unknown-result, success and retry states remain distinct. The UI must not backdate, change ownership/deadline/status or claim booking.

## Evidence and deferred work

Tests must cover strict body validation, owner/role and foreign-clinic denial (including privileged database path), direct-write denial, bounded/truncated ordering, exact replay versus changed payload, audit/outbox/idempotency rollback, revoked actor, replay by a former owner who remains an active clinic member, and browser unknown-result reconciliation. The actual local Supabase/PostgreSQL CI job is the database gate; embedded SQL alone is insufficient. No hosted migration, real patient contact, delivery integration, correction workflow, assignment, future due-date update, patient selection or appointment confirmation is included.

Sources: [master workflows](03_MASTER_WORKFLOWS.md) GJ-01 requires a named owner and next follow-up; [module PRD](04_MODULE_PRD.md) M01 calls for provenance/owner/due/action; [current intake contract](INTAKE_V1_CONTRACT.md) fixes the original receipt and disables real commands; [security](09_SECURITY_SAFETY.md) and [ADR-003](adr/ADR-003_DEVELOPMENT_AND_RELEASE_GATES.md) preserve authorization and separate release gates. The action vocabulary above is a new synthetic development contract, not a source-approved clinic process.
