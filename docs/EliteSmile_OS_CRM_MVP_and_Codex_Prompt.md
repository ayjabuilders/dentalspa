# EliteSmile OS / Dental Spa OS
## Patient CRM MVP specification and Codex execution prompt

**Version:** 1.0
**Date:** 29 October 2026
**Status:** Authoritative scope for this local development iteration; not a production-readiness declaration.
**Product boundary:** Patient relationship and administrative operations, from first contact or public booking to aftercare and the final service review.

This document consolidates the requested MVP from the **Patient CRM Features** conversation. It includes the supporting finance, patient/family access, documents, WhatsApp, team and settings capabilities needed to make that journey work. It does not choose between existing repositories. Codex must apply it to the existing project in which the execution prompt is launched, audit that project first, and extend what is already built.

The deliverable is this specification and the copy-paste prompt in section 13. Reading this document does not itself authorize implementation, external messages, deployment, or database operations. Pasting the execution prompt into the intended project authorizes the local implementation described there.

## 1. Authority, scope and non-negotiable boundaries

### 1.1 What controls the work

1. The user's latest explicit decisions control product scope and execution boundaries.
2. This specification defines the MVP requirements and acceptance gates.
3. Existing source code, migration history, architecture decisions and verified tests establish what must be preserved and extended.
4. Project PDFs supply workflow context. They do not prove implementation, approve clinical protocols, or expand this MVP.

Where existing implementation differs from a requirement, record the gap and evolve it compatibly. Do not label existing behavior complete merely because a screen or table exists. Do not replace a functioning architecture to match the conceptual entity names in this document.

### 1.2 Included modules

| Module | MVP outcome |
| --- | --- |
| CRM and booking | Capture inquiries, convert to patients, manage appointments and coordinate the administrative journey |
| WhatsApp API | Receive and reply to messages, assign conversations, and convert or link contacts to patients |
| Patient / Family Pass | Secure mobile access to each authorized person's appointments, journey, documents and finances |
| Documents | Private uploads, reviewed publication and manual administrative completeness tracking |
| Finance | Service pricing, devis, invoices, payment methods, deposits, installments, receipts and reconciliation |
| Team and permissions | Invite staff and control modules, actions, patient scope and sensitive approvals |
| Settings and integrations | Configure clinic rules, services, communications, permissions and secure API connections |
| Aftercare and reviews | Assigned follow-up, concern escalation, recall, feedback and voluntary review invitations |

### 1.3 Explicitly out of scope

- **All EliteSmile laboratory automation:** lab production, CAD/CAM, scan processing, manufacturing, 3D printers, inventory consumption, lab dispatch/status synchronization, quality-control release, supplier or technician automation. An optional manual external-lab note may explain an appointment dependency; it must trigger no lab workflow.
- **CNSS/CNOPS claim processing:** eligibility, reimbursement calculations, claim submission, insurer integration, automated form filling, insurance templates, insurer payment adjudication or approval tracking. Only patient file uploads and a manual administrative checklist are included.
- Replacing a clinical electronic record, diagnosis, prescriptions, autonomous clinical advice, detailed charting or treatment planning. Link to existing approved clinical records where available.
- AI agents, voice agents, Smart Notes, audio recording/transcription, smile simulation and automatic medical decisions.
- Instagram/email synchronization, marketing campaign automation, mass messaging, full accounting/general ledger, payroll, inventory, procurement, bank-feed synchronization and multi-clinic SaaS billing.
- Live payment-gateway charging, bank transfers or refunds. The MVP records and reconciles verified payments; a future provider integration requires a separate activation decision.
- Production deployment, connecting to any hosted/live database, importing real patient data, changing live account settings or sending messages to real people during this execution.

Existing out-of-scope features must be preserved. Do not delete them, activate them, or expand their behavior to satisfy this MVP.

## 2. Patient journey and required user flows

The patient, lead, appointment, journey, document, payment and communication statuses are separate. A paid invoice does not prove treatment completion; a booking request is not a confirmed appointment; an uploaded document is not a reviewed document.

### Flow A: Public booking to reception

1. A visitor opens the clinic's public booking link, selects a service and an available slot, and supplies the minimum contact details and required administrative consent.
2. The server validates clinic, service, duration, practitioner/resource availability and booking policy. It creates a request or confirmed appointment according to the configured mode.
3. The visitor receives a clear on-screen acknowledgement. Messaging delivery is separately tracked; an API request alone is not proof of delivery.
4. Reception reviews possible existing-patient matches without exposing those records publicly, assigns an owner, and confirms or proposes another slot.
5. After verified identity linking, the patient receives access to their Pass, intake tasks and required-document list.
6. Reception records arrival, waiting, consultation handoff, completion and the next appointment/action. Clinical actions remain under clinician authority.

**Failure paths:** stale slot, concurrent booking, expired hold, duplicate submission, invalid contact, unknown availability, cancellation, reschedule conflict, no-show, provider outage and network loss. The user must receive a recoverable state without a duplicate appointment.

### Flow B: WhatsApp contact to patient

1. A verified inbound webhook creates or updates a channel contact and conversation within the configured clinic.
2. Reception assigns the conversation, records requested service and follow-up, and selects **Create patient** or **Link to existing patient**.
3. The system suggests possible matches. An authorized staff member verifies identity and resolves ambiguity; a shared phone number never proves identity.
4. Conversion atomically creates or links the patient, preserves the original contact and lead history, and records the actor and conversion time.
5. Staff can book, prepare a devis, request documents and invite the patient to the Pass using the linked record.

**Failure paths:** duplicate webhook, repeated conversion click, simultaneous conversion, multiple family members sharing a number, revoked permission, invalid signature and message-delivery failure. No duplicate patient or unauthorized account access may result.

### Flow C: Individual and family access

1. An authenticated adult obtains access only through a verified patient-account link.
2. The adult may receive an explicit authorized relationship to a child or another adult. A family label alone grants nothing.
3. The Pass shows a member switcher and identifies the active patient on appointments, uploads and financial screens.
4. Each request checks the selected member's current access grant and allowed actions. Adults control delegation to their own records; guardian access to minors requires the clinic's validated procedure.
5. Revocation removes future access immediately at the authorization boundary and clears cached/private UI state.

**Failure paths:** unrelated family member, changed guardianship, expired delegation, child reaching the policy's adult transition, shared payer without record access, and switching members while an upload or request is pending.

### Flow D: Devis to reconciled payment

