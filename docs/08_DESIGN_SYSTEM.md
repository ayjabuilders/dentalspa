# 08 — Premium UI/UX Design System

## UX principle
Users should know **where they are, what matters, and what's next**, without learning a complex navigation taxonomy. Use *Next Action UX* backed by server-computed eligible actions. Preserve global search and ordinary navigation as fallback.

## Two distinct design systems
**Clinic OS**: Electron-like *feel* via installable PWA, desktop-first layout, resizable/sidebar workspaces, command palette (Cmd/Ctrl+K), keyboard navigation, contextual split panes, dense but scannable tables, inline task actions and quick switching between patients. Not Electron-level native OS access.
**Patient Pass**: native-like mobile PWA with bottom navigation (Accueil/RDV/Dossier/Messages/Compte as initial proposal), cards, bottom sheets, mobile-safe area, touch targets >=44x44 px, one primary action per view, clear human text and progressive disclosure. A patient is not shown internal tasks/lab issues.

## Proposed brand direction (NOT approved brand assets)
Neutral bright canvases, calm teal clinical accent (`#326F79` candidate), accessible ink (`#172333`), subtle surfaces, generous whitespace, professional typography supporting French and future Arabic RTL. Lucide icons with consistent optical size. Tailwind + shadcn/ui foundations; separate `ui-clinic` and `ui-patient` component packages; shared semantic tokens.

## Motion specifications (starting targets)
- Buttons/hover feedback ~80–180ms; panel/navigation transitions ~180–280ms; sheets ~220–320ms with physical easing.
- Prefer layout-preserving transitions, subtle tactile feedback, skeleton loading, toast/inline feedback and success state after server ACK.
- Honor `prefers-reduced-motion`; no essential state conveyed by motion alone.
- Avoid distracting movement during clinical action; no optimistic clinical completion or medication edits.

## Core states for every screen
Idle, loading, empty, partially-loaded, validation error, permission denied, network offline, conflict, recoverable server failure, success/confirmed, blocked by required clinical gate. Show exactly how to recover. Never hide blockers.

## Role-aware navigation
Reception `Ma Journée / Demandes / Agenda / Patients / Messages`; clinician `Ma Journée / Consultations / Cas / Validations`; assistant `Ma Journée / Préparation / Checklists / Équipe`; patient `Accueil / RDV / Dossier / Messages / Compte`. These are proposed defaults, subject to usability testing. A person can hold multiple roles but must see only authorized actions.

## Quality bar
WCAG 2.2 AA-oriented; focus rings, keyboard shortcuts, screen-reader names, contrast, device testing on iPhone + Android including installed PWA; localization and text wrapping; avoid recording data in analytics; do not persist sensitive data in offline caches.
