# M09 Aftercare, feedback, and review decision packet

**Status:** preparation only. No aftercare vocabulary, clinical escalation protocol, privacy basis, retention period, outbound message, or activation is approved by this packet.

**Purpose:** record the clinic, clinical, and privacy decisions needed before the MVP can persist or communicate after-visit follow-up. The packet derives its requirements from Flow F and CRM-MVP-09 in `docs/EliteSmile_OS_CRM_MVP_and_Codex_Prompt.md`; source workflow steps are organizational requirements, not automatically approved clinic procedure.

## Fixed requirements from the product specification

- An authorized staff member confirms the relevant visit/journey stage is complete and assigns a follow-up with a due date.
- Only clinician-approved instructions may be released to a patient.
- A patient concern is routed to an authorized clinician with an owner and remains unresolved until handled.
- Staff record contact attempts, outcomes, recall dates, and next actions.
- Private feedback and complaints are separate from public reviews; complaints have an owner, response, and resolution history.
- Eligible patients receive the same voluntary public-review invitation regardless of private rating. Opening a review link does not prove that a review was submitted.
- No automated diagnosis, treatment advice, urgency classification, or unapproved patient instruction may be inferred from a follow-up, message, or feedback.

These requirements do not define the clinic's operational vocabulary, permissions, approved text, legal basis, or retention. Do not turn examples or source-derived process steps into production rules without the accountable reviewer.

## Decisions required

| Decision | Questions for the accountable reviewer | Required record |
| --- | --- | --- |
| Entry and linkage | Which verified visit/journey states permit an aftercare task? Who may confirm the state? What happens if a visit or patient link is corrected or revoked? | Exact entry state, authority, evidence, correction behavior, and owner |
| Administrative follow-up | What task types, contact-attempt outcomes, recall states, due-date rules, and closure transitions are allowed? Which fields are necessary, and may staff enter free text? | Vocabulary, transition table, permitted fields, actor, and patient wording |
| Assignment and access | Who may create, assign, reassign, complete, reopen, and view a follow-up? Does authority depend on current ownership and active same-clinic membership? | Role/action matrix, ownership boundary, revocation behavior, and audit fields |
| Contact and consent | Which channels may be used? How is permission to contact verified and withdrawn? Which saved patient preferences are authoritative? Are reminders or retries allowed? | Consent evidence, channel rules, approved template/version, send authority, retry rules, and suppression behavior |
| Clinical concerns | What counts as a concern that must be routed to a clinician? Who receives it, who owns the response, and what action confirms it is handled? Which clinical response rules require a separate clinician protocol? | Clinician-approved concern vocabulary and routing/ownership contract; no inferred triage or patient advice |
| Feedback and complaints | Who can access private ratings and complaint details? How is a complaint owned, answered, corrected, escalated, and resolved? What can the patient see? | Separation from public review, role access, status transitions, response text, and audit trail |
| Public-review invitation | Define eligibility, approved neutral wording, channel, timing, consent, opt-out, and proof limits. Confirm that private feedback never changes invitation eligibility or wording. | Identical invitation policy, template/version, send authority, and evidence that opening is not treated as submission |
| Retention and privacy | What minimum aftercare, concern, complaint, and feedback data is retained? Who may inspect history? What are the deletion, correction, export, and audit rules? | Purpose, visibility, retention/deletion period, correction/export rules, and named privacy/legal approver |

## Review ownership

- **Clinic product owner:** operational task vocabulary, assignment, due dates, roles, and non-clinical transitions.
- **Licensed clinical lead:** concern definition/routing, any clinical escalation or response rule, and approval of every patient-facing clinical instruction.
- **Privacy/legal reviewer:** contact consent, sensitive feedback visibility, patient rights, retention/deletion, and any applicable Moroccan requirements.
- **Messaging/communications owner:** approved channel, template version, delivery, retry, opt-out, and proof-of-send semantics if a provider is later authorized.

Record each decision with the exact approved value, permitted actor, transitions, evidence, patient-facing text, effective date, policy version, approver name/role, and unresolved follow-up. Use `unresolved` when authority or approval is missing. Keep operational, clinical, and privacy approvals separate.

## Implementation boundary until decisions are recorded

- The existing `/aftercare` local screen remains a fictional, non-persistent demonstration only.
- Do not add API writes, database rows, patient/appointment linkage, outbound sends, scheduled reminders, patient-visible messages, clinical instructions, or automatic escalation based on this packet.
- Do not infer urgency from patient text or feedback. Any clinical concern remains subject to a clinician-approved process.
- Do not use a positive private rating to determine who receives an invitation, and do not claim that opening a link verifies a public review.
- The M09 delivery gate still requires verified patient/visit linkage, tenant and role isolation, durable local PostgreSQL, audit/outbox behavior, and privacy/clinical review as applicable.
