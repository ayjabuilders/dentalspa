# ADR-002 — Multiple frontend applications, single modular business core
**Status:** Proposed accepted architecture.

Independent Next.js apps for Clinic OS, Patient Pass and public booking, deployed separately and backed by authenticated versioned NestJS APIs. Internal domain modules are bounded contexts with no direct cross-domain table writes; domain events propagate consequences. Do **not** deploy one microservice per module in V1. Extract separately if different runtime/capacity/operational needs prove it necessary.

Data isolation: one Supabase Postgres instance/project per environment for pilot, with clinic_id tenancy, explicit policy, RLS for exposed tables, security tests for server privileged paths, and future data segregation review as clients scale.
