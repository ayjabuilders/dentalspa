# Decisions needed to complete the pilot MVP

This index consolidates the clinic choices that currently gate implementation of the remaining P0 behavior. It does not approve a workflow, clinical protocol, privacy basis, or release. The local preview can continue with clearly fictional data; connected clinic and patient behavior needs the accountable review below.

The product owner confirmed they can approve operational rules. Clinical and privacy decisions remain with the designated clinician and privacy reviewers. On 2026-10-29, the product owner approved D1 in the patient-selection packet: a saved choice means “possible match,” with identity still unverified. The owner also approved the six factual contact labels, explicitly excluded urgency/triage and conversion, approved a current-owner actor boundary (active same-clinic Reception/Manager/Dentist; Assistants excluded), and approved an append-only history of completed contacts containing only the selected factual label, server timestamp and verified author; repeated labels are allowed, with no free text or qualification/closure state. These decisions permit a default-off connected API/database draft, but not activation. Privacy review must still approve who can view the history and its retention/deletion period. Clinical and other remaining rule values remain unapproved.

## Existing policy packets

| Area | Decisions to record | Accountable review | Current source |
| --- | --- | --- | --- |
| Inquiry qualification and conversion (M01) | Approved service vocabulary, patient-stated timing language, qualification and factual outcome states, who may change them, duplicate-safe conversion criteria, retention and patient-facing wording | Clinic product owner; privacy reviewer for retention and visibility | [Inquiry outcome packet](INQUIRY_OUTCOME_DECISION_PACKET.md) |
| Patient identity and duplicate resolution (M01/M02) | Identity evidence, ambiguous-match handling, who may resolve a match, when an inquiry may be linked to an existing patient, and denial/review behavior | Clinic owner and designated identity/privacy reviewer | [Patient selection packet](PATIENT_SELECTION_DECISION_PACKET.md) |
| Patient administrative profile and timeline (M02) | Minimum profile fields, contact provenance/correction, preference-versus-consent use, role visibility, family boundaries, administrative event vocabulary, read audit, retention and patient correction/display | Clinic product owner; privacy/legal reviewer; identity reviewer for associations; licensed clinical lead for clinical material | [Patient profile packet](PATIENT_PROFILE_DECISION_PACKET.md) |
| Patient Pass and administrative intake (M03) | Enrollment/linkage and recovery; family/guardian grant scope and revocation; administrative fields and consent evidence/withdrawal; patient-visible projections; uploads/release; booking requests; access and retention | Clinic owner/intake lead; identity and privacy/legal reviewers; licensed clinical lead for clinical publication; finance lead/accountant for patient finance | [Patient Pass packet](PATIENT_PASS_DECISION_PACKET.md) |
| Booking resources and confirmation (M02) | Service durations, clinician/chair/room/equipment requirements, opening hours and buffers, holds, expiration, confirmation, cancellation, rescheduling and waiting-list behavior | Clinic owner and scheduling lead; clinical reviewer where service rules affect care | [Resource rules packet](RESOURCE_RULES_DECISION_PACKET.md) |
| Clinical encounter and publication (M04) | Authorized clinicians, encounter-to-appointment/patient link, note/template scope, sign/amend lifecycle, media references, consent, patient release and retention | Licensed clinical lead; privacy reviewer for patient access/retention; clinic product owner for administrative workflow | [Clinical encounter packet](CLINICAL_ENCOUNTER_DECISION_PACKET.md) |
| Treatment cases and plans (M05) | Case/plan lifecycle and version approval; clinical phase evidence/dependencies; appointment/encounter links; patient milestone publication; pause/rework/correction; optional manual lab-dependency note; access and retention | Licensed clinical lead; clinic owner; scheduling lead; privacy reviewer; laboratory lead only for a manual note; finance reviewer for quote linkage | [Treatment case packet](TREATMENT_CASE_DECISION_PACKET.md) |
| Team permissions and staffing (M16) | Tenant-scoped role/action matrix; verified clinical qualifications; finance segregation; staff invitation/revocation; patient/task scope; shifts/delegation; audit/export/retention and emergency access | Clinic owner; licensed clinical lead; finance lead/accountant; identity/security and privacy/employee-data reviewers | [Team permissions packet](TEAM_PERMISSIONS_DECISION_PACKET.md) |
| Aftercare, feedback, complaint, and review (M09) | Verified visit eligibility; assigned task types, factual outcomes and due dates; permitted actors; consent/channel/templates; clinician concern routing; complaint/feedback visibility and resolution; neutral review invitation eligibility; retention and correction | Clinic product owner for administrative workflow; licensed clinical lead for concern handling/instructions; privacy/legal reviewer for contact, feedback, visibility and retention | [Aftercare packet](AFTERCARE_DECISION_PACKET.md) |

## Decisions still to capture