1. Authorized staff select services from the clinic price book and prepare a versioned devis. Clinical plan approval, where required, is recorded independently.
2. Discount/negotiated-price requests go to the financial approver. Acceptance applies to an exact devis version.
3. An authorized user issues an invoice with immutable service, price, tax and payer snapshots.
4. Staff record a verified deposit or payment with its actual method, reference and receiving account/cash drawer. Allocate it to invoices without counting the same money twice.
5. The patient sees their devis, invoice, receipt, paid amount, remaining balance and installment schedule.
6. At closing, authorized finance staff compare expected receipts with counted cash or settlement evidence, explain discrepancies and reconcile the session.

**Failure paths:** rejected price override, superseded devis, duplicate payment request, unverified transfer, failed/returned payment, overpayment, partial allocation, refund request, closed session and unauthorized aggregate report access.

### Flow E: Documents and CNSS/CNOPS

1. Patient or authorized staff uploads a file into the correct patient's private folder.
2. Staff classify it, review it where needed and explicitly release any staff-provided patient-facing content.
3. Staff manually update the administrative checklist: **Not applicable / Missing / Received / Needs correction / Completed manually**.
4. The Pass displays permitted files and missing actions. A checklist completion means the clinic marked its paperwork complete; it does not mean the insurer accepted or reimbursed anything.

### Flow F: Aftercare to final review

1. An authorized staff member confirms the relevant visit/journey stage is complete and assigns follow-up with a due date.
2. Only clinician-approved instructions are released. Patient concerns go to the clinician with an owner and unresolved status until handled.
3. Staff record contact attempts, outcome, recall date and next action.
4. The patient may provide private feedback or a complaint. Complaints have an owner, response and resolution history.
5. All eligible patients may receive the same voluntary public-review invitation, regardless of private rating. Opening a review link does not prove a review was submitted.

## 3. CRM and booking specification

### 3.1 Inquiry and patient management

- Capture public booking/contact requests and manual phone, walk-in, referral, WhatsApp and social inquiries. Non-WhatsApp external channels can remain manually logged.
- Record source, campaign/referral when known, requested service, preferred language/channel/time zone, administrative priority, owner, next action and due date.
- Separate a prospect/contact from a patient record. Record conversion, closure and lost reasons.
- Provide search, duplicate suggestions and deliberate linking. Normalize phone/email for matching, but never automatically merge people on those fields.
- Support privileged duplicate resolution with a merge preview, retained identifiers, linked-record validation and audit. Do not silently combine portal identities or family permissions. If safe merge is not yet available, duplicate review/linking must work and merge remains explicitly incomplete.
- Patient profile: unique ID, identity/contact details, date of birth where needed, address/country, emergency contact, communication preferences, consent history, coordinator, tags and restricted administrative notes.
- Show a chronological timeline of appointments, conversations, documents, devis, payments, tasks and released journey milestones.
- Allow multiple journeys/cases and many appointments per patient. Preserve existing case references; do not create a competing clinical system.
- Provide preparation status, required forms/documents, reception checklist, responsible staff and next action.

### 3.2 Booking and calendar

- Responsive public booking link plus staff-created appointments and returning-patient booking from the Pass.
- Configurable service duration, buffers, working hours, holidays, breaks, practitioner availability and required chair/resource constraints.
- Day/week calendar, appointment details, filters and a reception/today view.
- Explicit request-only mode when availability cannot be guaranteed. Never show unverified availability as confirmed.
- Transactional slot reservation/confirmation and atomic rescheduling. Concurrent requests must not double-book any constrained resource or patient.
- If using temporary holds, include expiration and race-safe release. A stale hold must not permanently block availability.
- Confirm, cancel, reschedule, mark arrival, progress, completion and no-show with valid transitions and actor/time history.
- Capture cancellation/no-show reason; maintain a simple waitlist and manual promotion to a newly checked slot.
- Confirmation, preparation and reminder templates; deduplicated scheduled reminders only when the corresponding transport is enabled. Revalidate appointment state and consent when sending.
- Use UTC instants plus IANA clinic time zone, initially `Africa/Casablanca`; never assume a fixed UTC offset. Display the correct date/time to staff and patients.

### 3.3 Tasks, follow-up and reporting

- Assign patient/lead/appointment tasks, priorities and due dates; support reassignment, comments and completion history.
- Work queues: unassigned inquiries, unanswered conversations, pending confirmations, missing documents, unanswered devis, overdue tasks, no-shows, aftercare and complaints.
- Basic reporting: inquiries by source, conversion with a defined denominator, new/returning patients, appointments by status, no-shows, overdue work, feedback responses and review invitations.
- Every count must come from persisted, authorized records and a clear date range. Finance totals remain separately permissioned.

### 3.4 State models to map to existing contracts

| Domain | Required distinctions |
| --- | --- |
| Lead | New, Qualifying, Follow-up, Waiting for patient, Booked/Converted, Closed with reason |
| Appointment | Requested, Confirmed, Arrived, In progress where supported, Completed, Cancelled, No-show |
| Preparation | Not started, Incomplete, Ready, Needs review |
| Journey | Consultation, Proposal, Awaiting response, Accepted, Active, Paused, Completed, Closed |
| Task | To do, In progress, Blocked, Completed, Cancelled |
| Aftercare | Pending, Contact attempted, Response received, Escalated, Completed |
| Feedback | Not requested, Requested, Received; complaint resolution tracked independently |

Define valid transitions server-side. Do not rename existing states without a migration and backward-compatible contract strategy. An administrative journey state never grants clinical authorization.

## 4. WhatsApp API and communication

### 4.1 Inbox and conversion

- Clinic-scoped inbox, unread/pending indicators, assigned owner, searchable contact/conversation and patient link.
- Receive inbound text and supported media metadata; implement safe private media ingestion if attachments are supported. Unsupported content must be clearly labeled.
- Staff replies, approved template selection, message history and queued/accepted/sent/delivered/read/failed status where the provider supplies it. No invented read or delivery status.
- **Convert contact to patient** and **Link existing patient** actions with duplicate review, idempotency and preserved provenance.
- If a shared household conversation refers to several patients, require explicit patient context before attaching sensitive content. Do not publish the whole conversation to every family member.
- Store communication permission/opt-in evidence and opt-out independently of preferred channel. Inbound contact is not blanket marketing consent.

### 4.2 Settings → Integrations → WhatsApp

