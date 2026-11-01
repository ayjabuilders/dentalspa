import { describe, expect, it } from 'vitest';
import { ConfirmDemoBookingResponseSchema, ConfirmDemoBookingSchema, DemoBookingRequestItemSchema, DemoBookingServiceStatusSchema } from '../../packages/contracts/src';

const ids = {
  request: '74000000-0000-4000-8000-000000000001',
  appointment: '74000000-0000-4000-8000-000000000002',
  provider: '73000000-0000-4000-8000-000000000001',
  chair: '73000000-0000-4000-8000-000000000003',
};

describe('local demo booking confirmation contracts', () => {
  it('keeps a public request visibly pending before staff confirmation', () => {
    expect(DemoBookingRequestItemSchema.parse({
      id: ids.request, scenario_id: 'salma', requested_date: '2026-11-04', requested_time: '09:30',
      status: 'request_received', created_at: '2026-10-30T10:00:00Z', appointment: null,
    }).appointment).toBeNull();
  });

  it('accepts a confirmed synthetic appointment with its linked request', () => {
    expect(DemoBookingRequestItemSchema.parse({
      id: ids.request, scenario_id: 'salma', requested_date: '2026-11-04', requested_time: '09:30',
      status: 'confirmed', created_at: '2026-10-30T10:00:00Z',
      appointment: {
        id: ids.appointment, starts_at: '2026-11-04T09:30:00+01:00', ends_at: '2026-11-04T10:15:00+01:00',
        duration_minutes: 45, confirmed_at: '2026-10-30T10:01:00Z',
        provider_resource_id: ids.provider, chair_resource_id: ids.chair,
      },
    }).status).toBe('confirmed');
  });

  it('rejects confirmation payloads that contain patient, contact or clinical fields', () => {
    expect(ConfirmDemoBookingSchema.safeParse({ ...ids, patient_id: '20000000-0000-4000-8000-000000000001' }).success).toBe(false);
    expect(ConfirmDemoBookingSchema.safeParse({ provider_resource_id: ids.provider, chair_resource_id: ids.chair }).success).toBe(true);
  });

  it('validates an exact response and both local service flags', () => {
    expect(ConfirmDemoBookingResponseSchema.safeParse({
      status: 'confirmed', appointment_id: ids.appointment, booking_request_id: ids.request, scenario_id: 'salma',
      starts_at: '2026-11-04T09:30:00Z', ends_at: '2026-11-04T10:15:00Z', duration_minutes: 45,
      provider_resource_id: ids.provider, chair_resource_id: ids.chair, confirmed_at: '2026-10-30T10:00:00Z', replayed: false,
    }).success).toBe(true);
    expect(DemoBookingServiceStatusSchema.parse({ enabled: true, confirmation_enabled: false }).confirmation_enabled).toBe(false);
  });
});
