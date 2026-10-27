# Inquiry planned action v1 — administrative intention only

Status: frozen for bounded synthetic M01 development after independent security/domain, UX and API/database review. This resource records one staff-entered administrative intention for an inquiry. It is not a completed action, executable task, contact permission, status transition, urgency decision, booking step or server-computed “Next Action”.

## Meaning and versioned vocabulary

- The separate projection starts as `null`, meaning **no planned action is recorded**. It does not mean that no work is needed or that prior work is complete.
- Synthetic vocabulary version 1 is exactly `review_inquiry` and `review_follow_up`. These development-only values describe internal review, not communication or clinical work. Matching is exact; there are no aliases, free text, inferred defaults or channel-specific values.
- `review_inquiry` means review the inquiry information already authorized to the current owner. `review_follow_up` means review the authorized manual follow-up history. Neither value contacts anyone, opens another record, changes a due date or marks review complete.
- Clearing to `null` removes only the recorded intention. It never means completed, cancelled, contacted, refused or closed.
- This is an inquiry-level planning record, not a personal commitment by the actor who entered it. It follows the inquiry through future authorized reassignment so the new current owner can review it; reassignment does not endorse, complete or clear it. Persistent UI copy says it must be reviewed by the current owner. Former owners cannot read or replay it, and this resource exposes no former-owner identity.
- Contact preference, language, time zone, contact fields, deadline, status, ownership, follow-up history and patient/booking state remain unchanged. No value is derived from them.

## Authority and privacy

- The server derives clinic and actor from a verified session. Only the inquiry's **current owner**, with active `reception`, `manager` or `dentist` membership in that clinic, may read or change this resource. Managers have no implicit override for another owner's inquiry.
- API and privileged database paths independently enforce tenant, active role and current ownership. Absent, foreign-clinic and other-owner targets share the same not-found boundary. Patient, assistant, inactive and former-owner callers are denied.
- State lives in a private projection rather than on the broadly staff-readable inquiry row. Original inquiry, deadline and other projections remain unchanged. RLS is enabled as defense in depth and direct table access is revoked.
- Reads expose only schema/vocabulary versions, inquiry/clinic/current-owner IDs, nullable planned action, revision and server update time. Receipts/events contain no name, contact value, source, free text, patient identifier or former-owner identity. Responses are `Cache-Control: no-store`; request bodies are not logged.

## HTTP, concurrency and activation

`GET /api/v1/inquiries/:id/planned-action` returns strict `InquiryPlannedActionStateSchema`. Initial state is `planned_action: null`, `revision: 0`, `updated_at: null`; a positive revision requires an update time. Reads reject query parameters and remain available while writes are disabled.

`POST /api/v1/inquiries/:id/planned-action` requires a UUID path, UUID `Idempotency-Key` header and strict body `{ expected_revision, planned_action }`. Revision is an integer from 0 through 2147483647 and prevents stale A→B→A overwrites. Every successful first execution, no-op or replay returns HTTP 200. Internal RPC transport is POST-only.

The API checks default-off `ENABLE_INTAKE_COMMANDS=true`. In one transaction, the database locks the current-clinic inquiry, revalidates current ownership and active role, verifies trusted `private.intake_command_settings.enabled=true`, then resolves an exact actor/clinic/inquiry/command/key receipt before compare-and-set. Exact replay returns the immutable original receipt; changed payload reuse returns 409. Revoked/former owners and disabled activation cannot replay saved receipts.

Persistence is planned-action-specific: private tables `inquiry_planned_actions` and `inquiry_planned_action_receipts`, command discriminator `set_planned_action`, and POST-only RPCs `get_inquiry_planned_action` / `set_inquiry_planned_action`. Qualification, scheduling, follow-up and other receipt key spaces are never reused.

After replay resolution, current revision must equal `expected_revision`, even if the requested value matches current state. A no-op stores an immutable receipt with unchanged revision/update time and emits no audit/outbox event. A real change increments once and atomically updates state, receipt, audit and outbox. At the revision ceiling, replay/no-op remains possible; a real change returns sanitized 409.

The result contains a strict minimal receipt plus `replayed`. The receipt has inquiry/clinic/current-owner IDs, vocabulary version, previous/requested planned action, previous/current revision, `changed`, server `recorded_at` and `event_version: 1`. It is historical command evidence, not current state after later changes; clients reread fresh authorized state after success or replay.

