# 07 — Integration Matrix (verification needed)

| External system/channel | Pilot strategy | Status/risk | Required verification |
|---|---|---|---|
| Orthalis (legacy) | Manual or permitted export / staged import | **Unverified** API/export/ownership | Exact edition, vendor rights, export schema, migration validation |
| Dental Spa website/public booking | Direct public booking app → NestJS API | To build | DNS, branding, booking resource rules |
| Telephone | Manual entry first | No automatic call capture assumed | Provider compatibility and permissions |
| WhatsApp Business | Manual reception queue initially | API connection unverified | Official Business API provider, templates, consent, payload minimization |
| Instagram DMs | Manual entry initially | API access unverified | Provider permissions and rate limitations |
| Google Business Profile | Source attribution/manual contact | Unverified automation | Supported official integrations |
| Email/shared inbox | Manual intake or approved connector | Unverified | Shared-account access, security |
| Internal/external lab | Secure export/manual acknowledgement | Integrations not built | Lab contracts, secure transport, file compatibility |
| Imaging/scan/CAD/CAM | References and manual file uploads initially | Hardware/vendor-dependent | Exact device models, license/export format, supported workflows |
| Supabase Auth | Identity provider | Chosen | MFA/SSR, organization memberships, patient verified linking |
| Vercel | Next.js host, API option | Chosen target | Runtime suitability, long-lived jobs, pooler, private networking requirements |
| AI transcription/provider | Mock first | **Unselected** | Consent, processor DPA, non-retention guarantees, cross-border approval |

**Never promise** a live integration until a tested connector and lawful data path exist. Every integration needs contract, scopes, retries, idempotence, authentication, audit and off switch.