| Area | Decisions needed before implementation | Accountable review |
| --- | --- | --- |
| Patient forms and consent (M03) | Exact administrative fields and their purpose; mandatory/optional status; consent text, scope, version, withdrawal and access; retention; approved languages | Clinic owner and designated privacy/legal reviewer |
| Patient Pass access, documents and publication (M03) | Verified enrollment/linkage and recovery; adult/minor delegate evidence, scopes and revocation; patient-visible projections; private uploads and release; booking request versus confirmation; per-domain access and retention | Clinic owner/intake lead; identity and privacy/legal reviewers; licensed clinical lead for clinical material; finance lead/accountant for financial content |
| Patient administrative profile and timeline (M02) | Minimum personal/contact fields, provenance and corrections, role-specific visibility, admin timeline scope, family boundaries, read audit, patient display, retention/deletion and approved patient wording | Clinic owner and designated privacy/legal reviewer; licensed clinical lead for clinical data |
| Clinical encounter and publication (M04) | Authorized clinician roles; permitted note sections; signing, amendment and version rules; appointment/case links; which approved content may be released to a patient and by whom | Licensed clinical lead, with privacy/legal review for patient publication |
| Treatment cases and plans (M05) | Approved case states, plan versioning and approval roles, patient-visible milestones, pause/resume/rework rules and any manual external-lab dependency note | Licensed clinical lead; clinic owner; scheduling lead; privacy reviewer; laboratory lead only for a manual note |
| Aftercare, feedback, complaint, and review (M09) | Verified entry/linkage; operational task and contact vocabulary; role/action matrix; clinical concern ownership; consent and approved neutral messages; private feedback access; complaint response/resolution; invitation eligibility; retention, deletion and correction | Clinic product owner; licensed clinical lead; designated privacy/legal reviewer; communications owner |
| Fees and finance (M14) | Approved service catalogue and prices; quote revisions/discount approvals; payment and allocation evidence; receipt, refund and correction states; CNSS/insurance paperwork scope; role access and retention | Clinic owner and finance lead; accountant/legal review where required |
| Permissions and staffing (M16) | Role/action matrix; verified qualification evidence; shift/availability capture; task delegability; assignment and approval authority; invitation/revocation; delegation/absence; audit/export, retention and emergency-access rules | Clinic owner; licensed clinical lead; finance lead/accountant; identity/security and privacy/employee-data reviewers |

## How to supply decisions

For each row, provide the approved vocabulary, permitted actor, allowed transition, required evidence, patient-facing wording, retention period, and the name/role of the approver. Mark an item “needs review” when the correct authority is not yet known. Sample PDFs and synthetic demo data are not approvals.

The first operational decision that can be supplied is D1–D8 in the [patient selection packet](PATIENT_SELECTION_DECISION_PACKET.md). Its recommended values create only a reviewed, identity-unverified inquiry association. The packet explicitly leaves booking confirmation, patient creation and Patient Pass linkage as separate transitions.

For M14, use the [Finance decision packet](FINANCE_DECISION_PACKET.md) to record service/pricing, invoice, payment, access and retention rules. It contains requirements-derived invariants and reviewer prompts, not pre-approved values.

## D1–D8 in plain English

D1–D8 are eight safeguards around one future action: **a staff member finds an existing patient while handling an inquiry and records that the inquiry may refer to that patient**. They are not eight new features, and they are not required to demonstrate the local app with fictional profiles. The local demo must keep this association disabled until the applicable policy is approved.

| Decision | Plain-language question | Packet recommendation (not yet approved) |
| --- | --- | --- |
| D1 | Does saving the choice mean “reviewed as a possible match” or “identity verified”? | Save only a reviewed, explicitly unverified association. |
| D2 | Does permission to search also allow someone to save or correct the association? | Give saving/correction a separate permission. |
| D3 | How do we fix a mistaken association? | Revoke it, preserve the history, and review again. |
| D4 | What happens if a possible duplicate is found when creating a patient? | Stop and send it for manual review; do not bypass it. |
| D5 | If creation is later approved, who chooses the new patient reference? | Have the server generate an opaque reference. |
| D6 | Can an old review be used after the inquiry or permissions change? | Recheck the current record and authority when saving; do not invent a time limit. |
| D7 | What evidence should be kept? | Keep only minimal decision metadata; do not copy sensitive inquiry content into logs. |
| D8 | Does saving the association also book, create an account, or send an invitation? | No. Each of those needs its own approved action. |

These recommendations explain a conservative path; they do **not** record the owner's approval. Identity evidence, access roles, privacy visibility and retention still need the designated reviewers where applicable. None of these decisions can authorize clinical content or appointment confirmation.

No diagnostic criteria, prescriptions, clinical instructions, treatment protocol, service durations, prices, or legal conclusions are assumed by this index. The source requirements and unknowns remain tracked in [clinic discovery](02_CLINIC_DISCOVERY.md), [the module PRD](04_MODULE_PRD.md), and [the Build Center](BUILD_CENTER.md).
