# Vercel application configuration

This matrix describes the current code, not a completed deployment. Use separate
Vercel projects with the repository root available to each workspace build.
Do not copy the root `.env.example` wholesale into a browser application.

| Project | Root directory | Required configuration |
| --- | --- | --- |
| Dental API | `apps/dental-api` | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `HOSTED_SUPABASE_PROJECT_REF`, `ALLOWED_ORIGINS` |
| Clinic OS | `apps/clinic-os` | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_API_URL`, `CLINIC_SESSION_PROJECT_REF`, `CLINIC_APP_ORIGIN` |
| Public booking | `apps/public-booking` | `NEXT_PUBLIC_API_URL` |
| Patient Pass | `apps/patient-pass` | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_API_URL` |

The approved Dev project reference is `giufpdppsunryyhfnzps`. Its URL is
`https://giufpdppsunryyhfnzps.supabase.co`. Publishable keys belong in the existing
`*_ANON_KEY` configuration names used by this code. These variable names do not
require using a legacy JWT key.

`NEXT_PUBLIC_API_URL` is the API origin, without `/api/v1`. Never leave it empty
on Vercel: local fallbacks point to port 4300. All three Next configurations now
reject missing, non-HTTPS, IP/local-host or non-origin API values when `VERCEL=1`.
Turbo includes this flag and the validator in its build inputs. This validates
configuration syntax, not API reachability or DNS. Set `CLINIC_APP_ORIGIN`
to the exact Clinic OS HTTPS origin. Set `ALLOWED_ORIGINS` to the comma-separated
exact origins of the three browser apps; no wildcard. A changing preview origin
requires a matching configuration update. Public values are captured at build
time, so rebuild after changing them.

## API-only module switches

All switches default to disabled. The matching database gate must also be enabled
with the same server-held key; a switch never grants a user a role.

| Capability | Switch | Key |
| --- | --- | --- |
| Quote drafts | `ENABLE_HOSTED_QUOTE_DRAFTS` | `HOSTED_FINANCE_GATE_KEY` |
| Invoices | `ENABLE_HOSTED_INVOICES` | `HOSTED_FINANCE_GATE_KEY` |
| Payments | `ENABLE_HOSTED_PAYMENTS` | `HOSTED_FINANCE_GATE_KEY` |
| Installments | `ENABLE_HOSTED_INSTALLMENTS` | `HOSTED_FINANCE_GATE_KEY` |
| Team access | `ENABLE_HOSTED_TEAM_ACCESS` | `HOSTED_TEAM_ACCESS_GATE_KEY` |
| Patient documents | `ENABLE_HOSTED_PATIENT_DOCUMENTS` | `HOSTED_PATIENT_DOCUMENTS_GATE_KEY` |
| Agenda configuration | `ENABLE_HOSTED_AGENDA_SETTINGS` | `HOSTED_AGENDA_SETTINGS_GATE_KEY` |
| Staff confirmation/move/cancel | `ENABLE_HOSTED_CONFIGURED_BOOKING_CONFIRMATIONS` | `HOSTED_AGENDA_SETTINGS_GATE_KEY` |
| Public availability | `ENABLE_HOSTED_PUBLIC_AGENDA` | `HOSTED_PUBLIC_AGENDA_GATE_KEY` |
| Public request submission | `ENABLE_HOSTED_CONFIGURED_BOOKING_REQUESTS` | `HOSTED_PUBLIC_AGENDA_GATE_KEY` |

Public availability also requires `HOSTED_PUBLIC_AGENDA_CLINIC_ID`, selected on
the server. Automatic public confirmation additionally requires the confirmation
switch. This deployment currently binds one public booking site to one clinic;
it does not yet provide arbitrary clinic routing on one public hostname.

Private Storage and Auth Admin provisioning require `SUPABASE_SECRET_KEY`
(`SUPABASE_SERVICE_ROLE_KEY` remains a compatibility fallback; the secret variable takes precedence)
on the API server only. Never copy it, activation keys or `CRON_SECRET` into any
`NEXT_PUBLIC_*` variable or browser project. Use Vercel's sensitive environment
configuration for server credentials; do not commit their values.

The API cron is already configured for `/api/v1/internal/document-staging-cleanup`.
Its handler also requires `ENABLE_DOCUMENT_STAGING_CLEANUP=true`, a strong
`CRON_SECRET` and the exact project binding. It cleans expired staging objects,
not patient records. Direct document transfers use the private Storage service;
20 MiB uploads must not be sent through Vercel's API request body.

Completed direct imports keep their private staging copy until the cleanup worker
removes it. This supports recovery when the browser loses a completion response:
the same ticket and idempotency key can recover the receipt during the existing
30-minute ticket lifetime. The worker waits until ticket expiry plus its two-hour
capability grace period; deletion then depends on the configured cron schedule.
Verify the cron actually runs before enabling hosted imports. This is not a
retention policy for finalized patient documents.

## Outstanding release work

Hosted module selection is implemented, but historical database/contact/consent
and finance rules still include synthetic-only restrictions. Keep real patient
activation disabled until these are replaced by reviewed live configuration.
Verify actual Auth Admin provisioning, private file transfers, booking concurrency,
cross-clinic denial, session renewal, and browser journeys on deployed origins.
Complete export/restore verification and appropriate commercial hosting setup.
Use `HOSTED_FOUNDATION_ACTIVATION_PLAN.md` for evidence and remaining limitations.