- Use the existing provider if one is already implemented; otherwise plan for Meta WhatsApp Cloud API behind a small provider interface.
- Configure provider, business/WABA identifier, phone-number identifier, supported API version, callback URL, access-token reference, app-secret reference and webhook verification secret reference.
- Credentials are write-only secrets on the server. Settings return masked presence/health, never stored secret values. Support authorized replacement, rotation and disconnect.
- Show connection state, last successful event, last sanitized error, template availability and enabled/disabled send status.
- Verify webhook subscription challenge and signed request authenticity using the provider's current specification. Validate the configured business/phone identifiers before tenant routing.
- Persist an authenticated event durably before acknowledging successful receipt. Enforce payload limits, unique provider event/message IDs and retry-safe processing.
- Use a transactional outbox for sends, bounded retries/backoff, terminal failure and an authorized retry action. Protect against double sends after timeout or worker restart; mark uncertain outcomes for reconciliation rather than blindly resending.
- Enforce the provider's current conversation-window, template and opt-in rules at send time. Re-check official documentation when implementing; do not hardcode stale policy assumptions.
- Send neutral administrative messages and secure portal links. Do not include clinical documents, internal notes or diagnosis in ordinary notifications by default.

### 4.3 Local acceptance versus activation

Implement and test the real provider adapter against a local fake server and signed webhook fixtures. Simulate provider failures, duplicate callbacks, out-of-order statuses and unknown delivery outcomes. In local mode, all external delivery is disabled and the UI must say **Simulated / Not connected** accurately.

Local acceptance does not prove Meta onboarding, credentials, template approval or end-to-end live delivery. These are later activation gates. Do not ask for live credentials just to continue local development.

## 5. Patient / Family Pass and documents

### 5.1 Patient Pass

- Extend the existing mobile app/PWA and auth model; no second patient app or unrelated identity system.
- Secure invitation, sign-in, recovery and sign-out; use verified patient-account linkage, expiring invitations and revocation.
- Dashboard: next appointment, next administrative action, journey progress, outstanding documents and permitted balance information.
- Upcoming/history appointments, confirmation and cancel/reschedule requests within configured policy.
- Administrative onboarding, consent acknowledgements and contact-correction requests.
- Secure document upload/download, released devis/invoices/receipts, installment schedule, approved preparation/aftercare instructions and reception messages.
- Feedback, complaint/help request, preferred language/channel and notification choices.
- Mobile accessibility, readable error states, keyboard/focus support and Arabic/RTL readiness consistent with existing localization. Do not silently discard existing language support.

### 5.2 Family Pass

- One account may switch between explicitly authorized family members; every person retains their own patient ID and record.
- Represent relationship, authority basis, grantor/verifier, allowed actions, start/expiry and revocation. Keep guardian and adult-delegate access distinct.
- Permissions can distinguish viewing appointments, booking, documents, finances and submitting administrative forms.
- Financial responsibility is separate from medical/document access. Paying a child's or partner's invoice does not grant their entire record.
- Apply explicit adult-consent and minor/guardian verification policies before live use. In local development use clearly labeled synthetic policy fixtures; do not invent legal rules.
- Never infer family membership from name, address, telephone or a WhatsApp contact.

### 5.3 Document center and manual CNSS/CNOPS checklist

- Private storage and metadata scoped by clinic and patient, with categories such as identity, administrative consent, devis, invoice, receipt, approved instructions, CNSS, CNOPS and other uploaded documents.
- Preserve existing upload limits and allowed formats unless a justified change is reviewed. Validate actual file content, MIME, size and filename/path; reject executable content and path traversal.
- Track uploader, upload time, category, version, review state, visibility/release state and reviewer.
- Patients can see their own submissions and explicitly released staff documents. Internal notes, unreleased clinical files and other patients' metadata are excluded.
- Every download reauthorizes access; use short-lived signed URLs or an authorized download proxy. Never expose public buckets or permanent bearer links.
- Manual CNSS/CNOPS fields: category, checklist status, missing-item note, responsible staff, last update and optional completion date. Uploaded files remain linked to the patient.
- Do not create claim numbers, reimbursement estimates, claim state machines, automated insurance templates or insurer connectors.
- Record sensitive downloads and publication changes without logging file content. Remove orphaned uploads safely after failed metadata writes; retain recoverable error information.
- Do not cache private documents, records, authenticated pages or API responses in the PWA service worker. Offline mode may show only a public, data-free screen.

## 6. Finance specification

### 6.1 Pricing and catalog

- Service code, name, category, active/archive state, default price, currency, applicable configured tax, appointment duration and effective date.
- Preserve historical prices through quote/invoice line snapshots; a new catalog price must not rewrite issued documents.
- Configurable deposit requirement and permitted payment methods. Any service bundle must retain itemized, auditable values.
- Price/discount overrides require a reason and the configured financial approver. Approval is bound to the exact document version and expires when the subject changes.
- No clinical indication is inferred from a selected service or a payment.

### 6.2 Devis / estimates

- Draft with patient, payer where different, optional journey/case link, services, quantities, prices, discounts, taxes, total, validity and payment terms.
- Versioned states: Draft, Awaiting financial approval if needed, Approved/Ready, Sent/Published, Accepted, Refused, Expired, Superseded.
- Acceptance records the exact version, actor, timestamp and evidence; distinguish staff-recorded acceptance from authenticated patient acceptance. Do not claim legally qualified electronic signature without such a system.
- Share in the secure Pass and provide printable/downloadable output using existing document infrastructure.
- Follow-up queue for pending devis; editing an accepted devis creates a new version requiring new acceptance.

### 6.3 Invoices and corrections

- Draft, issue, view/download and track invoices linked to patient/payer and optionally an accepted devis.
- Allocate invoice numbers transactionally, uniquely within clinic and configured series. Never reuse an issued number.
- Snapshot clinic identity, payer, services, currency, dates and configured tax details at issue time.
- Issued invoices are immutable. Corrections use authorized credit/correction documents with reason and original reference; do not delete or rewrite posted history.
- Distinguish issue status from computed settlement status: unpaid, partly paid, paid, overdue and credited as applicable.
- Tax rates, required numbering/identity fields and invoice wording must be configurable and validated by the clinic's accountant before live issuance. Do not assert statutory compliance from this specification.

### 6.4 Payment methods and receipts

