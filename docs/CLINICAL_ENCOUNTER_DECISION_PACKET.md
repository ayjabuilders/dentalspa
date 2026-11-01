# Clinical encounter decision packet (M04)

**Status:** reviewer preparation only. No clinical, privacy or patient-publication rule is approved by this packet.
**Scope:** decisions required before connecting consultation notes, clinical context, media references, consent records or released content to patient records.
**Sources:** `docs/04_MODULE_PRD.md` (“M04 Clinical consult”), `docs/EliteSmile_OS_CRM_MVP_and_Codex_Prompt.md` sections 1, 2 (Flow A), 3.1, 3.2 and the project `AGENTS.md` invariants.

## Decision owners

The licensed clinical lead decides clinical authorship, note content, signing and amendment rules. The clinic product owner decides administrative workflow and staffing within that authority. The privacy reviewer decides patient access, retention, correction and release boundaries; legal review is required where clinic reviewers determine it applies. No reviewer is presumed to have approved another group’s decisions.

## Decisions to record

| Decision | Bounded question for review | Required record |
|---|---|---|
| Encounter authority | Which licensed roles and verified qualifications may create, author, review, sign, amend or void an encounter? May another clinician co-sign, and under what conditions? | Role/qualification evidence, permitted action, clinic scope and approver. |
| Patient and visit linkage | Must a clinical encounter reference a confirmed appointment? Which appointment states permit opening an encounter? What verified patient-link evidence is required, and how are cancelled, duplicate or stale visits handled? | Allowed source states, patient identity check, link/unlink correction path and authority. |
| Note scope and template | Which note types and sections are in the M04 MVP? Which sections are optional or required for a particular approved note type? Who versions and reviews templates? | Exact field vocabulary, content purpose, requiredness, version owner and clinical approval. |
| Draft, sign and correction lifecycle | Which states represent a saved draft, review, signature, amendment or void? What confirms that each action happened? Can signed text ever be overwritten? | Valid transitions, actor, server time, immutable version and correction/amendment evidence. |
| Clinical findings and treatment discussion | Which clinical content may be recorded in the CRM, and what must remain in an existing clinical record? Does M04 link to an external/approved record or store a copy? | Data boundary, allowed references, authorization and source-of-truth rule. No diagnosis, prescription or protocol is inferred here. |
| Images and attachments | Does M04 store only references or support private files? Which media types, metadata, patient/encounter links and review states are allowed? | Upload/review/release roles, private storage and access rules, retention, revocation and audit evidence. |
| Consent and patient publication | Which consent events are in M04, who may record them, what evidence/version is retained, and how are withdrawal or correction handled? Which signed content, if any, may be explicitly released to a patient or delegate, and by whom? | Exact consent text/version and purpose, actors, withdrawal, release approval, recipient scope and revocation. |
| Audit and retention | Which encounter access/actions must be audited, what fields may appear in audit/outbox, and how long are drafts, signed versions, media references and audit records retained? | Minimum event fields, retention/deletion/correction schedule, access visibility and accountable reviewer. |

## Fixed safeguards from the project requirements

- AI or local demo code cannot sign, approve, publish or make a consequential clinical change. A verified human clinician approval is required.
- The patient view must expose only explicitly released and approved content. Internal checklists, drafts, media notes and other patients’ information stay private.
- A signed note is not silently edited; corrections need a traceable amendment/version strategy.
- Workflow state must represent a confirmed action. Opening a page, calling a patient, arrival and consultation start are distinct events.
- Do not invent diagnoses, prescriptions, clinical instructions, mandatory steps, or third-party integrations.

These safeguards do not decide clinic vocabulary, clinical protocols, legally sufficient consent, retention duration, or which exact role has authority.

## Preparation boundary

This packet authorizes no clinical data entry, schema activation, migration application, patient publication, hosted access or release. The current `/clinical` page is a local demonstration with fictional profiles and an unsigned ephemeral draft shell; it is not evidence of encounter implementation. Keep M04 PRD criteria planned until the reviewers record decisions, the connected API/database path is built, and the required negative-isolation and role tests pass in the permitted local stack.

## Decision record

For each row, record the approved vocabulary and values, permitted actor, allowed transitions, required evidence, patient wording where relevant, effective date, version, approver name/role, and unresolved items. Mark a question `unresolved` if the accountable reviewer has not answered it. Do not copy sample content into policy.
