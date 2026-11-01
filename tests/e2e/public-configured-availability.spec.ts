import { test, expect } from '@playwright/test';
const base = 'http://localhost:4202';
const visit = '30000000-0000-4000-8000-000000000001';
const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
const service = 'Première visite fictive';
const localTime = (value: string) => new Intl.DateTimeFormat('fr-MA', { timeZone: 'Africa/Casablanca', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(value));
const followingDate = (value: string) => { const date = new Date(`${value}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + 1); return date.toISOString().slice(0, 10); };

test('public service/date selection displays server slots and clears them on failure', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let fail = false;
  const calls: URL[] = [];
  await page.route('**/api/v1/booking-requests/configured-availability?**', async route => {
    const url = new URL(route.request().url()); calls.push(url);
    expect(route.request().headers().authorization).toBeUndefined();
    if (fail) return route.fulfill({ status: 503, headers, json: { message: 'unavailable' } });
    const selected = url.searchParams.get('visit_type_id');
    await route.fulfill({ headers, json: {
      date: url.searchParams.get('date'), time_zone: 'Africa/Casablanca', revision: 1, informational: true,
      selected_visit_type_id: selected, visit_types: [{ id: visit, name: service, duration_minutes: 30 }],
      slots: selected ? [{ starts_at: `${url.searchParams.get('date')}T09:30:00.000Z`, ends_at: `${url.searchParams.get('date')}T10:00:00.000Z` }] : [],
    } });
  });
  await page.goto(base);
  await expect(page.getByRole('heading', { name: 'Votre prochaine visite', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Préparer ma première visite' })).toHaveCount(0);
  await page.getByRole('button', { name: new RegExp(service) }).click();
  await page.getByLabel('Date de visite', { exact: true }).fill('2026-11-02');
  const slots = page.getByRole('list', { name: 'Horaires disponibles' });
  await expect(slots.locator('time')).toHaveText(localTime('2026-11-02T09:30:00.000Z'));
  await expect(slots.locator('button>span')).toHaveText(localTime('2026-11-02T10:00:00.000Z'));
  expect(calls.at(-1)?.searchParams.get('visit_type_id')).toBe(visit);
  expect(calls.at(-1)?.searchParams.has('clinic_id')).toBe(false);
  await page.locator('#availability').screenshot({ path: testInfo.outputPath('public-availability-mobile.png'), animations: 'disabled' });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.locator('#availability').screenshot({ path: testInfo.outputPath('public-availability-desktop.png'), animations: 'disabled' });
  fail = true;
  await page.getByLabel('Date de visite', { exact: true }).fill('2026-11-03');
  await expect(slots).toHaveCount(0);
  await expect(page.locator('#availability').getByRole('alert')).toContainText('ne sont pas accessibles');
  fail = false;
  await page.getByRole('button', { name: 'Réessayer', exact: true }).click();
  await expect(slots).toBeVisible();
});

test('public discovery refuses mismatched responses and shows an empty day without fallback slots', async ({ page }) => {
  let invalid = true;
  await page.route('**/api/v1/booking-requests/configured-availability?**', route => {
    const url = new URL(route.request().url()); const date = url.searchParams.get('date')!;
    return route.fulfill({ headers, json: {
      date: invalid ? followingDate(date) : date, time_zone: 'Africa/Casablanca', revision: 1, informational: true,
      selected_visit_type_id: url.searchParams.get('visit_type_id'),
      visit_types: [{ id: visit, name: service, duration_minutes: 30 }], slots: [],
    } });
  });
  await page.goto(base);
  await expect(page.locator('#availability').getByRole('alert')).toBeVisible();
  await expect(page.locator('.booking-service')).toHaveCount(0);
  invalid = false;
  await page.getByRole('button', { name: 'Réessayer', exact: true }).click();
  await page.getByRole('button', { name: new RegExp(service) }).click();
  await page.getByLabel('Date de visite', { exact: true }).fill('2026-11-02');
  await expect(page.getByRole('heading', { name: 'Pas de créneau ce jour-là', exact: true })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Horaires disponibles' })).toHaveCount(0);
});

test('public discovery rejects slots from another day even when the response date matches', async ({ page }) => {
  await page.route('**/api/v1/booking-requests/configured-availability?**', route => {
    const url = new URL(route.request().url()); const selected = url.searchParams.get('visit_type_id'); const date = url.searchParams.get('date')!;
    return route.fulfill({ headers, json: { date, time_zone: 'Africa/Casablanca', revision: 1, informational: true,
      selected_visit_type_id: selected, visit_types: [{ id: visit, name: service, duration_minutes: 30 }],
      slots: selected ? [{ starts_at: `${followingDate(date)}T09:30:00.000Z`, ends_at: `${followingDate(date)}T10:00:00.000Z` }] : [],
    } });
  });
  await page.goto(base);
  await page.getByRole('button', { name: new RegExp(service) }).click();
  await page.getByLabel('Date de visite', { exact: true }).fill('2026-11-02');
  await expect(page.locator('#availability').getByRole('alert')).toBeVisible();
  await expect(page.getByRole('list', { name: 'Horaires disponibles' })).toHaveCount(0);
});
