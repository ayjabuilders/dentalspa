# Patient matching — next-slice proposal

Status: **proposal for coordinator review, not a frozen contract or implementation authorization**. No patient-selection, creation, merge, account-link or booking command is defined by this document.

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
    match_basis: 'reference_exact' | 'name_search';
  }>;
  truncated: boolean;
};
```

The coordinator must freeze the endpoint, request shape, maximum page size, ordering, search semantics and error codes before parallel implementation. Do not silently change the current `/patients` array response into this object. A separate versioned lookup route is an option; updating existing consumers together is another.

The selected clinic comes from verified server-side membership context, not arbitrary query/body authority. A proposed initial role set is reception, manager and dentist, matching manual intake; it requires coordinator confirmation. Existing broader staff patient reads do not automatically authorize future selection or creation commands.

The lookup must not expose contact, clinical, financial or account-link data. A name result is a search suggestion, not an identity determination. An empty result means only that the specified lookup returned no rows; a truncated result explicitly requires refinement. No automatic selection, conversion, deduplication or merge follows the lookup.

## Requirement traceability

Line references identify the source passages in this repository at proposal time. Quoted statements are requirements; the proposed response and implementation boundaries above are recommendations.

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
| Existing-patient account verification and legacy deduplication rules are unresolved | [Clinic discovery](02_CLINIC_DISCOVERY.md), lines 19 and 21 |
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

## Decisions before contract freeze

1. **Lookup permission and limits:** confirm roles, minimum/maximum query length, maximum returned rows, deterministic ordering, and whether pagination or refinement is sufficient.
2. **Search semantics:** define exact-reference case handling and name matching. Accents, Arabic, punctuation and transliteration must not silently become identity equivalence. No confidence score is proposed.
3. **Search transport/privacy:** choose a request shape that does not place names/contact information in logs, telemetry or persistent browser storage. Preserve no-store responses and clear connected results on logout/session expiry.
4. **Identity evidence for later selection:** the clinic must define what staff actually check and how a mistaken selection can be corrected. Do not invent an approved verification procedure from the documents.
5. **Duplicate override for later creation:** decide who can create despite possible matches, required structured reason codes, review freshness and concurrency behavior. No free-form medical-note field is proposed.
6. **Patient reference and legacy data:** define reference generation and Orthalis export/import rules separately. No verified integration or migration process is established.
7. **Contact data:** decide whether later creation captures contacts, their verification state and permitted uses. Inquiry contact values must not silently overwrite a selected patient's record or authorize Patient Pass access.

## Verification and release boundaries

For the read-only slice, test role and tenant negatives, direct database policy enforcement, foreign IDs, query bounds/escaping, deterministic order, exact truncation behavior, empty results, revoked sessions and no unintended data fields. UI tests should distinguish no results from incomplete results and should not offer a misleading “no duplicate” conclusion.

Selection/creation later require replay/conflict tests, composite tenant constraints, atomic rollback, stale-review handling and real multi-connection creation tests. PGlite's queued transactions do not establish hosted contention guarantees. Operational gates in ADR-003 remain open until independently satisfied; use synthetic data only and do not deploy or activate real patient workflows through this proposal.
