# Team permissions, qualifications and staffing decision packet (M16)

**Status:** preparation only. No clinic-wide role/action matrix, qualification rule, staffing policy, approval delegation, or employee-data retention policy is approved by this packet.
**Scope:** decisions needed to complete tenant-scoped staff access and task staffing while preserving separation between administrative, clinical and financial authority.
**Sources:** `docs/EliteSmile_OS_CRM_MVP_and_Codex_Prompt.md`, sections 3.3, 7.1 and 7.3; `docs/04_MODULE_PRD.md` (M16); `docs/03_MASTER_WORKFLOWS.md`; `docs/05_DOMAIN_MODEL.md`; `docs/09_SECURITY_SAFETY.md`; `docs/TEAM_ROSTER_V1_CONTRACT.md`; `docs/TEAM_ACTIVITY_V1_CONTRACT.md`; project `AGENTS.md`.

## Current implementation boundary

The repository includes a read-only team roster/activity foundation and local synthetic access, assignment and approval previews. These do not constitute the permission editor, complete role/action enforcement, verified staff qualifications, shifts/availability, safe task delegation, or connected approval workflow. A hidden menu is not authorization; connected permissions must be enforced in server handlers, domain services, queries, file access, background work and database policies. Existing per-command scopes already approved for M01 do not authorize broader M16 access.

## Decision owners

- The clinic owner defines the administrative role catalogue, clinic/multi-clinic scope, management responsibilities, invitations, staffing and routine delegation.
- The licensed clinical lead defines evidence of clinical qualification, clinician-only actions, clinical coverage requirements and clinical task delegability. A manager/owner title grants no clinical authority.
- The finance lead and accountant define who can issue/approve quotes, collect, allocate, refund, reconcile, view totals and export financial records. A cashier title alone grants no refund, price-approval or clinic-wide reporting power.
- The privacy/legal reviewer decides employee/staff data minimization, access and audit visibility, retention/deletion, export, session revocation and applicable review obligations.
- The clinic product owner coordinates cross-domain defaults but cannot approve clinical or legal matters outside their authority.

## Decisions to record

| Decision | Bounded question | Accountable review |
|---|---|---|
| Role catalogue and clinic scope | Which staff role names exist, can one member hold several roles, can a person join multiple clinics, and how is active clinic context selected? Which rules are clinic-specific versus platform-wide? Role names shown in the PRD are examples to review, not a pre-approved grant matrix. | Clinic owner; privacy reviewer |
| Permission model | For each module/action, who may view, create, edit, assign, approve, export, publish, collect, refund, reconcile or configure? Which permissions require patient/task assignment, qualification, current shift or additional approval? How are default-deny, role combination and conflict rules expressed? | Clinic owner; clinical lead; finance lead/accountant; privacy reviewer |
| Clinical qualifications and authority | Which roles/verified qualifications may author, review, sign, amend or publish each clinical record/action? What evidence is checked, by whom, at what interval, and what happens on expiry, suspension or disputed status? | Licensed clinical lead; privacy reviewer |
| Financial authority | Which separately granted roles/actions may price, request/approve an override, issue a quote/invoice, record or verify payment, allocate, refund, reconcile, see clinic totals or export? Which segregation-of-duties conflicts require another approver? | Clinic owner; finance lead/accountant; privacy reviewer |
| Invitations and membership lifecycle | Who may invite staff, for which clinic/role/scope, using what expiration and local email-sink behavior? Who activates, suspends, revokes, changes roles and restores access? How are replay, wrong recipient, expired invite, last administrator and stale sessions handled? | Clinic owner; identity/security reviewer; privacy reviewer |
| Patient and task scope | How are assigned-patient, assigned-task, team, shift and clinic-wide scopes granted/revoked? Are temporary exceptions allowed, with which reason and expiry? Does every request recheck current membership and assignment? | Clinic owner; clinical lead; privacy reviewer |
| Shifts and availability | What shift, leave, availability, location and team-assignment information is captured? Who may view/change it, how current must it be, and how are schedule conflicts and absence handled? | Clinic owner/staffing lead; privacy/employee-data reviewer |
| Task qualification and delegability | Which task types require verified skills, which can be delegated, and which remain clinician-only? What happens when nobody qualified is available or an assistant arrives mid-task? No mandatory clinical step may be removed to accommodate staffing. | Licensed clinical lead; clinic owner/staffing lead |
| Delegation and approvals | Who can delegate, accept, reassign, cover absence, request approval and act as a substitute? Which approvals are nondelegable? How are separation of duties, duplicate action and approval of one's own work handled? | Clinic owner; licensed clinical lead; finance lead/accountant |
| Permission changes and stale sessions | When does a permission change take effect? Which tokens/requests/cached UI are invalidated, and how are in-flight actions handled? How are tenant and object-ID negatives enforced, including direct endpoints, storage, exports and background work? | Identity/security reviewer; privacy reviewer; clinic owner |
| Audit and staff-data retention | Which grants, denials, reads, changes, approvals, assignments, exports and overrides are audited? Which minimal fields are retained, who can inspect them, for how long, and how are correction/deletion requests handled without turning the journal into a performance score? | Privacy/employee-data reviewer; clinic owner; clinical/finance reviewers for their actions |
| Emergency/exception access | Is any break-glass path needed? If so, which exact emergency criteria, permitted actors, fields, time bounds, notification and independent retrospective review apply? If not approved, access remains denied. | Clinic owner; licensed clinical lead; privacy/legal reviewer |

