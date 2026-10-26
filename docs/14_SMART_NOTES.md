# 14 — Smart Consultation Notes — scoped MVP

## What problem this solves
Dentist needs accurate traceable clinical documentation; patient needs memorable, simple, clinician-approved instructions. Two **separate outputs** from one consented/authorized source.

## Precise product trigger
Dentist manually confirms encounter start. UI exposes **Enable Smart Notes** only with explicit patient information/consent and clinician privilege. Microphone does not activate from check-in, patient call or encounter start alone. Show persistent active indicator, Pause/Resume/Stop, and recording/provider-disconnect errors.

## End-to-end flow
1. Authenticated dentist selects scheduled patient/encounter and clicks `Démarrer consultation`.
2. UI checks consent and asks separately to `Activer les notes intelligentes` (capture not started without explicit action).
3. Ephemeral, secure audio stream to privacy-reviewed transcription processor; transcript remains volatile (no database, object storage, files, logs, analytics or service worker cache).
4. Process structured temporary text into two separate drafts: (A) professional note fields; (B) simple patient instructions. Prefer generating at end with controlled clinician review, not live publishing.
5. Present uncertain/missing facts prominently, do not invent diagnosis, drugs, dates or procedures. Dentist can edit/replace or reject.
6. Clinical note signed/recorded with doctor identity and amendment rules. Patient advice separately approved and released to Patient Pass.
7. **Proposed** downstream workflow tasks are reviewed/confirmed before creation. All final artifacts carry audit reference to generating session/model but not raw audio/transcript.
8. Destroy transient buffers at end, stop and failure. Test provider logs/retention explicitly.

## What IS retained
`consultation_session` metadata, informed consent reference, capture started/stopped timestamps without media, model/version/processing status where safe, approved/signed clinical note, approved patient-facing instructions, publication/revision/audit. Do not overclaim deletion at third parties until vendor due diligence passes.

## What is NOT retained
Raw audio, media file/recording URLs, raw transcript, intermediate prompts containing PHI in logs, debug dumps, analytics payloads and accidental client caches. No audio playback/history feature.

## Authentication and consent
Written/localized privacy notices, adequate legal basis and informed patient consent or legally sufficient authorization per verified Moroccan rules. Multi-speaker/minor/accompanying adult scenarios require specific policy. No recording when consent absent; manually drafted notes always available.

## Infrastructure
NestJS owns encounter/note/approval endpoints. Isolated streaming provider adapter is replaceable and may need a runtime outside serverless HTTP if sessions are long. Supabase stores **final approved** documents + metadata only. Patient Pass fetches published advice under patient auth and server policy.

## Suggested task contracts
`startEncounter`, `authorizeCapture`, `pauseCapture`, `stopCapture`, `generateDrafts`, `updateClinicalDraft`, `signClinicalNote`, `approvePatientInstructions`, `publishPatientInstructions`, `proposeFollowUpTasks`. Every sensitive operation logged; only explicit API commands mutate state.

## Clinical checks
Speech recognition errors, wrong tooth/side, medication ambiguity, patient identity mismatch, missed allergy or uncertain negation require manual confirmation. Silence, interruptions or model unavailability produce incomplete draft, never an invented complete note.

## Milestone order
Mock transcript and deterministic draft rendering first; user-facing review/approval pipeline second; compliant streaming only after vendor/legal/consent/security review. No production voice capture in Foundation milestone.
