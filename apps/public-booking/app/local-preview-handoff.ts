export type LocalBookingPreviewInput = {
  scenario: string;
  date: string;
  time: string;
  visit: string;
  provider: string;
};

const scenarioIds = new Set(['salma', 'youssef', 'imane']);
const visitIds = new Set(['short-demo', 'standard-demo']);
const providerIds = new Set(['provider-demo-a', 'provider-demo-b']);

function isLocalHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.localhost') || host.endsWith('.local')) return true;
  const octets = host.split('.').map(Number);
  if (octets.length !== 4 || octets.some(value => !Number.isInteger(value) || value < 0 || value > 255)) return false;
  return octets[0] === 10
    || (octets[0] === 192 && octets[1] === 168)
    || (octets[0] === 172 && octets[1]! >= 16 && octets[1]! <= 31);
}

function isDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function localReceptionPreviewHref(hostname: string, input: LocalBookingPreviewInput): string | null {
  if (!isLocalHostname(hostname)
    || !scenarioIds.has(input.scenario)
    || !visitIds.has(input.visit)
    || !providerIds.has(input.provider)
    || !isDate(input.date)
    || !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time)) return null;

  const url = new URL('/booking-review', `http://${hostname}:4204`);
  url.searchParams.set('scenario', input.scenario);
  url.searchParams.set('date', input.date);
  url.searchParams.set('time', input.time);
  url.searchParams.set('visit', input.visit);
  url.searchParams.set('provider', input.provider);
  return url.toString();
}
