const scenarios = {
  salma: 'Salma Alaoui (FICTIF)',
  youssef: 'Youssef El Mansouri (FICTIF)',
  imane: 'Imane Berrada (FICTIF)',
} as const;

const visits = {
  'short-demo': 'Format démo court · 30 min',
  'standard-demo': 'Format démo standard · 45 min',
} as const;

const providers = {
  'provider-demo-a': 'Praticien·ne démo A',
  'provider-demo-b': 'Praticien·ne démo B',
} as const;

export type BookingRequestPreview = {
  scenario: keyof typeof scenarios;
  displayName: string;
  date: string;
  time: string;
  visit: keyof typeof visits;
  visitLabel: string;
  provider: keyof typeof providers;
  providerLabel: string;
};

export type BookingRequestSearchParams = Record<string, string | string[] | undefined>;

function one(params: BookingRequestSearchParams, key: string): string | null {
  const value = params[key];
  return typeof value === 'string' ? value : null;
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function parseBookingRequestPreview(params: BookingRequestSearchParams): BookingRequestPreview | null {
  const scenario = one(params, 'scenario');
  const date = one(params, 'date');
  const time = one(params, 'time');
  const visit = one(params, 'visit');
  const provider = one(params, 'provider');
  if (!scenario || !Object.prototype.hasOwnProperty.call(scenarios, scenario) || !date || !validDate(date)
    || !time || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)
    || !visit || !Object.prototype.hasOwnProperty.call(visits, visit)
    || !provider || !Object.prototype.hasOwnProperty.call(providers, provider)) return null;

  const safeScenario = scenario as keyof typeof scenarios;
  const safeVisit = visit as keyof typeof visits;
  const safeProvider = provider as keyof typeof providers;
  return {
    scenario: safeScenario,
    displayName: scenarios[safeScenario],
    date,
    time,
    visit: safeVisit,
    visitLabel: visits[safeVisit],
    provider: safeProvider,
    providerLabel: providers[safeProvider],
  };
}
