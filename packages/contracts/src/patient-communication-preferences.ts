import { z } from 'zod';
import { InquiryContactPreferenceSchema } from './inquiry-contact-preference';
import { InquiryCommunicationLanguageSchema } from './inquiry-communication-language';
import { InquiryCommunicationTimeZoneCatalogueVersion, InquiryCommunicationTimeZoneSchema } from './inquiry-communication-time-zone';
import { InquiryScheduleInstantSchema } from './inquiry-schedule';

export const PatientCommunicationPreferencesStateSchema = z.object({
  schema_version: z.literal(1),
  clinic_id: z.uuid(),
  patient_id: z.uuid(),
  contact_preference: InquiryContactPreferenceSchema.nullable(),
  language: InquiryCommunicationLanguageSchema.nullable(),
  time_zone: InquiryCommunicationTimeZoneSchema.nullable(),
  revision: z.number().int().min(0).max(2_147_483_647),
  updated_at: InquiryScheduleInstantSchema.nullable(),
}).strict().superRefine((state, context) => {
  if (state.revision === 0 && (state.contact_preference !== null || state.language !== null || state.time_zone !== null || state.updated_at !== null)) {
    context.addIssue({ code: 'custom', path: ['revision'], message: 'Initial patient preference state must be empty' });
  }
  if (state.revision > 0 && state.updated_at === null) {
    context.addIssue({ code: 'custom', path: ['updated_at'], message: 'Changed patient preferences require an update time' });
  }
}).describe('Patient-stated communication preferences. They are not consent, reachability, interpretation, or authorization to send.');
export type PatientCommunicationPreferencesState = z.infer<typeof PatientCommunicationPreferencesStateSchema>;

export const SetPatientCommunicationPreferencesSchema = z.object({
  expected_revision: z.number().int().min(0).max(2_147_483_647),
  contact_preference: InquiryContactPreferenceSchema.nullable(),
  language: InquiryCommunicationLanguageSchema.nullable(),
  time_zone: InquiryCommunicationTimeZoneSchema.nullable(),
}).strict();
export type SetPatientCommunicationPreferences = z.infer<typeof SetPatientCommunicationPreferencesSchema>;

export const PatientCommunicationPreferencesReceiptSchema = z.object({
  clinic_id: z.uuid(),
  patient_id: z.uuid(),
  previous_contact_preference: InquiryContactPreferenceSchema.nullable(),
  contact_preference: InquiryContactPreferenceSchema.nullable(),
  previous_language: InquiryCommunicationLanguageSchema.nullable(),
  language: InquiryCommunicationLanguageSchema.nullable(),
  previous_time_zone: InquiryCommunicationTimeZoneSchema.nullable(),
  time_zone: InquiryCommunicationTimeZoneSchema.nullable(),
  previous_revision: z.number().int().min(0).max(2_147_483_647),
  revision: z.number().int().min(0).max(2_147_483_647),
  changed: z.boolean(),
  recorded_at: InquiryScheduleInstantSchema,
  catalogue_version: z.literal(InquiryCommunicationTimeZoneCatalogueVersion),
  event_version: z.literal(1),
}).strict().superRefine((receipt, context) => {
  const changed = receipt.previous_contact_preference !== receipt.contact_preference ||
    receipt.previous_language !== receipt.language || receipt.previous_time_zone !== receipt.time_zone;
  if (changed !== receipt.changed || receipt.revision !== receipt.previous_revision + (changed ? 1 : 0)) {
    context.addIssue({ code: 'custom', path: ['revision'], message: 'Receipt revision and values must match the recorded transition' });
  }
});
export type PatientCommunicationPreferencesReceipt = z.infer<typeof PatientCommunicationPreferencesReceiptSchema>;

export const PatientCommunicationPreferencesResultSchema = z.object({
  receipt: PatientCommunicationPreferencesReceiptSchema,
  replayed: z.boolean(),
}).strict();
export type PatientCommunicationPreferencesResult = z.infer<typeof PatientCommunicationPreferencesResultSchema>;
