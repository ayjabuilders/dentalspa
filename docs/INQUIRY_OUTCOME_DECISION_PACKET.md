# Inquiry qualification and outcome decisions

Status: limited product-owner decisions recorded for the factual contact-outcome vocabulary, an owner-scoped operational actor rule, and a minimal append-only event model. The product owner explicitly excluded urgency/triage and patient conversion. Connected visibility and retention approval remains outstanding, so the connected API/database path stays disabled. Service capture, qualification, closure and reporting remain unapproved. This is not an approved clinical or complete operating protocol.

## Current safe boundary

- An inquiry is an administrative first contact. It is not a patient record, diagnosis, consultation, appointment, or treatment plan.
- Staff may record only events that actually occurred. An attempted call does not mean the patient was reached; a patient request does not mean a service is clinically indicated; a booking option does not mean an appointment is confirmed.
- No service catalog, clinical urgency taxonomy, qualification status model, connected result transition, patient-facing wording, or retention rule is approved. The local demo may display only the approved factual vocabulary in ephemeral synthetic state.
- The append-only event shape is approved as a proposed bounded administrative record: one event for each manually completed contact, server timestamp, selected factual label, verified actor, repeated labels allowed, and no free text or inquiry qualification/closure state. This product decision does not settle who may view historical events or how long they may be retained.
- Patient selection and identity correction remain gated by `PATIENT-SELECTION-POLICY`. Appointment confirmation remains gated by the patient-selection and resource-rules decisions.

## Decisions required

| Topic | Decision to approve | Required reviewer |
| --- | --- | --- |
| Requested service | Clinic-managed label list, patient-stated wording, version owner, and whether any value is clinical information | Clinic product owner; clinical reviewer for clinical terms |
| Timing / urgency | Whether to collect a preferred time window only, whether an urgency field is needed, exact patient-facing definitions, and any separately approved escalation protocol | Clinic product owner; clinical lead for triage language |
| Qualification states | Exact states, allowed transitions, evidence required, authorized roles, and how stale or disputed information is corrected | Clinic product owner; clinical reviewer where a state implies a clinical decision |
| Contact outcome | Approved: factual labels; active current inquiry owner with Reception, Manager or Dentist role in the same clinic; Assistants excluded; append-only event per completed contact with server time, selected label and verified actor; duplicates are allowed. No free text, qualification/closure state, urgency, triage or conversion. Privacy reviewer must still approve history visibility and retention before connected activation. | Clinic product owner; privacy reviewer for retention/visibility |
| Conversion | Conditions that create or link a patient, duplicate-resolution authority, reference generation, correction/reversal and audit requirements | Clinic product owner; identity policy approver |
| Closure / reopening | Allowed closure reasons, who may close, when an inquiry may reopen, and how a prior result is retained | Clinic product owner |
| Visibility and retention | Which roles can see each field and history; retention/deletion rules; whether any patient-facing publication is permitted | Clinic privacy owner and clinic product owner |
| Reporting | Approved definitions for conversion, contact, qualification and time-to-result; excluded or censored cases | Clinic product owner |

## Approval record

On 2026-10-29, the clinic product owner approved this bounded vocabulary for a local synthetic preview: **Sans tentative**, **Tenté sans réponse**, **Joint**, **A demandé un rappel**, **A refusé**, and **Impossible à poursuivre**. The same approval explicitly excludes urgency/triage and conversion to a patient. No sequence, transition, evidence payload, patient-facing statement, retention period or connected write was approved. The preview therefore uses in-memory fictional examples only and does not update a real inquiry.

The product owner also approved the actor boundary for any future connected factual contact-outcome command: only the current owner of the inquiry with active Reception, Manager or Dentist membership in that same clinic; Assistants are excluded. This is an administrative data-entry permission only and grants no clinical authority. On 2026-10-29, the product owner approved a bounded append-only event model: each manually completed contact may append the selected factual label, a server-generated timestamp and the verified author; repeating the same outcome is allowed; free text and inquiry qualification/closure state are excluded. These choices authorize the code to be prepared behind independent default-off API and database switches, but not to record real clinic events. The record's visibility to other staff and retention/deletion period remain for privacy review and must be decided before either switch can be activated.

For each approved decision, record the approving person and authority, date, exact vocabulary/version, transition table, exceptions, patient-facing copy, access rules, retention rule, and evidence. The connected read/write endpoints and database RPCs remain unavailable unless both the server environment flag and private database setting are explicitly enabled; both default to off. For this multi-tenant SaaS boundary, the server supplies clinic scope from the verified actor; SQL independently checks active same-clinic membership/role and current inquiry ownership, locks membership through the transaction, conceals cross-tenant/absent inquiries, and exposes no direct table access. No hosted migration or setting change is part of this implementation. Until privacy approves history visibility and retention, keep both switches off and the relevant PRD capability partial. Do not infer emergency handling, diagnosis, treatment suitability, consent, reachability, patient identity, or conversion from an administrative status.

## Next technical slice after approval

The default-off API/database slice is drafted with tenant/owner authorization, append-only events, idempotency, and transactional minimal audit/outbox behavior. Remaining dependent work is privacy approval for history visibility and retention, independent PostgreSQL contention/pgTAP verification, a connected UI, and a reviewed activation plan. Clinical decision fields and patient publication require their own explicit approvals and must not be bundled into an administrative result command.
