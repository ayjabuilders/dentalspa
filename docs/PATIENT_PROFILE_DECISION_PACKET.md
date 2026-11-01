# Patient administrative profile and timeline decision packet

**Status:** preparation only. No new profile fields, access policy, patient association, retention period, or patient-facing content is approved by this packet.

**Purpose:** define the connected administrative profile the CRM MVP needs without treating fictional scenarios as a patient's record or exposing clinical content before a separate clinician-approved release workflow.

## Current verified implementation boundary

- The Nest API's staff list and detail responses contain only `id`, `clinic_id`, `display_name`, and `reference`; they do not provide contact details or a durable CRM timeline.
- `apps/clinic-os/app/patients/[patientId]/page.tsx` only generates routes for local synthetic `patientDirectory` entries. Its profile view, journey scenarios, and document checklist are explicitly fictional, in-memory demonstrations.
- The read-only staff lookup can show a possible match. It does not verify identity, associate an inquiry, create a patient, create an account, or authorize a booking.
- This packet concerns administrative patient-profile scope. Clinical notes, diagnosis, treatment plans, instructions, images, and patient publication remain governed by the separate clinical encounter decisions.

## Decisions required

| Decision | Questions for the accountable reviewer | Required record |
| --- | --- | --- |
| Profile purpose and fields | Which minimum administrative fields are necessary for reception, management, dentists, and the patient? Which fields are optional, sensitive, or out of scope? | Field list, purpose, source, validation, visibility, and role |
| Contact details and verification | Which contact values can be stored? How is a phone/email verified, corrected, replaced, or marked unreachable? Does an inquiry value ever become a patient value, and only through which explicit action? | Contact provenance, verification evidence, correction flow, and patient wording |
| Preferences versus consent | How are preferred channel, language, and time zone shown? Which values are self-declared? What separate evidence is required before any contact or message? | Preference semantics, consent evidence, allowed use, and suppression behavior |
| Access and family relationships | Which staff roles may view or edit each field? What actions are allowed for a minor's guardian or an adult delegate, and how is authority verified, scoped, expired, and revoked? | Role/action matrix and separate patient, guardian, delegate, and payer scopes |
| Administrative timeline | Which confirmed operational events belong in the patient timeline? Which events must remain inquiry-only, manager-only, or clinical? What actor, timestamp, correction, and source evidence is kept? | Event vocabulary, ownership, visibility, append/correction behavior, and audit metadata |
| Patient identity and associations | Confirm that a possible match remains identity-unverified. What separately approved evidence, correction, duplicate review, and authority are required before associating an inquiry or account? | Reference to approved D1–D8 policy; this packet cannot override it |
| Read access, audit, and privacy | Which profile reads and exports are audited? Who may review that audit? What retention, deletion, correction, and access-request rules apply to profile and timeline data? | Read/write audit scope, visibility, retention/deletion, export, and named privacy approver |
| Patient-facing profile | Which approved administrative details may a patient see or request to correct? How do we keep internal work, another person's information, and unreleased clinical material private? | Explicit display/release list, correction workflow, and approved wording |

## Review ownership

- **Clinic product owner:** operational profile fields, role-specific use, and correction workflow.
- **Privacy/legal reviewer:** data purpose/minimization, access, patient rights, family data, audit visibility, retention/deletion, and applicable Moroccan requirements.
- **Identity/privacy reviewer:** verification evidence and duplicate resolution; see `docs/PATIENT_SELECTION_DECISION_PACKET.md`.
- **Licensed clinical lead:** any clinical fields, clinical-event timeline, or patient-facing clinical material; see `docs/CLINICAL_ENCOUNTER_DECISION_PACKET.md`.

For each decision record the exact value, actor, evidence, correction behavior, patient-facing text, effective date, policy version, approver name/role, and unresolved issues. Mark unanswered values `unresolved`; do not infer clinic policy from a mock or sample record.

## Implementation boundary until decisions are recorded

- Keep the existing synthetic profile screens and journey scenarios visibly marked as demonstrations.
- Keep patient lookup read-only and possible-match only; do not create a patient association, convert an inquiry, or create a Patient Pass link.
- Do not add contact, family, financial, or clinical fields, patient timeline events, uploads, exports, patient publication, or persistence based on this packet alone.
- A future connected implementation must use verified active same-clinic authorization, deny foreign IDs, audit sensitive access as approved, avoid private browser/service-worker caching, and pass real local PostgreSQL/RLS checks before local MVP acceptance.