## Fixed requirements; not clinic policy

- Enforce tenant isolation/default deny at each backend and data-access boundary. Never trust a caller-supplied `clinic_id`, `patient_id`, role claim or editable user metadata as authority. Check foreign/object identifiers from another tenant in negative tests.
- Apply least privilege and current active membership on every sensitive operation. Revocation/suspension must affect subsequent requests even with stale token claims. Menu visibility is never the security boundary.
- The user's approved M01 inquiry-contact outcome boundary is specific: active same-clinic current owner with Reception, Manager or Dentist membership may record the approved factual event; Assistants are excluded. This does not establish the global M16 matrix or clinical authority for a role.
- Only verified, qualified and authorized clinicians approve/sign clinical notes, plans, treatment, instructions or patient publication. Operations manager/owner status is not a clinical qualification.
- Financial approval is separate from clinical approval. Cash collection does not imply refund, discount, reconciliation, report or export permission.
- Staffing decisions consider qualification, shift, team assignment, availability and task delegability. A solo practice or absent assistant never disables a required clinical gate.
- Critical actions must commit audit and transactional outbox events with the domain write, and consumers must be idempotent. No raw patient/clinical content or secrets belong in team activity evidence.
- Task states describe confirmed actions; assignment, calling, arrival, consultation start and clinical completion are distinct.
- Invite delivery remains local/simulated until a provider is explicitly configured and approved. This packet does not authorize real email or other messages.
- Synthetic roster/shift/permission examples must be labeled as examples and grant no real access. Do not claim employee-law compliance or a legal retention period without qualified review.

## Implementation gates by capability

| Capability | Can proceed locally now | Gate before connected acceptance/activation |
|---|---|---|
| Synthetic roster/assignment/access previews | Yes, with fictional staff and explicit simulation labels | No proof of permissions, qualification or delegation; no PRD credit unless its exact criterion is verified |
| Role/action contract and permission editor | Requirements/contract preparation only; default deny | Approved role/action matrix, conflict rules and clinic scope; API/RLS tests for allowed and denied actions and cross-tenant object IDs |
| Staff invitation/membership lifecycle | Local UI or email-sink fixture only | Approved actors/expiry/revocation, verified identity integration, abuse/replay handling and immediate access-revocation tests |
| Clinical approvals and staffing | No enabled clinical workflow; only static capability boundaries | Licensed clinical lead's qualification evidence, task/approval/delegation rules, absence cases, role negatives and transactional audit/outbox tests |
| Finance approvals and reporting | Fictional preview only | Finance/accountant permission matrix and segregation-of-duties decisions; tenant/patient/drawer/report negative tests |
| Shift and workforce data | Synthetic examples only | Approved data fields, access/retention and applicable employee-data review; qualification and conflict-resolution rules |
| Audit journal, export and break-glass | Existing narrow journal remains limited to its documented actions | Approved event/visibility/retention/export and emergency policy; complete read/export auditing, independent review, redaction and idempotency tests |

## Decision record template

For each row above, record: exact role/action/scope; allowed and denied cases; qualification evidence and verifier; permitted delegator/approver; required audit/outbox evidence; effective date and policy version; approver name/role; revocation/session behavior; retention/deletion rule; unresolved exceptions. Mark unknown rules `needs review`. Do not convert PRD role examples into grants by inference.

## Preparation boundary

This packet authorizes no role grant, staff invitation, access expansion, shift/qualification record, task delegation, clinical or financial approval, break-glass operation, new data capture, migration, hosted access or release. It prepares a reviewable permission matrix before implementation so the shared multi-tenant foundation remains consistent across modules.
