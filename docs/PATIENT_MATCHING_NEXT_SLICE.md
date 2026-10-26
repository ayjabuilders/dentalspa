# M02.2 patient lookup — frozen development contract

Status: **frozen development contract for M02.2 read-only lookup**. No patient-selection, creation, merge, account-link or booking command is defined or authorized by this document.

## Recommended first slice: read-only clinic-scoped lookup

Start with a bounded, explicit lookup of existing patient records for authorized staff. Support exact patient-reference search and a separately labelled name search. Return explicit truncation and deterministic ordering so an incomplete result cannot be presented as proof that no existing patient exists.

Proposed response shape:

```ts
type PatientLookup = {
  items: Array<{
    id: string;
    clinic_id: string;
    reference: string;
    display_name: string;
    match_basis: 'reference_exact' | 'name_prefix';
  }>;
  truncated: boolean;
};
```

Shared schemas in `packages/contracts/src/patient-lookup.ts` are authoritative. Add `POST /api/v1/patients/lookup` with strict JSON `{mode, query}` and reject query-string parameters and unknown body fields. `reference_exact` accepts 1–256 Unicode code points; `name_prefix` accepts 2–120. Trim surrounding input whitespace only. Matching is literal and case-sensitive, preserving accents, punctuation, whitespace and script. Do not add wildcards, regular expressions, transliteration, accent folding, token rearrangement, fuzzy ranking or confidence scores.

Both transport hops use JSON-body POST: browser to Nest and Nest to a narrowly granted PostgreSQL RPC. Do not translate the lookup into Supabase REST filters, because those place identifiers in provider URLs. Do not log request bodies, query values or raw provider/database errors. Responses use `Cache-Control: no-store` and must never enter the service-worker cache.

Apply mode matching, clinic filtering, ordering and truncation inside PostgreSQL over the full clinic register. Fetch 21 rows, return at most 20, and set `truncated` when a twenty-first match exists. Order by `reference COLLATE "C" ASC, id ASC`. Return no total count and do not echo the query. Preserve the existing `/patients` array response and `GET /patients/:id` unchanged.

The selected clinic comes from verified server-side membership context, not arbitrary query/body authority. Active reception, manager and dentist memberships may use the lookup. The RPC independently repeats actor, active membership, role and clinic checks under fixed search-path rules and existing RLS. Anonymous, patient-only, assistant-only, inactive and foreign-clinic requests are denied. This endpoint boundary does not revoke assistants' existing minimal reads through foundation `/patients` and RLS; changing that policy requires a separate decision.

The lookup returns only id, clinic id, reference, display name and server-derived match basis. It must not expose contact, clinical, financial or account-link data. A name result is a search suggestion, not an identity determination. An empty result means only that the specified lookup returned no rows; a truncated result explicitly requires refinement. No automatic selection, conversion, deduplication or merge follows the lookup. Return 200 for success including empty results, 400 invalid input, 401 invalid identity, 403 forbidden scope and sanitized 503 for provider or malformed-result failure.

The RPC is read-only and writes no audit or outbox event. It accepts a clinic id from the trusted API adapter only to select the requested active membership; browser callers cannot establish authority by sending it. References are unconstrained in the existing database, so response validation leaves them unbounded. The 256-code-point reference query bound is an operational request limit, not a patient-identity rule; representative legacy-reference compatibility remains an activation check.

## Frontend acceptance

Embed a separate lookup component only inside the verified connection view. Keep `/patients` as the explicit synthetic preview. Require an explicit mode and submit; do not fetch the register on mount. Clear prior results and details when query or mode changes, abort superseded work and ignore late responses. Keep credentials, queries, results and details out of routes, browser storage, service-worker cache, telemetry and error text. Dispose and clear them on logout or expiry.

Support initial, loading, empty, truncated, denied, offline, unavailable and explicit retry states. Empty copy must not claim that no patient exists; truncated copy requires refinement. Label name results as unverified search suggestions. Opening a result is read-only preview only: no select, create, merge, account-link or booking action, and no automatic first-result selection. Use initials rather than generated portraits for connected records.

## Requirement traceability

Line references identify the source passages in this repository at contract-freeze time. Quoted statements are source requirements; the bounded lookup decisions above are the approved development contract.

