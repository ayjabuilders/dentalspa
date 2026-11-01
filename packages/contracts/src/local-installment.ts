import { z } from 'zod';
import {LocalAllocationReceiptSchema} from './local-payment';
const amount = z.number().int().min(1).max(1000000000000);
const balance = z.number().int().min(0).max(1000000000000);
const version = z.number().int().min(1).max(99999999);
const date = z.iso.date().refine(v => v >= '2000-01-01' && v <= '2100-12-31');
const invoiceTreatment = z.object({ invoice_id: z.uuid(), deposit_minor: balance, credited_minor: balance }).strict();
const line = z.object({ invoice_id: z.uuid(), due_on: date, amount_minor: amount }).strict();
const unique = (values: string[]) => new Set(values.map(v => v.toLowerCase())).size === values.length;
export const SaveLocalInstallmentSchema = z.object({
  plan_id: z.uuid().nullable(), expected_version: z.number().int().min(0).max(99999998), reason: z.string().trim().min(1).max(240),
  invoices: z.array(invoiceTreatment).min(1).max(20), lines: z.array(line).min(1).max(100),
}).strict().refine(v => (v.plan_id === null) === (v.expected_version === 0) && unique(v.invoices.map(i => i.invoice_id)) && unique(v.lines.map(l => l.invoice_id + ':' + l.due_on)) && v.lines.every(l => v.invoices.some(i => i.invoice_id.toLowerCase() === l.invoice_id.toLowerCase())) && v.invoices.every(i => v.lines.some(l => l.invoice_id.toLowerCase() === i.invoice_id.toLowerCase())) && v.lines.reduce((n,l)=>n+BigInt(l.amount_minor),0n)<=1000000000000n, 'Invalid agreement scope or total');
export const TransitionLocalInstallmentSchema = z.object({ version, action: z.enum(['approved','accepted']), reference: z.string().regex(/^DEMO-/).max(120) }).strict();
export const LocalInstallmentDraftReceiptSchema = z.object({ plan_id:z.uuid(),patient_id:z.uuid(),version,agreed_minor:amount,currency_code:z.literal('MAD'),status:z.literal('draft'),synthetic_only:z.literal(true),replayed:z.boolean() }).strict();
export const LocalInstallmentTransitionReceiptSchema = z.object({ plan_id:z.uuid(),patient_id:z.uuid(),version,status:z.enum(['approved','accepted']),synthetic_only:z.literal(true),replayed:z.boolean() }).strict();
const summary = z.object({plan_id:z.uuid(),latest_version:version,accepted_version:version.nullable(),agreed_minor:amount,currency_code:z.literal('MAD'),status:z.enum(['draft','approved','accepted']),created_at:z.iso.datetime()}).strict().refine(v => (v.accepted_version===null || v.accepted_version<=v.latest_version) && (v.status==='accepted')===(v.accepted_version===v.latest_version),'Inconsistent agreement status');
export const LocalInstallmentListSchema = z.object({clinic_id:z.uuid(),patient_id:z.uuid(),synthetic_only:z.literal(true),can_write:z.boolean(),truncated:z.boolean(),items:z.array(summary).max(50)}).strict().refine(v=>unique(v.items.map(i=>i.plan_id)),'Duplicate agreements');
const snapshotInvoice = invoiceTreatment.extend({number:z.string().min(1).max(80),total_minor:amount,scheduled_minor:amount}).strict().refine(v=>v.total_minor-v.credited_minor-v.deposit_minor===v.scheduled_minor,'Inconsistent invoice baseline');
export const LocalInstallmentVersionSchema = z.object({
  clinic_id:z.uuid(),patient_id:z.uuid(),plan_id:z.uuid(),latest_version:version,accepted_version:version.nullable(),version,agreed_minor:amount,currency_code:z.literal('MAD'),reason:z.string().min(1).max(240),created_by:z.uuid(),created_at:z.iso.datetime(),
  snapshot:z.object({schema_version:z.literal(1),synthetic_only:z.literal(true),deposit_treatment:z.literal('net_allocations_at_version'),credit_treatment:z.literal('posted_credits_at_version'),invoices:z.array(snapshotInvoice).min(1).max(20)}).strict(),
  lines:z.array(line.extend({line_id:z.uuid()}).strict()).min(1).max(100),
  events:z.array(z.object({action:z.enum(['approved','accepted']),actor_ref:z.uuid(),reference:z.string().regex(/^DEMO-/).max(120),created_at:z.iso.datetime()}).strict()).max(2),
}).strict().superRefine((v,ctx)=>{
  const invoices=v.snapshot.invoices, approved=v.events.find(e=>e.action==='approved'),accepted=v.events.find(e=>e.action==='accepted');
  if(v.version>v.latest_version || (v.accepted_version!==null&&v.accepted_version>v.latest_version) || !unique(invoices.map(i=>i.invoice_id)) || !unique(v.lines.map(l=>l.line_id)) || !unique(v.lines.map(l=>l.invoice_id+':'+l.due_on)) || !unique(v.events.map(e=>e.action)) || (accepted&&(!approved||accepted.created_at<approved.created_at)) || (v.accepted_version===v.version&&!accepted) || (accepted&&(v.accepted_version===null||v.accepted_version<v.version)) || invoices.reduce((n,i)=>n+BigInt(i.scheduled_minor),0n)!==BigInt(v.agreed_minor) || v.lines.some(l=>!invoices.some(i=>i.invoice_id.toLowerCase()===l.invoice_id.toLowerCase())) || invoices.some(i=>v.lines.filter(l=>l.invoice_id.toLowerCase()===i.invoice_id.toLowerCase()).reduce((n,l)=>n+BigInt(l.amount_minor),0n)!==BigInt(i.scheduled_minor)))ctx.addIssue({code:'custom',message:'Inconsistent agreement version'});
});

