# 11 — Testing, Pilot and Release Gates

## Synthetic pilot journeys
- New lead via website → qualified → assigned → appointment requested/confirmed → staff calendar → patient view.
- Existing patient's booking via phone → matching without duplicate → later user account linked securely.
- Reception check-in → dentist calls patient → assistant escorts → room readiness → explicit consultation start; verify role-specific Next Action.
- Dentist works alone / with assistant / assistant joins mid-session; gates and accountability preserved.
- Hollywood Smile interest request -> clinician-approved actual plan -> longitudinal phase progression -> lab order mock -> QC -> patient-friendly released timeline.
- Consultation Notes synthetic voice/transcript fixture -> 2 drafts -> clinician corrections -> signed note -> approved patient instructions; no raw transcript/audio persistence.
- Orthodontic recurring checks loop, cancelled appointment, laboratory rework and paused case.

## Adversarial and safety tests
Tenant A cannot read Tenant B; Patient A cannot see Patient B's data; anonymous public booking cannot enumerate patients; receptionist cannot sign clinical note or access margins; privileged database path still enforces authorized clinic; nonmember cannot subscribe to realtime channel; signed URLs expire; task replay idempotent; malformed events quarantined; same chair cannot be double-booked; missing required clinical gate blocks completion; modified published template does not alter running instances; loss of assistant does not mark their tasks complete; provider errors stop speech handling and do not log transcript; simulated patient medical advice is never published without explicit review.

## User-centered pilot
Clinic staff walkthrough with role-specific Ma Journée and real operational exceptions (using synthetic cases). Patient usability checks on physical iOS/Android in installed PWA mode. Measure who can find next action and complete tasks without explanation; track misclicks, not just visual appeal.

## Release controls
1. Foundation gate: secure identity/tenant, migration, audit, worker backbone, restore test on staging.
2. Operational MVP: booking scheduling lock, patient matching, reception and check-in, role tasks and clear Next Action, staff acceptance.
3. Clinical gate: clinician-approved notes/workflows and data protection for actual patient records; legal/compliance approval.
4. Patient Pass gate: verified identity, release policies, access/notifications and consent.
5. AI gate: documented vendor agreements, processor retention controls, consent, approved tests and clinical sign-off. No real capture until passed.

## Legacy migration
Export research -> mappings -> deduplication rules -> synthetic trial -> reconciliation (counts, balances, appointment IDs) -> staged parallel run -> go/no-go -> rollback. Never disable Orthalis before signed pilot criteria and rollback are ready.