Public failures are 400 malformed input/header/path/query, 401 absent/expired identity, 403 denied role, 404 absent/foreign/not-current-owner, 409 stale/key-conflict/revision-ceiling and 503 disabled/unavailable. Writes require API `ENABLE_INTAKE_COMMANDS=true` plus trusted `private.intake_command_settings.enabled=true`; disabled write retains `intake_disabled`.

For a real change, audit action and outbox event `InquiryPlannedActionChanged` version 1 use the inquiry aggregate. Payload is exactly `{ vocabulary_version, previous_planned_action, planned_action, previous_revision, revision, recorded_at }`; identity/correlation remain envelope fields. No task, reminder, notification, message or activity-feed consumer is activated.

## UI acceptance

The authorized inquiry detail adds one compact “Prochaine action prévue” row immediately above “Replanifier le suivi”, outside “Informations déclarées”. `null` displays “Aucune action consignée”; a value displays “Prévu : Examiner la demande” or “Prévu : Examiner l’historique du suivi”. The row has no success color, completion checkbox, progress indicator or history panel.

Persistent copy states: “Intention administrative uniquement, à revoir par le responsable actuel. Aucune action effectuée, échéance modifiée ou communication envoyée.” “Renseigner l’action prévue” / “Modifier l’action prévue” opens the existing accessible dialog pattern with a deliberate selection and no inferred default. Confirmed persistence says “Intention enregistrée”, never “Action effectuée”. Clearing is a distinct “Effacer l’action prévue” control and never claims completion.

The dialog identifies the choices as a “Catalogue de démonstration limité”. It does not show phone/email actions, derive a channel from contact preference, add a date field or combine its save with scheduling. Saving or recording a follow-up does not complete or clear the plan and does not add an entry to follow-up history.

Support loading, empty, saving, success, no-change, neutral 409 recovery, unknown-result verification, offline, denied, expired and unavailable states without optimistic success. An unavailable read never displays the empty-state claim. Ordinary navigation aborts stale reads and resets unsent drafts. An uncertain command remains bound to its original inquiry/key/body in session memory for explicit verification only. No background retry or offline queue. Logout, expiry, clinic/session replacement, offline transition, disposal, authority loss or 404 aborts and clears private state; late responses are ignored. Recovery is isolated from qualification, schedule and follow-up attempts, including the delayed-read loading-reset case.

Use the Dental Spa pearl/navy system, 14px working text, 44px mobile targets, visible focus/labels, live status feedback and reduced-motion behavior. Stack label/value/action at 390px without page-level horizontal overflow and return focus to the opener. Synthetic `/intake` and authenticated `/connection` remain visibly distinct.

## Verification and gates

Test anonymous/patient/assistant/inactive/foreign/other-owner/former-owner denial in HTTP and privileged SQL paths; reads with switches off; independent API/database write gates; null initialization; both exact values and clearing; SQL/Zod vocabulary parity; wrong/missing vocabulary version; rejection of communication/booking/clinical/free-text fields; unchanged qualification/deadline/status/owner/follow-up/patient state; follow-up recording neither clears nor completes the plan; reassignment-before-replay denial; new-owner reads expose only current-owner identity; no-op stability; stale and A→B→A conflict; revision ceiling; exact replay/key conflict; two-session contention/replay; rollback at every sink; minimized payloads; private table access; no-store/no logging; and UI cross-inquiry/late-response/session cleanup and recovery isolation.

Real operational vocabulary, ownership/reassignment procedure, task-engine integration, contact authority, hosted identity, production activation and any notification remain explicit approval/release gates. This resource must never be presented as workflow eligibility or proof that an action occurred.

Sources: [module PRD](04_MODULE_PRD.md) M01 requires provenance, owner, due date and action; [domain model](05_DOMAIN_MODEL.md) places next action on Lead/ContactInteraction; [master workflows](03_MASTER_WORKFLOWS.md) GJ-01 separates responsible owner, deadline and follow-up; [manual follow-up contract](INQUIRY_FOLLOW_UP_V1_CONTRACT.md) records actions already performed; [ADR-003](adr/ADR-003_DEVELOPMENT_AND_RELEASE_GATES.md) separates bounded development from operational activation.
