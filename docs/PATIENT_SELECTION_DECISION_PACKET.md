# Patient selection decision packet

Status: product/clinic decision required. This document presents bounded choices; it is not an approved identity policy and does not authorize implementation, patient creation, appointment confirmation or Patient Pass linkage.

## Why a decision is required

The merged patient lookup is deliberately read-only. It returns only clinic-scoped patient reference, display name and match basis. It does not contain date of birth, verified contacts, external identifiers or clinic-approved identity evidence. An exact reference or name match therefore cannot be presented as proof of identity.

The smallest future write should be a separate, inquiry-specific **reviewed candidate association**. It records what a staff member decided without mutating the original inquiry receipt and without claiming more identity assurance than the approved evidence supports. Selection, patient creation, resource holding, appointment confirmation and account linkage remain separate state transitions.

## Decisions for the product and clinic owners

### D1 — Meaning of a recorded selection

- **A — Reviewed candidate association:** staff explicitly chooses a candidate; the record remains labelled identity unverified.
- **B — Verified patient selection:** staff completes a clinic-approved, versioned identity-check procedure.

Recommended first development boundary: **A**, synthetic-only, with no booking or account entitlement. Option B remains blocked until the clinic defines and approves the evidence procedure.

### D2 — Selection and correction authority

- **A — Existing roles:** reception, manager and dentist may select and correct.
- **B — Explicit capabilities:** lookup permission does not imply selection/correction; named roles receive separate capabilities.

Recommended: **B**. Manager status is not clinical authority, and read access must not silently become write authority.

### D3 — Mistaken-selection correction

- **A — Revoke then re-review:** suspend/revoke the association, preserve history, then review another candidate separately.
- **B — Atomic superseding correction:** replace with expected version, old/new references and an approved structured reason.

Recommended first boundary: **A**. Once any downstream record depends on a selection, correction must stop and enter a separately approved remediation workflow rather than retargeting data automatically.

### D4 — Suspected duplicate override for patient creation

- **A — No override:** creation remains blocked and enters manual review.
- **B — Designated reviewer override:** approved roles choose an approved structured reason.
- **C — Two-person approval.**

Recommended: **A**. Empty or truncated search results never prove that no duplicate exists, and same-name people must not be merged automatically.

### D5 — New patient reference generation

- **A — Server-generated opaque clinic-unique reference.**
- **B — Server-generated clinic sequence using an approved format.**
- **C — Validated legacy/external reference under a separate import policy.**

Recommended eventual default: **A**. Creation stays disabled until this and duplicate policy are approved. References are identifiers, never authentication secrets.

### D6 — Review freshness

- **A — Version-bound receipt:** server binds actor, clinic, inquiry, candidate, policy version and reviewed record version; commit revalidates all of them.
- **B — Version receipt plus a clinic-defined time limit.**

Recommended development default: **A**, failing closed on record change, logout, clinic change or revoked authority. Do not invent an arbitrary duration. A historical decision remains visible after freshness expires; expiry only prevents new consequential use.

### D7 — Retained decision evidence

- **A — Minimal metadata:** actor, time, clinic, inquiry/candidate references, policy/version, reviewed version and approved structured reason.
- **B — Restricted review snapshot:** only explicitly approved fields, readership and retention.

Recommended: **A**. Do not retain raw searches, inquiry contacts, documents, free-form medical explanations or sensitive data in logs/events.

### D8 — Consequences of selection

- **A — None:** selection creates no Patient Pass link, appointment, hold consumption, invitation or message.
- **B — Later independent commands may consume a fresh reviewed selection after their own approval.**

Recommended now: **A**. Patient account enrollment and appointment confirmation remain separately authorized workflows.

## Proposed truthful UI after approval

1. Search within a specific inquiry. Candidate action: **“Examiner ce dossier”**, never automatic first-result selection.
2. Review inquiry and candidate in separate labelled regions. Display only currently authorized patient fields and keep inquiry-supplied information distinct.
3. Before approved evidence is complete: **“Examen incomplet · aucune sélection enregistrée.”** Do not add a generic checkbox that falsely certifies identity.
4. Final action after server validation: **“Enregistrer cette sélection.”** Pending and success states appear only around the authoritative command.
5. Success copy: **“Sélection enregistrée pour cette demande. Aucun rendez-vous ni accès Patient Pass créé.”**
6. Distinguish **wrong record**, **information correction** and **possible duplicate**; never merge, delete, overwrite contact data or retarget dependencies automatically.
7. No match, truncated results, stale review, conflict, denied, offline and unknown-result states remain distinct. An unknown result replays the exact key and reconciles current state before another selection.

Accessibility requirements remain 44px mobile targets, visible focus, announced asynchronous outcomes, text plus icons, reduced motion and no confidence scores or celebratory “match” styling.

## Approval record required before implementation

The accountable clinic/product owner must record:

- chosen option for D1–D8;
- approved roles/capabilities and exceptions;
- the actual identity evidence procedure if D1-B is chosen;
- structured correction/override reasons, audit readership and retention;
- patient-facing language;
- effective policy owner and version.

Until that approval exists, lookup remains read-only and all selection/creation/confirmation writes remain blocked.

## Traceability

- [Patient matching next slice](PATIENT_MATCHING_NEXT_SLICE.md): current lookup boundary, data limits, subsequent-command prerequisites and deferred decisions.
- [Clinic discovery](02_CLINIC_DISCOVERY.md): identity/account-linking and legacy deduplication decisions remain open; workflow validation requires approval of roles, safeguards, exceptions and captured data.
- [Security and safety](09_SECURITY_SAFETY.md): action-specific authorization and secure enrollment; name or phone alone is insufficient for account identity.
- [Domain model](05_DOMAIN_MODEL.md): tenant-checked cross-domain references and separate account linkage.
- [Scheduling hold v1 contract](SCHEDULING_HOLD_V1_CONTRACT.md): resource holds are not appointments and confirmation remains deferred.
- [Test/pilot plan](11_TEST_PILOT_PLAN.md): matching and later secure account linkage are distinct.
