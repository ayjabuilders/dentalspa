import { describe, expect, it } from 'vitest';
import {
  CreateSchedulingHoldSchema,
  SchedulingAvailabilityIntervalSchema,
  SchedulingAvailabilityRequestSchema,
  SchedulingAvailabilityResponseSchema,
  SchedulingHoldCreatedResponseSchema,
  SchedulingHoldEventSchema,
} from '../../packages/contracts/src';

const providerResourceId = 'a26b9a2f-28c3-4a1d-9c40-6efc18a6f1d1';
const chairResourceId = 'bc80b1e8-38b0-47dd-a17f-11c21c0674d4';
const validHold = {
  provider_resource_id: providerResourceId,
  chair_resource_id: chairResourceId,
  starts_at: '2026-10-27T09:00:00+01:00',
  ends_at: '2026-10-27T09:30:00+01:00',
  display_timezone: 'Africa/Casablanca',
};

describe('scheduling hold v1 contract', () => {
  it('accepts explicit resource, UTC-instant and display-zone inputs', () => {
    expect(CreateSchedulingHoldSchema.parse(validHold)).toEqual(validHold);
  });

  it.each(['clinic_id', 'actor_ref', 'status', 'expires_at', 'patient_id', 'inquiry_id', 'service_id', 'idempotency_key'])(
    'rejects caller-owned or deferred %s',
    (field) => {
      expect(CreateSchedulingHoldSchema.safeParse({ ...validHold, [field]: 'forged' }).success).toBe(false);
    },
  );

  it('rejects naive timestamps, reversed intervals and unsupported display zones', () => {
    expect(CreateSchedulingHoldSchema.safeParse({ ...validHold, starts_at: '2026-10-27T09:00:00' }).success).toBe(false);
    expect(CreateSchedulingHoldSchema.safeParse({ ...validHold, ends_at: validHold.starts_at }).success).toBe(false);
    expect(CreateSchedulingHoldSchema.safeParse({ ...validHold, display_timezone: 'UTC+1' }).success).toBe(false);
    expect(CreateSchedulingHoldSchema.safeParse({ ...validHold, display_timezone: 'Mars/Olympus' }).success).toBe(false);
    expect(CreateSchedulingHoldSchema.safeParse({ ...validHold, display_timezone: 'UTC' }).success).toBe(true);
    expect(CreateSchedulingHoldSchema.safeParse({ ...validHold, starts_at: '2026-10-27T09:00:00.1234Z' }).success).toBe(false);
  });

  it('requires a bounded explicit availability window', () => {
    const result = SchedulingAvailabilityRequestSchema.safeParse({
      provider_resource_id: providerResourceId,
      chair_resource_id: chairResourceId,
      window_starts_at: '2026-10-28T08:00:00Z',
      window_ends_at: '2026-10-27T08:00:00Z',
      display_timezone: 'Africa/Casablanca',
    });
    expect(result.success).toBe(false);
  });

  it('rejects reversed availability intervals and requires partial-result truth', () => {
    expect(SchedulingAvailabilityIntervalSchema.safeParse({
      starts_at: '2026-10-27T12:00:00Z',
      ends_at: '2026-10-27T11:00:00Z',
    }).success).toBe(false);
    expect(SchedulingAvailabilityResponseSchema.safeParse({
      provider_resource_id: providerResourceId,
      chair_resource_id: chairResourceId,
      window_starts_at: '2026-10-27T08:00:00Z',
      window_ends_at: '2026-10-27T18:00:00Z',
      display_timezone: 'Africa/Casablanca',
      observed_at: '2026-10-27T07:59:59Z',
      informational: true,
      intervals: [],
    }).success).toBe(false);
  });

  it('rejects out-of-window, unsorted and overlapping availability intervals', () => {
    const response = {
      provider_resource_id: providerResourceId,
      chair_resource_id: chairResourceId,
      window_starts_at: '2026-10-27T08:00:00Z',
      window_ends_at: '2026-10-27T18:00:00Z',
      display_timezone: 'Africa/Casablanca',
      observed_at: '2026-10-27T07:59:59Z',
      informational: true as const,
      truncated: false,
    };
    expect(SchedulingAvailabilityResponseSchema.safeParse({
      ...response,
      intervals: [{ starts_at: '2026-10-27T07:00:00Z', ends_at: '2026-10-27T08:30:00Z' }],
    }).success).toBe(false);
    expect(SchedulingAvailabilityResponseSchema.safeParse({
      ...response,
      intervals: [
        { starts_at: '2026-10-27T10:00:00Z', ends_at: '2026-10-27T11:00:00Z' },
        { starts_at: '2026-10-27T09:30:00Z', ends_at: '2026-10-27T10:30:00Z' },
      ],
    }).success).toBe(false);
  });

  it('binds each event name to its truthful terminal status', () => {
    const event = {
      event_id: '443f0f9e-7b55-4d6e-a2bf-6913277d9c19',
      event_type: 'SlotHoldReleased',
      event_version: 1,
      clinic_id: 'e59fa39a-f46f-48a5-a309-cde8b9b5de50',
      aggregate_type: 'scheduling_hold',
      aggregate_id: 'b8fa6f4e-0928-46ff-98fd-3b6095609c04',
      occurred_at: '2026-10-27T09:05:00Z',
      correlation_id: '67302a0b-e3fb-4acd-809f-b41ae9a3601b',
      actor_ref: '1cad91d1-e394-4d3b-b7df-8e6f9bcced94',
      payload: {
        provider_resource_id: providerResourceId,
        chair_resource_id: chairResourceId,
        starts_at: validHold.starts_at,
        ends_at: validHold.ends_at,
        expires_at: '2026-10-27T08:10:00Z',
        status: 'held',
      },
    };
    expect(SchedulingHoldEventSchema.safeParse(event).success).toBe(false);
  });

  it('requires a validated server projection and explicit replay truth', () => {
    expect(SchedulingHoldCreatedResponseSchema.safeParse({ success: true }).success).toBe(false);
  });
});
