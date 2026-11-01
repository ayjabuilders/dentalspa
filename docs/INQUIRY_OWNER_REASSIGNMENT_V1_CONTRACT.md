# Inquiry owner reassignment v1 — synthetic development contract

Status: coordinator-frozen for synthetic staff-only development after the reviewed manual-intake foundation. This is an administrative ownership command. It is not clinical delegation, a task assignment, a shift or qualification decision, patient selection, booking, contact permission or a clinic-approved operating SOP.

## Authorization and scope

- Only a verified active `manager` membership for the selected clinic may reassign an inquiry. A manager receives no clinical authority from this command.
- The clinic and actor are derived from the verified bearer session. The path identifies the inquiry. The body contains only `expected_owner_user_id` and `owner_user_id`; it cannot set the actor, clinic, inquiry status or contact data.
- The target must be an active member of the same clinic with an existing intake role: `reception`, `manager` or `dentist`. An assistant-only account cannot own a manual intake under the existing intake contract. These roles establish intake access only; they say nothing about shifts, clinical qualifications, presence or ability to perform treatment.
- A missing/foreign inquiry returns the same 404. A stale expected owner conflicts. No caller-provided clinic or arbitrary membership claim is trusted.
- `ENABLE_INTAKE_COMMANDS=true` and the existing trusted private intake switch must both be enabled for the write. Both remain disabled by default.

## Command and state semantics

`POST /api/v1/inquiries/:id/owner` accepts the strict `SetInquiryOwnerSchema` plus a UUID `Idempotency-Key`; no query parameters are accepted. The expected owner is the compare-and-set token. The database locks the inquiry row, rechecks the manager, clinic, target membership and activation, then compares the current owner. A concurrent or stale reassignment cannot silently overwrite a newer owner. Reassigning to the current owner is a recorded no-op and does not update the inquiry.

The service returns a validated immutable receipt with inquiry/clinic IDs, previous and resulting owner IDs, whether ownership changed, database timestamp and event version. New results use HTTP 201; an identical replay returns the saved receipt with HTTP 200; a key reused with a different normalized body returns 409. Authorization and activation are checked before replay access. Errors do not expose contact data or raw database text. Responses use `Cache-Control: no-store`.

The command changes only `inquiries.owner_user_id`. It does not alter the original inquiry receipt, status, source, contact values, deadline, patient record, appointment, message or clinical content. After a successful change, current-owner worklists and owner-only commands apply their existing ownership checks: the former owner loses those owner-scoped views; the new owner gains the existing intake scope. The existing clinic-wide intake list remains available to active intake roles. Managers use that list and this command, not owner-only histories on behalf of staff.

## Transaction and events

The command stores private idempotency receipts, updates ownership, and writes `InquiryOwnerReassigned` audit/outbox rows in one transaction. The outbox contains only the inquiry reference and previous/new owner user IDs; it excludes inquiry name, contact values, free text and medical information. A failure rolls back the ownership change and both records. The event is persistence for a future idempotent consumer, not notification delivery.

The RPC rechecks active manager authority and target membership under fixed-search-path rules and uses the authenticated caller's user-scoped client. Direct table writes remain revoked. Private idempotency data has RLS enabled and no client grants. Any privileged service-role connection must not be treated as inheriting RLS.

## UI and verification

Only a connected manager (or the clearly labeled local manager demo) sees the reassignment control. Candidate names come from the authorized active team roster, filtered to existing intake roles; a truncated or unavailable roster is not treated as complete. The UI binds a submission to the inquiry and observed owner, retains the same key/body for uncertain retry, and refreshes the authoritative list after a conflict. It never calls an owner-specific edit on behalf of the target. Loading, empty, permission-denied, offline, conflict, unknown-result, retry and success states are explicit. No stale success appears before a validated receipt.

Verification covers strict schemas, reception/dentist/patient/anonymous/foreign-clinic denial, manager checks repeated in SQL, inactive and assistant-only target denial, stale-owner conflicts, cross-clinic inquiry IDs, idempotent identical replay, changed-body conflict, no-op, lost/expired authorization, direct write denial, audit/outbox privacy and rollback. Use independent PostgreSQL sessions in CI to prove two managers racing from the same expected owner cannot both win. Local PGlite tests are useful but do not replace that contention evidence. Migration remains local; no hosted mutation or operational activation is authorized here.

## Traceability

The [M01 PRD](04_MODULE_PRD.md) requires a named owner and lifecycle tracking. [GJ-01](03_MASTER_WORKFLOWS.md) calls for one accountable owner. The existing [intake contract](INTAKE_V1_CONTRACT.md) limits intake roles and initializes creator ownership. The existing [team roster contract](TEAM_ROSTER_V1_CONTRACT.md) exposes roles but does not establish qualifications or shifts. This v1 command only changes the administrative inquiry owner.
