import { z } from 'zod';
export const QuoteDraftCommandSchema = z.object({
  lines: z.array(z.object({ service_id: z.uuid(), price_version: z.number().int().min(1).max(999999999), quantity: z.number().int().min(1).max(100) }).strict()).min(1).max(50),
}).strict().refine(value => new Set(value.lines.map(line => line.service_id.toLowerCase())).size === value.lines.length, 'Duplicate services');
export const QuoteCatalogSchema = z.object({
  synthetic_only: z.literal(true),
  items: z.array(z.object({ service_id: z.uuid(), label: z.string().min(1).max(160), price_version: z.number().int().positive(), unit_amount_minor: z.number().int().min(1).max(10000000000), currency_code: z.literal('MAD') }).strict()).max(1000),
}).strict().refine(value => new Set(value.items.map(item => item.service_id.toLowerCase())).size === value.items.length, 'Duplicate services');
export const QuoteDraftReceiptSchema = z.object({
  quote_id: z.uuid(), patient_id: z.uuid(), version: z.literal(1), state: z.literal('draft'), currency_code: z.literal('MAD'),
  total_minor: z.number().int().min(1).max(1000000000000), replayed: z.boolean(),
}).strict();
export type QuoteDraftCommand = z.infer<typeof QuoteDraftCommandSchema>;
export type QuoteCatalog = z.infer<typeof QuoteCatalogSchema>;
export const QuoteRevisionCommandSchema = z.object({
  expected_version: z.number().int().min(1).max(2147483646), lines: QuoteDraftCommandSchema.shape.lines,
}).strict().refine(value => new Set(value.lines.map(line => line.service_id.toLowerCase())).size === value.lines.length, 'Duplicate services');
export const QuoteRevisionReceiptSchema = QuoteDraftReceiptSchema.extend({ version: z.number().int().min(2).max(2147483647) });
export const FinanceCatalogServiceSchema = z.object({
  service_id:z.uuid(),code:z.string().regex(/^[A-Z0-9][A-Z0-9_-]{0,59}$/),label:z.string().min(1).max(160),category:z.string().max(60).nullable(),
  archived:z.boolean(),price_version:z.number().int().positive(),unit_amount_minor:z.number().int().min(1).max(10000000000),currency_code:z.literal('MAD'),effective_at:z.iso.datetime(),
}).strict();
export const FinanceCatalogSchema = z.object({synthetic_only:z.literal(true),items:z.array(FinanceCatalogServiceSchema).max(1000)}).strict();
export const FinanceCatalogCommandSchema = z.object({
  service_id:z.uuid().nullable(),expected_version:z.number().int().min(0).max(999999998),code:FinanceCatalogServiceSchema.shape.code,
  label:z.string().trim().min(1).max(160),category:z.string().trim().max(60).nullable(),archived:z.boolean(),unit_amount_minor:FinanceCatalogServiceSchema.shape.unit_amount_minor,
}).strict().refine(value=>value.service_id?value.expected_version>0:value.expected_version===0&&!value.archived,'Invalid service version');
export const FinanceCatalogReceiptSchema = FinanceCatalogServiceSchema.extend({replayed:z.boolean()});
