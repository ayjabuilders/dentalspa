# Patient Pass and intake decision packet (M03)

**Status:** preparation only. No patient, guardian, consent, access, retention, or publication policy is approved by this packet.
**Scope:** decisions needed to complete the connected Patient Pass and administrative intake without creating a second identity system or exposing internal clinic data.
**Sources:** `docs/EliteSmile_OS_CRM_MVP_and_Codex_Prompt.md`, sections 2 (flows A and C), 5.1–5.3, 7.3 and 8; `docs/04_MODULE_PRD.md` (M03); `docs/09_SECURITY_SAFETY.md`; `docs/15_PATIENT_PASS_UX.md`; project `AGENTS.md`.

## Current implementation boundary

The existing Patient Pass remains the target application. The local preview includes an accessible three-step introduction, synthetic visit-preparation scenarios, a non-persistent communication-preference form, fictional administrative message examples, and other explicitly labeled demo content. Some verified own-account read and preference API boundaries exist, but connected appointment, form/consent, document, family-access, released clinical-content, finance and messaging workflows are not thereby accepted. Consult `docs/MODULE_PROGRESS.json` for criterion-level evidence; screens and synthetic profiles do not grant patient access or prove record linkage.

## Decision owners

- The clinic product owner and intake lead decide administrative fields, purposes, requiredness, patient wording, correction path, and administrative appointment-request behavior.
- The designated privacy/legal reviewer decides notice and lawful handling, consent evidence and withdrawal, sensitive-data minimization, access, retention/deletion, correction, and any required guardian/adult-delegate verification policy.
- The identity reviewer decides patient-account enrollment, recovery, linkage evidence, duplicate-account handling, and revocation procedures.
- The licensed clinical lead decides which clinical documents/instructions may be released, by whom, and under what approval evidence. Operational roles do not gain clinical authority from this packet.
- The finance lead/accountant decides which financial records may be shown to a verified patient or payer, subject to privacy review. Payer status alone grants no general patient-record access.

## Decisions to record

| Decision | Bounded question | Accountable review |
|---|---|---|
| Enrollment and identity linkage | How is an invitation issued, verified, expired, resent, revoked and recovered? What evidence binds the authenticated account to exactly one patient? How are an already-linked account, duplicate invitation, wrong-recipient attempt and support correction handled? | Identity reviewer; clinic owner; privacy reviewer |
| Patient self-access and session lifecycle | Which account states and active links permit access? What happens on suspension, link revocation, password recovery, device change and logout? Which UI/private state must be cleared immediately? | Identity reviewer; privacy reviewer |
| Family member and guardian access | Which relationship/authority evidence supports adult delegation or guardian access to a minor? Who verifies and records it, what distinct scopes may be granted (appointments, booking, documents, finance, forms), duration/expiry and revocation apply, and how is a change or dispute handled? | Clinic owner; identity reviewer; privacy/legal reviewer |
| Administrative forms | For each field, what exact purpose justifies it, is it required or optional, who can see/correct it, how is provenance shown, and what happens when it is missing or outdated? Separate contact preference from consent, reachability and permission to send. | Clinic owner/intake lead; privacy reviewer |
| Consent and acknowledgements | Which specific administrative consent/information statements are needed, in what approved language/version, for what purpose and channel? Who presents and records acknowledgement, what evidence/time/version is retained, how can a patient withdraw or correct it, and which operation stops after withdrawal? Distinguish acknowledgement from an identity check, contact preference and legal consent unless the reviewer explicitly defines them. | Clinic owner; privacy/legal reviewer |
| Patient-visible dashboard and timeline | Which appointment, administrative task, journey milestone, document, financial item or message is visible, to which verified subject/delegate, in what wording, and based on what source state? How are pending requests distinguished from confirmed actions? | Clinic owner; privacy reviewer; identity reviewer; clinician for clinical material; finance lead/accountant for financial material |
| Booking actions | Which patient actions create a request versus a confirmed booking? Which cancellation/reschedule requests are permitted and what server-confirmed states and patient-facing wording are returned? Do not expose or imply availability before resource rules and the transactional scheduling contract allow it. | Clinic owner/scheduling lead; clinician where service rules affect care |
| Document upload, review and publication | Which types may patients upload, allowed file formats/size, review/accept/correction states, metadata, private storage boundary, who can publish staff files, revocation and download audit? How are files retained/deleted and orphaned uploads handled? | Clinic owner; privacy reviewer; clinician for clinical material; finance reviewer for finance documents |
| Family/payer separation | Can a payer see only a named invoice/receipt, or other approved financial items? How is payer authorization recorded and revoked independently from patient/guardian access and clinical/document permissions? | Finance lead/accountant; clinic owner; privacy reviewer |
| Language, accessibility and notifications | Which approved French/Arabic wording and RTL behavior apply? Which notifications can be sent, through which explicitly enabled channel and consent state, and what content must never appear on a lock screen? | Clinic owner/communications owner; privacy reviewer |
| Retention, correction and audit | Retention/deletion periods by form, consent, relationship grant, document and message; correction/export access; patient/staff access audit scope, visibility and retention; legal hold/complaint handling. | Privacy/legal reviewer; clinic owner; identity and clinical/finance reviewers for their data |