| Requirement | Source passage |
| --- | --- |
| Find before create; no automatic merge on weak identifiers | [Master workflows](03_MASTER_WORKFLOWS.md), line 8: “Find existing patient before create; do not merge on weak identifiers automatically.” |
| Duplicate-safe patient conversion belongs to acquisition | [Module PRD](04_MODULE_PRD.md), line 9: “duplicate-safe patient conversion” |
| Patient identity/contact and verified account linkage are separate responsibilities | [Domain model](05_DOMAIN_MODEL.md), lines 5 and 7: identity owns separately verified account links; Patient owns clinic-scoped identity/contact and verified contacts |
| Cross-domain references must remain tenant checked | [Domain model](05_DOMAIN_MODEL.md), line 20: “Every cross-domain reference is explicitly tenant-checked.” |
| Search is clinic scoped; creation follows duplicate review | [Draft endpoint inventory](../contracts/OPENAPI_DRAFT.yaml), lines 24–34: staff-scoped patient search; creation with duplicate review; 409 suspected duplicate/conflict. This file explicitly identifies itself as an incomplete design draft in lines 5–7. |
| Matching an existing record must not create an authenticated patient account link | [Test/pilot plan](11_TEST_PILOT_PLAN.md), line 5: “Existing patient's booking via phone → matching without duplicate → later user account linked securely.” |
| Name or phone alone cannot establish Patient Pass identity | [Security and safety](09_SECURITY_SAFETY.md), line 10: “Account must be verified and linked through secure enrollment/recovery; name or phone alone is insufficient.” |
| Anonymous public booking must not enumerate patients | [Test/pilot plan](11_TEST_PILOT_PLAN.md), line 13 |
| Existing-patient account verification and legacy deduplication rules are unresolved | [Clinic discovery](02_CLINIC_DISCOVERY.md), lines 17 and 19 |
| Development dependencies and operational release gates are separate | [ADR-003](adr/ADR-003_DEVELOPMENT_AND_RELEASE_GATES.md), lines 7 and 11 |

## Current implementation constraints

- The foundation `public.patients` table has only `id`, `clinic_id`, `reference`, `display_name` and `created_at`. `(clinic_id,reference)` is unique. See [foundation migration](../supabase/migrations/20261026131434_foundation.sql), lines 25–31.
- Patient email, phone, date of birth, verified-contact records and external identifiers are not implemented. The lookup must not imply searching fields that do not exist.
- The existing [patient repository](../apps/dental-api/src/patients/infrastructure/patient.repository.ts) limits list results to 100 without returning truncation. A filtered view of that partial list cannot establish absence from the clinic's complete patient register.
- M02.1 inquiry creation has a strict, immutable result with `status: new` and no patient selection. Changing that response or mutating the original inquiry fields affects idempotency replay semantics. Future selection should use a separate relation/projection, or a deliberately revised contract preserving original command results.
- `patient_account_links` is a separately verified authentication boundary. A staff search or inquiry selection must not write to it.

## Subsequent sub-slices — not ready to implement

### Explicit selection of an existing patient

After identity-check policy is defined, consider a separate inquiry-to-patient selection command. It should record the actual staff decision, actor and time; validate the current clinic and both resources; reject conflicting selections; and commit idempotency, selection, audit and outbox atomically. It must not claim identity verification beyond the evidence actually collected or create a Patient Pass account link. Whether a stored review snapshot or freshness token is required is still undecided.

### Patient creation after duplicate review

After duplicate-review and override policies are defined, consider a separate patient-creation command. It must recheck relevant candidates in the transaction, protect concurrent retries, generate a clinic-unique reference and preserve audit evidence. Same-name people can be legitimate different patients, so name uniqueness is not a safe identity rule. No automatic merge, contact overwrite or import reconciliation is proposed.

### Booking

Scheduling follows its own frozen contract and resource-locking dependencies. A lookup or selection result is not an appointment request, reservation or confirmed booking.

## Decisions deferred beyond lookup

1. **Identity evidence for later selection:** the clinic must define what staff actually check and how a mistaken selection can be corrected. Do not invent an approved verification procedure from the documents.
2. **Duplicate override for later creation:** decide who can create despite possible matches, required structured reason codes, review freshness and concurrency behavior. No free-form medical-note field is proposed.
3. **Patient reference and legacy data:** define reference generation and Orthalis export/import rules separately. No verified integration or migration process is established. Audit representative legacy reference lengths before activation.
4. **Contact data:** decide whether later creation captures contacts, their verification state and permitted uses. Inquiry contact values must not silently overwrite a selected patient's record or authorize Patient Pass access.

## Verification and release boundaries

For the read-only slice, test role and tenant negatives, direct database policy enforcement, foreign IDs, query bounds/escaping, deterministic order, exact truncation behavior, empty results, revoked sessions and no unintended data fields. UI tests should distinguish no results from incomplete results and should not offer a misleading “no duplicate” conclusion.

Selection/creation later require replay/conflict tests, composite tenant constraints, atomic rollback, stale-review handling and real multi-connection creation tests. PGlite's queued transactions do not establish hosted contention guarantees. Operational gates in ADR-003 remain open until independently satisfied; use synthetic data only and do not deploy or activate real patient workflows through this contract.
