import { z } from 'zod';

const OffsetDateTimeSchema = z.iso.datetime({ offset: true }).refine((value) => {
  const fractionalSeconds = value.match(/\.(\d+)(?:Z|[+-]\d{2}:\d{2})$/)?.[1];
  return fractionalSeconds === undefined || fractionalSeconds.length <= 3;
}, 'timestamps support at most millisecond precision');
const IanaTimezoneSchema = z.string().trim().min(1).max(64).refine((value) => {
  if (/^[+-]/.test(value)) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}, 'display_timezone must be a supported IANA time zone');

export const SchedulingAvailabilityRequestSchema = z.object({
  provider_resource_id: z.uuid(),
  chair_resource_id: z.uuid(),
  window_starts_at: OffsetDateTimeSchema,
  window_ends_at: OffsetDateTimeSchema,
  display_timezone: IanaTimezoneSchema,
}).strict().superRefine((value, context) => {
  if (Date.parse(value.window_starts_at) >= Date.parse(value.window_ends_at)) {
    context.addIssue({ code: 'custom', path: ['window_ends_at'], message: 'window_ends_at must be after window_starts_at' });
  }
});

export const SchedulingResourceSummarySchema = z.object({
  id: z.uuid(),
  kind: z.enum(['provider', 'chair']),
  display_name: z.string().trim().min(1).max(120),
}).strict();

export const SchedulingResourceListResponseSchema = z.object({
  items: z.array(SchedulingResourceSummarySchema).max(100),
  observed_at: OffsetDateTimeSchema,
  truncated: z.boolean(),
}).strict();

export const SchedulingAvailabilityIntervalSchema = z.object({
  starts_at: OffsetDateTimeSchema,
  ends_at: OffsetDateTimeSchema,
}).strict().superRefine((value, context) => {
  if (Date.parse(value.starts_at) >= Date.parse(value.ends_at)) {
    context.addIssue({ code: 'custom', path: ['ends_at'], message: 'ends_at must be after starts_at' });
  }
});

export const SchedulingAvailabilityResponseSchema = z.object({
  provider_resource_id: z.uuid(),
  chair_resource_id: z.uuid(),
  window_starts_at: OffsetDateTimeSchema,
  window_ends_at: OffsetDateTimeSchema,
  display_timezone: IanaTimezoneSchema,
  observed_at: OffsetDateTimeSchema,
  informational: z.literal(true),
  intervals: z.array(SchedulingAvailabilityIntervalSchema).max(200),
  truncated: z.boolean(),
}).strict().superRefine((value, context) => {
  const windowStartsAt = Date.parse(value.window_starts_at);
  const windowEndsAt = Date.parse(value.window_ends_at);
  if (windowStartsAt >= windowEndsAt) {
    context.addIssue({ code: 'custom', path: ['window_ends_at'], message: 'window_ends_at must be after window_starts_at' });
    return;
  }
  value.intervals.forEach((interval, index) => {
    const startsAt = Date.parse(interval.starts_at);
    const endsAt = Date.parse(interval.ends_at);
    if (startsAt < windowStartsAt || endsAt > windowEndsAt) {
      context.addIssue({ code: 'custom', path: ['intervals', index], message: 'interval must be contained in the response window' });
    }
    const previous = value.intervals[index - 1];
    if (previous && startsAt < Date.parse(previous.ends_at)) {
      context.addIssue({ code: 'custom', path: ['intervals', index], message: 'intervals must be chronological and non-overlapping' });
    }
  });
});

export const CreateSchedulingHoldSchema = z.object({
  provider_resource_id: z.uuid(),
  chair_resource_id: z.uuid(),
  starts_at: OffsetDateTimeSchema,
  ends_at: OffsetDateTimeSchema,
  display_timezone: IanaTimezoneSchema,
}).strict().superRefine((value, context) => {
  if (Date.parse(value.starts_at) >= Date.parse(value.ends_at)) {
    context.addIssue({ code: 'custom', path: ['ends_at'], message: 'ends_at must be after starts_at' });
  }
});

export const SchedulingHoldStatusSchema = z.enum(['held', 'released', 'expired']);

export const SchedulingHoldSchema = CreateSchedulingHoldSchema.extend({
  id: z.uuid(),
  clinic_id: z.uuid(),
  status: SchedulingHoldStatusSchema,
  expires_at: OffsetDateTimeSchema,
  created_at: OffsetDateTimeSchema,
  version: z.number().int().positive(),
}).strict();

export const SchedulingHoldCreatedResponseSchema = z.object({
  item: SchedulingHoldSchema,
  replayed: z.boolean(),
  observed_at: OffsetDateTimeSchema,
}).strict();

export const SchedulingHoldReleasedResponseSchema = z.object({
  item: SchedulingHoldSchema,
  replayed: z.boolean(),
  transitioned: z.boolean(),
  observed_at: OffsetDateTimeSchema,
}).strict();

export const SchedulingHoldResponseSchema = z.object({
  item: SchedulingHoldSchema,
  observed_at: OffsetDateTimeSchema,
}).strict();

export const SchedulingHoldEventSchema = z.object({
  event_id: z.uuid(),
  event_type: z.enum(['SlotHoldCreated', 'SlotHoldReleased', 'SlotHoldExpired']),
  event_version: z.literal(1),
  clinic_id: z.uuid(),
  aggregate_type: z.literal('scheduling_hold'),
  aggregate_id: z.uuid(),
  occurred_at: OffsetDateTimeSchema,
  correlation_id: z.uuid(),
  actor_ref: z.uuid(),
  payload: z.object({
    provider_resource_id: z.uuid(),
    chair_resource_id: z.uuid(),
    starts_at: OffsetDateTimeSchema,
    ends_at: OffsetDateTimeSchema,
    expires_at: OffsetDateTimeSchema,
    status: SchedulingHoldStatusSchema,
  }).strict(),
}).strict().superRefine((value, context) => {
  const expectedStatus = {
    SlotHoldCreated: 'held',
    SlotHoldReleased: 'released',
    SlotHoldExpired: 'expired',
  }[value.event_type];
  if (value.payload.status !== expectedStatus) {
    context.addIssue({ code: 'custom', path: ['payload', 'status'], message: `${value.event_type} requires ${expectedStatus} status` });
  }
});

export type SchedulingAvailabilityRequest = z.infer<typeof SchedulingAvailabilityRequestSchema>;
export type SchedulingAvailabilityResponse = z.infer<typeof SchedulingAvailabilityResponseSchema>;
export type SchedulingResourceSummary = z.infer<typeof SchedulingResourceSummarySchema>;
export type SchedulingResourceListResponse = z.infer<typeof SchedulingResourceListResponseSchema>;
export type CreateSchedulingHold = z.infer<typeof CreateSchedulingHoldSchema>;
export type SchedulingHold = z.infer<typeof SchedulingHoldSchema>;
export type SchedulingHoldCreatedResponse = z.infer<typeof SchedulingHoldCreatedResponseSchema>;
export type SchedulingHoldReleasedResponse = z.infer<typeof SchedulingHoldReleasedResponseSchema>;
export type SchedulingHoldResponse = z.infer<typeof SchedulingHoldResponseSchema>;
export type SchedulingHoldEvent = z.infer<typeof SchedulingHoldEventSchema>;
