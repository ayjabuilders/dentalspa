import { expect, test, type Page, type Route } from '@playwright/test';
import { createTeamTransport } from '../../apps/clinic-os/components/team/transport';
const base = process.env.TEAM_UI_URL ?? 'http://localhost:4200';
const clinic = '10000000-0000-4000-8000-000000000001';
const user = '10000000-0000-4000-8000-000000000002';
const item = { kind: 'inquiry_created', actor_display_name: 'Acteur synthétique', occurred_at: '2026-10-27T09:00:00Z' };
const activity = { observed_at: '2026-10-27T09:10:00Z', items: [item], truncated: false };
const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Cache-Control': 'no-store' };
async function verified(page: Page, handler: (route: Route) => Promise<void>, rosterHandler?: (route: Route) => Promise<void>) {
  let count = 0;
  await page.route('https://team-auth.example.invalid/**', async route => {
    if (route.request().method() === 'OPTIONS' || route.request().url().includes('/logout')) return route.fulfill({ status: 204, headers });
    return route.fulfill({ status: 200, headers, json: { access_token: 'synthetic-token', token_type: 'bearer', refresh_token: 'synthetic-refresh', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: user, aud: 'authenticated', role: 'authenticated', email: 'staff@example.invalid', app_metadata: {}, user_metadata: {}, created_at: '2026-10-26T09:00:00Z' } } });
  });
  await page.route('**/api/v1/**', async route => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const url = route.request().url();
    if (url.endsWith('/me/workspace')) return route.fulfill({ status: 200, headers, json: { user_id: user, clinic_id: clinic, roles: ['manager'], mode: 'connected' } });
    if (url.endsWith('/team/roster') && rosterHandler) return rosterHandler(route);
    if (url.endsWith('/team/roster')) return route.fulfill({ status: 200, headers, json: { observed_at: activity.observed_at, members: [], truncated: false } });
    expect(url).toMatch(/\/api\/v1\/team\/activity$/); expect(route.request().method()).toBe('GET'); expect(route.request().headers()['x-clinic-id']).toBe(clinic); count++; return handler(route);
  });
  await page.goto(`${base}/connection`); await page.getByLabel('Adresse e-mail', { exact: true }).fill('staff@example.invalid'); await page.getByLabel('Mot de passe', { exact: true }).fill('synthetic-password'); await page.getByLabel('Identifiant du cabinet de développement').fill(clinic);
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click(); await page.getByRole('button', { name: 'Ouvrir les membres du cabinet' }).click();
  await expect(page.getByRole('button', { name: 'Afficher l’activité récente' })).toBeVisible(); expect(count).toBe(0);
  await page.getByRole('button', { name: 'Afficher l’activité récente' }).click(); return () => count;
}

test('demo journal has four truthful action labels, no inferred contact/booking and no storage', async ({ page }) => {
  await page.goto(`${base}/team`); await expect(page.locator('.team-activity-timeline>li')).toHaveCount(4);
  for (const name of ['Demande créée', 'Suivi consigné', 'Option temporaire créée', 'Option temporaire libérée']) await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  await expect(page.getByText('Membre non affiché', { exact: true })).toBeVisible();
  await expect(page.getByText(/Événements et noms synthétiques/)).toBeVisible(); await expect(page.getByText(/aperçu non exhaustif/)).toBeVisible();
  await expect(page.getByText('Ne prouve pas un contact réussi')).toBeVisible(); await expect(page.getByText('Aucune réservation confirmée')).toBeVisible();
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toMatch(/Adam|Nora|Lina|inquiry_created/);
});

test('responsive journal pearl/navy, keyboard focus, motion and reduced-motion', async ({ page }) => {
  await page.goto(`${base}/team`); await expect(page.locator('.team-activity-timeline>li')).toHaveCount(4);
  expect(await page.locator('.team-activity-timeline>li').first().evaluate(el => getComputedStyle(el).animationName)).toBe('team-activity-enter');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await page.locator('.team-activity-timeline>li').first().evaluate(el => getComputedStyle(el).animationName)).toBe('none');
  for (const theme of ['pearl', 'navy']) {
    if (theme === 'navy') await page.getByRole('button', { name: 'Activer le thème sombre' }).click();
    for (const width of [1536, 1280, 768, 390]) {
      await page.setViewportSize({ width, height: 1000 }); await page.locator('.team-activity').evaluate(element => element.scrollIntoView({ block: 'start' }));
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ animations: 'disabled', path: `test-results/activity-${theme}-${width}.png` });
    }
  }
  const refresh = page.getByRole('button', { name: 'Actualiser l’activité', exact: true }); await refresh.focus(); await page.keyboard.press('Tab');
  await expect(page.getByRole('region', { name: 'Actions récentes, des plus récentes aux plus anciennes' })).toBeFocused();
  expect((await refresh.boundingBox())!.height).toBeGreaterThanOrEqual(44);
});

