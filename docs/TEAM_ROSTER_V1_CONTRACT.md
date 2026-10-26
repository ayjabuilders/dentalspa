# Team roster v1 — synthetic read-only contract

Status: frozen after independent security and UI review for a bounded M16 synthetic development slice. This is not approval for staff invitations, shift scheduling, delegation, clinical qualification, or real operational use.

## Purpose and boundary

The existing foundation stores verified clinic memberships and a display name for each identity. This slice presents the **active members of one clinic** to a currently active manager or dentist. It groups multiple active access roles for the same person and shows no email, phone, credentials, patient data, medical competency, shift, presence, availability, or approval authority. A role label describes access granted in the foundation; it is not evidence of licensure or task eligibility. The screen offers no mutation command.

`GET /api/v1/team/roster` returns the strict `TeamRosterSchema` from `packages/contracts/src/team-roster.ts`. It accepts no query or body parameters. The server derives actor and clinic from the verified session. The response has one authoritative database `observed_at`, at most 100 **distinct** members, and `truncated=true` if at least one more distinct active member exists. The schema rejects duplicate user IDs and nonunique/noncanonical role arrays. The database alone orders by `lower(display_name COLLATE "C") COLLATE "C", user_id`; this is a deterministic byte-oriented ordering, not locale-aware name sorting, and clients preserve it without re-sorting. Roles per member are unique in canonical alphabetical order (`assistant`, `dentist`, `manager`, `reception`). An empty set is explicit. This is an observed directory, not a live staffing roster.

## Authorization and privacy

- Current actor must have an **active** `manager` or `dentist` membership in the verified clinic. `assistant` and `reception` alone do not gain staff-directory access. Manager access does not imply authority to sign clinical content.
- The private SQL projection independently rechecks clinic, actor and active role even when invoked through a privileged service connection. It never trusts a caller-supplied owner, role or clinic query. Inactive/foreign membership rows and profiles from outside the clinic are excluded. Before joining, sorting or applying the 100-member limit, it checks **every distinct active member in the clinic** for a profile; any missing profile fails the projection rather than silently presenting an incomplete directory.
- Return only `user_id`, `clinic_id`, `display_name` and active access roles for each person. No inactive status, email, phone or role history is returned. Set `Cache-Control: no-store` on success and failure; no browser storage, service-worker cache or name-bearing analytics/logs. A patient-only account receives no roster.
- Public errors: 400 unsupported query/body, 401 absent or expired identity, 403 active-role or clinic denial, 503 unavailable/malformed trusted response. No write activation switch applies to this read-only route.

## Clinic experience

Use the existing Dental Spa pearl/navy component system on `/team` for a clearly marked, synthetic in-memory demonstration. The connected roster is opened from the current memory-only verified session under `/connection`; it is cleared on logout, expiry, clinic change, offline state or transport disposal. Abort and ignore late responses; a denied refresh clears earlier names. Heading “Membres du cabinet” and “Rôles d’accès” labels explicitly say roles do not establish qualification, presence or task eligibility. Show observed time with named timezone and `100+` partial count when truncated. Search and role filters, if offered, must say they filter only the loaded rows; distinguish an empty server directory from no local filter result. Provide distinct loading, empty, denied, expired, offline, unavailable and retry states, keyboard focus and responsive 44px controls. No invitation, edit, assignment, approval or clinical sign-off affordance appears.

## Verification and gates

Test privileged SQL and direct API cross-clinic isolation, active-role denial, patient-only denial, multi-role aggregation, duplicate/missing profile behavior, deterministic ordering, 100/101 truncation, no-store and strict projection. Test browser session cleanup, keyboard focus, responsive pearl/navy layouts and no storage of staff names. The additive migration and pgTAP must pass real local PostgreSQL CI before development merge. Hosted identity/revocation, staffing policy, qualification checks and physical-device approval remain activation/release gates.

Sources: [module PRD](04_MODULE_PRD.md) M16; [domain model](05_DOMAIN_MODEL.md) identity and membership boundary; [workflow engine](13_WORKFLOW_ENGINE.md) staffing/qualification distinction; [security](09_SECURITY_SAFETY.md); [ADR-003](adr/ADR-003_DEVELOPMENT_AND_RELEASE_GATES.md).
