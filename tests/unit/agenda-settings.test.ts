import { describe, expect, it } from 'vitest';
import { AgendaSettingsSchema, UpdateAgendaSettingsSchema } from '../../packages/contracts/src/agenda-settings';

const opening = { weekday: 1, start: '09:00', end: '12:00' };
const visit = {
  id: '76000000-0000-4000-8000-000000000001', name: 'Contrôle fictif', active: true, public_bookable: false,
  duration_minutes: 20, buffer_before_minutes: 0, buffer_after_minutes: 10,
  resource_pairs: [{ provider_id: '76000000-0000-4000-8000-000000000002', chair_id: '76000000-0000-4000-8000-000000000003' }],
  weekly_windows: [{ ...opening, end: '10:30' }],
};
const settings = {
  schema_version: 1, revision: 1, time_zone: 'Africa/Casablanca', slot_step_minutes: 10,
  minimum_notice_minutes: 120, booking_horizon_days: 30, confirmation_mode: 'staff_review',
  patient_cancellation_enabled: true, patient_reschedule_enabled: true,
  cancellation_notice_minutes: 1440, reschedule_notice_minutes: 1440,
  weekly_windows: [opening], closures: [], visit_types: [visit],
};

describe('agenda configuration contracts', () => {
  it('supports a restricted follow-up type with explicit timing and no public exposure', () => {
    expect(AgendaSettingsSchema.parse(settings).visit_types[0]).toMatchObject({ duration_minutes: 20, public_bookable: false });
  });
  it('rejects overlaps, malformed time, and visit windows outside clinic opening', () => {
    for (const invalid of [
      { ...settings, weekly_windows: [opening, { ...opening, start: '10:00' }] },
      { ...settings, weekly_windows: [{ ...opening, end: '25:00' }] },
      { ...settings, visit_types: [{ ...visit, weekly_windows: [{ ...opening, end: '13:00' }] }] },
      { ...settings, visit_types: [visit, visit] },
    ]) expect(AgendaSettingsSchema.safeParse(invalid).success).toBe(false);
  });
  it('keeps closed schedules closed and rejects caller-supplied tenant reassignment', () => {
    expect(AgendaSettingsSchema.parse({ ...settings, weekly_windows: [], visit_types: [] }).weekly_windows).toEqual([]);
    expect(UpdateAgendaSettingsSchema.safeParse({ expected_revision: 1, settings: { ...settings, revision: 2 }, clinic_id: 'foreign' }).success).toBe(false);
  });
  it('requires explicit revision advancement for concurrent editor protection', () => {
    expect(UpdateAgendaSettingsSchema.safeParse({ expected_revision: 1, settings }).success).toBe(false);
    expect(UpdateAgendaSettingsSchema.safeParse({ expected_revision: 1, settings: { ...settings, revision: 2 } }).success).toBe(true);
  });
});
