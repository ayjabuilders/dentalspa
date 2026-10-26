# Next module: inquiry, booking and reception

Status: implementation sequence prepared on 26 October 2026. ADR-003 now permits bounded synthetic M02 development after reviewed technical dependencies pass, while M01 hosted identity, restore and operational acceptance remain activation/release gates. The parallel work does not declare those gates passed, and each M02 command retains its own contract and policy dependencies.

## Product outcome

A receptionist can record a manual inquiry, review possible existing patients, assign responsibility and request a time. A confirmed appointment appears in the clinic calendar and the verified patient's own view. Requests, confirmed appointments and actual arrival remain distinct. No clinical workflow starts automatically.

## Small implementation slices

1. **Intake and patient matching.** Clinic-scoped inquiry ownership, channel, follow-up date and minimal contact details; duplicate candidates require staff review. No automatic merge on names or phone numbers. Manual attribution only for unverified external channels. Create/update commands include idempotency, permission checks and audit/outbox writes in the same transaction.
2. **Resource-safe scheduling.** Explicit provider/chair resources, UTC intervals, display timezone, request/hold/confirmed states and resource constraints. Availability is informational. Atomic confirmation must reject competing transactions and preserve replay semantics; rescheduling must retain the old slot if the replacement cannot commit.
3. **Reception and calendar.** API-driven request queue and calendar; visible conflict, retry, empty and permission states. Check-in records staff attestation of actual arrival, separate from calling, escorting or starting a consultation. Booking success appears only after commit.
4. **Patient projection.** Read-only own appointments through verified account linkage; no staff-only notes, inquiry contact records, resource internals or other patient information. Public requests return generic responses and never expose patient matching results.

## Parallel ownership after the gate

| Lane | Owns | Dependency |
| --- | --- | --- |
| Data and scheduling | Reviewable migrations, transactional commands, constraints, audit/outbox | Agreed versioned command contracts and error codes |
| Clinic experience | Intake, duplicate review, reception and calendar UI | Contract fixtures initially; real API integration before acceptance |
| Patient/public experience | Verified appointment card, request form and privacy states | Approved public request policy and patient projection |
| Integration lead | Contract review, tenant/role checks, concurrency, end-to-end tests | Integrates each slice before starting the next |

Agents must own distinct files. Shared contracts and migrations are reviewed by the integration lead before parallel consumers change. UI fixtures stay explicitly synthetic and cannot authorize or confirm real appointments.

## Evidence required

- Two concurrent confirmations for the same constrained resource: one commits; one conflicts. Adjacent nonoverlapping times succeed; different clinics remain isolated.
- Identical idempotency key/payload returns the original outcome; a changed payload conflicts; replay does not emit another audit or outbox event.
- Failed reschedule keeps the original booking. Cancellation releases capacity and retains its actor/history.
- Staff cannot address a foreign clinic's patients, inquiries, resources or appointments. Patient-only accounts cannot use staff routes.
- Unverified or ambiguous patient links deny access. Public callers cannot enumerate patients or confirm arbitrary resources; abuse protection is tested before exposing the form.
- Keyboard, responsive calendar scrolling, timezone display and truthful pending/conflict feedback pass browser checks. Authenticated responses never enter a service-worker cache.

## Decisions to resolve before corresponding production behavior

Clinic operating hours, appointment duration rules, resource qualifications, hold expiration, contact verification and public abuse controls require explicit configuration or product decisions. They are not inferred clinical rules. The OpenAPI draft is an endpoint inventory, not an implemented booking contract.

Remaining M01 evidence is recorded in `M01_VERIFICATION.md`. No remote migration, deployment, clinical approval, vendor messaging or real patient data is authorized by this planning document.
