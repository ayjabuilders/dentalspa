import { describe, expect, it } from 'vitest';
import { createPatientDemoScenarios, findPatientDemoScenario, linkPatientDemoAppointment } from '../../apps/patient-pass/app/demo-scenarios';

function calendarDate(value: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function visitDateKey(visit: { day: string; month: string; year: string }): string {
  const months = Array.from({ length: 12 }, (_, month) => new Intl.DateTimeFormat('fr-MA', {
    timeZone: 'UTC', month: 'long',
  }).format(new Date(Date.UTC(2020, month, 1))));
  const month = months.indexOf(visit.month) + 1;
  return `${visit.year}-${String(month).padStart(2, '0')}-${String(visit.day).padStart(2, '0')}`;
}

describe('Patient Pass demo scenarios', () => {
  it('uses future Casablanca calendar dates, including across a year boundary', () => {
    const scenarios = createPatientDemoScenarios(new Date('2026-12-30T12:00:00.000Z'));
    const visits = scenarios.flatMap(scenario => scenario.visit ? [scenario.visit] : []);

    expect(scenarios).toHaveLength(10);
    expect(visits).toHaveLength(6);
    expect(visits.some(visit => Number(visit.year) === 2027)).toBe(true);
    expect(new Set(visits.map(visit => `${visit.day}-${visit.month}-${visit.year}`)).size).toBe(5);
    const today = calendarDate(new Date('2026-12-30T12:00:00.000Z'), 'Africa/Casablanca');
    expect(visits.every(visit => visitDateKey(visit) > today)).toBe(true);
    expect(scenarios.filter(scenario => scenario.visit === null)).toHaveLength(4);
  });

  it('keeps visit examples at least one Casablanca day in the future and validates ID/name pairs', () => {
    const now = new Date('2026-10-29T23:30:00.000Z');
    const scenarios = createPatientDemoScenarios(now);
    const visit = scenarios.find(scenario => scenario.id === 'DEMO-005')?.visit;
    const today = calendarDate(now, 'Africa/Casablanca');

    expect(`${visit?.day} ${visit?.month} ${visit?.year}`).toMatch(/^\d{1,2} \p{L}+ 2026$/u);
    expect(visit ? visitDateKey(visit) > today : false).toBe(true);
    expect(findPatientDemoScenario('DEMO-005', 'Yasmine Benjelloun')?.visit?.time).toBe('13:30');
    expect(findPatientDemoScenario('DEMO-005', 'Adam Berrada')).toBeNull();
    expect(scenarios.every(scenario => scenario.visit === null || scenario.visit.description.includes('non '))).toBe(true);
  });

  it('links only an allowlisted fictional profile to a canonical simulated appointment', () => {
    const profile = findPatientDemoScenario('DEMO-003', 'Imane El Idrissi');
    const startsAt = '2027-01-10T12:00:00.000Z';
    const expectedTime = new Intl.DateTimeFormat('fr-MA', {
      timeZone: 'Africa/Casablanca', hour: '2-digit', minute: '2-digit',
    }).format(new Date(startsAt));
    const linked = linkPatientDemoAppointment(profile, startsAt, 'rescheduled');

    expect(linked?.visit).toMatchObject({
      day: '10', month: 'janvier', year: '2027', time: expectedTime, demoState: 'simulated-reschedule',
    });
    expect(linked?.visit?.description).toContain('aucune réservation réelle');
    expect(linkPatientDemoAppointment(null, '2027-01-10T12:00:00.000Z', 'confirmed')).toBeNull();
    expect(linkPatientDemoAppointment(profile, '2027-01-10T12:00:00Z', 'confirmed')).toBeNull();
    expect(linkPatientDemoAppointment(profile, '2027-01-10T12:00:00.000Z', 'booked')).toBeNull();
  });
});
