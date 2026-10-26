# 15 — Patient Pass — Separate Native-feeling PWA

## Identity
Patient Pass is a distinct app, not a mobile breakpoint of Clinic OS. It accesses a **patient projection API**, not the internal clinical event feed, and uses its own installable app manifest, navigation, icon and design language.

## Home page
Greeting, next appointment, one contextual next action, current treatment phase in patient-approved language, approved documents, contact team. Never surface staff-only clinical checklist or confidential internal exchange.

## Initial IA (proposed)
Bottom tabs: `Accueil`, `RDV`, `Dossier`, `Messages`, `Compte`. Deeper screens use back and mobile sheets, clear progress, generous touch targets, and no hidden required actions behind gestures.

## Golden journey
1. Public booking request; receive safe confirmation or explicit pending state.
2. Secure invitation/identity link (identity verification, no name/phone-only linking).
3. Intake and administrative forms with resumable draft (privacy and security constraints).
4. See upcoming/recent visits and preparation instructions.
5. After clinician-approved treatment plan, see approved *journey milestone* and next appointment; no internal task data.
6. Read released invoices, approved clinical documents, approved visit summary/aftercare.
7. Send secure support request; emergency routing instructions must be reviewed and never AI-diagnose.

## PWA behavior
Standalone display, mobile-safe-area support, manifest, install guidance where supported, controlled web push opt-in and permission handling. No guaranteed native OS parity or device-hardware integration. Offline: static shell/asset cache only initially; sensitive PHI offline storage prohibited pending risk analysis. Notifications use neutral text that doesn't expose diagnosis or procedures on lock screen.

## UI quality
Responsive design for small screens and text expansion; French first with Arabic localization readiness. Accessible touch sizes >=44 px, VoiceOver/TalkBack smoke tests, dark/light preferences subject to brand decision, motion reduced settings, graceful network loss. Use native-like bottom sheets and thoughtful short transitions, not animation-heavy clinical screens.

## What the patient sees vs staff
Staff: `facettes reçues du labo; contrôle qualité à confirmer` → Patient: `Préparation de votre prochaine séance en cours` only if approved for release.
Staff: `note clinique brouillon` → Patient: nothing.
Staff: `patient instructions signed, published` → Patient: friendly summary with author/date and next steps.
