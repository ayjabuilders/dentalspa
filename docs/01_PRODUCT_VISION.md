# 01 — Product Vision

## Product strategy
Dental Spa = patient-facing flagship pilot for Dr Amina. Dental OS = neutral multi-clinic B2B operating platform. Dental Playbook = approved SOPs, role handoffs and reusable service templates. Dental Academy and Network are later expansion tracks, not part of pilot MVP.

## Core promise
Any inquiry (website/social/phone) progresses through **one trackable journey**: inquiry → matched patient → booking → preparation → visit/clinical encounter → treatment plan and longitudinal case → billing/aftercare → continued relationship. Clinician, receptionist, assistant, lab, and patient see role-appropriate next steps.

## Distinct products
- **Clinic OS** — installable desktop-oriented PWA; primary workspace `Ma Journée`; agenda, calls/inquiries, patients, clinical context, tasks, finance permissioned.
- **Patient Pass** — independent mobile-first PWA with native-like navigation; appointments, approved care journey, approved documents/invoices, secure support messages. Never a responsive copy of Clinic OS.
- **Public Booking** — safe unauthenticated lead/intake and appointment-request surface; no false claims of confirmed availability.
- Future: LabFlow, SmartStock, ChairFlow, SteriTrack, Pulse AI; these consume contracts/events, not shared frontend components.

## Product principles
1. No-navigation-training ambition: role-aware, context-aware **Next Action UX** (must be usability-tested).
2. One source of truth, separate professional/patient projections.
3. Clear clinical authority and record provenance.
4. Service journeys span multiple sessions, and session tasks span multiple staff.
5. Human-in-the-loop AI. No nonconsensual audio or raw transcript retention.
6. Ship small vertical slices; validate on synthetic data, then staff walkthroughs and limited clinic pilot.

## Success signals (targets to establish with clinic)
Time to locate next patient/action; number of appointments requiring duplicate entry; prep task completion reliability; overdue patient requests; booking/no-show metrics; patient understanding of aftercare; frequency of clinical-note correction; zero critical privacy incidents.

## Out of scope until separately approved
Autonomous diagnosis, automatic prescriptions, direct scanner/printer control, wholesale Orthalis migration, unverified messaging API integrations, lab production automation and autonomous agent actions.
