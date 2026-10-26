# 05 — Domain Model and Data Ownership

## Primary aggregates / domains
- `Clinic`: clinic_id and settings; future multi-clinic isolation.
- `Identity`: Supabase auth users, staff profiles, clinic memberships, role grants; patient account links separately verified.
- `Lead/ContactInteraction`: inquiry source, assigned owner, next action, conversion.
- `Patient`: clinic-scoped identity, contact, patient auth linkage, verified contacts; medical data in Clinical domain.
- `Scheduling`: resources, service types, availability rules, slot holds, appointment state and audit.
- `Encounter`: real consultation session, structured clinical note versions, signatures and attachments.
- `TreatmentCase`: longitudinal plan, version, milestones/phases and clinical decision state.
- `Workflow`: approved templates/versions, phases/steps, execution instances, tasks, assignments, gates and transitions.
- `LabWorkOrder`: technical production state tied to signed clinician prescription; future LabFlow.
- `Finance`: quotes, invoices, receipts, payments and allocations; financial approval independent of clinical approval.
- `Communication`: messages, conversations, notifications and delivery status.
- `Document`: file metadata, private storage key, access release, version, integrity and permitted audience.
- `Governance`: approval requests, immutable audit events, outbox events, delivery attempts.
- `ConsultationIntelligence`: capture session metadata (no audio), draft lifecycle, final clinician signed note, patient instructions publication.

## High-level relationships
`Clinic 1—N Patients`, `Clinic 1—N Memberships`, `Patient 1—N Appointments`, `Appointment 0—1 or 1—N Encounters depending on finalized business rule`, `Patient 1—N TreatmentCases`, `TreatmentCase 1—N PlanVersions`, `TreatmentCase 1—N PhaseInstances`, `Encounter 0—N Tasks`, `WorkflowInstance N—1 TemplateVersion`, `Patient 1—N Invoices`. Every cross-domain reference is explicitly tenant-checked.

## Candidate tables (proposals, not final migrations)
`clinics, clinic_settings, profiles, clinic_memberships, membership_roles, patient_account_links, patients, patient_consents, leads, contact_interactions, services, clinical_resources, resource_availability, slot_holds, appointments, appointment_history, encounters, clinical_notes, clinical_note_versions, treatment_cases, treatment_plan_versions, case_phase_instances, workflow_templates, workflow_template_versions, workflow_step_definitions, workflow_instances, workflow_step_instances, tasks, task_assignments, task_templates, staff_shifts, staff_competencies, care_team_assignments, lab_work_orders, quotes, invoices, payments, payment_allocations, documents, document_releases, conversations, messages, notifications, capture_sessions, ai_processing_audit, approval_requests, audit_events, outbox_events, outbox_delivery_attempts`.

## Data integrity standards
- UUID identity, consistent `clinic_id`, UTC timestamps, actor identifiers and explicit status enums.
- Use DB unique/exclusion/transaction constraints for mutually exclusive booked resources; don't rely on React availability state.
- Use multiple phase instances or iteration IDs for repeated orthodontic checks; don't pretend one linear phase per service.
- Signed clinical notes use append-only amendment/version history; no silent overwrites.
- Keep patient-safe timeline projection distinct from the internal detailed workflow and approval feed.
- Source of truth is clinical event/approval, not AI-inferred journey progress.
- Contracts and events must include type and version; correlate task, visit and case IDs.

## Domain event baseline
`LeadCreated`, `AppointmentRequested`, `AppointmentConfirmed`, `PatientCheckedIn`, `PatientCalled`, `PatientRoomed`, `ConsultationStarted`, `EncounterSigned`, `TreatmentPlanApproved`, `TaskAssigned`, `TaskCompleted`, `LabWorkReceived`, `LabQCApproved`, `PatientDocumentReleased`. Consumers independently track idempotence.
