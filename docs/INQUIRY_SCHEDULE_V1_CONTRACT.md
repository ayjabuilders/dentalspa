# Inquiry follow-up schedule v1 — current-owner command

Status: frozen for bounded synthetic M01 development, pending independent review. This command changes only the administrative follow-up timestamp on an existing inquiry. It does not contact anyone, assign another owner, select/link a patient, create an appointment, or change inquiry status.

## Authority and meaning

- The server derives clinic and actor from a verified session. Only the inquiry's **current owner**, with an active `reception`, `manager` or `dentist` membership in that clinic, may issue the command. Managers receive no implicit right to alter another owner's deadline. Assistant, patient, inactive, foreign-clinic and former-owner callers are denied or receive the same not-found boundary.
- `follow_up_at` is an administrative reminder instant, not a clinical urgency, promised contact, booked slot or completed task. It may be set to any valid four-digit ISO instant or cleared to `null`; v1 does not invent clinic working hours, priority or escalation rules.
- The original creator/owner, source, contact fields, status and creation time remain unchanged. Reassignment is a later policy-dependent command.
- Writes require both existing default-off switches: API `ENABLE_INTAKE_COMMANDS=true` and trusted `private.intake_command_settings.enabled=true`. Direct RPC calls recheck the private switch and current authorization. A disabled switch retains the existing sanitized `503 intake_disabled` behavior.

## HTTP and concurrency

`POST /api/v1/inquiries/:id/follow-up-schedule` requires one UUID path, `Idempotency-Key` UUID header and strict `SetInquiryScheduleSchema`: `{ expected_follow_up_at, follow_up_at }`. Both keys are required and independently nullable.

Schedule instants allow at most six fractional digits, matching PostgreSQL microsecond precision, and both their input year and normalized UTC year must remain within `0001–9999` (PostgreSQL has no year zero). Equivalent ISO offsets compare as the same instant. The UI preserves the exact `follow_up_at` string from the freshly loaded detail as `expected_follow_up_at`; the minute-resolution input is used only to form the requested new instant.

Inside one transaction, the database orders checks as follows: lock the current-clinic inquiry; revalidate current owner, active role and private activation; locate an exact actor/clinic/inquiry/command/idempotency-key receipt; return that immutable receipt when the normalized input matches; reject key reuse when it differs; compare the expected instant; then persist the no-op receipt or perform the change. Revoked/former owners and disabled activation cannot replay a saved receipt.

If expected and requested instants are equal, atomically save and return an immutable command receipt with `changed: false` and emit no audit/outbox event. A real change atomically updates only `follow_up_at`, saves the receipt, and appends audit/outbox rows. Exact-key retries return the original receipt with `replayed: true`; reusing a key with different normalized input returns 409. A receipt is evidence of that command outcome, not necessarily the inquiry's current deadline after later commands.

The strict `InquiryScheduleResultSchema` returns `receipt` plus `replayed`. The receipt contains only inquiry/clinic/owner IDs, previous and requested timestamps, `changed`, server `recorded_at` and `event_version: 1`; it contains no name, contact, status or message. After every success or replay, the client fetches fresh authorized detail/worklist before presenting the current deadline. Responses and errors are `Cache-Control: no-store`. Public failures: 400 malformed input/header/path, 401 identity absent/expired, 403 role denied, 404 absent/foreign/not-current-owner, 409 stale expected value or key conflict, 503 disabled/unavailable. Provider details and contact content never appear in errors or logs.

For a real change, audit action `InquiryFollowUpScheduleChanged` and outbox event of the same name/version 1 use the inquiry as aggregate. The outbox payload is exactly `{ previous_follow_up_at, follow_up_at, recorded_at }`; actor/clinic/aggregate/correlation remain envelope fields. No inquiry name, contact, source, status, full snapshot or free text is stored. Inquiry update, immutable receipt, audit row and outbox row commit or roll back together. No-op receipts emit neither event.

## UI acceptance

In the existing inquiry detail, current owners can open “Replanifier le suivi,” see the currently observed timestamp, choose a local date/time or “Sans date,” and submit the corresponding ISO instant. The dialog must state that no message or appointment is created. Show saving, success/no-change, stale-conflict, unknown-result verification, offline, denied, expired and unavailable states without optimistic success. Refresh the owner worklist/detail only from fresh authorized reads after a validated receipt.

An unknown network outcome retains the exact key and normalized payload in memory even if the dialog closes or the user navigates between detail/worklist inside the mounted intake tool; reopening offers only explicit verification with that exact command. There is no persistent/offline queue or background retry. Logout, expiry, clinic/session replacement, transport disposal, offline transition or detected authorization loss aborts requests and clears receipt, draft, inquiry and errors. Keyboard focus, 44px mobile targets, reduced motion and pearl/navy styling follow the Dental Spa system.

## Verification and gates

Test tenant/current-owner authorization through privileged SQL and API paths, exact null/timestamp compare-and-set, equivalent offsets, two-session contention, no-op behavior, idempotent replay/conflict, atomic rollback, audit/outbox payload minimization, sanitized errors, strict transport parsing and all browser lifecycle states. Real hosted identity, clinic scheduling policy, reassignment, notification delivery, appointment confirmation and production activation remain separate gates.

Sources: [master workflows](03_MASTER_WORKFLOWS.md) GJ-01 requires a named owner and next deadline; [module PRD](04_MODULE_PRD.md) M01 requires owner/due/action; [owner worklist contract](INQUIRY_OWNER_WORKLIST_V1_CONTRACT.md) defines the existing deadline projection and explicitly reserves a later command to change it; [security](09_SECURITY_SAFETY.md) and [ADR-003](adr/ADR-003_DEVELOPMENT_AND_RELEASE_GATES.md) require tenant-safe development with separate release gates.
