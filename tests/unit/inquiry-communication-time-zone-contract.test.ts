import { describe, expect, it } from 'vitest';
import {
  InquiryCommunicationTimeZoneResultSchema,
  InquiryCommunicationTimeZoneStateSchema,
  InquiryCommunicationTimeZoneValues,
  SetInquiryCommunicationTimeZoneSchema,
} from '../../packages/contracts/src';

const ids = {
  inquiry_id: crypto.randomUUID(),
  clinic_id: crypto.randomUUID(),
  owner_user_id: crypto.randomUUID(),
};

describe('inquiry communication time zone v1 contract', () => {
  it('starts unrecorded and requires the frozen catalogue version', () => {
    const state = { schema_version: 1, catalogue_version: 1, ...ids, time_zone: null, revision: 0, updated_at: null } as const;
    expect(InquiryCommunicationTimeZoneStateSchema.parse(state).time_zone).toBeNull();
    expect(InquiryCommunicationTimeZoneStateSchema.safeParse({ ...state, catalogue_version: 2 }).success).toBe(false);
    expect(InquiryCommunicationTimeZoneStateSchema.safeParse({ ...state, time_zone: 'Africa/Casablanca' }).success).toBe(false);
  });

  it('accepts only exact versioned identifiers and rejects inference, aliases and offsets', () => {
    for (const time_zone of [...InquiryCommunicationTimeZoneValues, null]) {
      expect(SetInquiryCommunicationTimeZoneSchema.safeParse({ expected_revision: 0, time_zone }).success).toBe(true);
    }
    for (const input of [
      { expected_revision: 0, time_zone: 'UTC+01:00' },
      { expected_revision: 0, time_zone: 'US/Eastern' },
      { expected_revision: 0, time_zone: 'europe/paris' },
      { expected_revision: 0, time_zone: 'Europe/Paris ' },
      { expected_revision: -1, time_zone: 'Europe/Paris' },
      { expected_revision: 0, time_zone: 'Europe/Paris', inferred_from: 'browser' },
      { expected_revision: 0, time_zone: 'Europe/Paris', preferred_calling_hour: '10:00' },
      { expected_revision: 0, time_zone: 'Europe/Paris', consent: true },
    ]) expect(SetInquiryCommunicationTimeZoneSchema.safeParse(input).success).toBe(false);
  });

  it('validates minimal receipt transitions including initial and ceiling no-ops', () => {
    const changed = { ...ids, catalogue_version: 1, previous_time_zone: null, time_zone: 'Africa/Casablanca', previous_revision: 0, revision: 1, changed: true, recorded_at: '2026-10-26T23:30:00Z', event_version: 1 } as const;
    expect(InquiryCommunicationTimeZoneResultSchema.parse({ receipt: changed, replayed: false }).receipt).toEqual(changed);
    expect(InquiryCommunicationTimeZoneResultSchema.safeParse({ receipt: { ...changed, revision: 0 }, replayed: false }).success).toBe(false);
    expect(InquiryCommunicationTimeZoneResultSchema.safeParse({ receipt: { ...changed, location: 'Paris' }, replayed: false }).success).toBe(false);
    const initialNoOp = { ...changed, previous_time_zone: null, time_zone: null, previous_revision: 0, revision: 0, changed: false } as const;
    expect(InquiryCommunicationTimeZoneResultSchema.parse({ receipt: initialNoOp, replayed: true }).replayed).toBe(true);
    expect(InquiryCommunicationTimeZoneResultSchema.safeParse({ receipt: { ...initialNoOp, previous_time_zone: 'Europe/Paris' }, replayed: false }).success).toBe(false);
    const ceilingNoOp = { ...changed, previous_time_zone: 'Europe/London', time_zone: 'Europe/London', previous_revision: 2_147_483_647, revision: 2_147_483_647, changed: false } as const;
    expect(InquiryCommunicationTimeZoneResultSchema.parse({ receipt: ceilingNoOp, replayed: false }).receipt.revision).toBe(2_147_483_647);
    expect(InquiryCommunicationTimeZoneResultSchema.safeParse({ receipt: { ...ceilingNoOp, time_zone: 'Europe/Paris', changed: true }, replayed: false }).success).toBe(false);
  });
});
