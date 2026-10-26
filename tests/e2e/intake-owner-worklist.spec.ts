import { expect, test, type Page, type Route } from '@playwright/test';
import { createDemoIntakeTransport, createHttpIntakeTransport } from '../../apps/clinic-os/components/intake/transport';
const base = process.env.OWNER_WORKLIST_UI_URL ?? 'http://localhost:4200';
const clinic = '10000000-0000-4000-8000-000000000001';
const user = '10000000-0000-4000-8000-000000000002';
const oldId = '10000000-0000-4000-8000-000000000099';
const otherId = '10000000-0000-4000-8000-000000000098';
const item = { id: oldId, clinic_id: clinic, owner_user_id: user, display_name: 'Ancienne demande', source: 'phone' as const, status: 'new' as const, follow_up_at: '2026-01-01T09:00:00Z', created_at: '2025-01-01T09:00:00Z' };
const worklist = { observed_at: '2026-10-27T09:00:00Z', overdue: { items: [item], truncated: false }, upcoming: { items: [], truncated: false }, undated: { items: [], truncated: false } };
const detail = { ...item, display_name: 'Nom actualisé', contact_email: 'synthetic@example.invalid', contact_phone: null };
const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Cache-Control': 'no-store' };
async function verified(page: Page, handler: (route: Route) => Promise<void>) {
  await page.route('https://owner-auth.example.invalid/**', async route => {
    if (route.request().method() === 'OPTIONS' || route.request().url().includes('/logout')) return route.fulfill({ status: 204, headers });
    return route.fulfill({ status: 200, headers, json: { access_token: 'synthetic-token', token_type: 'bearer', refresh_token: 'synthetic-refresh', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: user, aud: 'authenticated', role: 'authenticated', email: 'staff@example.invalid', app_metadata: {}, user_metadata: {}, created_at: '2026-10-26T09:00:00Z' } } });
  });
  await page.route('**/api/v1/**', async route => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (route.request().url().endsWith('/me/workspace')) return route.fulfill({ status: 200, headers, json: { user_id: user, clinic_id: clinic, roles: ['reception'], mode: 'connected' } });
    if (route.request().url().endsWith('/inquiries')) return route.fulfill({ status: 200, headers, json: { items: [], truncated: true } });
    if (route.request().url().endsWith('/follow-ups')) return route.fulfill({ status: 200, headers, json: { items: [], truncated: false } });
    return handler(route);
  });
  await page.goto(`${base}/connection`);
  await page.getByLabel('Adresse e-mail', { exact: true }).fill('staff@example.invalid');
  await page.getByLabel('Mot de passe', { exact: true }).fill('synthetic-password');
  await page.getByLabel('Identifiant du cabinet de développement').fill(clinic);
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  await page.getByRole('button', { name: 'Ouvrir les demandes du cabinet' }).click();
}
test('demo buckets preserve original deadlines after follow-up and allow fresh detail focus', async ({ page }) => {
  await page.goto(`${base}/intake`);
  const list = page.locator('.owner-worklist');
  await expect(list.getByRole('tab', { name: /Échéances passées/ })).toHaveAttribute('aria-selected', 'true');
  await list.getByRole('button', { name: 'Ouvrir la demande Nora Exemple' }).click();
  const panel = page.getByRole('complementary', { name: 'Demande sélectionnée' });
  await expect(panel).toBeFocused(); await expect(panel.getByRole('heading', { name: 'Nora Exemple' })).toBeVisible();
  await panel.getByRole('button', { name: 'Consigner un suivi', exact: true }).click();
  await page.getByLabel('Action constatée').selectOption('contact_attempt'); await page.getByLabel('Canal observé').selectOption('phone');
  await page.getByRole('button', { name: 'Enregistrer le suivi', exact: true }).click();
  await expect(page.locator('.follow-up-history li')).toHaveCount(1);
  await expect(list.getByRole('button', { name: 'Ouvrir la demande Nora Exemple' })).toBeVisible();
  await list.getByRole('tab', { name: /À venir/ }).click(); await expect(list.getByRole('button', { name: 'Ouvrir la demande Adam Exemple' })).toBeVisible();
  await list.getByRole('tab', { name: /Sans date/ }).click(); await expect(list.getByRole('button', { name: 'Ouvrir la demande Lina Exemple' })).toBeVisible();
});
test('responsive pearl/navy tabs support keyboard and do not overflow', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.goto(`${base}/intake`);
  const list = page.locator('.owner-worklist');
  await list.getByRole('tab', { name: /Échéances passées/ }).focus(); await page.keyboard.press('ArrowRight');
  await expect(list.getByRole('tab', { name: /À venir/ })).toBeFocused(); await expect(list.getByRole('tab', { name: /À venir/ })).toHaveAttribute('aria-selected', 'true');
  for (const width of [1536, 1280, 768, 390]) {
    await page.setViewportSize({ width, height: 900 }); await list.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/owner-worklist-pearl-${width}.png` });
  }
  expect((await list.getByRole('tab', { name: /À venir/ }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await page.getByRole('button', { name: 'Activer le thème sombre' }).click(); await list.scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/owner-worklist-navy-390.png' });
});
test.describe('verified owner worklist', () => {
  test.skip(process.env.OWNER_WORKLIST_CONFIGURED !== '1', 'Requires isolated synthetic authentication build.');
  test('partial server bucket and old inquiry fetch do not depend on newest-100 or browser clock', async ({ page }) => {
    const requests: string[] = [];
    await verified(page, async route => {
      requests.push(route.request().url());
      return route.fulfill({ status: 200, headers, json: route.request().url().endsWith('/owner-worklist') ? { ...worklist, observed_at: '2000-01-01T00:00:00Z', overdue: { items: [], truncated: false }, upcoming: { items: [item], truncated: true } } : detail });
    });
    const list = page.locator('.owner-worklist'); await list.getByRole('tab', { name: /À venir 50\+/ }).click();
    await expect(list.getByText(/Liste partielle/)).toBeVisible(); await expect(list.getByText(/2000/)).toBeVisible();
    await list.getByRole('button', { name: 'Ouvrir la demande Ancienne demande' }).click();
    await expect(page.getByRole('heading', { name: 'Nom actualisé', exact: true })).toBeVisible();
    await expect(page.getByRole('complementary')).toContainText('synthetic@example.invalid');
    expect(requests.some(url => url.endsWith(`/inquiries/${oldId}`))).toBe(true);
    expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage, href: location.href }))).not.toMatch(/Ancienne|synthetic-token|example.invalid/);
    await page.getByRole('button', { name: 'Se déconnecter', exact: true }).first().click(); await expect(list).toHaveCount(0);
  });
  test('missing detail clears former data and late superseded detail cannot reopen', async ({ page }) => {
    let mode = 'late'; let release!: () => void; let started!: () => void;
    const waiting = new Promise<void>(resolve => { started = resolve; });
    await verified(page, async route => {
      if (route.request().url().endsWith('/owner-worklist')) return route.fulfill({ status: 200, headers, json: { ...worklist, overdue: { items: [item, { ...item, id: otherId, display_name: 'Autre demande' }], truncated: false } } });
      if (route.request().url().endsWith(oldId) && mode === 'late') { started(); await new Promise<void>(resolve => { release = resolve; }); await route.fulfill({ status: 200, headers, json: detail }).catch(() => undefined); return; }
      if (mode === 'missing') return route.fulfill({ status: 404, headers, json: { code: 'not_found' } });
      return route.fulfill({ status: 200, headers, json: { ...detail, id: otherId, display_name: 'Autre détail' } });
    });
    const list = page.locator('.owner-worklist'); await list.getByRole('button', { name: 'Ouvrir la demande Ancienne demande' }).click(); await waiting;
    await expect(list.getByText(/Vérification de l’accès actuel/)).toBeVisible();
    await list.getByRole('button', { name: 'Ouvrir la demande Autre demande' }).click(); await expect(page.getByRole('heading', { name: 'Autre détail', exact: true })).toBeVisible();
    release(); await expect(page.getByRole('heading', { name: 'Nom actualisé', exact: true })).toHaveCount(0);
    mode = 'missing'; await list.getByRole('button', { name: 'Ouvrir la demande Ancienne demande' }).click();
    await expect(list.getByRole('alert')).toContainText('absente, réattribuée ou inaccessible');
    await expect(page.getByRole('heading', { name: 'Autre détail', exact: true })).toHaveCount(0);
  });
  test('denied/unavailable/offline/expired are distinct and clear the projection', async ({ page, context }) => {
    let status = 403;
    await verified(page, async route => route.fulfill({ status, headers, json: status === 200 ? worklist : { code: 'unavailable' } }));
    const list = page.locator('.owner-worklist'); await expect(list.getByText(/n’est pas autorisé/)).toBeVisible();
    status = 503; await list.getByRole('button', { name: 'Réessayer les échéances' }).click(); await expect(list.getByText('Les échéances sont indisponibles. Réessayez.', { exact: true })).toBeVisible();
    status = 200; await list.getByRole('button', { name: 'Réessayer les échéances' }).click(); await expect(list.locator('li')).toHaveCount(1);
    await context.setOffline(true); await expect(list.locator('li')).toHaveCount(0); await expect(list.getByRole('button', { name: 'Réessayer les échéances' })).toBeDisabled();
    await context.setOffline(false); status = 401; await list.getByRole('button', { name: 'Réessayer les échéances' }).click(); await expect(page.locator('.intake-workspace')).toHaveCount(0);
  });
});
test('transport rejects foreign owner/clinic, projection extras and wrong single detail', async () => {
  let value: unknown = worklist; const calls: { url: string; init: RequestInit }[] = [];
  const transport = createHttpIntakeTransport({ api: 'https://example.invalid', token: 'synthetic', clinicId: clinic, userId: user, fetcher: (async (url, init) => { calls.push({ url: String(url), init: init! }); return Response.json(value); }) as typeof fetch });
  expect(await transport.ownerWorklist()).toEqual(worklist);
  for (const patch of [{ owner_user_id: otherId }, { clinic_id: otherId }, { contact_email: 'forbidden@example.invalid' }]) { value = { ...worklist, overdue: { items: [{ ...item, ...patch }], truncated: false } }; await expect(transport.ownerWorklist()).rejects.toMatchObject({ kind: 'unavailable' }); }
  for (const patch of [{ id: otherId }, { owner_user_id: otherId }, { clinic_id: otherId }]) { value = { ...detail, ...patch }; await expect(transport.inquiry(oldId)).rejects.toMatchObject({ kind: 'unavailable' }); }
  expect(calls[0]).toMatchObject({ url: 'https://example.invalid/api/v1/inquiries/owner-worklist', init: { cache: 'no-store', credentials: 'omit', method: 'GET' } });
  transport.dispose?.(); await expect(transport.ownerWorklist()).rejects.toMatchObject({ kind: 'expired' });
});
test('demo worklist projects only minimal original fields and does not mutate inquiries', async () => {
  const transport = createDemoIntakeTransport(); const before = await transport.list(); const list = await transport.ownerWorklist();
  expect(list.overdue.items).toHaveLength(1); expect(list.upcoming.items).toHaveLength(1); expect(list.undated.items).toHaveLength(1);
  expect(list.overdue.items[0]).not.toHaveProperty('contact_email'); expect(list.overdue.items[0]).not.toHaveProperty('contact_phone');
  expect(await transport.inquiry(list.overdue.items[0]!.id)).toEqual(before.items.find(item => item.id === list.overdue.items[0]!.id)); expect(await transport.list()).toEqual(before);
});
