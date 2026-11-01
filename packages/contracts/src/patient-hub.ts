import { z } from 'zod';
import { PatientAdministrativeRecordSchema } from './patient-directory';
const minor = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const PatientQuoteDetailsSchema = z.object({
  subtotal_minor: minor, discount_minor: minor, tax_minor: minor, valid_until: z.iso.date().nullable(),
  lines: z.array(z.object({
    line_number: z.number().int().positive(), label: z.string().min(1).max(160), quantity: z.number().int().positive(),
    unit_amount_minor: minor, subtotal_minor: minor, discount_minor: minor, tax_minor: minor, total_minor: minor,
    service_id: z.uuid().optional(), price_version: z.number().int().positive().optional(),
  }).strict()).max(1000),
}).strict().superRefine((value, ctx) => {
  const numbers = new Set<number>();
  let subtotal = 0n, discount = 0n, tax = 0n;
  for (const line of value.lines) {
    const base = BigInt(line.quantity) * BigInt(line.unit_amount_minor);
    if (numbers.has(line.line_number) || base !== BigInt(line.subtotal_minor) || line.discount_minor > line.subtotal_minor
      || base - BigInt(line.discount_minor) + BigInt(line.tax_minor) !== BigInt(line.total_minor)) {
      ctx.addIssue({ code: 'custom', message: 'Inconsistent quote line' });
    }
    numbers.add(line.line_number);
    subtotal += BigInt(line.subtotal_minor); discount += BigInt(line.discount_minor); tax += BigInt(line.tax_minor);
  }
  if (subtotal !== BigInt(value.subtotal_minor) || discount !== BigInt(value.discount_minor) || tax !== BigInt(value.tax_minor)) {
    ctx.addIssue({ code: 'custom', message: 'Inconsistent quote totals' });
  }
});
const quoteFields = {
  id: z.uuid(), version: z.number().int().positive(), state: z.literal('draft'), currency_code: z.string().regex(/^[A-Z]{3}$/), total_minor: minor,
  details: PatientQuoteDetailsSchema.optional(),
};
const quoteTotalValid = (value: {total_minor:number;details?:z.infer<typeof PatientQuoteDetailsSchema>}) => !value.details || BigInt(value.total_minor) === BigInt(value.details.subtotal_minor) - BigInt(value.details.discount_minor) + BigInt(value.details.tax_minor);
export const PatientQuoteVersionSchema = z.object(quoteFields).strict().refine(quoteTotalValid, 'Inconsistent quote total');
export const PatientHubQuoteSchema = z.object({...quoteFields, history: z.array(PatientQuoteVersionSchema).max(1000).optional()}).strict()
  .refine(quoteTotalValid, 'Inconsistent quote total')
  .refine(value => !value.history || (value.history.every(item => item.id === value.id && item.version < value.version) && new Set(value.history.map(item => item.version)).size === value.history.length), 'Invalid quote history');
export const PatientHubSchema = z.object({
  patient: PatientAdministrativeRecordSchema,
  profile: z.object({ phone_display: z.string().nullable(), email: z.string().nullable(), city: z.string().nullable(), birth_date: z.iso.date().nullable(), preferred_language: z.enum(['fr','ar','en']), revision: z.number().int().positive() }).strict().nullable(),
  appointments: z.array(z.object({ id: z.uuid(), starts_at: z.iso.datetime(), ends_at: z.iso.datetime(), status: z.enum(['confirmed','cancelled']) }).strict()).max(1000),
  checklist: z.array(z.object({ kind: z.enum(['cnss','cnops']), status: z.enum(['not_applicable','missing','received','needs_correction','completed_manually']).nullable(), revision: z.number().int().nonnegative() }).strict()).max(2),
  quotes: z.array(PatientHubQuoteSchema).max(1000),
}).strict();
export type PatientHub = z.infer<typeof PatientHubSchema>;