- Support recording cash, card terminal, bank transfer, cheque and a clearly named configurable method such as mobile wallet.
- Each method defines active state, reference requirement, receiving account/drawer and settlement behavior.
- Record amount, currency, received/effective time, method, collector, payer, reference, status and allocations. Never store card PAN/CVV or banking credentials.
- Pending transfer, uncleared cheque and failed payment must not count as cleared cash. Keep payment confirmation separate from bank settlement when applicable.
- Allow split-method payment through distinct payment entries and receipts/allocations; do not double-count it as one extra aggregate payment.
- Deposits become allocated payments or explicit unapplied credit. Never create revenue twice when a deposit is later allocated.
- Issue a receipt for a confirmed payment with a unique reference and linked allocation details. External-provider status must be reconciled if such a provider is later introduced.
- Refunds and reversals require dedicated permission, reason and original-payment reference. Record a refund only when actually performed/verified externally; requesting one does not move money.

### 6.5 Installments and balances

- Installment plan: agreed total, linked invoice(s), deposit, due dates, installment amounts, status and approval/acceptance history.
- Installment sums must equal the agreed amount after the explicitly recorded deposit/credit treatment; prevent inconsistent schedules.
- Allocate partial receipts to installments/invoices without exceeding the confirmed available payment amount.
- Derive remaining balance from issued debits, posted credits and valid net payment allocations. Recompute after a reversal/refund, preserving whether a refund also has a corresponding credit note.
- Rescheduling installments changes a versioned agreement and future due dates, not historical receipts.
- Display due, paid, partial and overdue amounts; support an authorized reminder queue without shaming text or automatic clinical decisions.

### 6.6 Reconciliation and restricted reporting

- Cash session: opening float, collector/drawer, confirmed cash in, verified cash refunds/out, expected close, counted cash, discrepancy, reason, approver and close time.
- Card/bank/cheque reconciliation: match recorded payments against manually supplied settlement/reference evidence; track pending, matched and disputed items.
- Closing freezes the session. Reopening/correction requires explicit permission and audit; no silent edits to a closed period.
- Receipt/payment list, outstanding balances, aging, collections by method and reconciliation reports for authorized finance roles.
- Reception/cashier may collect and see the necessary patient balance or own drawer data without querying clinic earnings, margins, other cashiers' totals or owner reports.
- Exports obey the same scope and column restrictions as the API and screens. Basic finance CSV and printable reports are sufficient; a full accounting integration is not required.

### 6.7 Financial invariants and numeric acceptance fixture

Use integer minor units or exact decimal arithmetic with a documented currency/rounding policy. Never use unrounded binary floating-point values as accounting truth. Do not silently mix currencies; the initial clinic currency may be MAD, with no foreign-exchange engine in this MVP.

Synthetic test example, with tax explicitly disabled for the fixture:

1. Two units at MAD 500.00 produce MAD 1,000.00. An authorized 10% discount produces an issued total of MAD 900.00.
2. A confirmed MAD 300.00 deposit allocated once leaves MAD 600.00 due.
3. Two installments of MAD 300.00 cover that remainder. Recording MAD 200.00 against the first leaves MAD 100.00 on it and MAD 400.00 total due.
4. Retrying the same payment request creates no new money or receipt. An allocation beyond the available payment is rejected.
5. A verified MAD 100.00 refund without a credit note reduces net paid and raises total due to MAD 500.00. A separate MAD 100.00 posted credit then reduces due to MAD 400.00. Preserve both histories.
6. A separate cash-session fixture with opening MAD 100.00, cash receipts MAD 500.00 and cash refunds MAD 50.00 expects MAD 550.00. Counting MAD 540.00 records a MAD -10.00 discrepancy requiring explanation.

Also test concurrent numbering, rounding, zero/negative input validation, overpayment as unapplied credit, pending cheque exclusion, failed settlements and unauthorized refund/report requests.

## 7. Team permissions, settings and security

### 7.1 Team and permission editor

- Invite, activate, suspend and revoke staff; expire/revoke invitations and prevent invitation replay. Use a local email sink during development.
- Assign roles, clinic scope, module visibility and action permissions. Suggested roles: owner/admin, manager, reception, assistant/coordinator, dentist, finance/cashier and patient/delegate.
- Permission dimensions: view, create, edit, assign, approve, export, collect, refund, reconcile, publish documents and manage integration settings.
- Hiding a menu is only presentation. Enforce permissions in API handlers, domain services, queries, file access, exports, background work and database policies.
- A manager/owner is not automatically a clinician. A cashier is not automatically a financial approver. A family delegate is not staff.
- Staff cannot grant themselves wider privileges. Prevent removal of the last active administrative access path without a validated replacement.
- Permission changes and suspension take effect on subsequent sensitive requests, including sessions with stale token claims.

| Actor | Default permitted scope | Explicit restrictions |
| --- | --- | --- |
| Reception | Inquiries, booking, administrative patient data, assigned messages, configured payment collection | No owner earnings/margins, integration secrets, arbitrary refunds or clinical approval |
| Assistant/coordinator | Assigned patients/tasks, preparation, permitted documents and communications | No automatic finance/admin/clinical authority |
| Dentist | Relevant patient/appointment context and approval of clinical content within existing system | No automatic integration administration or unrestricted financial reporting |
| Finance/cashier | Assigned collection, receipts, balances; reconciliation only if granted | Clinical/internal records excluded; refund/price approval separately granted |
| Owner/manager | Team/settings and authorized operational/financial oversight | Clinical authority requires separate qualification/permission |
| Patient/delegate | Own or expressly delegated patient projection and permitted actions | No internal notes, other patients, unreleased content, clinic totals or role administration |

### 7.2 Settings

- Clinic display/legal identity, contacts, time zone, language and default currency.
- Services, price books, durations, buffers, business hours, holidays, practitioners/resources and booking request/confirmation policy.
- Document categories and administrative checklist definitions; CNSS/CNOPS stays manual.
- Payment methods, invoice/devis/receipt sequences, configured tax treatment, discounts/approval thresholds and reconciliation rules.
- Team roles and permission presets; integration configuration and masked connection diagnostics.
- Message templates, consent rules, reminder schedules and review URL. Public review invitations must not be filtered by private satisfaction score.
- Audit settings changes and version consequential configuration. Existing invoices, accepted devis, appointments and grants must not be silently reinterpreted.

### 7.3 Security baseline

