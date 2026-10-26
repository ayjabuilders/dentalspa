# 16 — Source Traceability and Evidentiary Boundaries

## Primary user-provided documents reviewed
1. `Dental_Spa_Dental_OS_Master_Project_Guide_2026.pdf` (80-page working guide): architecture principle, M01–M21 release tiers, case model, modular monolith, approvals, privacy, roles, UX distinction, pre-Codex twelve-document pack and go/no-go gates.
2. `Tableaux_Checklists_Cliniques_Par_Acte copie.pdf` (4 pages): specific before/during/after organizational checklists for orthodontics, composites, veneers fitting/bonding, crowns, endodontics, implants, extractions, laser, consultation. Explicitly **not definitive clinical protocols**.
3. `les taches effectuées par le praticien, l assistante et la prothesiste.docx` (6 pages): 15 operational domains, clinical support incl. voice dictation/clinician-approved summaries, materials/trays priority, lab and finance workflows.
4. `Ma_Journee_Taches_Separees_Cabinet_Dentaire.pdf` (3 pages): assistant daily duties, internal prosthetist fabrication/QC, external lab handoff, scan-for-veneers prep; Orthalis references.
5. `Module_Reception_Suivi_Patients_Cabinet_Dentaire.pdf` (2 pages): unified intake across phone/WhatsApp/Instagram/email/Google, one owner, response deadline, qualification, source status vocabulary, international/e-consultation, phased manual-to-integration approach.
6. `Tableau_Bord_Synthese_Cabinet_Dentaire.pdf` (1 page): 8 responsibility poles; two polyvalent assistants alternate reception/chairside; ownership and explicit completion/medical validation.

## User decisions added in conversation
- Host on Vercel + Supabase, use Next.js frontends and **NestJS** backend rather than guide's Django REST; Python only as future specialized AI runtime.
- Clinic OS premium desktop/Electron-like PWA, Patient Pass independent native-feeling mobile PWA; transitions, motion and Next Action UX.
- Configurable per-service longitudinal journeys, session tasks, dentist-specific variants and dynamic solo/collaborator staffing.
- Hollywood Smile patient-service example, with actual clinical plan approved separately by dentist.
- Smart Consultation Notes: temporary audio, no stored recording/raw transcript, two clinician-reviewed audiences (professional and patient), task suggestions not autonomous clinical actions.

## Explicitly *NOT* proven by sources
- Hollywood Smile exists as one fully specified clinic SOP. It does **not**; it must be composed from consultation, planning, scan/lab and veneer tasks and clinically reviewed.
- Source checklists are signed regulatory protocols. They explicitly say they are adaptation models.
- Orthalis, WhatsApp, Instagram, scanner or CAD/3D printer have available authorized APIs. Unverified.
- Supabase/Vercel/AI cloud setup is approved for Moroccan health data. Legal/contractual review pending.
- Zero third-party data retention is guaranteed merely because Dental OS does not store audio. Vendor-specific review pending.
- Exact clinical task order, service time, required equipment, staffing competencies and CNSS workflow are final. Pending discovery/validation.

## Requirement identifiers
`SRC-GUIDE`, `SRC-CHECKLIST`, `SRC-TASKMAP`, `SRC-DAY`, `SRC-RECEPTION`, `SRC-DASH`, `USR-STACK`, `USR-UX`, `USR-WORKFLOW`, `USR-NOTES`. Each product story/PR should cite an identifier and note `documented / proposed / needs-clinical-review`.
