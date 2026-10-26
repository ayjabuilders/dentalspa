import { test, expect, type Page, type Route } from '@playwright/test';
import { createSchedulingTransport } from '../../apps/clinic-os/components/scheduling/transport';
const base = process.env.SCHEDULING_UI_URL ?? 'http://localhost:4200';
const clinic = '10000000-0000-4000-8000-000000000001';
const provider = '10000000-0000-4000-8000-000000000041';
const chair = '10000000-0000-4000-8000-000000000042';
const id = '10000000-0000-4000-8000-000000000043';
const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
const now = () => new Date().toISOString();
async function choose(page: Page) {
  await page.getByRole('button', { name: 'Charger les ressources' }).click();
  await page.getByLabel('Praticien', { exact: true }).selectOption(provider);
  await page.getByLabel('Fauteuil', { exact: true }).selectOption(chair);
  await page.getByRole('button', { name: 'Vérifier les disponibilités' }).click();
}
async function connect(page: Page, handler: (route: Route) => Promise<void>) {
  await page.route('https://lookup-auth.example.invalid/**', async route => {
    if (route.request().method() === 'OPTIONS' || route.request().url().includes('/logout')) return route.fulfill({ status: 204, headers });
    return route.fulfill({ status: 200, headers, json: { access_token: 'synthetic-token', token_type: 'bearer', refresh_token: 'synthetic-refresh', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: clinic, aud: 'authenticated', role: 'authenticated', email: 'staff@example.invalid', app_metadata: {}, user_metadata: {}, created_at: now() } } });
  });
  await page.route('**/api/v1/**', async route => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (route.request().url().endsWith('/me/workspace')) return route.fulfill({ status: 200, headers, json: { user_id: clinic, clinic_id: clinic, roles: ['reception'], mode: 'connected' } });
    if (route.request().url().endsWith('/resources')) return route.fulfill({ status: 200, headers, json: { items: [{ id: provider, kind: 'provider', display_name: 'Praticien test autorisé' }, { id: chair, kind: 'chair', display_name: 'Fauteuil test autorisé' }], observed_at: now(), truncated: false } });
    return handler(route);
  });
  await page.goto(`${base}/connection`);
  await page.getByLabel('Adresse e-mail', { exact: true }).fill('staff@example.invalid');
  await page.getByLabel('Mot de passe', { exact: true }).fill('synthetic-password');
  await page.getByLabel('Identifiant du cabinet de développement').fill(clinic);
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  await page.getByRole('button', { name: 'Planifier les ressources' }).click();
  expect(await page.locator('.schedule-heading').evaluate(element => getComputedStyle(element).display)).toBe('flex');
}
async function availability(route: Route, truncated = false, empty = false) {
  const body = route.request().postDataJSON();
  return route.fulfill({ status: 200, headers, json: { ...body, intervals: empty ? [] : [{ starts_at: body.window_starts_at, ends_at: new Date(Date.parse(body.window_starts_at) + 1800000).toISOString() }], observed_at: now(), informational: true, truncated } });
}
test('synthetic agenda: explicit resources, proposal, hold, release, no retained data', async ({ page }) => {
  await page.goto(`${base}/planning`);
  await expect(page.getByText('Simulation synthétique · mémoire locale uniquement')).toBeVisible();
  await choose(page);
  await expect(page.locator('.schedule-slots li')).toHaveCount(8);
  await page.getByRole('button', { name: 'Proposer' }).first().click();
  await expect(page.getByRole('heading', { name: 'Horaire proposé' })).toBeVisible();
  await page.getByLabel('Durée souhaitée (minutes)').fill('31');
  await expect(page.getByRole('button', { name: 'Poser une option temporaire' })).toBeDisabled();
  await page.getByLabel('Durée souhaitée (minutes)').fill('15');
  await page.getByRole('button', { name: 'Poser une option temporaire' }).click();
  await expect(page.getByRole('heading', { name: 'Option temporaire active' })).toBeVisible();
  await page.getByRole('button', { name: 'Libérer l’option' }).click();
  await expect(page.getByRole('heading', { name: 'Option libérée' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Charger les ressources' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Option libérée' })).toHaveCount(0);
});
test('mobile/light/dark reflow, touch targets, keyboard focus and reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`${base}/planning`); await choose(page);
  for (const width of [1536, 1280, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.locator('.workspace-scroll').evaluate(element => element.scrollTo(0, 0));
    await page.screenshot({ path: `test-results/scheduling-light-${width}.png`, fullPage: true });
  }
  const button = page.getByRole('button', { name: 'Proposer' }).first();
  expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await page.keyboard.press('Tab'); await button.focus(); expect(await button.evaluate(element => getComputedStyle(element).outlineStyle)).not.toBe('none');
  await page.getByRole('button', { name: 'Activer le thème sombre' }).click();
  expect(await page.locator('.scheduling-workspace').evaluate(element => getComputedStyle(element).getPropertyValue('--schedule-accent'))).toBe('#85baff');
  expect(await page.locator('.schedule-review').evaluate(element => getComputedStyle(element).animationName)).toBe('none');
  for (const width of [1536, 1280, 768, 390]) { await page.setViewportSize({ width, height: 900 }); await page.screenshot({ path: `test-results/scheduling-dark-${width}.png`, fullPage: true }); }
});
test.describe('verified scheduling session', () => {
  test.skip(process.env.SCHEDULING_CONFIGURED !== '1', 'Requires isolated synthetic auth build.');
  test('unknown command retries exact key/body, reads current terminal status, clears on logout', async ({ page }) => {
    const commands: { key: string | undefined; body: unknown }[] = []; let reads = 0; let saved: Record<string, unknown> = {};
    await connect(page, async route => {
      const url = route.request().url();
      if (url.endsWith('/availability')) return availability(route, true);
      if (url.endsWith('/holds')) {
        commands.push({ key: route.request().headers()['idempotency-key'], body: route.request().postDataJSON() });
        saved = { ...route.request().postDataJSON(), id, clinic_id: clinic, status: 'held', expires_at: new Date(Date.now() + 120000).toISOString(), created_at: now(), version: 1 };
        if (commands.length === 1) return route.abort();
        return route.fulfill({ status: 200, headers, json: { item: saved, observed_at: now(), replayed: true } });
      }
      reads++; return route.fulfill({ status: 200, headers, json: { item: { ...saved, status: 'released', version: 2 }, observed_at: now() } });
    });
    await choose(page);
    await expect(page.getByText(/Résultats partiels/)).toBeVisible();
    await page.getByRole('button', { name: 'Proposer' }).click();
    await page.getByRole('button', { name: 'Poser une option temporaire' }).click();
    await expect(page.getByRole('heading', { name: 'Résultat à vérifier' })).toBeVisible();
    await expect(page.getByLabel('Praticien', { exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Masquer la planification' }).click();
    await page.getByRole('button', { name: 'Planifier les ressources' }).click();
    await page.getByRole('button', { name: 'Vérifier le résultat' }).click();
    await expect(page.getByRole('heading', { name: 'Option libérée' })).toBeVisible();
    await page.screenshot({ path: 'test-results/scheduling-connected-released.png', fullPage: true });
    expect(commands).toHaveLength(2); expect(commands[0]).toEqual(commands[1]); expect(reads).toBe(1);
    expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toMatch(/synthetic-token|resource|starts_at/);
    await page.getByRole('button', { name: 'Se déconnecter', exact: true }).first().click();
    await expect(page.locator('.scheduling-workspace')).toHaveCount(0);
  });
  test('deadline requests reconciliation instead of inventing expiry', async ({ page }) => {
    await page.clock.install();
    let saved: Record<string, unknown> = {}; let expired = false;
    await connect(page, async route => {
      if (route.request().url().endsWith('/availability')) return availability(route);
      if (route.request().url().endsWith('/holds')) {
        saved = { ...route.request().postDataJSON(), id, clinic_id: clinic, status: 'held', expires_at: new Date(Date.now() + 60000).toISOString(), created_at: now(), version: 1 };
        return route.fulfill({ status: 200, headers, json: { item: saved, replayed: false, observed_at: now() } });
      }
      return route.fulfill({ status: 200, headers, json: { item: { ...saved, status: expired ? 'expired' : 'held' }, observed_at: now() } });
    });
    await choose(page); await page.getByRole('button', { name: 'Proposer' }).click(); await page.getByRole('button', { name: 'Poser une option temporaire' }).click();
    await expect(page.getByRole('heading', { name: 'Option temporaire active' })).toBeVisible();
    await page.clock.fastForward(61000);
    await expect(page.getByRole('heading', { name: 'Résultat à vérifier' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Option expirée' })).toHaveCount(0);
    expired = true; await page.getByRole('button', { name: 'Vérifier le résultat' }).click();
    await expect(page.getByRole('heading', { name: 'Option expirée' })).toBeVisible();
    await page.clock.fastForward(3601000);
    await expect(page.locator('.scheduling-workspace')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Se connecter', exact: true })).toBeVisible();
  });
  test('denied, empty, conflict and offline are truthful', async ({ page, context }) => {
    let mode = 'denied';
    await connect(page, async route => {
      if (route.request().url().endsWith('/availability')) {
        if (mode === 'denied') return route.fulfill({ status: 403, headers, json: { code: 'forbidden' } });
        return availability(route, false, mode === 'empty');
      }
      return route.fulfill({ status: 409, headers, json: { code: 'resource_conflict' } });
    });
    await choose(page); await expect(page.getByText('Vous ne disposez pas des droits de planification.')).toBeVisible();
    mode = 'empty'; await page.getByRole('button', { name: 'Vérifier les disponibilités' }).click();
    await expect(page.getByRole('heading', { name: 'Aucune plage libre retournée' })).toBeVisible();
    mode = 'free'; await page.getByRole('button', { name: 'Vérifier les disponibilités' }).click();
    await page.getByRole('button', { name: 'Proposer' }).click(); await page.getByRole('button', { name: 'Poser une option temporaire' }).click();
    await expect(page.getByText(/Les ressources ont changé/)).toBeVisible();
    await page.getByRole('button', { name: 'Vérifier les disponibilités' }).click();
    await context.setOffline(true); await expect(page.locator('.schedule-slots li')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Vérifier les disponibilités' })).toBeDisabled();
    await context.setOffline(false);
  });
});
test('transport omits credentials, forbids cross-tenant response and disposes token', async () => {
  const calls: RequestInit[] = [];
  const transport = createSchedulingTransport({ api: 'https://api.example.invalid', token: 'test', clinicId: clinic, fetcher: (async (_url, init) => { calls.push(init!); return new Response(JSON.stringify({ item: { id, clinic_id: provider, provider_resource_id: provider, chair_resource_id: chair, starts_at: '2026-10-27T08:00:00Z', ends_at: '2026-10-27T08:30:00Z', display_timezone: 'UTC', status: 'held', expires_at: '2026-10-26T09:00:00Z', created_at: '2026-10-26T08:00:00Z', version: 1 }, observed_at: now() })); }) as typeof fetch });
  await expect(transport.read(id)).rejects.toMatchObject({ kind: 'unavailable' });
  expect(calls[0]).toMatchObject({ cache: 'no-store', credentials: 'omit' });
  transport.dispose(); await expect(transport.resources()).rejects.toMatchObject({ kind: 'expired' }); expect(calls).toHaveLength(1);
});
test('transport distinguishes disabled from service failures and ignores late disposed responses', async () => {
  for (const [status, code, kind] of [[503, 'scheduling_disabled', 'disabled'], [503, 'unknown', 'unavailable'], [401, 'unauthenticated', 'expired'], [403, 'forbidden', 'denied']] as const) {
    const transport = createSchedulingTransport({ api: 'https://api.example.invalid', token: 'test', clinicId: clinic, fetcher: (async () => new Response(JSON.stringify({ code }), { status })) as typeof fetch });
    await expect(transport.resources()).rejects.toMatchObject({ kind }); transport.dispose();
  }
  let resolve!: (response: Response) => void;
  const transport = createSchedulingTransport({ api: 'https://api.example.invalid', token: 'test', clinicId: clinic, fetcher: (() => new Promise<Response>(done => { resolve = done; })) as typeof fetch });
  const pending = transport.resources(); transport.dispose();
  resolve(new Response(JSON.stringify({ items: [], observed_at: now(), truncated: false })));
  await expect(pending).rejects.toMatchObject({ kind: 'expired' });
});
