# Scheduling resource rules — clinic decision packet

Status: product/clinic decisions required. This packet records bounded questions for synthetic appointment-confirmation design. It is not a clinic schedule, an approved service catalog, or authorization to confirm appointments, migrate hosted data, or enable real resources.

## Current boundary

The merged scheduling kernel can show informational availability and place a temporary, transactional hold on one synthetic provider and one synthetic chair. It prevents overlapping occupancy for either resource, but a hold contains no patient, inquiry, service, appointment, arrival, or consultation state. The resource labels and availability windows are development fixtures. An approved patient-selection policy is a separate prerequisite for appointment confirmation.

The accountable clinic and product owners should record a named approver, policy version and effective date for the choices below. The choices describe operational configuration; they do not prescribe care or delegate clinical authority.

## Decisions required before the confirmation contract

### R1 — Service and duration source

- **A — Explicitly configured offerings:** a clinic owner approves each schedulable offering and its duration by provider/location before use.
- **B — Staff-entered duration:** authorized staff choose a duration for each booking within clinic-approved bounds and give a structured reason.

The current fixtures cannot establish either rule. Until approval, real confirmation fails closed; no duration is inferred from a marketing label or a treatment interest.

### R2 — Provider/chair eligibility

- **A — Approved pairing matrix:** only configured provider, chair, location and offering combinations are offered.
- **B — Separate eligibility rules:** provider and chair qualifications are independently configured and intersected at request time.

Record who maintains the rules, how absences or equipment outages suspend eligibility, and whether a second chair or provider may be substituted. A manager role alone must not grant clinical qualification.

### R3 — Opening hours and exceptions

- **A — Versioned weekly hours plus dated closures/overrides.**
- **B — Explicit published availability blocks without a recurring schedule.**

Specify timezone, holidays, lunch/cleaning blocks, who publishes an exception, and whether existing confirmed appointments remain valid after a rule change. Unpublished or missing availability is unavailable, not implicitly open.

### R4 — Preparation and turnover buffers

- **A — Per-offering pre/post buffers on the same constrained resources.**
- **B — Separately reserved preparation/turnover resources and tasks.**

The clinic must approve overlap rules for room preparation, visit, cleaning and parallel staff activity. The system must not infer that two stages may share a chair just because their names differ.

### R5 — Booking authority and review

- **A — Explicit staff capability to confirm, cancel and reschedule.**
- **B — Separate capabilities or second-person review for specified offerings/exceptions.**

Record who may override normal hours, change a provider, cancel a booking and view the change history. Patient self-request remains a request; it never becomes a confirmed slot through the public form alone.

### R6 — Hold window and expiry

Approve a maximum advance-booking horizon, maximum interval, hold lifetime, and whether a hold can be renewed. The current server-controlled synthetic bounds are development settings, not clinic policy. Expired or released holds cannot be consumed; a confirmation command must validate the current hold and resource rules inside one transaction.

### R7 — Cancellation and rescheduling consequences

Approve cancellation reasons, authority, patient-facing status and operational notice obligations. A failed reschedule must leave the original confirmed allocation intact. Whether a late cancellation/no-show affects fees, reminders or clinical records is a separate finance/clinic decision; no fee or clinical transition is inferred here.

### R8 — Patient communication boundary

Approve wording that distinguishes **request received**, **slot temporarily held**, **appointment confirmed**, **change requested**, and **cancelled**. Specify eligible channels, consent and delivery evidence. The transactional outbox is only an event record; it is not proof that a message was sent or read. No public or patient-facing confirmation is issued before the appointment transaction commits and account linkage is verified where private details are shown.

## Contract constraints independent of the choices

- Keep clinic and actor derived from a verified session. Revalidate patient-selection evidence, hold, resources and authority at commit; never trust client-provided clinic or patient identity.
- Keep inquiry, reviewed candidate association, hold and appointment as separate records and transitions. Confirmation does not mean arrival, check-in, rooming or consultation start.
- Occupancy, appointment, history, audit, outbox and idempotency outcome must commit atomically; conflicts and unknown outcomes require reconciliation, not an optimistic success message.
- Preserve old occupancy if a reschedule fails. Cancellation releases capacity with actor/history; it does not erase the appointment.
- Test same-provider and same-chair contention, replay, expiry, revoked actor, foreign-clinic references, eligibility change, cancellation and failed reschedule on PostgreSQL connections.
- Keep all configuration and examples synthetic until owner approval and hosted activation gates are met.

## Approval record

Record R1–R8 choices, exact configuration values, authorized roles, exception owner, patient-facing language, effective policy version and sign-off by the accountable clinic/product authorities. If a choice needs clinical or legal review, record that reviewer and leave the dependent behavior disabled. No default is treated as approval by silence.

## Traceability

- [Clinic discovery](02_CLINIC_DISCOVERY.md): service durations, roster, rooms, overlap and operational rules are explicitly open decisions.
- [Master workflows](03_MASTER_WORKFLOWS.md): request, hold and confirmation are distinct; arrival and consultation occur later.
- [Module PRD](04_MODULE_PRD.md) and [M02 delivery sequence](M02_DELIVERY_SEQUENCE.md): resource-safe booking, cancellation and reschedule evidence.
- [Domain model](05_DOMAIN_MODEL.md): scheduling owns resources, availability, holds, appointments and audit.
- [Scheduling hold v1 contract](SCHEDULING_HOLD_V1_CONTRACT.md): current synthetic-only boundary and deferred confirmation.
- [Patient selection packet](PATIENT_SELECTION_DECISION_PACKET.md): separate D1–D8 identity/association approval.
- [Security and safety](09_SECURITY_SAFETY.md) and [test/pilot plan](11_TEST_PILOT_PLAN.md): authority, isolation, contention and patient privacy gates.
