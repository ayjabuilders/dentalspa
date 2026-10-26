import { expect, test, type Page, type Route } from '@playwright/test';
import { createDemoIntakeTransport, createHttpIntakeTransport } from '../../apps/clinic-os/components/intake/transport';
const base = process.env.SCHEDULE_UI_URL ?? 'http://localhost:4200';
const clinic = '10000000-0000-4000-8000-000000000001'; const user = '10000000-0000-4000-8000-000000000002'; const id = '10000000-0000-4000-8000-000000000011';
const original = { id, clinic_id: clinic, owner_user_id: user, display_name: 'Lina Synthétique', contact_phone: null, contact_email: null, source: 'phone', status: 'new', created_at: '2026-10-26T09:30:00Z', follow_up_at: '2026-11-12T11:12:13.123456+01:00' };
const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Cache-Control': 'no-store' };
async function connected(page: Page, post: (route: Route) => Promise<void>) {
  let current = { ...original }; let detailReads = 0; let worklistReads = 0;
  await page.route('https://schedule-auth.example.invalid/**', route => route.fulfill({ status: 200, headers, json: { access_token: 'synthetic-token', token_type: 'bearer', refresh_token: 'synthetic-refresh', expires_in: 3600, expires_at: Math.floor(Date.now()/1000)+3600, user: { id: user, aud: 'authenticated', role: 'authenticated', email: 'staff@example.invalid', app_metadata: {}, user_metadata: {}, created_at: original.created_at } } }));
  await page.route('**/api/v1/**', async route => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const url = route.request().url();
    if (url.endsWith('/me/workspace')) return route.fulfill({ status: 200, headers, json: { user_id: user, clinic_id: clinic, roles: ['reception'], mode: 'connected' } });
    if (url.endsWith('/follow-up-schedule')) return post(route);
    if (url.endsWith('/owner-worklist')) { worklistReads++; return route.fulfill({ status: 200, headers, json: { observed_at: '2026-10-27T09:00:00Z', overdue: { items: [], truncated: false }, upcoming: { items: [{ ...current, contact_email: undefined, contact_phone: undefined }], truncated: false }, undated: { items: [], truncated: false } } }); }
    if (url.endsWith('/follow-ups')) return route.fulfill({ status: 200, headers, json: { items: [], truncated: false } });
    if (url.endsWith('/'+id)) { detailReads++; return route.fulfill({ status: 200, headers, json: current }); }
    return route.fulfill({ status: 200, headers, json: { items: [current], truncated: false } });
  });
  await page.goto(base+'/connection'); await page.getByLabel('Adresse e-mail', { exact: true }).fill('staff@example.invalid'); await page.getByLabel('Mot de passe', { exact: true }).fill('synthetic-password'); await page.getByLabel('Identifiant du cabinet de développement').fill(clinic); await page.getByRole('button', { name: 'Se connecter', exact: true }).click(); await page.getByRole('button', { name: 'Ouvrir les demandes du cabinet' }).click(); await expect(page.getByRole('button', { name: 'Replanifier le suivi', exact: true })).toBeVisible();
  return { reads: () => ({ detailReads, worklistReads }), set: (value: string) => { current = { ...current, follow_up_at: value }; } };
}
const receipt = (body: { expected_follow_up_at: string | null; follow_up_at: string | null }, changed = true) => ({ receipt: { inquiry_id: id, clinic_id: clinic, owner_user_id: user, previous_follow_up_at: body.expected_follow_up_at, follow_up_at: body.follow_up_at, changed, recorded_at: '2026-10-27T10:00:00Z', event_version: 1 }, replayed: false });
async function open(page: Page) { await page.getByRole('button', { name: 'Replanifier le suivi', exact: true }).click(); await expect(page.getByLabel('Nouvelle échéance locale')).toBeVisible(); }

test('demo no-change, date edit and current list/worklist refresh', async ({ page }) => {
  await page.goto(base+'/intake'); await open(page); await page.getByRole('button', { name: 'Enregistrer l’échéance' }).click(); await expect(page.getByRole('dialog')).toContainText('Aucun changement nécessaire');
  await page.getByLabel('Sans date', { exact: true }).uncheck(); await page.getByLabel('Nouvelle échéance locale').fill('2030-11-12T10:30'); await page.getByRole('button', { name: 'Enregistrer l’échéance' }).click(); await expect(page.getByRole('dialog')).toContainText('Replanification enregistrée'); await page.getByRole('button', { name: 'Fermer', exact: true }).last().click(); await open(page); await expect(page.getByLabel('Nouvelle échéance locale')).toHaveValue('2030-11-12T10:30');
});