test.describe('verified activity', () => {
  test.skip(process.env.TEAM_CONFIGURED !== '1', 'Requires isolated synthetic authentication build.');
  test('explicit load, 50+ partial, denied refresh removes names and logout unmounts', async ({ page }) => {
    let denied = false;
    await verified(page, route => route.fulfill({ status: denied ? 403 : 200, headers, json: denied ? {} : { ...activity, items: Array.from({ length: 50 }, () => item), truncated: true } }));
    await expect(page.getByRole('heading', { name: 'Activité récente', exact: true })).toBeFocused(); await expect(page.locator('.team-activity-timeline>li')).toHaveCount(50); await expect(page.locator('.team-activity-count strong')).toHaveText('50+'); await expect(page.getByText(/total exact n’est pas disponible/)).toBeVisible();
    await page.locator('.team-activity').evaluate(element => element.scrollIntoView({ block: 'start' })); await page.screenshot({ animations: 'disabled', path: 'test-results/activity-connected-partial.png' });
    denied = true; await page.getByRole('button', { name: 'Actualiser l’activité', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Activité non autorisée' })).toBeVisible(); await expect(page.getByText(item.actor_display_name, { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Se déconnecter', exact: true }).first().click(); await expect(page.locator('.team-activity')).toHaveCount(0);
  });
  test('offline clears and ignores late response, reconnect needs retry, unavailable and empty differ', async ({ page, context }) => {
    let count = 0; let release!: () => void;
    const calls = await verified(page, async route => {
      count++;
      if (count === 1) { await new Promise<void>(resolve => { release = resolve; }); await route.fulfill({ status: 200, headers, json: activity }).catch(() => undefined); return; }
      return route.fulfill({ status: count === 2 ? 503 : 200, headers, json: count === 2 ? {} : { ...activity, items: [] } });
    });
    await expect(page.getByRole('heading', { name: 'Lecture de l’activité…' })).toBeVisible(); await expect.poll(() => Boolean(release)).toBe(true);
    await context.setOffline(true); await expect(page.getByRole('heading', { name: 'Activité hors connexion' })).toBeVisible(); release(); await expect(page.getByText(item.actor_display_name, { exact: true })).toHaveCount(0);
    await context.setOffline(false); expect(calls()).toBe(1); await page.getByRole('button', { name: 'Réessayer l’activité' }).click(); await expect(page.getByRole('heading', { name: 'Activité indisponible' })).toBeVisible();
    await page.getByRole('button', { name: 'Réessayer l’activité' }).click(); await expect(page.getByRole('heading', { name: 'Aucune action retournée' })).toBeVisible();
  });
  test('tool close clears events; session deadline clears reopened activity', async ({ page }) => {
    await page.clock.install(); const count = await verified(page, route => route.fulfill({ status: 200, headers, json: activity })); await expect(page.locator('.team-activity-timeline>li')).toHaveCount(1);
    await page.getByRole('button', { name: 'Masquer les membres du cabinet' }).click(); await expect(page.locator('.team-activity')).toHaveCount(0);
    await page.getByRole('button', { name: 'Ouvrir les membres du cabinet' }).click(); await expect(page.getByRole('button', { name: 'Afficher l’activité récente' })).toBeVisible(); expect(count()).toBe(1); await expect(page.locator('.team-activity-timeline>li')).toHaveCount(0);
    await page.getByRole('button', { name: 'Afficher l’activité récente' }).click(); await expect(page.locator('.team-activity-timeline>li')).toHaveCount(1);
    expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage, url: location.href }))).not.toMatch(/Acteur|synthetic-token|inquiry_created/);
    await page.clock.fastForward(3601000); await expect(page.locator('.team-activity')).toHaveCount(0); await expect(page.getByRole('button', { name: 'Se connecter', exact: true })).toBeVisible();
  });
  test('roster authority denial clears journal and blocks late activity; activity-only denial preserves roster', async ({ page }) => {
    let rosterDenied = false; let activityDenied = false; let delayed = false; let release!: () => void;
    await verified(page, async route => {
      if (delayed) await new Promise<void>(resolve => { release = resolve; });
      await route.fulfill({ status: activityDenied ? 403 : 200, headers, json: activityDenied ? {} : activity }).catch(() => undefined);
    }, route => route.fulfill({ status: rosterDenied ? 403 : 200, headers, json: rosterDenied ? {} : { observed_at: activity.observed_at, members: [{ user_id: user, clinic_id: clinic, display_name: 'Dentiste synthétique', roles: ['dentist'] }], truncated: false } }));
    await expect(page.getByText(item.actor_display_name, { exact: true })).toBeVisible();
    rosterDenied = true; await page.getByRole('button', { name: 'Actualiser les membres' }).click();
    await expect(page.getByRole('heading', { name: 'Annuaire non autorisé' })).toBeVisible();
    await expect(page.locator('.team-activity-timeline>li')).toHaveCount(0); await expect(page.getByText(item.actor_display_name, { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Réessayer l’activité' })).toBeDisabled();
    rosterDenied = false; await page.getByRole('button', { name: 'Réessayer l’annuaire' }).click(); await page.getByRole('button', { name: 'Afficher l’activité récente' }).click();
    await expect(page.getByText(item.actor_display_name, { exact: true })).toBeVisible();
    activityDenied = true; await page.getByRole('button', { name: 'Actualiser l’activité', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Activité non autorisée' })).toBeVisible(); await expect(page.getByText('Dentiste synthétique', { exact: true })).toBeVisible();
    activityDenied = false; delayed = true; await page.getByRole('button', { name: 'Réessayer l’activité' }).click(); await expect.poll(() => Boolean(release)).toBe(true);
    rosterDenied = true; await page.getByRole('button', { name: 'Actualiser les membres' }).click(); await expect(page.getByRole('heading', { name: 'Annuaire non autorisé' })).toBeVisible(); release();
    await expect(page.locator('.team-activity-timeline>li')).toHaveCount(0); await expect(page.getByText(item.actor_display_name, { exact: true })).toHaveCount(0);
  });
  test('401 activity response clears entire verified tool', async ({ page }) => {
    await verified(page, route => route.fulfill({ status: 401, headers, json: {} })); await expect(page.locator('.team-activity')).toHaveCount(0); await expect(page.getByRole('button', { name: 'Se connecter', exact: true })).toBeVisible();
  });
});

test('strict activity response rejects scope fields, malformed types, kinds, order and false partials', async () => {
  let payload: unknown = activity; const calls: { url: string; init: RequestInit }[] = [];
  const transport = createTeamTransport({ api: 'https://api.example.invalid', token: 'synthetic', clinicId: clinic, fetcher: (async (url, init) => { calls.push({ url: String(url), init: init! }); return Response.json(payload); }) as typeof fetch });
  expect(await transport.activity()).toEqual(activity);
  for (const value of [{ ...activity, clinic_id: user }, { ...activity, items: [{ ...item, clinic_id: user }] }, { ...activity, items: [{ ...item, patient_name: 'Forbidden' }] }, { ...activity, items: [{ ...item, kind: 'approved' }] }, { ...activity, items: [{ ...item, actor_display_name: 42 }] }, { ...activity, items: [item, { ...item, occurred_at: '2026-10-27T09:01:00Z' }] }, { ...activity, truncated: true }]) {
    payload = value; await expect(transport.activity()).rejects.toMatchObject({ kind: 'unavailable' });
  }
  expect(calls[0]).toMatchObject({ url: 'https://api.example.invalid/api/v1/team/activity', init: { method: 'GET', cache: 'no-store', credentials: 'omit', headers: { 'X-Clinic-Id': clinic } } }); expect(calls[0]!.init.body).toBeUndefined(); transport.dispose();
});

test('replacing clinic/session disposes old activity even if the old fetch ignores abort', async () => {
  let finish!: (value: Response) => void; let signal: AbortSignal | null | undefined;
  const old = createTeamTransport({ api: 'https://api.example.invalid', token: 'old-session', clinicId: clinic, fetcher: ((_url, init) => { signal = init?.signal; return new Promise<Response>(resolve => { finish = resolve; }); }) as typeof fetch });
  const pending = old.activity(); old.dispose(); expect(signal!.aborted).toBe(true);
  const fresh = createTeamTransport({ api: 'https://api.example.invalid', token: 'new-session', clinicId: user, fetcher: (async (_url, init) => { expect(init?.headers).toMatchObject({ Authorization: 'Bearer new-session', 'X-Clinic-Id': user }); return Response.json({ ...activity, items: [] }); }) as typeof fetch });
  finish(Response.json(activity)); await expect(pending).rejects.toMatchObject({ kind: 'expired' }); expect((await fresh.activity()).items).toEqual([]); fresh.dispose();
});
