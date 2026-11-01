# Treatment cases and patient journey decision packet (M05)

**Status:** preparation only. No treatment protocol, case-state vocabulary, clinical approval, patient publication rule, or lab workflow is approved here.
**Scope:** decisions needed to implement multiple clinic-scoped cases per patient, immutable plan revisions, auditable case phases, and explicitly released patient milestones.
**Sources:** `docs/EliteSmile_OS_CRM_MVP_and_Codex_Prompt.md`, sections 2, 3.1 and 11; `docs/04_MODULE_PRD.md` (M05); `docs/03_MASTER_WORKFLOWS.md` (GJ-03); `docs/05_DOMAIN_MODEL.md`; `docs/09_SECURITY_SAFETY.md`; project `AGENTS.md`.

## Current implementation boundary

The repository has no connected M05 case/plan schema or lifecycle. Synthetic patient journey panels elsewhere are illustrative examples, not persisted cases, approved plans, visit histories, clinical progress, or patient links. The conceptual domain model is not a migration or an authorization to create every listed table. The M05 PRD calls for multiple plans/cases per patient, immutable revisions, and auditable case phases; clinical content and patient publication still need the licensed reviewer.

## Decision owners

- The licensed clinical lead approves clinical authorship, plan content, phase vocabulary, allowed transitions, treatment/visit dependencies, clinical completion, and any rework or restart rules.
- The clinic product owner defines administrative ownership, case coordination and patient-facing administrative workflow within clinician authority.
- The privacy/legal reviewer decides access, patient publication boundaries, retention, correction and deletion for case/plan records and audit history.
- The appointment/scheduling lead decides how a case references confirmed appointments and how cancelled, rescheduled or repeated visits affect case coordination; clinical consequences remain with the licensed clinical lead.
- A laboratory lead may review the wording and permitted use of a manual external-lab dependency note. This packet does not create or authorize laboratory automation.
- Finance/accounting decides any quote/invoice association. A payment or financial state never proves clinical phase completion or treatment acceptance.

## Decisions to record

| Decision | Bounded question | Accountable review |
|---|---|---|
| Case opening and source | Which approved administrative event may open a case? Is a patient request or selected service merely interest until a clinician reviews it? What verified patient and clinic linkage is required, and how are duplicate or mistaken cases corrected without silently merging records? | Licensed clinical lead; clinic owner; identity/privacy reviewer |
| Multiple cases and ownership | Can one patient have concurrent cases? Which case identifiers and ownership model are used? Who may assign/reassign a coordinator and clinical owner, and what should happen when an owner leaves or is unavailable? | Licensed clinical lead; clinic owner/team lead |
| Case-state vocabulary | Which exact states and transitions are required (including review, acceptance, active, paused, completed and closed)? Which actor/evidence confirms each transition? How are cancellation, patient deferral, repeat visit, failed prerequisite, clinician change and reopening represented? | Licensed clinical lead; clinic product owner |
| Plan versions and approval | What constitutes a new immutable plan version? Which licensed roles may draft, review, approve, supersede or withdraw a version? What evidence binds patient acceptance, clinical approval, estimate version and effective date? Can an approved plan be amended, and how are prior versions retained? | Licensed clinical lead; privacy reviewer; finance lead for quote linkage |
| Phase and milestone definitions | Which phase names/dependencies are clinically approved for each versioned journey? What event and authorized actor confirm phase start/completion, blocked state, repetition or rework? Which prerequisites cannot be skipped, even if staffing is limited? | Licensed clinical lead; clinic product owner |
| Appointment/encounter links | Does a case phase require a confirmed appointment or a signed encounter? Which appointment/encounter states can satisfy a dependency? How are cancelled, rescheduled, duplicate, unrelated or corrected references handled? | Licensed clinical lead; scheduling lead; identity reviewer |
| Patient-visible progress | Which exact plain-language milestones may be published, by whom, after what clinical approval/evidence, for which patient or authorized delegate? How are draft, internal, superseded and corrected status kept private? | Licensed clinical lead; privacy reviewer; clinic product owner |
| Pause, resume, close and correction | Who can pause/resume/close a case, what reasons are approved, which actions remain available while paused, and what evidence is required to correct a mistaken event or reopen a closed case? Never overwrite signed approval history. | Licensed clinical lead; privacy reviewer; clinic product owner |
| External-lab dependency | Is a manual note needed to explain an appointment dependency, and which nonclinical metadata may it contain? Who can view/correct it and when is it cleared? Confirm that it triggers no dispatch, production, QC, inventory or supplier workflow. | Clinic owner; licensed clinical lead; laboratory lead; privacy reviewer |
| Retention, audit and access | Which reads/writes/approvals/publications are audited, which minimum fields are retained, who may read/export them, and what correction/deletion/retention schedule applies to cases, plan versions, milestones and audit events? | Licensed clinical lead; privacy/legal reviewer; clinic owner |

