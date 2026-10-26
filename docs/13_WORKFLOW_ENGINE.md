# 13 — Service Journey and Visit Task Engine Specification

## Core principle
A **service offering**, **clinician-approved treatment plan**, **treatment case**, **journey template**, **case phase instance**, **visit/appointment**, **visit checklist** and **individual task** are different concepts. A person selecting "Hollywood Smile" from the website signals an *interest*, not a diagnosis/clinical plan. Only the licensed clinician approves a case and applicable treatment steps.

## Template levels
1. Shared draft organizational template.
2. Clinic-approved template + controls.
3. Practitioner-specific approved variant that changes eligible operational steps/assignments only; no silent deletion of required medical gates.
4. Instance snapshot pinned to immutable template/version at launch.

## Hierarchy
`ServiceCatalog` → `JourneyTemplateVersion` → `JourneyPhaseDefinition` → `VisitWorkflowDefinition` → `StepDefinition/TaskTemplate`.
At runtime: `TreatmentCase` → `PhaseInstance(s)` → `VisitWorkflowInstance` → `TaskInstance(s)`.
For repetitive orthodontic follow-ups allow loops/iteration counters; for veneers and lab work allow revision/retouch branches. Parallel tasks require explicit dependencies.

## Engine command rules
- `instantiate_case_journey` only after valid clinical plan approval; store source/actor/version.
- `complete_task` validates authentication, tenant, assigned or delegated role, prerequisites, evidence and permissions. Store actor/time, audit and outbox atomically.
- `transition_phase` validates all required gates; manual override requires explicit authority, reason and audit, never silent skip.
- `reassign_task` checks qualifications and retains prior assignment/performer.
- `publish_patient_milestone` requires approved content and minimal projection; no internal notes automatically.
- Events from Scheduling/Clinical/Lab update eligibility, not automatically attest real-world actions.

## Staffing modes
`solo`: Dr Amina handles eligible operational steps where qualified; no fictitious assistant assignment and no bypass of safety gates.
`assistant`: escort/room prep can go to assigned assistant; dental decisions/signatures remain clinician's.
`multi-staff`: clinic and care-team context (shifts, competencies, location, workload); one accountable task owner. Staff can change mid-session; completed tasks retain performer; future tasks are re-resolved.
If no qualified assignee, task enters `unassigned/blocked` and triggers actionable exception.

## Safe workflow statuses
- Task `planned → eligible → assigned → in_progress → awaiting_review → completed` with `blocked/cancelled` branches.
- Appointment `requested → held → confirmed → arrived → called → roomed → in_consultation → completed` with separate `no_show/cancelled/rescheduled` transitions.
- Case `draft → assessed → plan_proposed → clinically_approved → active → clinically_closed` plus `paused/revision`.
- Phase `not_started → ready → in_progress → awaiting_gate → completed` with loops/blocked/revision.

## Worked Hollywood Smile *proposal*, not clinical SOP
1. Consultation/diagnostic (supported by clinical checklists).
2. Esthetic planning and options/devis/consent (supported across high-level task map and guide).
3. Indicated photography/scan (assistant 'Scan pour facettes' task).
4. If prescribed, technical lab handoff/design/manufacture/QC/delivery (prosthetist/external lab procedures).
5. If indicated and validated, veneers try-in and bonding (specific checklist).
6. Clinical follow-up and any return-to-lab/remake loop.
This is a **composed example**; no full exact Hollywood Smile protocol was found as such in the provided clinical checklist. The final permitted branches and mandatory gates await Dr Amina's approval.

## Patient projection
`current_phase_title`, `approved_progress_label`, `next_visit`, `approved_next_action`, `released_documents`, `optional_help_contact`. Do not expose internal lab defects, unapproved plan versions, staff workload or clinical notes awaiting signature. Do not calculate a fabricated treatment completion percentage when phases differ in complexity.

## What to test
Template version pins across edits, orthodontic repeat loop, lab rework, solo/assistant shift changes, gate blocking, event replay, patient progression from approved source state, unauthorized override attempt, concurrency on task claim.
