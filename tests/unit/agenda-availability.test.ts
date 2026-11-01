import { describe, expect, it } from 'vitest';
import { calculatePublicAgendaSlots } from '../../apps/dental-api/src/booking-requests/agenda-availability';
const clinic = '10000000-0000-4000-8000-000000000001';
const provider = '74000000-0000-4000-8000-000000000001';
const chair = '74000000-0000-4000-8000-000000000003';
const visitId = '76000000-0000-4000-8000-000000000001';
function fixture() {
  return {
    clinic_id: clinic, date: '2026-11-02', visit_type_id: visitId, now: '2026-11-01T12:00:00Z',
    settings: {
      schema_version: 1, revision: 1, time_zone: 'Africa/Casablanca', slot_step_minutes: 15, minimum_notice_minutes: 0, booking_horizon_days: 30,
      confirmation_mode: 'staff_review', patient_cancellation_enabled: false, patient_reschedule_enabled: false, cancellation_notice_minutes: 0, reschedule_notice_minutes: 0,
      weekly_windows: [{ weekday: 1, start: '09:00', end: '12:00' }], closures: [] as Array<{ date: string; resource_id: string | null; start: string; end: string }>,
      visit_types: [{ id: visitId, name: 'Visite fictive', active: true, public_bookable: true, duration_minutes: 30, buffer_before_minutes: 0, buffer_after_minutes: 0,
        resource_pairs: [{ provider_id: provider, chair_id: chair }], weekly_windows: [{ weekday: 1, start: '09:00', end: '10:00' }] }],
    },
    resources: [
      { id: provider, clinic_id: clinic, kind: 'provider', active: true, windows: [{ starts_at: '2026-11-02T08:00:00Z', ends_at: '2026-11-02T11:00:00Z' }] },
      { id: chair, clinic_id: clinic, kind: 'chair', active: true, windows: [{ starts_at: '2026-11-02T08:00:00Z', ends_at: '2026-11-02T11:00:00Z' }] },
    ],
    occupancy: [] as Array<{ clinic_id: string; resource_id: string; period: { starts_at: string; ends_at: string } }>,
  };
}
describe('configured public agenda availability', () => {
  it('uses the visit-specific window and configured duration/step', () => {
    const slots = calculatePublicAgendaSlots(fixture());
    expect(slots.map(slot => slot.starts_at)).toEqual(['2026-11-02T09:00:00.000Z', '2026-11-02T09:15:00.000Z', '2026-11-02T09:30:00.000Z']);
    expect(slots.every(slot => Date.parse(slot.ends_at) - Date.parse(slot.starts_at) === 30 * 60000)).toBe(true);
  });
  it('never exposes private follow-up types through public discovery', () => {
    const input = fixture(); input.settings.visit_types[0]!.public_bookable = false;
    expect(calculatePublicAgendaSlots(input)).toEqual([]);
  });
  it('intersects both resource windows and excludes occupied periods with buffers', () => {
    const input = fixture();
    input.settings.visit_types[0]!.buffer_after_minutes = 15;
    input.occupancy.push({ clinic_id: clinic, resource_id: chair, period: { starts_at: '2026-11-02T10:00:00Z', ends_at: '2026-11-02T11:00:00Z' } });
    expect(calculatePublicAgendaSlots(input).map(slot => slot.starts_at)).toEqual(['2026-11-02T09:00:00.000Z', '2026-11-02T09:15:00.000Z']);
    input.resources[0]!.active = false;
    expect(calculatePublicAgendaSlots(input)).toEqual([]);
  });
  it('applies closures, notice and horizon without substituting default slots', () => {
    const input = fixture();
    input.settings.closures.push({ date: input.date, resource_id: null, start: '09:00', end: '12:00' });
    expect(calculatePublicAgendaSlots(input)).toEqual([]);
    input.settings.closures = []; input.now = '2026-11-02T09:10:00Z'; input.settings.minimum_notice_minutes = 20;
    expect(calculatePublicAgendaSlots(input).map(slot => slot.starts_at)).toEqual(['2026-11-02T09:30:00.000Z']);
    input.now = '2026-09-01T00:00:00Z';
    expect(calculatePublicAgendaSlots(input)).toEqual([]);
  });
  it('rejects mixed-tenant and malformed occupancy snapshots', () => {
    const input = fixture(); input.resources[0]!.clinic_id = '10000000-0000-4000-8000-000000000002';
    expect(() => calculatePublicAgendaSlots(input)).toThrow('invalid_agenda_snapshot');
    const invalid = fixture(); invalid.occupancy.push({ clinic_id: clinic, resource_id: chair, period: { starts_at: 'bad', ends_at: 'bad' } });
    expect(() => calculatePublicAgendaSlots(invalid)).toThrow();
  });
});