## Fixed requirements; not clinic policy

- Keep inquiry, patient, appointment, encounter, case, task, document, quote and payment state machines separate. A service interest is not a diagnosis, approved plan, case acceptance, confirmed booking or completed treatment.
- One patient may have multiple independent cases and many appointments; a visit may exist without a treatment case. Verify every cross-domain reference within the same tenant and patient scope.
- Runtime work must pin an immutable approved template/plan version. Do not silently mutate an active plan or reinterpret an existing case when a template changes.
- Clinical approval belongs to an authorized clinician. Manager, owner, finance or operations status does not confer clinical authority. Administrative milestone changes never authorize treatment.
- Workflow states must reflect confirmed real-world actions, with actor and server time. Calling, booking, arrival, consultation start and clinical completion remain distinct.
- Patients see only explicitly released and approved plain-language milestones. Internal tasks, draft plans, staff comments, lab details, unreleased notes and other patients' information remain private.
- Keep financial approval independent from clinical approval. Quote acceptance/payment is not plan approval or treatment completion.
- Any external-lab mention remains a manual explanatory note only. Laboratory automation is explicitly out of scope; no lab state is inferred from a note or appointment.
- AI, if introduced in a separate approved scope, may draft suggestions only. A human clinician approves every consequential clinical change or publication.
- Use synthetic, visibly fictional scenarios for local previews. Do not infer diagnosis, treatment, clinical protocol, mandatory phase, patient instruction or real-world progress.

## Implementation gates by capability

| Capability | Can proceed locally now | Gate before connected acceptance/activation |
|---|---|---|
| Synthetic journey illustration | Yes, if unmistakably fictional, non-persistent, and not attributed as a patient's actual treatment | No PRD case/clinical coverage credit |
| Case and plan contracts/schema | Only after the licensed reviewers define the minimum lifecycle, and privacy defines access/retention; default deny until then | Approved case/plan vocabulary and transitions, tenant-scoped schema, role/patient isolation, immutable version strategy, audit/outbox and local PostgreSQL/RLS tests |
| Phase progression and appointment dependencies | Contract preparation only; no real progression inferred from a UI or payment | Clinician-approved phase evidence and scheduling/encounter state contract; concurrency and invalid-transition tests |
| Patient-visible milestones | Static empty state or synthetic examples only | Explicit clinician publication approval, patient/delegate authorization, revoked-access behavior, no-store and audit tests |
| External-lab dependency note | Optional local mock wording only, with no automation or real order | Clinic/lab/clinical/privacy review of allowed metadata and visibility; must stay independent of laboratory production workflow |

## Decision record template

For each row above, record: approved value/vocabulary; permitted actor and qualification; allowed transition; required evidence; affected immutable plan/template version; patient-facing wording and publication approver; effective date and policy version; approver name/role; retention/correction rule; unresolved exceptions. Mark unknown rules `needs review`. Do not import checklist examples as approved clinical protocols.

## Preparation boundary

This packet authorizes no diagnosis, treatment plan, clinical case, patient milestone, patient link, appointment or encounter mutation, lab dispatch/status, migration, database write, hosted access or release. It prepares the reviewer decisions needed before a connected M05 implementation can be safely specified.
