/** Fictional public-booking options for local walkthroughs. Never used by the API. */
export const demoVisitOptions = [
  { id: 'short-demo', label: 'Format démo court', durationMinutes: 30 },
  { id: 'standard-demo', label: 'Format démo standard', durationMinutes: 45 },
] as const;

export type DemoResourceKind = 'Praticien·ne' | 'Salle' | 'Fauteuil' | 'Équipe' | 'Équipement';
export type DemoResource = { id: string; kind: DemoResourceKind; label: string };

const demoResourceBundles: Record<string, readonly DemoResource[]> = {
  'provider-demo-a': [
    { id: 'provider-demo-a', kind: 'Praticien·ne', label: 'Praticien·ne démo A' },
    { id: 'room-demo-a', kind: 'Salle', label: 'Salle démo 01' },
    { id: 'chair-demo-a', kind: 'Fauteuil', label: 'Fauteuil démo 01' },
    { id: 'team-demo-a', kind: 'Équipe', label: 'Équipe de démo A' },
    { id: 'equipment-demo-a', kind: 'Équipement', label: 'Équipement démo 01' },
  ],
  'provider-demo-b': [
    { id: 'provider-demo-b', kind: 'Praticien·ne', label: 'Praticien·ne démo B' },
    { id: 'room-demo-b', kind: 'Salle', label: 'Salle démo 02' },
    { id: 'chair-demo-b', kind: 'Fauteuil', label: 'Fauteuil démo 02' },
    { id: 'team-demo-b', kind: 'Équipe', label: 'Équipe de démo B' },
    { id: 'equipment-demo-b', kind: 'Équipement', label: 'Équipement démo 02' },
  ],
};

export const demoProviders = [
  { id: 'provider-demo-a', label: 'Praticien·ne démo A' },
  { id: 'provider-demo-b', label: 'Praticien·ne démo B' },
] as const;

export const demoTimeWindows = [
  { id: 'morning', label: 'Matin · préférence' },
  { id: 'afternoon', label: 'Après-midi · préférence' },
  { id: 'any', label: 'Pas de préférence' },
] as const;

const demoOpeningPeriods = [[9 * 60, 12 * 60], [14 * 60, 17 * 60]] as const;
const demoResourceBusyPeriods: Record<string, readonly (readonly [number, number])[]> = {
  'provider-demo-a': [[10 * 60, 10 * 60 + 45], [15 * 60, 15 * 60 + 30]],
  'provider-demo-b': [[9 * 60 + 30, 10 * 60 + 15], [14 * 60 + 30, 15 * 60 + 15]],
  'room-demo-a': [[9 * 60 + 30, 10 * 60], [15 * 60, 16 * 60]],
  'chair-demo-a': [[11 * 60 + 30, 12 * 60]],
  'team-demo-a': [[14 * 60 + 30, 15 * 60]],
  'equipment-demo-a': [[9 * 60, 9 * 60 + 30]],
  'room-demo-b': [[11 * 60 + 30, 12 * 60]],
  'chair-demo-b': [[14 * 60, 14 * 60 + 30]],
  'team-demo-b': [[9 * 60, 9 * 60 + 30]],
  'equipment-demo-b': [[14 * 60 + 30, 15 * 60 + 15]],
};

export function demoResourceBundle(providerId: string): readonly DemoResource[] {
  return demoResourceBundles[providerId] ?? [];
}

/** Fictional weekly opening windows; Sundays are closed in this sample only. */
export function demoAvailableTimes(date: string, providerId: string, durationMinutes: number) {
  const resources = demoResourceBundle(providerId);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !resources.length) return [];
  const dateValue = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(dateValue.valueOf()) || dateValue.toISOString().slice(0, 10) !== date || date < casablancaDateOffset(0) || date > casablancaDateOffset(30)) return [];
  const day = dateValue.getUTCDay();
  if (day === 0) return [];
  const slots: string[] = [];
  for (const [periodStart, periodEnd] of demoOpeningPeriods) {
    for (let start = periodStart; start + durationMinutes <= periodEnd; start += 30) {
      const end = start + durationMinutes;
      const overlapsResource = resources.some(resource => (demoResourceBusyPeriods[resource.id] ?? []).some(([busyStart, busyEnd]) => start < busyEnd && end > busyStart));
      if (overlapsResource) continue;
      slots.push(`${String(Math.floor(start / 60)).padStart(2, '0')}:${String(start % 60).padStart(2, '0')}`);
    }
  }
  return slots;
}

export function casablancaDateOffset(days: number, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const date = new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day) + days));
  return date.toISOString().slice(0, 10);
}

export function casablancaNextDemoOpenDate(startOffset: number, now = new Date()) {
  for (let offset = Math.max(0, startOffset); offset <= startOffset + 7; offset++) {
    const date = casablancaDateOffset(offset, now);
    if (new Date(`${date}T12:00:00Z`).getUTCDay() !== 0) return date;
  }
  return casablancaDateOffset(startOffset, now);
}

/** Next Sunday, used only to illustrate a no-sample-availability scenario. */
export function casablancaNextDemoSundayDate(now = new Date()) {
  for (let offset = 0; offset <= 7; offset++) {
    const date = casablancaDateOffset(offset, now);
    if (new Date(`${date}T12:00:00Z`).getUTCDay() === 0) return date;
  }
  return casablancaDateOffset(7, now);
}

/** Validate an alternative date for the local preference preview only. */
export function isDemoWaitlistAlternativeDateAllowed(alternativeDate: string, unavailableDate: string, now = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(alternativeDate) || alternativeDate === unavailableDate) return false;
  const parsed = new Date(`${alternativeDate}T12:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== alternativeDate) return false;
  const firstDate = casablancaDateOffset(0, now);
  const lastDate = casablancaDateOffset(30, now);
  return alternativeDate >= firstDate && alternativeDate <= lastDate && parsed.getUTCDay() !== 0;
}
