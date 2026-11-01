# Finance module decision packet (M14)

**Status:** preparation only; no financial policy or price is approved by this packet.
**Scope:** decisions needed before connected quotes, invoices, collections, receipts and reconciliation can be implemented or enabled.
**Source:** `docs/EliteSmile_OS_CRM_MVP_and_Codex_Prompt.md`, sections 6.1–6.7 and 7.1–7.2.
**Current behavior:** Business Pulse is an explicitly fictional, in-memory preview. It creates no API/database records, invoices, balances, receipts or payments.

## Decisions and accountable reviewers

| Decision | What the clinic must define | Accountable review |
|---|---|---|
| Service catalogue and prices | Approved service code/name/category, active dates, MAD price, any configured tax treatment, and which catalogue version applies to a new quote. Appointment duration belongs to the separately reviewed resource rules. | Clinic owner and finance lead; accountant for tax treatment. |
| Quote lifecycle | Which roles may draft, review, issue/share and record acceptance; validity period; payer distinct from patient; accepted-version evidence; how refusal, expiry and superseding revisions are recorded. | Clinic owner and finance lead; accountant/legal reviewer where required. |
| Discounts and negotiated prices | Who may request an override, who may approve it, amount/percentage thresholds, required reason and expiry; bind the decision to the exact quote version. | Clinic owner and finance lead; accountant where required. |
| Invoice issuance | Required clinic/payer identity fields, tax wording/treatment, series and format, date/time convention, uniqueness and correction/credit-document process. Issued numbers must never be reused. | Accountant and clinic finance lead; legal review where required. The system must not claim statutory compliance before this review. |
| Payment methods and verification | Which methods are accepted; evidence needed to distinguish received, pending, failed and settled funds; who records and verifies each method; which references may be stored. Never collect card PAN/CVV or bank credentials. | Finance lead; accountant for settlement treatment; privacy reviewer for evidence/retention. |
| Deposits, allocations and installments | How a deposit is allocated once, when excess becomes unapplied credit, who may allocate/reallocate, installment sum/due-date rules, acceptance evidence and versioned rescheduling. No allocation may exceed available confirmed funds. | Finance lead and accountant. |
| Refunds, reversals and corrections | Who may request, approve and record a verified refund; required reason and original-payment reference; how a refund is kept distinct from a credit note; treatment of failed/returned payments. A request alone must never change a balance. | Finance lead and accountant; legal review where required. |
| Cash sessions and reconciliation | Drawer/collector scope, opening float, included cash events, expected close, count evidence, discrepancy reason/threshold, approver, close/reopen authority and audit evidence. | Finance lead and accountant. |
| Roles, patient visibility and reports | Separate view/create/issue/collect/refund/reconcile/export permissions. Define each person's own drawer and assigned-patient scope, who may see clinic totals, and which exact approved finance documents the patient may see. Owner/manager and cashier do not gain permissions by title alone. | Clinic owner and finance lead; privacy reviewer for access/retention. |
| Retention, correction and export | Retention/deletion schedule for financial documents, allocation/payment evidence and audit history; authorized export columns, recipients and audit requirements. | Privacy reviewer and accountant/legal reviewer as applicable. |

## Fixed development invariants from the PRD

These describe required software behavior; they do not set the clinic's prices, tax, permissions or legal policy.

- Use exact decimal arithmetic or integer MAD minor units and document rounding. Never treat binary floating-point as accounting truth.
- A quote/invoice line keeps the price and tax snapshot used when it was issued; a later price change cannot rewrite it.
- A price override is approved against an exact immutable quote version. Editing that quote invalidates the approval.
- Invoice numbering is unique within its approved clinic series, allocated transactionally, and never reused.
- A repeated payment command is idempotent. Pending transfers, uncleared cheques and failed settlements do not count as cleared funds.
- Payment, allocation, refund/reversal, credit note and cash reconciliation remain separate auditable events. Do not count an allocated deposit twice.
- A verified refund and a posted credit note have separate effects and histories. Overpayment remains unapplied credit until an authorized allocation.
- Reception/cashier access to an assigned patient's necessary balance or own drawer does not grant access to clinic-wide revenue, other drawers, margins or unrestricted exports.
- Patient views contain only explicitly released finance content for the verified patient or authorized delegate.

## Synthetic acceptance fixture

The exact amounts and transitions in PRD section 6.7 are test fixtures only, with tax explicitly disabled for that fixture. They are not a clinic catalogue or accounting configuration. When connected finance work is authorized, test all six numeric steps plus duplicate requests, concurrent invoice numbering, rounding, invalid nonpositive amounts, overpayment, pending cheque, failed settlement, over-allocation, unauthorized refund/report access and closed cash sessions.

## Record each decision

For each row above, record the approved value/vocabulary, permitted actor and action, required evidence, allowed transition, patient-facing wording if applicable, effective date, policy version and approver name/role. Write `unresolved` when the accountable reviewer has not approved it. Do not infer values from a synthetic preview or add real patient/financial data to this packet.

## Implementation boundary

The packet does not authorize a hosted migration, payment-provider access, real-money action, invoice issuance or activation. Local code can continue with synthetic fixtures and default-deny configuration, but connected M14 acceptance still requires approved finance/role/privacy decisions and migration, tenant-isolation, idempotency and concurrency verification against the project's local PostgreSQL/Supabase stack. No production schema or provider was touched to prepare this packet.
