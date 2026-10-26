# 03 — Master Workflows / Golden Journeys

## Separation of time scales
**Lead lifecycle** (contact to booked or closed) != **appointment/session workflow** (one visit) != **treatment journey** (multi-visit clinical plan). Link them through patient/appointment/encounter/case IDs. One patient may have many independent cases; some visits have no case.

## GJ-01 Contact to consultation
1. Inquiry from website, phone, WhatsApp, Instagram, email or Google Business; record `channel`, timestamp, reason and follow-up owner manually if no validated integration.
2. Find existing patient before create; do not merge on weak identifiers automatically.
3. Qualify contact details, language, contact preference, urgency routing and international timezone (only minimal medical detail in insecure social channels).
4. Assign one responsible staff member + next deadline. Intake statuses from source: Nouvelle, À qualifier, À rappeler, En attente du patient, E-consultation à planifier, RDV confirmé, Clôturée.
5. Offer available slot; request/hold/confirm against constrained provider/chair calendar transactionally.
6. Confirmation, visit prep tasks, patient invitation (subject to verification and consent).
7. Follow up unresponded inquiries and close with reason.

## GJ-02 Single visit: reception → doctor → team → care
- Appointment confirmed does not imply patient arrived.
- Reception check-in (`arrived`) updates practitioner workspace.
- Dentist clicks **Appeler le patient** (separate from **Démarrer consultation**).
- If qualified escort/assistant assigned, create/activate escort task; otherwise clinician performs eligible steps without deleting mandatory checks.
- `PatientRoomed` explicitly attested by authorized staff; preparation/readiness gates validated.
- `ConsultationStarted` requires clinician confirmation; clinical notes/checklists start.
- Clinician signs/approves note and next plan; task engine proposes clinical/admin handoffs. Checkout/aftercare performed with explicit responsibility.
- Interruptions, emergency deviations, reassignment and no-show must preserve traceability.

## GJ-03 Multi-session treatment case
A patient-selected service is **an interest/request**, not a medical diagnosis or approved plan. Clinician reviews and approves actual plan and applicable versioned service journey. Each phase has state, dependencies and evidence. Case can pause, repeat a visit, revisit a phase, branch to rework/rescan, and close clinically. The patient sees only released, plain-language milestones.

## GJ-04 Lab job (from assistant/prosthetist source)
Valid prescription → secure transfer of scans/photos → receipt/completeness check → deadline → design/fabrication → QC → delivery → chairside acceptance. `Manufactured` is not `Received` or `ReadyForFitting`. Returns/retouches form a loop and cannot be implicitly marked complete.

## GJ-05 Smart Notes (optional, controlled)
Authorized clinician explicitly starts encounter; separate informed capture/consent activation; temporary streaming/transcription without raw storage; generate two drafts (clinician + patient); clinician edits and signs; only approved patient instructions are published; action suggestions require review. Capture may be paused/stopped; avoid recording if consent absent.

## General workflow state conventions
`draft | eligible | queued | assigned | in_progress | blocked | awaiting_review | completed | cancelled` per task where applicable. A task, visit and case each own their separate state machine; never reuse status fields interchangeably.

## Exceptional conditions
No assigned assistant / doctor alone; assistant arrives mid-case; patient late; slot resource conflict; lab delivery late; consent withheld; condition not met; clinician changes plan; failed network; interrupted recording; errors in AI draft. Default to safe held states with human explanation, not silent success.