test('responsive pearl/navy dialog and keyboard targets', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.goto(base+'/intake');
  for (const theme of ['pearl','navy']) {
    if (theme === 'navy') await page.getByRole('button', { name: 'Activer le thème sombre' }).click(); await open(page);
    for (const width of [1536,1280,768,390]) { await page.setViewportSize({ width, height: 1000 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await page.screenshot({ animations: 'disabled', path: `test-results/inquiry-schedule-${theme}-${width}.png` }); }
    expect((await page.getByRole('button', { name: 'Enregistrer l’échéance' }).boundingBox())!.height).toBeGreaterThanOrEqual(44); await page.getByRole('button', { name: 'Fermer', exact: true }).last().click();
  }
});

test.describe('verified inquiry schedule', () => {
test.skip(process.env.SCHEDULE_CONFIGURED !== '1', 'Requires isolated synthetic authentication build.');

test('fresh exact microseconds CAS; unknown uses same key/body after dialog navigation and rereads', async ({ page }) => {
  const posts: { key: string | undefined; body: { expected_follow_up_at: string; follow_up_at: string } }[] = [];
  const app = await connected(page, async route => { const body = route.request().postDataJSON(); posts.push({ key: route.request().headers()['idempotency-key'], body }); if (posts.length === 1) return route.abort('failed'); app.set(body.follow_up_at); return route.fulfill({ status: 200, headers, json: { ...receipt(body), replayed: true } }); });
  await open(page); expect(app.reads().detailReads).toBe(1); await page.getByLabel('Nouvelle échéance locale').fill('2030-11-12T10:30'); await page.getByRole('button', { name: 'Enregistrer l’échéance' }).click(); await expect(page.getByRole('dialog')).toContainText('Résultat à vérifier'); await page.getByRole('button', { name: 'Fermer', exact: true }).last().click(); await page.getByRole('tab', { name: /À venir/ }).click(); await page.getByRole('button', { name: 'Vérifier la replanification' }).click(); await page.getByRole('button', { name: 'Vérifier le résultat exact' }).click();
  await expect(page.getByRole('dialog')).toContainText('Replanification enregistrée'); expect(posts[0]).toEqual(posts[1]); expect(posts[0]!.body.expected_follow_up_at).toBe(original.follow_up_at); expect(app.reads().detailReads).toBe(2); expect(app.reads().worklistReads).toBeGreaterThanOrEqual(2);
});

test('409 requires fresh detail and a new decision, never optimistic success', async ({ page }) => {
  const app = await connected(page, route => route.fulfill({ status: 409, headers, json: {} })); await open(page); await page.getByLabel('Sans date', { exact: true }).check(); await page.getByRole('button', { name: 'Enregistrer l’échéance' }).click(); await expect(page.getByRole('dialog')).toContainText('La date a changé'); await expect(page.getByRole('button', { name: 'Enregistrer l’échéance' })).toHaveCount(0); await page.getByRole('button', { name: 'Relire le détail actuel' }).click(); await expect(page.getByLabel('Nouvelle échéance locale')).toBeVisible(); expect(app.reads().detailReads).toBe(2);
});

test('denied write clears surrounding private detail and draft', async ({ page }) => {
  await connected(page, route => route.fulfill({ status: 403, headers, json: {} })); await open(page); await page.getByLabel('Sans date', { exact: true }).check(); await page.getByRole('button', { name: 'Enregistrer l’échéance' }).click(); await expect(page.getByRole('dialog')).toHaveCount(0); await expect(page.getByText('Lina Synthétique', { exact: true })).toHaveCount(0); await expect(page.getByRole('button', { name: 'Vérifier la replanification' })).toHaveCount(0);
});

test('offline clears uncertain command and private inquiry views without background replay', async ({ page, context }) => {
  let posts = 0; await connected(page, route => { posts++; return route.abort('failed'); }); await open(page); await page.getByLabel('Sans date', { exact: true }).check(); await page.getByRole('button', { name: 'Enregistrer l’échéance' }).click(); await expect(page.getByRole('dialog')).toContainText('Résultat à vérifier'); await context.setOffline(true); await expect(page.getByRole('dialog')).toHaveCount(0); await expect(page.getByText('Lina Synthétique', { exact: true })).toHaveCount(0); await context.setOffline(false); expect(posts).toBe(1); await expect(page.getByRole('button', { name: 'Vérifier la replanification' })).toHaveCount(0);
});

test('expired schedule clears session and disabled command never claims success', async ({ page }) => {
  let status = 503;
  await connected(page, route => route.fulfill({ status, headers, json: status === 503 ? { code: 'intake_disabled' } : {} }));
  await open(page); await page.getByRole('button', { name: 'Enregistrer l’échéance' }).click(); await expect(page.getByRole('dialog')).toContainText('désactivée'); await expect(page.getByRole('button', { name: 'Vérifier le résultat exact' })).toHaveCount(0);
  status = 401; await page.getByRole('button', { name: 'Enregistrer l’échéance' }).click(); await expect(page.getByRole('dialog')).toHaveCount(0); await expect(page.getByRole('button', { name: 'Se connecter', exact: true })).toBeVisible(); await expect(page.getByText('Lina Synthétique', { exact: true })).toHaveCount(0);
});
});

test('strict schedule receipt scope/echo/changed checks and disposal clear pending command', async () => {
  const body = { expected_follow_up_at: original.follow_up_at, follow_up_at: null }; let value: unknown = receipt(body); let init: RequestInit | undefined;
  const transport = createHttpIntakeTransport({ api: 'https://api.example.invalid', token: 'synthetic', clinicId: clinic, userId: user, fetcher: (async (_url, options) => { init = options; return Response.json(value); }) as typeof fetch });
  expect((await transport.setSchedule(id, body, crypto.randomUUID())).receipt.changed).toBe(true); expect(init).toMatchObject({ cache: 'no-store', credentials: 'omit', method: 'POST' });
  for (const extra of [{ clinic_id: user }, { owner_user_id: clinic }, { inquiry_id: user }, { changed: false }, { previous_follow_up_at: null }, { contact_email: 'forbidden@example.invalid' }]) { value = { ...receipt(body), receipt: { ...receipt(body).receipt, ...extra } }; await expect(transport.setSchedule(id,body,crypto.randomUUID())).rejects.toMatchObject({ kind: 'unavailable' }); }
  transport.pendingSchedule.current = { id, body, key: crypto.randomUUID() }; transport.dispose!(); expect(transport.pendingSchedule.current).toBeNull(); await expect(transport.setSchedule(id,body,crypto.randomUUID())).rejects.toMatchObject({ kind: 'expired' });
});

test('demo CAS retains immutable replay and rejects stale value without inquiry mutation', async () => {
  const demo = createDemoIntakeTransport(); const before = await demo.inquiry(id); const body = { expected_follow_up_at: before.follow_up_at, follow_up_at: '2030-11-12T10:30:00Z' }; const key = crypto.randomUUID();
  const first = await demo.setSchedule(id,body,key); expect(first.receipt.changed).toBe(true); expect((await demo.setSchedule(id,body,key)).replayed).toBe(true); await expect(demo.setSchedule(id,body,crypto.randomUUID())).rejects.toMatchObject({ kind: 'conflict' }); expect(await demo.inquiry(id)).toEqual({ ...before, follow_up_at: body.follow_up_at });
});

test('legacy denied history keeps its retry boundary unless a schedule lifecycle is active', async () => {
  let cleared = 0;
  const transport = createHttpIntakeTransport({ api: 'https://api.example.invalid', token: 'synthetic', clinicId: clinic, userId: user, fetcher: async () => Response.json({}, { status: 403 }) });
  transport.onPrivateClear(() => { cleared++; });
  await expect(transport.followUps(id)).rejects.toMatchObject({ kind: 'denied' }); expect(cleared).toBe(0);
  transport.scheduleActive.current = true;
  await expect(transport.followUps(id)).rejects.toMatchObject({ kind: 'denied' }); expect(cleared).toBe(1); expect(transport.scheduleActive.current).toBe(false);
});
