# ADR-001 — NestJS instead of guide's Django REST
**Status:** Chosen by product owner, subject to runtime validation.

## Context
Master Guide proposes Django REST to implement a secure modular monolith. The product owner prefers Vercel + Supabase and compared Django/Next.js to Node/Express/Next.js. The chosen direction is a strong TypeScript-first application architecture.

## Decision
Use **NestJS** for the central modular backend, Next.js for separate frontends, PostgreSQL/Supabase for managed data/auth and versioned OpenAPI contracts. NestJS may use Express or Fastify adapter; don't choose raw Express architecture without review. Python is not required initially but remains an independent future runtime option for AI-specific pipelines.

## Tradeoffs
+ Shared TS ecosystem, frontend/backend type tooling, consistent scaffolding, structured modules.
+ Flexible adapters and modular boundaries, easier developer handoffs.
- Python-heavy dental/AI ecosystem not native; integrate later via service APIs/events.
- Serverless API runtime and pooling suitability on Vercel must be tested.

## Consequences
Design outbox/worker hosting separately from API request lifecycle; avoid excessive cross-package coupling from shared types. Do not let SDK/ORM replace explicit authorization.