export const AllocateLocalInstallmentSchema=z.object({version,line_id:z.uuid(),payment_id:z.uuid(),amount_minor:amount}).strict();
export const LocalInstallmentAllocationReceiptSchema=LocalAllocationReceiptSchema.extend({plan_id:z.uuid(),version,line_id:z.uuid(),line_paid_minor:amount,line_remaining_minor:balance}).strict().refine(v=>v.line_paid_minor>=v.amount_minor&&v.line_paid_minor+v.line_remaining_minor<=1000000000000,'Invalid installment allocation');
const installmentBalanceLine=z.object({line_id:z.uuid(),invoice_id:z.uuid(),due_on:date,amount_minor:amount,paid_minor:balance,remaining_minor:balance,payment_state:z.enum(['unpaid','partial','paid']),overdue:z.boolean()}).strict();
export const LocalInstallmentBalancesSchema=z.object({
 clinic_id:z.uuid(),patient_id:z.uuid(),plan_id:z.uuid(),version,active:z.boolean(),as_of_date:date,time_zone:z.literal('Africa/Casablanca'),synthetic_only:z.literal(true),requires_revision:z.boolean(),
 invoices:z.array(z.object({invoice_id:z.uuid(),invoice_remaining_minor:balance,scheduled_remaining_minor:balance,requires_revision:z.boolean()}).strict()).min(1).max(20),
 lines:z.array(installmentBalanceLine).min(1).max(100),
}).strict().superRefine((v,ctx)=>{
 const same=(a:string,b:string)=>a.toLowerCase()===b.toLowerCase();
 if(!unique(v.invoices.map(i=>i.invoice_id))||!unique(v.lines.map(l=>l.line_id))||v.requires_revision!==v.invoices.some(i=>i.requires_revision)||v.lines.some(l=>!v.invoices.some(i=>same(i.invoice_id,l.invoice_id))||l.paid_minor+l.remaining_minor!==l.amount_minor||l.payment_state!==(l.remaining_minor===0?'paid':l.paid_minor>0?'partial':'unpaid')||l.overdue!==(v.active&&l.due_on<v.as_of_date&&l.remaining_minor>0))||v.invoices.some(i=>!v.lines.some(l=>same(l.invoice_id,i.invoice_id))||i.requires_revision!==(i.invoice_remaining_minor!==i.scheduled_remaining_minor)||v.lines.filter(l=>same(l.invoice_id,i.invoice_id)).reduce((n,l)=>n+BigInt(l.remaining_minor),0n)!==BigInt(i.scheduled_remaining_minor)))ctx.addIssue({code:'custom',message:'Inconsistent installment balances'});
});
export const LocalInstallmentReminderQuerySchema=z.object({after_due:date.optional(),after_id:z.uuid().optional(),q:z.string().trim().max(100).optional().transform(v=>v||undefined)}).strict().refine(v=>!!v.after_due===!!v.after_id,'Incomplete cursor');
const reminderItem=z.object({line_id:z.uuid(),plan_id:z.uuid(),version,invoice_id:z.uuid(),patient_id:z.uuid(),patient_name:z.string().min(1).max(200),patient_reference:z.string().min(1).max(100),due_on:date,amount_minor:amount,paid_minor:balance,remaining_minor:amount,overdue:z.boolean(),requires_revision:z.boolean()}).strict().refine(v=>v.paid_minor+v.remaining_minor===v.amount_minor,'Invalid reminder balance');
export const LocalInstallmentReminderQueueSchema=z.object({clinic_id:z.uuid(),synthetic_only:z.literal(true),as_of_date:date,time_zone:z.literal('Africa/Casablanca'),currency_code:z.literal('MAD'),items:z.array(reminderItem).max(10),next_cursor:z.object({due_on:date,line_id:z.uuid()}).strict().nullable()}).strict().refine(v=>unique(v.items.map(i=>i.line_id))&&v.items.every(i=>i.due_on<=v.as_of_date&&i.overdue===(i.due_on<v.as_of_date))&&(!v.next_cursor||(v.items.length===10&&v.next_cursor.line_id===v.items[9]?.line_id&&v.next_cursor.due_on===v.items[9]?.due_on)),'Invalid reminder queue');
