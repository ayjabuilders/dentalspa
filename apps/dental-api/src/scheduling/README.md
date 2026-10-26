# Synthetic scheduling hold kernel

This module implements `docs/SCHEDULING_HOLD_V1_CONTRACT.md`. It never creates an appointment, selects a patient, or sends a notification.

Both switches must be explicitly enabled for a synthetic development environment:

- API process: `ENABLE_SCHEDULING_HOLDS=true` (all five endpoints otherwise return `503 scheduling_disabled`).
- Trusted database configuration: the authorized clinic's `private.scheduling_settings.enabled=true`. The migration provisions a clearly named synthetic sandbox clinic with this setting **false**, four synthetic resources, broad synthetic windows and no memberships/accounts. Provisioning an authorized test membership remains a separate trusted operation. The switches are not permission substitutes.

No public configuration API or direct authenticated table grant exists. Resource windows, hold TTL (default 300 seconds), maximum duration (7200 seconds), horizon (2592000 seconds), and maximum availability search window (604800 seconds) are server-owned. Synthetic windows are test fixtures, not representations of actual clinic hours. Resource/window changes must not occur concurrently with activation tests; a future administration contract must participate in the same clinic locking protocol.

All RPC calls use POST, even for HTTP GET projections, with a user-scoped Supabase client. The database independently verifies active reception/manager/dentist membership, the clinic gate and POST transport. Private tables use RLS with no client policies or grants; security-definer functions have empty search paths and explicit tenant predicates. The service validates strict response schemas and the requested identifiers before returning data. Errors expose stable codes only and responses use `no-store`.

Creates/releases acquire a clinic advisory transaction lock before sampling millisecond UTC database time. Paired resource occupancy is additionally enforced by a GiST exclusion constraint. Availability is an observational read, not a reservation. Expired holds project as expired immediately; a later successful create persists cleanup while holding the clinic lock. There is no scheduled cleanup worker in this slice. Cleanup events use server-owned nonhuman actor `00000000-0000-4000-8000-000000000001`.

Idempotency keys are durable and scoped by clinic, actor and command. Release keys additionally bind their canonical payload to the target hold. UTC-normalized timestamps make offset-equivalent commands replay identically. Replay occurs before mutable resource/duration checks and returns the immutable original receipt, including its original observation time and expiry. Clients must GET the hold to reconcile its current state. Disabled gates and revoked authorization still deny replay.

The migration adds nullable `aggregate_type` and `payload` columns to the existing private outbox; older producers remain compatible. Scheduling events persist the frozen v1 envelope. Outbox persistence does not mean delivery.

Verification: PGlite exercises the actual migration with `btree_gist`, but it cannot establish independent-connection race correctness. Full PostgreSQL pgTAP plus competing connections for shared providers/shared chairs, release/expiry/create races, and post-lock expiry timing are mandatory before activation. No hosted migration, real resources, real accounts or production activation are authorized by this implementation.
