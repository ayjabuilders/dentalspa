import { z } from 'zod';
import { PatientQuoteDetailsSchema } from './patient-hub';

export const PrepareLocalInvoiceSchema = z.object({ quote_id: z.uuid(), quote_version: z.number().int().min(1).max(2147483647) }).strict();
export const IssueLocalInvoiceSchema = z.object({}).strict();
const common = {
  invoice_id: z.uuid(), patient_id: z.uuid(), total_minor: z.number().int().min(1).max(1000000000000),
  currency_code: z.literal('MAD'), synthetic_only: z.literal(true), replayed: z.boolean(),
};
export const LocalInvoiceDraftReceiptSchema = z.object({ ...common, quote_id: z.uuid(), quote_version: PrepareLocalInvoiceSchema.shape.quote_version, state: z.literal('draft') }).strict();
export const LocalInvoiceIssuedReceiptSchema = z.object({
  ...common, state: z.literal('issued'), number: z.string().regex(/^DEMO(?:-[A-Z0-9]{1,16})?-[1-9][0-9]{0,8}$/), issued_at: z.iso.datetime(),
}).strict();
const person = z.object({id:z.uuid(),reference:z.string().min(1).max(120),display_name:z.string().min(1).max(160)}).strict();
const invoiceQuote = z.object({id:z.uuid(),version:z.number().int().positive(),state:z.literal('draft'),currency_code:z.literal('MAD'),total_minor:common.total_minor,details:PatientQuoteDetailsSchema}).strict();
export const LocalInvoiceSnapshotSchema = z.object({
  schema_version:z.literal(1),synthetic_only:z.literal(true),clinic:z.object({id:z.uuid(),name:z.string().min(1).max(120)}).strict(),
  patient:person,payer:person,payer_basis:z.literal('patient_self_synthetic_fixture'),quote:invoiceQuote,
  disclaimer:z.literal('LOCAL SYNTHETIC DOCUMENT - NOT A STATUTORY INVOICE'),
}).strict().refine(value=>value.patient.id===value.payer.id&&value.patient.reference===value.payer.reference&&value.patient.display_name===value.payer.display_name,'Invalid synthetic payer');
export const LocalInvoiceRecordSchema = z.object({
  invoice_id:z.uuid(),patient_id:z.uuid(),quote_id:z.uuid(),quote_version:PrepareLocalInvoiceSchema.shape.quote_version,
  state:z.enum(['draft','issued']),number:LocalInvoiceIssuedReceiptSchema.shape.number.nullable(),issued_at:z.iso.datetime().nullable(),created_at:z.iso.datetime(),
  total_minor:common.total_minor,currency_code:z.literal('MAD'),snapshot:LocalInvoiceSnapshotSchema,
}).strict().superRefine((value,ctx)=>{
  const quote=value.snapshot.quote,details=quote.details;
  if(value.patient_id!==value.snapshot.patient.id||value.quote_id!==quote.id||value.quote_version!==quote.version||value.total_minor!==quote.total_minor||!details.lines.length||BigInt(value.total_minor)!==BigInt(details.subtotal_minor)-BigInt(details.discount_minor)+BigInt(details.tax_minor))ctx.addIssue({code:'custom',message:'Inconsistent invoice snapshot'});
  if(value.state==='draft'?(value.number!==null||value.issued_at!==null):(value.number===null||value.issued_at===null))ctx.addIssue({code:'custom',message:'Inconsistent invoice issuance'});
});
export const LocalInvoiceListSchema = z.object({synthetic_only:z.literal(true),items:z.array(LocalInvoiceRecordSchema).max(50),truncated:z.boolean()}).strict()
  .refine(value=>new Set(value.items.map(item=>item.invoice_id)).size===value.items.length,'Duplicate invoices');
