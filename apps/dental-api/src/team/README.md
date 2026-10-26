# Read-only team roster

GET /api/v1/team/roster exposes active clinic membership display names and access roles to an active manager or dentist. Access roles do not establish qualifications, licensure, presence, shifts or scheduling eligibility. No invitations or membership writes are implemented; no command feature flag is required.

The authenticated-user Supabase client calls the POST-only team_roster RPC. The security-definer function independently verifies auth.uid() and current active clinic membership even for privileged execution. Its fixed empty search path and fully qualified relations do not expand direct profile-table grants or RLS access.

The STABLE function uses one statement snapshot for all-member profile completeness and the final projection. A missing profile anywhere in the active clinic membership fails the entire read with a generic 503, including beyond the first 100 members. Canonical roles are aggregated once per user. Ordering is lower(display_name COLLATE "C") COLLATE "C", then UUID; the API preserves this database order. Fetching 101 distinct members determines explicit truncation. Observation time comes from statement_timestamp().

HTTP responses and controller errors are no-store. Unknown provider details and malformed projections become generic unavailable responses, with no contact or provider error content exposed. Query parameters and request bodies are rejected.

Focused verification: team-roster API and adapter tests, PGlite migration/isolation tests, and supabase/tests/team_roster.test.sql for PostgreSQL CI. PGlite is not a substitute for executing pgTAP against local PostgreSQL in CI. No hosted schema changes or real clinic data are involved.