- Derive identity and clinic membership from verified server-side authentication. Never trust caller-supplied patient/clinic IDs or editable user metadata as authority.
- Default deny; enforce tenant, patient and action scope independently. Use compound ownership checks/foreign keys where appropriate.
- RLS on exposed tables; least-privilege grants; safe views and restricted privileged functions. Service-role access can bypass RLS, so API authorization remains mandatory.
- Family access needs an explicit current grant in both API and data policy paths. Membership in the same clinic is not sufficient for patient access.
- Private buckets and explicit release rules; test metadata listing as well as file downloads. Existing broad read policies must be reviewed before new sensitive entities are added.
- Store secrets only in ignored local configuration or the existing server-side secret mechanism. Never print `.env` contents, connection strings, tokens, passwords, cookies or authorization headers.
- Validate payloads, lengths, file signatures and allowed identifiers; constrain public endpoint abuse and avoid patient enumeration. Check CSRF/origin handling appropriate to existing auth.
- Atomic domain write + audit + outbox for consequential actions; idempotency scoped to actor/clinic and payload fingerprint. A reused key with a different request must fail.
- Audit actor, authorized scope, action, entity/version, time and safe change metadata. Protect audit integrity and sensitive read/export records; avoid raw health data in logs.
- Clear private state on sign-out, expiry, permission denial and family-member switch. Sensitive responses use appropriate no-store/cache controls.
- Restrict bulk export and retention/deletion actions. Preserve financial/audit history according to approved policy; do not invent a retention period.
- Provide synthetic backup/restore evidence for records and private files. Later real-patient release requires appropriate privacy, hosting, retention, recovery and operational reviews, including Moroccan requirements where applicable.

## 8. Domain entities and compatibility rules

These are conceptual boundaries, not a mandatory new database schema. Map each one to the existing tables, types, services and events before adding anything.

| Domain | Entities / essential relationships |
| --- | --- |
| Identity | Clinic, User/Auth identity, Membership, Role, Permission, StaffInvitation, PatientAccountLink |
| CRM | Contact, ChannelIdentity, Lead/Inquiry, LeadPatientLink, Patient, Consent, Activity, Task, Assignment |
| Booking | Service, AvailabilityRule, Practitioner, Resource, SlotHold if used, Appointment, AppointmentHistory, WaitlistEntry |
| Journey | Existing Case/Journey reference, administrative Milestone, IntakeSubmission, PreparationChecklist |
| Messaging | IntegrationConfig, SecretReference, Conversation, ConversationParticipant, Message, WebhookReceipt, DeliveryAttempt, Template, ConsentEvidence |
| Family | Family/Household grouping, Relationship, AccessGrant, GuardianVerification, Payer relationship |
| Documents | Document metadata, DocumentVersion, StorageObject reference, Release, ChecklistItem/Status |
| Finance | PriceBook, PriceVersion, Quote, QuoteVersion/Line, PriceOverrideApproval, Invoice/Line, CreditNote, Payment, PaymentAllocation, Receipt, Refund/Reversal, InstallmentPlan/Item, CashSession, ReconciliationItem |
| Follow-up | AftercareTask, ApprovedInstruction reference, Concern, Recall, Feedback, Complaint, ReviewInvitation |
| Infrastructure | AuditEvent, OutboxEvent, IdempotencyReceipt, ConfigurationVersion |

Rules:

- Stable IDs and explicit clinic ownership; patient-related entities reference the patient's clinic. Tenant isolation must hold even for guessed valid IDs.
- Phone numbers are channel contacts, not unique human identities. A contact can refer to more than one person; linkage is deliberate.
- A patient can have multiple journeys, appointments, invoices and access grants. Do not force a single journey or a single guardian if the existing model needs extension.
- Separate payer, beneficiary, account holder and clinical patient.
- Financial allocation and grant/revocation records need uniqueness, validity and transaction constraints, not UI-only validation.
- Public booking creates narrowly scoped requests; it never grants direct anonymous access to patient tables.
- Preserve existing API versions, IDs and published contracts. Prefer additive migrations, adapters and explicit backfills. Remove old fields only through a separately justified compatibility plan.

## 9. Milestones and measurable acceptance gates

Use the `CRM-MVP-*` IDs below to avoid confusing this delivery sequence with historical project module numbers. Codex may split a milestone into useful vertical slices and reorder dependency-independent slices, but cannot drop requirements or declare an incomplete module accepted.

Every milestone needs: concrete user outcome, existing components reused, gaps, touched contracts/data, permissions, tests, migration strategy, evidence and remaining activation gates.

| Milestone | Deliverable and dependencies | Required acceptance evidence |
| --- | --- | --- |
| **CRM-MVP-00 Audit and baseline** | Identify target repo; inspect instructions, app boundaries, worktree status, source documents, migrations, adapters and tests; map every requirement to built/partial/missing/unverified | Preserved-work inventory, migration checksum manifest, safe local environment verified, current checks classified; no new scaffold or remote database access |
| **CRM-MVP-01 Access and configuration foundation** | Extend current auth, tenancy, roles, audit/outbox and necessary clinic settings | Owner/reception/dentist/cashier/patient tests; cross-clinic denial; revoked staff denied on next sensitive request; settings changes audited; local migration gate passes |
| **CRM-MVP-02 CRM core** | Leads, contacts, patient linking, profile/timeline, assignments and follow-up queues | Manual inquiry → verified patient conversion preserves history; duplicate/concurrent conversion creates one intended link; search/task access restricted; persistence survives restart |
| **CRM-MVP-03 Public and staff booking** | Service durations/resources, public request, calendar, confirm/reschedule/cancel, reception and waitlist | At least two independent concurrent requests for one constrained slot yield at most one booking; failed reschedule preserves old slot; no-show/cancellation/reminder tests; public flow in browser |
| **CRM-MVP-04 Documents and administrative intake** | Private upload/review/release, required-document checklist, manual CNSS/CNOPS statuses | Valid/invalid upload cases; patient A cannot list/read B's files; unreleased files denied; manual checklist changes audited; no claim/template endpoints |
| **CRM-MVP-05 Individual and Family Pass** | Mobile journey, appointments, documents, secure messages, explicit member grants | Patient end-to-end flow; guardian/adult delegation tests; revocation and member-switch race tests; unrelated member denied; no private offline cache |
| **CRM-MVP-06 Finance: pricing, devis and invoices** | Price book, approval, immutable versions, invoice numbering and patient publication | Price change leaves old documents unchanged; unauthorized discount denied; concurrent numbering unique; exact accepted quote version retained; patient/finance visibility verified |
| **CRM-MVP-07 Finance: payments and reconciliation** | Methods, deposit/allocation, installments, receipts, reversals, reconciliation and scoped reports | Numeric fixture in section 6.7 passes; duplicate requests do not double-count; closed-session rules; pending funds excluded; receptionist cannot query/export aggregate earnings |
| **CRM-MVP-08 WhatsApp connector and conversion** | Settings, inbound inbox, outbound adapter, conversion, consent and retry handling; depends on CRM/access/outbox | Valid/invalid signature tests; duplicate/out-of-order webhook tests; conversion history preserved; uncertain send handled; local fake provider only; credentials masked |
| **CRM-MVP-09 Aftercare, feedback and review** | Owned check-ins, clinician-approved instructions, escalation, recall, complaints and review invitation | Visit → aftercare → response/escalation → closure; no automatic clinical advice; review invitation independent of rating; public review remains unverified unless reliable evidence exists |
| **CRM-MVP-10 Integrated local acceptance** | Complete journey across modules, regression, recovery, security and handoff | All required local gates green; restart/restore drill; critical negative cases; final built/remaining report and clearly separate live activation checklist |

