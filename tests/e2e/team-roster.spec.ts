import { expect, test, type Page, type Route } from '@playwright/test';
import { selectWorkspace, workspaceChoices, workspaceVerification } from './helpers/workspace-selection';
import { createTeamTransport } from '../../apps/clinic-os/components/team/transport';
const base = process.env.TEAM_UI_URL ?? 'http://localhost:4204';
const clinic = '10000000-0000-4000-8000-000000000001';
const user = '10000000-0000-4000-8000-000000000002';
const member = { user_id: user, clinic_id: clinic, display_name: 'Nora Synthétique', roles: ['dentist', 'manager'] };
const roster = { observed_at: '2026-10-27T09:00:00Z', members: [member], truncated: false };
const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Cache-Control': 'no-store' };
async function verified(page: Page, handler: (route: Route) => Promise<void>) {
  const calls: string[] = [];
  await page.route('https://team-auth.example.invalid/**', async route => {
    if (route.request().method() === 'OPTIONS' || route.request().url().includes('/logout')) return route.fulfill({ status: 204, headers });
    return route.fulfill({ status: 200, headers, json: { access_token: 'synthetic-token', token_type: 'bearer', refresh_token: 'synthetic-refresh', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: user, aud: 'authenticated', role: 'authenticated', email: 'staff@example.invalid', app_metadata: {}, user_metadata: {}, created_at: '2026-10-26T09:00:00Z' } } });
  });
  await page.route('**/api/v1/**', async route => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    calls.push(route.request().url());
    if (route.request().url().endsWith('/me/workspaces')) return route.fulfill({ status: 200, headers, json: workspaceChoices(clinic, ['manager']) }); if (route.request().url().endsWith('/me/workspace')) return route.fulfill({ status: 200, headers, json: workspaceVerification(user, clinic, ['manager']) });
    return handler(route);
  });
  await page.goto(`${base}/connection`); await page.getByLabel('Adresse e-mail', { exact: true }).fill('staff@example.invalid');
  await page.getByLabel('Mot de passe', { exact: true }).fill('synthetic-password'); await page.getByRole('button', { name: 'Se connecter', exact: true }).click(); await selectWorkspace(page); await expect(page.getByRole('button', { name: 'Ouvrir les membres du cabinet' })).toBeVisible();
  expect(calls).toHaveLength(2);
  expect(calls.map(url => new URL(url).pathname)).toEqual(['/api/v1/me/workspaces', '/api/v1/me/workspace']);
  await page.getByRole('button', { name: 'Ouvrir les membres du cabinet' }).click(); await expect(page.locator('.team-access-decision-preview')).toHaveCount(0); return calls;
}
test('synthetic team shows grouped access roles and loaded-only search without management actions', async ({ page }) => {
  await page.goto(`${base}/team?preview=1`); await expect(page.getByRole('heading', { name: 'Membres du cabinet', exact: true })).toBeVisible();
  await expect(page.locator('.team-roster-list>li')).toHaveCount(4);
  await expect(page.getByText('Démonstration synthétique · mémoire temporaire')).toBeVisible();
  await page.getByLabel('Filtrer les rôles d’accès chargés').selectOption('manager'); await expect(page.locator('.team-roster-list>li')).toHaveCount(2);
  await page.getByLabel('Rechercher parmi les membres chargés').fill('Imane'); await expect(page.locator('.team-roster-list>li')).toHaveCount(1);
  await expect(page.locator('.team-roster-roles li')).toHaveText(['Dentiste', 'Gestionnaire']);
  await page.getByLabel('Rechercher parmi les membres chargés').fill('Absent'); await expect(page.getByRole('heading', { name: 'Aucun résultat dans la liste chargée' })).toBeVisible();
  await page.getByRole('button', { name: 'Réinitialiser les filtres' }).click(); await expect(page.locator('.team-roster-list>li')).toHaveCount(4);
  await expect(page.getByRole('button', { name: /Inviter|Modifier|Approuver/ })).toHaveCount(0);
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toMatch(/Nora|Adam|Lina|Yanis/);
});
test('M16 decision preview stays unresolved, demo-only, responsive and creates no persisted state', async ({ page }) => {
  const apiRequests: string[] = [];
  page.on('request', request => { if (/\/api\/|supabase/i.test(request.url())) apiRequests.push(`${request.method()} ${request.url()}`); });
  await page.addInitScript(() => {
    const writes: string[] = [];
    Object.defineProperty(window, '__teamPreviewStorageWrites', { value: writes });
    const patchStorage = (method: 'setItem' | 'removeItem' | 'clear') => {
      const original = Storage.prototype[method] as (this: Storage, ...args: string[]) => void;
      Object.defineProperty(Storage.prototype, method, { configurable: true, writable: true, value: function (this: Storage, ...args: string[]) {
        writes.push(`${this === window.localStorage ? 'local' : 'session'}:${method}:${String(args[0] ?? '')}`);
        return original.apply(this, args);
      } });
    };
    patchStorage('setItem'); patchStorage('removeItem'); patchStorage('clear');
  });
  await page.goto(`${base}/team?preview=1`);
  const panel = page.locator('.team-access-decision-preview');
  await expect(panel.getByRole('heading', { name: 'Questions d’accès et d’équipe' })).toBeVisible();
  await expect(panel.locator('.team-access-decision-list>li')).toHaveCount(7);
  await expect(panel.locator('.team-access-decision-status')).toHaveText(Array(7).fill('À définir'));
  await expect(panel.getByText(/aucune règle d’accès n’est activée ni décidée ici/)).toBeVisible();
  await expect(panel.locator('button, input, select, textarea')).toHaveCount(0);
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  }
  expect(apiRequests).toEqual([]);
  const writes = await page.evaluate(() => (window as unknown as { __teamPreviewStorageWrites: string[] }).__teamPreviewStorageWrites);
  // Supabase's imported auth SDK probes browser storage with a random lswt-* key, then removes it.
  expect(writes.filter(write => !write.includes(':lswt-'))).toEqual([]);
  expect(await page.evaluate(() => Object.keys(localStorage).concat(Object.keys(sessionStorage)).filter(key => key.startsWith('lswt-')))).toEqual([]);
});
test('fictional admin assignment proposal is session-only and resets without sending or saving', async ({ page }) => {
  const apiRequests: string[] = [];
  page.on('request', request => { if (/\/api\//.test(request.url())) apiRequests.push(request.url()); });
  await page.goto(`${base}/team?preview=1`);
  await expect(page.getByRole('heading', { name: 'Aperçu d’affectation' })).toBeVisible();
  await expect(page.getByText(/Règles, capacités, équipes, horaires et disponibilités entièrement fictifs/)).toBeVisible();
  await page.getByLabel('Tâche d’exemple').selectOption('office-supplies-demo');
  await expect(page.getByRole('button', { name: 'Ajouter à l’aperçu' })).toBeDisabled();
  await expect(page.locator('.team-assignment-candidates .team-assignment-no-match').filter({ hasText: 'Déjà occupé dans le scénario' })).toBeVisible();
  await page.getByLabel('Créneau d’exemple').selectOption('15:00');
  await page.getByLabel('Membre correspondant aux critères fictifs').selectOption('10000000-0000-4000-8000-000000000013');
  await page.getByRole('button', { name: 'Ajouter à l’aperçu' }).click();
  await expect(page.locator('.team-assignment-list').getByText('Imane El Idrissi · Dentiste, Gestionnaire · Support administratif de démonstration', { exact: true })).toBeVisible();
  await expect(page.getByText('Vérifier les fournitures de bureau · 15:00')).toBeVisible();
  await expect(page.getByText('Non transmise', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Effacer' }).click();
  await expect(page.getByText('Aucune proposition dans cette session.')).toBeVisible();
  expect(apiRequests).toEqual([]);
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toMatch(/Salma|fournitures|welcome-demo/);
  await page.getByRole('button', { name: 'Ajouter à l’aperçu' }).click();
  await page.reload();
  await expect(page.getByText('Aucune proposition dans cette session.')).toBeVisible();
  expect(apiRequests).toEqual([]);
});
test('fictional approval inbox only simulates administrative decisions in memory', async ({ page }) => {
  const apiRequests: string[] = [];
  page.on('request', request => { if (/\/api\//.test(request.url())) apiRequests.push(request.url()); });
  await page.goto(`${base}/team?preview=1`);
  const inbox = page.locator('.team-approval-preview');
  await expect(inbox.getByRole('heading', { name: 'Aperçu de la boîte d’approbations' })).toBeVisible();
  await expect(inbox.locator('.team-approval-list>li')).toHaveCount(2);
  await expect(inbox.getByText(/ne représentent ni les permissions d’un membre réel, ni une approbation du cabinet/)).toBeVisible();
  await inbox.getByRole('button', { name: 'Simuler l’acceptation' }).first().click();
  await expect(inbox.getByText('Acceptée dans cet aperçu')).toBeVisible();
  await inbox.getByRole('button', { name: 'Simuler le refus' }).click();
  await expect(inbox.getByText('Refusée dans cet aperçu')).toBeVisible();
  await expect(inbox.getByRole('button', { name: /Simuler l’acceptation|Simuler le refus/ })).toHaveCount(0);
  expect(apiRequests).toEqual([]);
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toMatch(/welcome-copy-demo|office-supplies-demo|Acceptée|Refusée/);
  await inbox.getByRole('button', { name: 'Réinitialiser les décisions de démo' }).click();
  await expect(inbox.getByText('À revoir dans la démo')).toHaveCount(2);
  await inbox.getByRole('button', { name: 'Simuler l’acceptation' }).first().click();
  await page.reload();
  await expect(page.locator('.team-approval-preview').getByText('À revoir dans la démo')).toHaveCount(2);
  expect(apiRequests).toEqual([]);
});
test('fictional delegation checks sample policy and recipient acceptance without assigning real work', async ({ page }) => {
  const apiRequests: string[] = [];
  page.on('request', request => { if (/\/api\//.test(request.url())) apiRequests.push(request.url()); });
  await page.goto(`${base}/team?preview=1`);
  const delegation = page.locator('.team-delegation-preview');
  await expect(delegation.getByRole('heading', { name: 'Aperçu de délégation' })).toBeVisible();
  await expect(delegation.getByText('désactivée pour cette tâche fictive')).toBeVisible();
  await expect(delegation.getByRole('button', { name: 'Simuler la proposition' })).toBeDisabled();
  await delegation.getByLabel('Tâche de délégation d’exemple').selectOption('office-supplies-demo');
  await delegation.getByLabel('Créneau de délégation d’exemple').selectOption('14:00');
  await expect(delegation.getByRole('button', { name: 'Simuler la proposition' })).toBeDisabled();
  await expect(delegation.locator('.team-delegation-no-match').filter({ hasText: 'Déjà occupé dans le scénario' })).toBeVisible();
  await delegation.getByLabel('Créneau de délégation d’exemple').selectOption('15:00');
  await delegation.getByLabel('Membre remplaçant fictif').selectOption('10000000-0000-4000-8000-000000000013');
  await delegation.getByRole('button', { name: 'Simuler la proposition' }).click();
  await expect(delegation.getByText('Youssef Benali → Imane El Idrissi')).toBeVisible();
  await delegation.getByRole('button', { name: 'Simuler l’acceptation du remplaçant' }).click();
  await expect(delegation.getByText('Acceptée dans cet aperçu')).toBeVisible();
  expect(apiRequests).toEqual([]);
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toMatch(/Imane|Youssef|office-supplies-demo|Acceptée/);
  await delegation.getByRole('button', { name: 'Effacer cette proposition' }).click();
  await expect(delegation.getByText('Aucune proposition de délégation dans cette session.')).toBeVisible();
  await page.reload();
  await expect(page.locator('.team-delegation-preview').getByText('Aucune proposition de délégation dans cette session.')).toBeVisible();
  expect(apiRequests).toEqual([]);
});
test('responsive pearl/navy layout, keyboard focus and touch controls', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.goto(`${base}/team?preview=1`); await expect(page.locator('.team-roster-list>li')).toHaveCount(4);
  for (const width of [1536, 1280, 768, 390]) {
    await page.setViewportSize({ width, height: 900 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ animations: 'disabled', path: `test-results/team-pearl-${width}.png` });
  }
  const input = page.getByLabel('Rechercher parmi les membres chargés'); await input.focus();
  expect(await page.locator('.team-roster-search').evaluate(element => getComputedStyle(element).boxShadow)).not.toBe('none');
  expect((await page.getByLabel('Filtrer les rôles d’accès chargés').boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await page.getByRole('button', { name: 'Activer le thème sombre' }).click();
  for (const width of [1536, 1280, 768, 390]) { await page.setViewportSize({ width, height: 900 }); await page.screenshot({ animations: 'disabled', path: `test-results/team-navy-${width}.png` }); }
  const preview = page.locator('.team-assignment-preview'); await preview.scrollIntoViewIfNeeded();
  await page.setViewportSize({ width: 390, height: 844 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await page.getByLabel('Tâche d’exemple').boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect((await page.getByRole('button', { name: 'Ajouter à l’aperçu' }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await page.screenshot({ animations: 'disabled', path: 'test-results/team-assignment-navy-390.png' });
  await page.getByRole('button', { name: 'Activer le thème clair' }).click();
  await page.screenshot({ animations: 'disabled', path: 'test-results/team-assignment-pearl-390.png' });
  const approvals = page.locator('.team-approval-preview'); await approvals.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await approvals.getByRole('button', { name: 'Simuler l’acceptation' }).first().boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await page.screenshot({ animations: 'disabled', path: 'test-results/team-approval-pearl-390.png' });
  await page.getByRole('button', { name: 'Activer le thème sombre' }).click();
  await page.screenshot({ animations: 'disabled', path: 'test-results/team-approval-navy-390.png' });
  const delegation = page.locator('.team-delegation-preview'); await delegation.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await delegation.getByLabel('Tâche de délégation d’exemple').boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await page.screenshot({ animations: 'disabled', path: 'test-results/team-delegation-navy-390.png' });
});
test.describe('verified team roster', () => {
  test.skip(process.env.TEAM_CONFIGURED !== '1', 'Requires isolated synthetic authentication build.');
  test('explicit launch, partial/filter truth, denied refresh clears names/query and logout clears tool', async ({ page }) => {
    let denied = false;
    const calls = await verified(page, async route => route.fulfill({ status: denied ? 403 : 200, headers, json: denied ? { code: 'forbidden' } : { ...roster, members: Array.from({ length: 100 }, (_, index) => ({ ...member, user_id: `10000000-0000-4000-8000-${String(index + 10).padStart(12, '0')}`, display_name: index === 0 ? member.display_name : `Personne synthétique ${index}` })), truncated: true } }));
    await expect(page.getByRole('heading', { name: 'Membres du cabinet', exact: true })).toBeFocused();
    await expect(page.locator('.team-roster-list>li')).toHaveCount(100); await page.locator('.team-roster').scrollIntoViewIfNeeded(); await page.screenshot({ animations: 'disabled', path: 'test-results/team-connected-1280.png' }); await page.setViewportSize({ width: 390, height: 900 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await page.locator('.team-roster').scrollIntoViewIfNeeded(); await page.screenshot({ animations: 'disabled', path: 'test-results/team-connected-390.png' }); await expect(page.getByText('100+ membres', { exact: true })).toBeVisible(); await expect(page.getByText(/Annuaire partiel/)).toBeVisible();
    await page.getByLabel('Rechercher parmi les membres chargés').fill('Nora');
    denied = true; await page.getByRole('button', { name: 'Actualiser les membres' }).click();
    await expect(page.getByRole('heading', { name: 'Annuaire non autorisé' })).toBeVisible(); await expect(page.getByText('Nora Synthétique', { exact: true })).toHaveCount(0);
    await expect(page.getByLabel('Rechercher parmi les membres chargés')).toHaveValue('');
    expect(calls.filter(url => url.includes('/team/')).every(url => url.endsWith('/team/roster'))).toBe(true);
    await page.getByRole('button', { name: 'Se déconnecter', exact: true }).first().click(); await expect(page.locator('.team-roster')).toHaveCount(0);
  });
  test('offline aborts late response, reconnect is explicit, empty and unavailable differ', async ({ page, context }) => {
    let count = 0; let release!: () => void; let started!: () => void; const waiting = new Promise<void>(resolve => { started = resolve; });
    await verified(page, async route => {
      count++;
      if (count === 1) { started(); await new Promise<void>(resolve => { release = resolve; }); await route.fulfill({ status: 200, headers, json: roster }).catch(() => undefined); return; }
      return route.fulfill({ status: count === 2 ? 503 : 200, headers, json: count === 2 ? { code: 'unavailable' } : { ...roster, members: [] } });
    });
    await waiting; await expect(page.getByRole('heading', { name: 'Lecture de l’annuaire…' })).toBeVisible();
    await context.setOffline(true); await expect(page.getByRole('heading', { name: 'Vous êtes hors connexion' })).toBeVisible(); release();
    await expect(page.getByText('Nora Synthétique', { exact: true })).toHaveCount(0); await context.setOffline(false); expect(count).toBe(1);
    await page.getByRole('button', { name: 'Réessayer l’annuaire' }).click(); await expect(page.getByRole('heading', { name: 'Annuaire indisponible' })).toBeVisible();
    await page.getByRole('button', { name: 'Réessayer l’annuaire' }).click(); await expect(page.getByRole('heading', { name: 'Aucun membre retourné' })).toBeVisible();
  });
  test('session deadline removes roster and search; reopening tool refreshes without storage', async ({ page }) => {
    await page.clock.install(); let count = 0;
    await verified(page, async route => { count++; return route.fulfill({ status: 200, headers, json: roster }); });
    await expect(page.locator('.team-roster-list>li')).toHaveCount(1); await page.getByLabel('Rechercher parmi les membres chargés').fill('Nora');
    await page.getByRole('button', { name: 'Masquer les membres du cabinet' }).click(); await expect(page.locator('.team-roster')).toHaveCount(0);
    await page.getByRole('button', { name: 'Ouvrir les membres du cabinet' }).click(); await expect(page.locator('.team-roster-list>li')).toHaveCount(1); expect(count).toBe(2);
    await expect(page.getByLabel('Rechercher parmi les membres chargés')).toHaveValue('');
    expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage, href: location.href }))).not.toMatch(/Nora|synthetic-token/);
    await page.clock.fastForward(3601000); await expect(page.locator('.team-roster')).toHaveCount(0); await expect(page.getByRole('button', { name: 'Se connecter', exact: true })).toBeVisible();
  });
});
test('strict transport rejects foreign clinic, duplicates, extra fields and noncanonical roles', async () => {
  let value: unknown = roster; const calls: RequestInit[] = [];
  const transport = createTeamTransport({ api: 'https://api.example.invalid', token: 'synthetic', clinicId: clinic, fetcher: (async (_url, init) => { calls.push(init!); return Response.json(value); }) as typeof fetch });
  expect(await transport.roster()).toEqual(roster);
  for (const members of [[{ ...member, clinic_id: user }], [member, member], [{ ...member, email: 'forbidden@example.invalid' }], [{ ...member, roles: ['dentist', 'dentist'] }], [{ ...member, roles: ['manager', 'dentist'] }]]) { value = { ...roster, members }; await expect(transport.roster()).rejects.toMatchObject({ kind: 'unavailable' }); }
  expect(calls[0]).toMatchObject({ method: 'GET', cache: 'no-store', credentials: 'omit' }); expect(calls[0]!.body).toBeUndefined();
  transport.dispose(); await expect(transport.roster()).rejects.toMatchObject({ kind: 'expired' });
});
test('disposal notifies consumer and blocks late responses even when fetch ignores abort', async () => {
  let resolve!: (value: Response) => void; let disposed = 0;
  const transport = createTeamTransport({ api: 'https://api.example.invalid', token: 'synthetic', clinicId: clinic, fetcher: (() => new Promise<Response>(done => { resolve = done; })) as typeof fetch });
  transport.onDispose(() => { disposed++; }); const pending = transport.roster(); transport.dispose(); resolve(Response.json(roster));
  await expect(pending).rejects.toMatchObject({ kind: 'expired' }); expect(disposed).toBe(1);
});