## Fixed requirements; not clinic policy

- Extend the existing Patient Pass and authentication model. An authenticated account sees only its own explicitly verified patient link, or an explicitly current and authorized delegate grant. Name, phone, address, household label or payer status alone never establishes identity or family authority.
- Keep each family member's patient identifier and record separate. Check the current grant and allowed action on every request; revocation must prevent future access and clear private UI state.
- A booking request is not a confirmed appointment. The Pass must render server-authorized workflow state and must not invent availability, confirmation, completion, clinical instructions or delivery status.
- Patient content is an explicit projection, not the internal clinic event feed. Internal checklists, staff notes, unreleased clinical files, other-patient metadata, finance margins and clinic totals remain excluded.
- Staff-authored clinical material requires the responsible clinician's approval and explicit patient release. Only the authorized patient/delegate may access that released material.
- Files remain private, clinic/patient scoped and reauthorized on every download. Never place private records, authenticated pages, API responses or documents in service-worker caches. Offline mode may show only data-free public content.
- Administrative contact preference is not consent, contact permission, identity evidence or proof of reachability. Inbound contact alone does not create marketing consent.
- Keep demo values synthetic and clearly labeled. A UI preview or test fixture does not approve forms, legal wording, a guardian rule, retention schedule, clinical publication or a live workflow.

## Implementation gates by capability

| Capability | Can proceed locally now | Gate before connected acceptance/activation |
|---|---|---|
| Static/synthetic Patient Pass demonstrations | Yes, with clear fiction labels and no private data writes | None for the demo itself; never claim connected acceptance |
| Own-account shell/read boundary | Only against the already defined verified account/profile contract | Local PostgreSQL/RLS, session revocation and tenant/object negative tests for the complete connected path |
| Administrative form writes and consent records | Contract/UI preparation only; keep any unapproved behavior disabled | Approved field/purpose matrix, approved consent text/version, actor/evidence/withdrawal rules, privacy and retention decision, local DB/RLS/audit tests |
| Family/delegate member switching | Synthetic fixture only; no real grant or authority implication | Approved adult/minor policy, identity evidence, action scopes, expiry/revocation and cross-patient isolation tests |
| Patient uploads and staff publications | Static empty states / synthetic metadata only | Approved file policy and storage threat model, private bucket/RLS, malware/size/type validation, release authorization, reauthorization/download audit and retention/deletion tests |
| Patient appointment display and actions | Unconfirmed illustrative examples only | Approved scheduling rules, connected appointment projection, request-versus-confirmed contract and atomic resource-safe booking tests |
| Clinical and financial patient views | Hidden or explicit demo-only examples | Respective clinician/privacy or finance/accounting review plus connected authorization and release/role tests |

## Decision record template

For each row above, record: approved value/vocabulary; permitted actor; exact allowed transition; required evidence; patient-facing wording and approved languages; applicable patient/delegate scope; effective date and policy version; approver name/role; retention/deletion rule; unresolved exceptions. Mark unresolved items `needs review`. Do not infer consent or legal sufficiency from a sample PDF, translated wording, existing screen or synthetic test.

## Preparation boundary

This packet authorizes no new patient fields, invitation, account link, family grant, consent capture, document upload/download/publication, appointment action, patient-facing clinical content, database migration, hosted access or release. It makes the reviewer decisions concrete so later implementation can remain aligned with the existing Patient Pass rather than guessing or replacing it.
