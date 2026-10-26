import { z } from 'zod';
import { InquiryScheduleInstantSchema } from './inquiry-schedule';

export const InquiryCommunicationTimeZoneCatalogueVersion = 1 as const;
export const InquiryCommunicationTimeZoneValues = [
  'Africa/Casablanca',
  'Africa/Dakar',
  'America/New_York',
  'America/Sao_Paulo',
  'America/Toronto',
  'Asia/Dubai',
  'Asia/Riyadh',
  'Asia/Tokyo',
  'Australia/Sydney',
  'Etc/UTC',
  'Europe/London',
  'Europe/Paris',
] as const;

export const InquiryCommunicationTimeZoneSchema = z.enum(InquiryCommunicationTimeZoneValues);
export type InquiryCommunicationTimeZone = z.infer<typeof InquiryCommunicationTimeZoneSchema>;

export const InquiryCommunicationTimeZoneRevisionSchema = z.number().int().min(0).max(2_147_483_647);

export const InquiryCommunicationTimeZoneStateSchema = z.object({
  schema_version: z.literal(1),
  catalogue_version: z.literal(InquiryCommunicationTimeZoneCatalogueVersion),
  inquiry_id: z.uuid(),
  clinic_id: z.uuid(),
  owner_user_id: z.uuid(),
  time_zone: InquiryCommunicationTimeZoneSchema.nullable(),
  revision: InquiryCommunicationTimeZoneRevisionSchema,
  updated_at: InquiryScheduleInstantSchema.nullable(),
}).strict().superRefine((state, context) => {
  if (state.revision === 0 && (state.time_zone !== null || state.updated_at !== null)) {
    context.addIssue({ code: 'custom', message: 'Initial communication time zone state must be empty' });
  }
  if (state.revision > 0 && state.updated_at === null) {
    context.addIssue({ code: 'custom', message: 'Changed communication time zone state must have an update time' });
  }
});
export type InquiryCommunicationTimeZoneState = z.infer<typeof InquiryCommunicationTimeZoneStateSchema>;

export const SetInquiryCommunicationTimeZoneSchema = z.object({
  expected_revision: InquiryCommunicationTimeZoneRevisionSchema,
  time_zone: InquiryCommunicationTimeZoneSchema.nullable(),
}).strict();
export type SetInquiryCommunicationTimeZone = z.infer<typeof SetInquiryCommunicationTimeZoneSchema>;

export const InquiryCommunicationTimeZoneReceiptSchema = z.object({
  inquiry_id: z.uuid(),
  clinic_id: z.uuid(),
  owner_user_id: z.uuid(),
  catalogue_version: z.literal(InquiryCommunicationTimeZoneCatalogueVersion),
  previous_time_zone: InquiryCommunicationTimeZoneSchema.nullable(),
  time_zone: InquiryCommunicationTimeZoneSchema.nullable(),
  previous_revision: InquiryCommunicationTimeZoneRevisionSchema,
  revision: InquiryCommunicationTimeZoneRevisionSchema,
  changed: z.boolean(),
  recorded_at: InquiryScheduleInstantSchema,
  event_version: z.literal(1),
}).strict().superRefine((receipt, context) => {
  const valuesDiffer = receipt.previous_time_zone !== receipt.time_zone;
  const revisionChanged = receipt.revision === receipt.previous_revision + 1;
  const revisionUnchanged = receipt.revision === receipt.previous_revision;
  if (receipt.previous_revision === 0 && receipt.previous_time_zone !== null) {
    context.addIssue({ code: 'custom', message: 'Initial previous communication time zone must be empty' });
  }
  if (receipt.revision === 0 && receipt.time_zone !== null) {
    context.addIssue({ code: 'custom', message: 'Initial resulting communication time zone must be empty' });
  }
  if (receipt.changed !== valuesDiffer) {
    context.addIssue({ code: 'custom', message: 'Changed must match the communication time zone transition' });
  }
  if ((receipt.changed && !revisionChanged) || (!receipt.changed && !revisionUnchanged)) {
    context.addIssue({ code: 'custom', message: 'Revision must match the command outcome' });
  }
});
export type InquiryCommunicationTimeZoneReceipt = z.infer<typeof InquiryCommunicationTimeZoneReceiptSchema>;

export const InquiryCommunicationTimeZoneResultSchema = z.object({
  receipt: InquiryCommunicationTimeZoneReceiptSchema,
  replayed: z.boolean(),
}).strict();
export type InquiryCommunicationTimeZoneResult = z.infer<typeof InquiryCommunicationTimeZoneResultSchema>;
