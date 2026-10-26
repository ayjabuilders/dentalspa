# 04 — Module Product Requirements (PRD)

## Build priority vs future roadmap
Aligned with source guide's groups: P0 operational core M01–M05, M14, M16; P1 connected experience includes M06–M07, M09–M13, M15; P2 intelligence M08 and M17–M20; M21 later ecosystem. For the **pilot**, an operational subset of the Playbook engine (M20 concepts) is needed earlier for task templates.

| Module | Pilot role | Core acceptance |
| --- | --- | --- |
| Identity / Team / Approvals (M16) | Foundation | Tenant isolation; clinician-only clinical approvals; staff invitations, shifts, policy guards |
| Growth & Acquisition (M01) | First slice | Unify manually captured leads; provenance/owner/due/action; duplicate-safe patient conversion |
| Booking & Capacity (M02) | First slice | Resource-safe booking; no double booking; cancellations & reschedules traced |
| Patient Pass & Intake (M03) | First slice read-only MVP, then expand | Patient-only authorized appointment; native-feeling PWA; later forms/docs/chat |
| Clinical Encounters (M04) | Early after booking | Encounter linked to appointment; note author & signing; no unreviewed clinical publishing |
| Treatment Cases (M05) | Early | Multiple plans/cases per patient, immutable plan revisions, auditable case phases |
| Finance (M14) | Clinic replacement phase | Role-limited quotes/invoices/payment events; no fabricated CNSS integration |
| Templates / Playbook (M20 concepts) | Small foundational engine | Immutable templates, approved variants, dependency gating and role assignments |
| ChairFlow (M12) | Future expansion | Validated room readiness workflows, not hardcoded equipment controls |
| LabFlow (M09) | Future expansion | Lab orders, signed clinical prescription, QC, statuses and rework |
| SmartStock/Procurement (M10/M11) | Future | Stock constraints and supplier workflow; verified items |
| SteriTrack (M13) | Future | Traceable sterilization checks and cycle evidence |
| Aftercare (M15) | Later patient journey | Approved advice, reminders and escalation |
| Pulse/Agents (M17/M18) | Later | Permissioned tool gateway, shadow mode and clinician review |
| Analytics (M19) | Later | Measures based on audited source-of-truth events |
| Design/CAD (M06–M08) | Later | Verified media/scanner/CAD capabilities; no unsupported device promises |

## Product slices
**M01 Foundation:** structure, safe identity, clinic/user domain, API, logging, outbox, app shells, test harness.
**M02 Patient inquiry & booking:** public request, de-dup, resource calendar, receptionist dashboard, appointment display in Patient Pass.
**M03 Task orchestrator:** service templates, staff-shift resolver, task handoffs and Next Action UX.
**M04 Clinical consult:** encounter and clinical notes with clinician approval; sample template.
**M05 Case journeys:** approved multi-session case, published patient timeline and lab handoff mock.
**M06 Smart Notes pilot:** synthetic first, consent-gated ephemeral capture only after safety approval.

## Exclusions
Not marketing automation, stock prediction, generic autonomous agents, voice-based diagnosis or production healthcare deployment on day one.