Finance views in the Pass are completed as finance milestones land; an early Pass milestone cannot claim unbuilt finance features. Minimal settings/permission controls are built before their dependent features, then completed alongside those modules rather than duplicated at the end.

### 9.1 Gate required before a module is marked locally accepted

1. The user flow works through the actual UI/API and durable local storage, including meaningful empty/loading/error/conflict/permission states.
2. Relevant unit, integration and browser checks pass on the integrated candidate; changed code passes type/lint/build checks appropriate to the repo.
3. Changed database behavior passes real local PostgreSQL migration, RLS, constraint and concurrency tests. SQLite, PGlite or mocks alone are not sufficient evidence for PostgreSQL behavior.
4. Cross-tenant, wrong-patient, unauthorized-role and retry cases pass for the affected surface; secrets are absent from logs, artifacts and browser bundles.
5. Existing relevant behavior remains intact. Migration/recovery impact is reviewed; sensitive changes receive independent review when required by the repo.
6. Progress records contain reproducible evidence, not just “done.” Known live activation items remain labeled pending.

### 9.2 How autonomy proceeds

- After all applicable local gates pass, update progress and immediately start the next ready milestone without asking “shall I continue?”
- A failed local gate keeps its milestone open and blocks dependent implementation that relies on that failed behavior. Fix it before advancing that dependency chain.
- An external activation gate such as live WhatsApp credentials does not block already specified local adapter development or unrelated modules.
- If a dependency is unavailable, record the exact blocker and continue an independent ready slice; never silently waive the missing test or count the blocked module complete.
- Do not repeat unchanged hosted checks, credential requests, passing test suites or superficial UI refinements instead of delivering the next functional capability.

## 10. Safe local development and Supabase migration protocol

### 10.1 Read-only audit before implementation

- Resolve the actual repo root, active branch/worktree and applicable `AGENTS.md` instructions. Inspect tracked, modified and untracked files. An empty current folder is not permission to bootstrap a replacement app.
- Inventory frontends, API, shared contracts, auth, data adapters, design system, existing tests, generated assets and progress records.
- Read migration files in order, local config, seed/test SQL and security helpers; record filenames and checksums. Inspect schema names, grants, RLS, storage policies, RPC privileges, audit/outbox, indexes and booking constraints.
- Compare local migration history to the filesystem only after proving the database is isolated and local. Do not query a hosted project to “complete the audit.” Treat historical claims about hosted state as historical evidence, not newly verified facts.
- Inspect environment loading and script behavior without displaying secret values. Existing scripts may target a live development project despite their names. Disable those paths for this execution.
- Record built/partial/missing/unverified for each requirement; map to exact files/tests. Run proportionate baseline checks and distinguish pre-existing failures from regressions.
- Preserve pending work with an appropriate local snapshot/checkpoint excluding secrets and private data. Never use destructive reset/clean, overwrite unknown files, or discard untracked implementation.

### 10.2 Local environment safety boundary

- Use synthetic data only, with separate local databases/storage and disabled outbound transports.
- Verify resolved database/API hosts, ports and container identity. Accept only known loopback/local-container targets; account for tunnels or forwarded ports rather than assuming `localhost` is safe by itself.
- Use an isolated Supabase local project ID/ports/volumes so tests cannot reset another developer's local stack. Start from existing config; initialize config only if absent and needed, without replacing migrations.
- Existing `.env.local` or process variables must not silently point the app or tests at hosted Supabase. Add a fail-closed guard for local test/migration commands; preserve the user's configuration rather than overwriting it.
- Do not run `supabase link`, `db push`, remote `db pull`, `--linked`, hosted verification scripts, remote SQL/MCP operations, deployment commands or secret-management calls to hosted services.
- No live database reads or writes, even if the account/project is labeled development. Do not request, print or copy real credentials.

### 10.3 Migration lifecycle

1. Inspect the current schema and choose the smallest compatible change. Existing applied migration files are immutable; record checksums to detect accidental edits.
2. Create a new migration using the installed CLI's migration-generation command. Review SQL explicitly. Do not paste a second repository's migration chain into the chosen project.
3. Include tables/constraints/indexes plus RLS, grants and function/storage permissions as needed. Avoid broad temporary policies or privileged execution used merely to bypass an error.
4. Prepare synthetic legacy-shaped fixtures and additive backfills. Document rollback/recovery and incompatible assumptions. Do not drop data to make a test pass.
5. **Upgrade path:** in a disposable local database at the previous migration head, insert fixtures, apply only new migrations and assert old records/IDs/files/permissions survive correctly.
6. **Fresh path:** in a separate disposable local stack or safely snapshotted test stack, replay the full migration chain and synthetic seed from empty, then run database tests.
7. Test real PostgreSQL transactions, constraint races, RLS under representative roles, forged IDs, revoked grants, restricted functions and storage boundaries. Re-running the migration runner should have no pending migrations; individual DDL files need not be repeatedly executable by hand.
8. Verify rollback of failed transactional work. For nontransactional changes, prove the documented cleanup/recovery path. Restore backup to a separate target and compare key records and file checksums.
9. Regenerate shared types/contracts as required; run affected application tests and browser flows. Record migration filenames and evidence before closing the module.

If Docker/local Supabase/PostgreSQL is unavailable, do not substitute a live project. Diagnose local prerequisites, use safe mocks for independent development, and mark PostgreSQL acceptance pending until the real local checks can run.

### 10.4 Commands are patterns to adapt, not a blind script

Discover scripts in `package.json`, the lockfile, repo documentation and CLI `--help`. Use installed/pinned tools; do not introduce a new package manager or silently upgrade framework versions. The known project family uses Node, pnpm, Next.js, NestJS and Supabase; verify the selected repo's actual versions and paths.

Read-only starting patterns in PowerShell:

