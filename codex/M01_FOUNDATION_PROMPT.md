# Codex Prompt — Milestone 01 (execute now)

You are the founding senior full-stack engineer and application architect for **Dental Spa OS**. The authoritative handoff is this repository's `README.md`, `AGENTS.md`, twelve numbered `docs/01_...` through `docs/12_...`, additional domain specs `docs/13_...` through `docs/16_...`, ADRs, and qa contracts. Read them before coding. Trace source-derived vs proposed requirements.

## Objective
Create a **running, tested, polished foundation** for a multi-app healthcare operations platform, using **synthetic data only**. Do not build clinical/AI functionality yet.

### Stack
- pnpm + Turborepo monorepo
- Next.js + TypeScript clinic-os (desktop-first), patient-pass (mobile-first installable PWA), public-booking (responsive)
- Tailwind + accessible shadcn primitives, Lucide icons, Motion with reduced-motion handling
- NestJS modular backend; `/api/v1`, OpenAPI, Zod or equivalent validation, strict role/tenant enforcement
- Supabase Postgres, Supabase Auth, private Storage migration structure; support local Supabase dev
- TypeScript contracts from API schemas and event schema draft
- Vercel deployment targets documented but **do not deploy**

### Deliver in incremental PRs
1. Establish package scripts: install, dev, lint, typecheck, unit, integration, e2e and CI.
2. Scaffold separate apps with own themes/components/layout; create minimal true-to-intent navigation shells and mock data states: Clinic `Ma Journée`, Patient Pass `Accueil`, public booking landing shell.
3. NestJS domain modules as bounded skeletons (`identity`, `clinics`, `patients`, `scheduling`, `workflows`, `clinical`, `treatment-cases`, `documents`, `communications`, `audit`); put no cross-domain SQL in controllers.
4. Configure Supabase local migrations with clinics, profiles, memberships, patients (minimal safe fields), audit and outbox *skeletons*. Provide policy tests. Do not fabricate full clinical schemas.
5. Implement bearer auth verification and identity→membership resolution plus policy guard with no-tenant/no-role deny semantics. Handle patient linkage separately.
6. Add health endpoints, versioned API documentation, correlation ID and structured logs excluding personal health data.
7. Test tenant isolation and patient own-resource access failures, signed-link private-by-default policy, no service-role secrets in frontend, responsive/keyboard/reduced motion UI, PWA manifest.
8. Document local setup and provide exact test output, risks, incomplete items and suggested next small PR.

### Interface quality
Polished modern product, not generic starter UI. Clinic OS should evoke a precise desktop app with command palette placeholder, contextual 'next actions', keyboard focus, elegant density and microinteractions. Patient Pass should look and behave like a native-feeling mobile app with bottom tabs, touch targets, safe-area and considered loading/empty/error states. UI interactions must be functional within stub scope, but mock states clearly labeled.

### Safety boundaries
Do not use real patient data; do not record audio; do not add AI API keys or patient prompt logs. No Orthalis/WhatsApp/social/scanner integrations until verified. No production deployment or migration. No clinical workflow marked approved.

### Finish response
Report implemented paths/commands, unit+integration+e2e results, security assumptions and blocked items, technical debt and M02 cutline. If environment credentials are missing, scaffold deterministic local setup with `.env.example` and document the missing inputs without blocking safe engineering work.
