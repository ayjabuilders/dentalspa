import { describe, expect, it } from 'vitest';
import { casablancaDateOffset, casablancaNextDemoOpenDate, casablancaNextDemoSundayDate, demoAvailableTimes, demoResourceBundle, isDemoWaitlistAlternativeDateAllowed } from '../../apps/public-booking/app/demo-booking-catalog';

describe('fictional public booking availability', () => {
  it('associates each fictional provider with all five illustrative resource kinds', () => {
    const bundle = demoResourceBundle('provider-demo-b');

    expect(bundle.map(resource => resource.kind)).toEqual(['Praticien·ne', 'Salle', 'Fauteuil', 'Équipe', 'Équipement']);
    expect(demoResourceBundle('unknown-provider')).toEqual([]);
  });

  it('offers only sample opening periods and excludes overlapping fictional appointments', () => {
    const date = casablancaNextDemoOpenDate(2);
    const times = demoAvailableTimes(date, 'provider-demo-b', 45);

    expect(times).toContain('10:30');
    expect(times).toContain('15:30');
    expect(times).not.toContain('11:00');
    expect(times).not.toContain('09:00');
    expect(times).not.toContain('14:00');
    expect(times.every(time => time < '12:00' || time >= '14:00')).toBe(true);
  });

  it('returns no sample slots for Sunday, invalid dates or dates beyond the sample horizon', () => {
    const today = new Date();
    let sunday = '';
    for (let offset = 0; offset <= 7; offset++) {
      const candidate = casablancaDateOffset(offset, today);
      if (new Date(`${candidate}T12:00:00Z`).getUTCDay() === 0) sunday = candidate;
    }

    expect(demoAvailableTimes(sunday, 'provider-demo-a', 30)).toEqual([]);
    expect(demoAvailableTimes('not-a-date', 'provider-demo-a', 30)).toEqual([]);
    expect(demoAvailableTimes('9999-99-99', 'provider-demo-a', 30)).toEqual([]);
    expect(demoAvailableTimes(casablancaDateOffset(31), 'provider-demo-a', 30)).toEqual([]);
  });

  it('finds a Sunday for the explicit no-sample-availability scenario', () => {
    const now = new Date('2026-10-30T12:00:00.000Z');
    const sunday = casablancaNextDemoSundayDate(now);

    expect(new Date(`${sunday}T12:00:00Z`).getUTCDay()).toBe(0);
    expect(demoAvailableTimes(sunday, 'provider-demo-b', 45)).toEqual([]);
  });

  it('accepts only a distinct open alternative date within the local demo horizon', () => {
    const now = new Date('2026-10-28T12:00:00.000Z');
    const firstOpenDate = casablancaNextDemoOpenDate(1, now);
    const sunday = '2026-11-01';

    expect(isDemoWaitlistAlternativeDateAllowed(firstOpenDate, sunday, now)).toBe(true);
    expect(isDemoWaitlistAlternativeDateAllowed(sunday, '2026-10-31', now)).toBe(false);
    expect(isDemoWaitlistAlternativeDateAllowed(sunday, sunday, now)).toBe(false);
    expect(isDemoWaitlistAlternativeDateAllowed('2026-11-28', sunday, now)).toBe(false);
    expect(isDemoWaitlistAlternativeDateAllowed('not-a-date', sunday, now)).toBe(false);
  });
});