```powershell
Get-Location
git status --short
git diff --stat
rg --files -g AGENTS.md -g package.json -g '*lock*' -g '!node_modules'
rg --files supabase
Get-Content package.json
node --version
pnpm --version
supabase --version
supabase --help
supabase migration up --help
supabase db reset --help
supabase test db --help
Get-FileHash supabase/migrations/*.sql -Algorithm SHA256
```

Application patterns, only after inspecting each script and local environment resolution:

```powershell
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm dev
# Use the repo's existing integration/e2e/contract-generation scripts.
# Examples may be test:integration, integration, e2e, or contracts:generate.
```

Supabase patterns, only in the verified isolated local project and with installed-version flags confirmed:

```powershell
supabase start
supabase migration list --local
supabase migration new crm_mvp_descriptive_change
supabase migration up --local
supabase db lint --local
supabase test db
# Destructive to the selected local database: disposable test target ONLY.
# Take/verify any needed local snapshot first; never reset a working dataset.
supabase db reset --local
```

Inspect CLI/startup output privately and redact it before sharing: local tooling may print credentials. For commands without a `--local` flag, verify their documented default and actual resolved target; do not invent a flag. Use a pinned `pnpm exec supabase` wrapper if that is how the repo installs the CLI.

These patterns follow [Supabase's local migration workflow](https://supabase.com/docs/guides/local-development/database-migrations) and [CLI reference](https://supabase.com/docs/reference/cli/introduction); the stricter no-hosted-access boundary in this document takes precedence over remote deployment examples in those pages.

## 11. Progress tracking and final acceptance

Reuse the project's existing progress/queue/Build Center system. If none exists, create one concise progress file under the established documentation directory. Avoid parallel trackers with conflicting completion claims.

Suggested entry:

```text
Goal: CRM-MVP-03 / Public booking and transactional confirmation
Outcome: Visitor requests a slot; reception confirms; patient sees the same record.
Status: not_started | audited | in_progress | verifying | locally_accepted | blocked
Dependencies: CRM-MVP-01 and the required CRM-MVP-02 slice
Existing work reused: exact paths/contracts/migrations
Remaining acceptance checks: explicit checkboxes
Changes: concise files/features and new migration filenames
Evidence: command or test, candidate commit/hash, result, fixture scope, date
Review: required reviewer outcome or pending review
Activation gates: live/provider/device/operational checks still pending
Blocker: exact missing dependency and impact, if any
Next action: one concrete action
```

Codex sets measurable goals for itself. If native goal tools are available when the execution prompt is invoked, use one active milestone goal at a time, mark it complete only after its local gates pass, and start the next. Otherwise maintain the same goal lifecycle in the existing tracker. Do not fabricate tool availability or assign arbitrary token/time budgets.

The complete local MVP requires these integrated scenarios:

1. New public booking → inquiry/patient verification → reception confirmation → intake/documents → arrival → administrative journey update.
2. WhatsApp webhook fixture → assigned conversation → deliberate patient conversion/link → booking → simulated confirmation, without duplicate records.
3. Patient and family member switch → authorized appointments/files/finance → unrelated-member denial → delegation revocation.
4. Price book → approved devis version → invoice → deposit → installments → receipt → partial payment → refund/correction → reconciliation.
5. Completed visit → approved aftercare → concern escalation or follow-up closure → private feedback → voluntary review invitation.
6. Cross-tenant/cross-patient and restricted-role tests, revoked staff, duplicate operations, failed uploads, stale slots, outbox retries and app restart.
7. Fresh and upgrade migration paths plus synthetic database/file restore, with key records and hashes verified.

Final handoff states: what is built and reused; exact local startup/check commands; migrations added; tests passed/failed/not run; remaining risks; and activation gates. Never equate mock success, a build, an attractive screen, or source-document wording with verified end-to-end behavior.

**Separate future activation checklist:** hosted Auth/RLS/Storage and revocation validation, real provider onboarding and approved templates, real-device PWA checks, authorized fiscal/privacy/clinical policy review, legacy-data migration plan, staff operational acceptance, hosting/runtime verification, backup/restore objectives and an explicitly authorized deployment. None is permission to contact a live service during this assignment.

## 12. Source alignment and unresolved facts

### 12.1 Conversation decisions

- [Patient CRM Features](chatgpt-conversation://6ae3ccff-9a4c-83ea-9649-adab2f976f24): patient booking through final review; Patient Pass and family access; finance details; WhatsApp API/settings and contact conversion; team module permissions; local autonomous module delivery; CNSS/CNOPS uploads and manual status; no lab automation.
- Latest clarification: provide the CRM MVP from that chat context, leaving repo selection to the execution context. Therefore this document intentionally does not nominate, merge or replace a repository.

### 12.2 Project-source evidence

The available **Dental_Spa_Dental_OS_Master_Project_Guide_2026.pdf** was reviewed as a planning source. Its relevant physical PDF pages are:

| Pages | Relevant principle used here |
| --- | --- |
| 11–12 | End-to-end patient journey and separation of administrative work from clinical authority |
| 21–23 | Lead ownership/conversion, transactional resource-aware booking and secure Patient Pass |
| 34–36 | Pricing/payment controls, aftercare and granular team permissions |
| 51–52 | Multiple cases/appointments and transactional audit/outbox relationships |
| 55 | Patient/role restrictions and separation of clinical and financial approval |
| 64 | Operational MVP joining CRM, booking, patient hub and finance |
| 71, 73 | Negative tests, recovery and bounded, measurable implementation epics |

Source located at `C:/Users/platf/Documents/Dental Spa/sources/Dental_Spa_Dental_OS_Master_Project_Guide_2026.pdf`; a copy also exists in the downloaded handoff. Prefer the selected project's own `sources/` copy when available. The PDF is a broad blueprint, not proof that its modules are built. Its lab/AI roadmap does not expand this iteration.

The available project's `docs/16_SOURCE_TRACEABILITY.md` and `sources/README.md` summarize additional reception, daily-duty and dashboard documents. Their original PDFs were not available in the inspected source folder; no claim of fresh direct review of those originals is made here. Use those summaries only as attributed context, and inspect originals if later supplied.

### 12.3 Decisions that must not be fabricated

- Real service prices, durations, resource constraints, staff authority and booking-confirmation policy.
- Patient verification, adult delegation, guardianship and age-transition rules.
- Approved clinical instructions, escalation responsibility and recall intervals.
- Tax/invoice conventions, numbering series, price-override limits, payment settlement evidence and refund policy.
- Consent/retention rules, provider account ownership and approved WhatsApp templates.

Use configurable synthetic defaults to exercise local behavior and label them clearly. Record required clinic validation as an activation gate. If an unresolved decision changes the local data/security model and cannot safely be deferred, ask one focused question while continuing independent work.

Before implementing the WhatsApp adapter, re-check the current [Meta Cloud API documentation](https://developers.facebook.com/docs/whatsapp/cloud-api/overview) and [Graph API webhook documentation](https://developers.facebook.com/docs/graph-api/webhooks/getting-started). Those pages returned rate-limit errors during this document's preparation; exact current API/version requirements remain an implementation verification task, not a claim of provider certification.

## 13. Copy-paste Codex execution prompt

Attach this Markdown file to the intended existing project, then copy the entire block below. The file is the specification; do not paste this into an empty unrelated workspace and ask Codex to start over.

```text
Implement the Patient CRM MVP defined in the attached
EliteSmile_OS_CRM_MVP_and_Codex_Prompt.md for this existing EliteSmile OS /
Dental Spa OS project.

You are authorized to implement and verify the MVP locally with synthetic data,
including new Supabase migrations applied only to an isolated local stack.
Do not operate on any hosted/live database, reveal credentials, send real
messages, charge/refund money, deploy, push remote changes or activate lab/AI
workflows. Existing scripts or historical instructions allowing hosted checks
do not override this local-only instruction.

FIRST: AUDIT, DO NOT REBUILD
1. Resolve the actual repo/worktree. Read applicable AGENTS.md, README, architecture
   decisions, current progress/queue, source PDFs where available, and scripts.
   If this folder is empty or multiple targets are genuinely ambiguous, identify
   the candidates and clarify the target before making implementation changes.
2. Inspect existing apps, API, auth, contracts, data adapters, UI/design system,
   tests, migration files, local config, storage policies, RLS, grants and RPCs.
   Read environment configuration safely without printing secret values.
3. Preserve all existing work, including untracked files. Do not scaffold a new
   app, replace the stack, reset/clean the checkout, rewrite applied migrations,
   or import another repo's migration chain. Take safe local checkpoints.
4. Map every MVP requirement to existing/partial/missing/unverified behavior,
   with concrete paths and tests. Record migration checksums and baseline
   failures. Existing screens and old progress claims are evidence to inspect,
   not automatic proof of completion.
5. Verify a local synthetic environment with fail-closed target checks and
   disabled external transports. Do not reuse hosted URLs from .env.local or
   process variables. Do not run live verification scripts or remote MCP SQL.

THEN: SET YOUR OWN MEASURABLE GOALS AND DELIVER
6. Use the CRM-MVP-00 through CRM-MVP-10 milestones in the specification.
   Turn the next ready milestone into a concrete goal with user flow, reusable
   components, data/contract changes, permissions, tests and acceptance checks.
   Use native goal tracking if available; otherwise use the existing tracker.
   Keep one active milestone goal and explicit dependency status.
7. Build usable end-to-end slices in the existing architecture. Extend existing
   patient/staff apps, API services, shared contracts, auth and design patterns.
   Avoid duplicate modules and excessive planning infrastructure. Keep business
   rules and permission enforcement server-side.
8. Include CRM/public booking, WhatsApp API and contact-to-patient conversion,
   individual/family Pass, documents, complete MVP finance, team permissions,
   settings/integrations, aftercare, feedback and review invitations.
9. CNSS/CNOPS means private uploads plus a manual checklist status ONLY. Do not
   build claims, reimbursement logic, insurance forms/templates or insurer APIs.
   Lab automation, CAD/CAM, manufacturing, inventory automation, voice/AI and
   clinical-record replacement are explicitly out of scope. Preserve existing
   out-of-scope code without activating or expanding it.

MIGRATE AND TEST SAFELY
10. Create only forward, reviewable, compatible migrations using the pinned
    CLI's supported commands. Re-check --help and relevant official docs.
    Verify both clean replay and upgrade from the prior migration head with
    synthetic legacy-shaped data. Do not modify historical migration files.
11. Before any reset, prove the target is a disposable isolated local database
    and preserve any needed local data/files. Never use a live project when
    Docker/PostgreSQL is unavailable. Record the blocker accurately.
12. Test actual local PostgreSQL RLS, constraints, concurrency and migration
    behavior; mocks, SQLite or PGlite alone cannot pass that gate. Test API
    tenant/patient/action scope separately because privileged clients bypass RLS.
13. Run relevant type/lint/build, unit/integration and browser checks. Verify
    retries, duplicate operations, wrong roles/patients/tenants, stale state,
    revocation, private files, family grants, accounting arithmetic and recovery.
    Apply repo-required independent review to consequential/security changes.
    Reuse valid evidence; repeat checks when changes or failures justify it.
14. Use a local fake WhatsApp provider, signed fixtures and local email sink.
    Implement provider boundaries but label simulated/not-connected behavior
    honestly. Live onboarding/credentials/template approval are later activation
    gates, not reasons to stop local implementation or request real secrets.

CONTINUE AUTONOMOUSLY THROUGH ACCEPTANCE
15. Mark a milestone locally accepted only when all applicable gates pass and
    evidence is recorded. Update the existing progress/Build Center in the same
    coherent batch. Keep financial, clinical and operational statuses distinct.
16. Immediately proceed to the next ready milestone without asking permission
    to continue routine local work. Do not stop after a plan, scaffold or partial
    implementation. Do not endlessly recheck hosted credentials or polish tiny
    details instead of delivering a complete functional capability.
17. A failed gate blocks its dependants. Fix it; or, if genuinely blocked, record
    the exact missing condition and continue an independent ready slice. Never
    waive a missing test, silently shrink scope or call a blocked module done.
    Ask only for missing information that materially blocks a safe decision.
18. Distinguish local acceptance from real-service activation and release. Do
    not invent clinic policies, clinical approval, legal compliance or provider
    delivery. Use labeled configurable synthetic defaults where safe.

REPORT AND FINISH
19. Give concise updates about completed capabilities, current evidence, blockers
    and the next goal. Maintain enough progress detail to resume without a new
    full audit. Keep credentials and patient data out of all output.
20. Complete the integrated scenarios and local recovery drill in section 11.
    Finish with what was reused/built, migrations added, reproducible local
    commands, passed/failed/not-run checks and remaining activation gates.
    The result must be a working, tested local CRM MVP aligned with this repo,
    not a replacement demo and not an assertion of production readiness.

Start with the read-only audit now, then set the first measurable goal and
continue through the ready milestones under these constraints.
```
