export type PatientDemoScenario = {
  id: string;
  name: string;
  visit: { day: string; month: string; year: string; time: string; description: string; demoState?: 'example' | 'simulated-confirmation' | 'simulated-reschedule' | 'simulated-cancellation' } | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const CASABLANCA_DATE = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Africa/Casablanca',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const FRENCH_DATE = new Intl.DateTimeFormat('fr-MA', {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

function dateParts(formatter: Intl.DateTimeFormat, date: Date): Record<string, string> {
  return Object.fromEntries(formatter.formatToParts(date).map(part => [part.type, part.value]));
}

function futureDate(daysFromToday: number, now: Date) {
  const today = dateParts(CASABLANCA_DATE, now);
  const utcToday = Date.UTC(Number(today.year), Number(today.month) - 1, Number(today.day));
  const parts = dateParts(FRENCH_DATE, new Date(utcToday + daysFromToday * DAY_MS));
  return { day: parts.day!, month: parts.month!, year: parts.year! };
}

// Synthetic presentation cases only. None describes a booked or confirmed visit.
// Dates stay in the future for a local client demo and use the clinic's timezone.
export function createPatientDemoScenarios(now: Date = new Date()): PatientDemoScenario[] {
  const visit = (days: number, time: string, description: string) => ({
    ...futureDate(days, now),
    time,
    description,
  });

  return [
    { id: 'DEMO-001', name: 'Salma Alaoui', visit: visit(1, '09:00', 'Scénario d’accueil · non réservé') },
    { id: 'DEMO-002', name: 'Youssef Benali', visit: visit(2, '09:45', 'Exemple de visite · non confirmé') },
    { id: 'DEMO-003', name: 'Imane El Idrissi', visit: null },
    { id: 'DEMO-004', name: 'Mehdi Amrani', visit: visit(3, '11:15', 'Option illustrée · non réservée') },
    { id: 'DEMO-005', name: 'Yasmine Benjelloun', visit: visit(1, '13:30', 'Scénario d’après-midi · non confirmé') },
    { id: 'DEMO-006', name: 'Adam Berrada', visit: null },
    { id: 'DEMO-007', name: 'Nour Idrissi', visit: visit(4, '14:15', 'Scénario de visite · non confirmé') },
    { id: 'DEMO-008', name: 'Omar Bennani', visit: null },
    { id: 'DEMO-009', name: 'Samira Amrani', visit: visit(5, '15:00', 'Scénario de visite · non confirmé') },
    { id: 'DEMO-010', name: 'Hamza Chraibi', visit: null },
  ];
}

export function findPatientDemoScenario(
  id: string,
  name: string,
  scenarios: PatientDemoScenario[] = createPatientDemoScenarios(),
): PatientDemoScenario | null {
  return scenarios.find(scenario => scenario.id === id && scenario.name === name) ?? null;
}

/**
 * Resolve an optional Clinic OS demo handoff. This accepts only an allowlisted
 * fictional profile and a canonical timestamp/state; it never represents a
 * connected appointment or grants access to patient records.
 */
export function linkPatientDemoAppointment(
  scenario: PatientDemoScenario | null,
  startsAt: string | null,
  action: string | null,
): PatientDemoScenario | null {
  if (!scenario) return null;
  if (startsAt === null && action === null) return scenario;
  if (startsAt === null || !['confirmed', 'rescheduled', 'cancelled'].includes(action ?? '')) return null;

  const parsed = new Date(startsAt);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== startsAt) return null;

  const formatter = new Intl.DateTimeFormat('fr-MA', {
    timeZone: 'Africa/Casablanca',
    day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  const parts = Object.fromEntries(formatter.formatToParts(parsed).map(part => [part.type, part.value]));
  const demoState = action === 'cancelled' ? 'simulated-cancellation' : action === 'rescheduled' ? 'simulated-reschedule' : 'simulated-confirmation';
  const description = action === 'cancelled'
    ? 'Annulation simulée dans Clinic OS · aucune réservation réelle'
    : action === 'rescheduled'
      ? 'Déplacement simulé dans Clinic OS · aucune réservation réelle'
      : 'Confirmation simulée dans Clinic OS · aucune réservation réelle';

  return {
    ...scenario,
    visit: {
      day: parts.day!, month: parts.month!, year: parts.year!,
      time: `${parts.hour}:${parts.minute}`,
      description,
      demoState,
    },
  };
}
