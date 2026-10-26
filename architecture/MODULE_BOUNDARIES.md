# Modules and permissions — engineering boundaries

| Bounded context | Owns | Reads from | Emits | Must not do |
|---|---|---|---|---|
| Identity | user membership, permissions, patient account linkage | Auth provider | MembershipActivated | infer role from UI |
| Patients | patient identity and contact | identity | PatientCreated | own medical diagnosis |
| Acquisition | inquiry/lead and owner | patients | LeadQualified | auto-ingest unverified social APIs |
| Scheduling | appointment/resource availability | patients, identity | AppointmentConfirmed | allow constrained double booking |
| Workflow | templates, tasks, instances | scheduling, clinical, team | TaskCompleted | bypass signed clinical gates |
| Clinical | encounters/notes/signatures | patients, scheduling | EncounterSigned | auto-publish AI drafts |
| Cases | plan versions, phase milestones | clinical, workflow | CasePhaseCompleted | treat marketing interest as approved plan |
| Finance | invoices/payment ledger | cases, patients | InvoiceIssued | approve diagnosis |
| Documents | private file metadata/releases | clinical, cases | DocumentReleased | grant patient access by file path guess |
| Comms | staff and patient conversations | identity, patients | MessageSent | leak medical details in push titles |
| Lab (future) | lab job QC state | cases, documents | LabQCApproved | sign clinical fitting decisions |
| AI (future) | draft proposals/trace | authorized APIs | SuggestionPrepared | write clinical DB directly |

Cross-module sync reads must pass public services/read projections; no repository imported from foreign module to write its tables.
