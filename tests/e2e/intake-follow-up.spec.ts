import { expect, test, type Page, type Route } from '@playwright/test';
import { createDemoIntakeTransport, createHttpIntakeTransport } from '../../apps/clinic-os/components/intake/transport';
const base = process.env.FOLLOW_UP_UI_URL ?? 'http://localhost:4200';
const clinic = '10000000-0000-4000-8000-000000000001';
const user = '10000000-0000-4000-8000-000000000002';
const inquiryId = '10000000-0000-4000-8000-000000000011';
const otherId = '10000000-0000-4000-8000-000000000012';
const recordId = '10000000-0000-4000-8000-000000000021';
const inquiry = { id: inquiryId, clinic_id: clinic, owner_user_id: user, display_name: 'Lina Exemple', contact_phone: null, contact_email: null, source: 'phone', follow_up_at: null, status: 'new', created_at: '2026-10-26T09:30:00Z' };
const record = { id: recordId, clinic_id: clinic, inquiry_id: inquiryId, actor_user_id: user, kind: 'contact_attempt', channel: 'phone', recorded_at: '2026-10-26T10:00:00Z', event_version: 1 };
const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Cache-Control': 'no-store' };
async function verified(page: Page, handler: (route: Route) => Promise<void>) {
  await page.route('https://follow-up-auth.example.invalid/**', async route => {
    if (route.request().method() === 'OPTIONS' || route.request().url().includes('/logout')) return route.fulfill({ status: 204, headers });
    return route.fulfill({ status: 200, headers, json: { access_token: 'synthetic-token', token_type: 'bearer', refresh_token: 'synthetic-refresh', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: user, aud: 'authenticated', role: 'authenticated', email: 'staff@example.invalid', app_metadata: {}, user_metadata: {}, created_at: '2026-10-26T09:00:00Z' } } });
  });
  await page.route('**/api/v1/**', async route => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (route.request().url().endsWith('/me/workspace')) return route.fulfill({ status: 200, headers, json: { user_id: user, clinic_id: clinic, roles: ['reception'], mode: 'connected' } });
    if (route.request().url().endsWith('/inquiries')) return route.fulfill({ status: 200, headers, json: { items: [inquiry, { ...inquiry, id: otherId, display_name: 'Adam Exemple' }], truncated: false } });
    return handler(route);
  });
  await page.goto(`${base}/connection`);
  await page.getByLabel('Adresse e-mail', { exact: true }).fill('staff@example.invalid');
  await page.getByLabel('Mot de passe', { exact: true }).fill('synthetic-password');
  await page.getByLabel('Identifiant du cabinet de développement').fill(clinic);
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  await page.getByRole('button', { name: 'Ouvrir les demandes du cabinet' }).click();
  await expect(page.getByRole('heading', { name: 'Lina Exemple', exact: true })).toBeVisible();
}
async function choose(page: Page) {
  await page.getByRole('button', { name: 'Consigner un suivi', exact: true }).click();
  await expect(page.getByLabel('Action constatée')).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Enregistrer le suivi', exact: true })).toBeDisabled();
  await page.getByLabel('Action constatée').selectOption('contact_attempt');
  await page.getByLabel('Canal observé').selectOption('phone');
}
test('demo follow-up is explicit, append-only, bounded to its inquiry and memory-only', async ({ page }) => {
  await page.goto(`${base}/intake`); await expect(page.getByText('Aucun suivi consigné.', { exact: true })).toBeVisible();
  await choose(page);
  await expect(page.getByRole('dialog')).toContainText('Aucun message ne sera envoyé');
  await page.getByRole('button', { name: 'Enregistrer le suivi', exact: true }).click();
  await expect(page.locator('.follow-up-history li')).toHaveCount(1);
  await expect(page.locator('.follow-up-history')).toContainText('Tentative de contact');
  await expect(page.getByRole('complementary', { name: 'Demande sélectionnée' })).toContainText('Nouvelle demande');
  await expect(page.getByRole('complementary', { name: 'Demande sélectionnée' })).toContainText('Non planifié');
  await page.getByRole('button', { name: /Adam Exemple/ }).click(); await expect(page.locator('.follow-up-history li')).toHaveCount(0);
  await page.getByRole('button', { name: /Lina Exemple/ }).click(); await expect(page.locator('.follow-up-history li')).toHaveCount(1);
  await page.reload(); await expect(page.getByText('Aucun suivi consigné.', { exact: true })).toBeVisible();
});
test('pearl/navy mobile dialog reflows with keyboard focus and reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.goto(`${base}/intake`);
  await choose(page);
  for (const width of [1536, 1280, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/follow-up-pearl-${width}.png`, fullPage: false });
  }
  expect((await page.getByLabel('Action constatée').boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await page.getByLabel('Action constatée').focus(); expect(await page.getByLabel('Action constatée').evaluate(element => getComputedStyle(element).boxShadow)).not.toBe('none');
  await page.getByRole('button', { name: 'Fermer', exact: true }).last().click();
  await page.getByRole('button', { name: 'Activer le thème sombre' }).click();
  await page.getByRole('button', { name: 'Consigner un suivi', exact: true }).click();
  await page.screenshot({ path: 'test-results/follow-up-navy-390.png', fullPage: false });
});
test.describe('verified follow-up', () => {
  test.skip(process.env.FOLLOW_UP_CONFIGURED !== '1', 'Requires isolated synthetic authentication build.');
  test('unknown write survives changing inquiry and reopening tool; replays same target/key/body and reconciles history', async ({ page }) => {
    const posts: { url: string; key: string | undefined; body: unknown }[] = []; let reconciled = 0;
    await verified(page, async route => {
      if (route.request().method() === 'POST') {
        posts.push({ url: route.request().url(), key: route.request().headers()['idempotency-key'], body: route.request().postDataJSON() });
        if (posts.length === 1) return route.abort();
        return route.fulfill({ status: 200, headers, json: { item: record, replayed: true } });
      }
      if (posts.length > 1 && route.request().url().includes(inquiryId)) reconciled++;
      return route.fulfill({ status: 200, headers, json: { items: posts.length > 1 && route.request().url().includes(inquiryId) ? [record] : [], truncated: false } });
    });
    await choose(page); await page.getByRole('button', { name: 'Enregistrer le suivi', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Résultat à vérifier');
    await expect(page.getByLabel('Action constatée')).toBeDisabled();
    await page.getByRole('button', { name: 'Fermer', exact: true }).last().click();
    await page.getByRole('button', { name: /Adam Exemple/ }).click();
    await page.getByRole('button', { name: 'Reprendre le suivi à vérifier' }).click();
    await expect(page.locator('.follow-up-target')).toContainText('Lina Exemple');
    await page.getByRole('button', { name: 'Fermer', exact: true }).last().click();
    await page.getByRole('button', { name: 'Masquer les demandes' }).click();
    await page.getByRole('button', { name: 'Ouvrir les demandes du cabinet' }).click();
    await page.getByRole('button', { name: 'Reprendre le suivi à vérifier' }).click();
    await page.getByRole('button', { name: 'Vérifier le résultat', exact: true }).click();
    await expect(page.locator('.follow-up-success')).toContainText('Suivi retrouvé, sans doublon');
    expect(posts).toHaveLength(2); expect(posts[0]).toEqual(posts[1]); expect(reconciled).toBeGreaterThan(0);
    await expect(page.locator('.follow-up-history li')).toHaveCount(1);
    expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toMatch(/synthetic-token|contact_attempt|Lina/);
    await page.getByRole('button', { name: 'Se déconnecter', exact: true }).first().click(); await expect(page.locator('.follow-up')).toHaveCount(0);
  });
  test('a validated write with failed history reconciliation retains its exact receipt attempt', async ({ page }) => {
    let posts = 0; const keys: string[] = [];
    await verified(page, async route => {
      if (route.request().method() === 'POST') {
        posts++; keys.push(route.request().headers()['idempotency-key']!);
        return route.fulfill({ status: 200, headers, json: { item: record, replayed: posts > 1 } });
      }
      if (posts === 1) return route.fulfill({ status: 503, headers, json: { code: 'provider_unavailable' } });
      return route.fulfill({ status: 200, headers, json: { items: posts > 1 ? [record] : [], truncated: false } });
    });
    await choose(page); await page.getByRole('button', { name: 'Enregistrer le suivi', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Réponse reçue, historique à vérifier');
    await expect(page.locator('.follow-up-success')).toHaveCount(0);
    await page.getByRole('button', { name: 'Vérifier le résultat' }).click();
    await expect(page.locator('.follow-up-history li')).toHaveCount(1);
    expect(keys).toHaveLength(2); expect(keys[0]).toBe(keys[1]);
  });
  test('history truncation, denied/disabled states, offline and session expiry remain distinct', async ({ page, context }) => {
    let mode = 'partial';
    await verified(page, async route => {
      if (mode === 'expired') return route.fulfill({ status: 401, headers, json: { code: 'unauthenticated' } });
      if (mode === 'denied') return route.fulfill({ status: 403, headers, json: { code: 'forbidden' } });
      if (route.request().method() === 'POST') return route.fulfill({ status: 503, headers, json: { code: 'intake_disabled' } });
      return route.fulfill({ status: 200, headers, json: { items: [record], truncated: true } });
    });
    await expect(page.getByText(/Historique partiel/)).toBeVisible();
    await choose(page); await page.getByRole('button', { name: 'Enregistrer le suivi', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('n’est pas activé');
    await page.getByRole('button', { name: 'Fermer', exact: true }).last().click();
    mode = 'denied'; await page.getByRole('button', { name: /Adam Exemple/ }).click();
    await expect(page.getByText('Ce suivi est réservé au responsable autorisé de la demande.', { exact: true })).toBeVisible();
    await context.setOffline(true); await expect(page.locator('.follow-up-history li')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Réessayer l’historique' })).toBeDisabled(); await context.setOffline(false);
    mode = 'expired'; await page.getByRole('button', { name: 'Réessayer l’historique' }).click();
    await expect(page.locator('.intake-workspace')).toHaveCount(0);
  });
});
test('demo receipt is idempotent, rejects changed payload and never mutates inquiry', async () => {
  const transport = createDemoIntakeTransport(); const before = await transport.list();
  const key = crypto.randomUUID(); const body = { kind: 'contact_attempt' as const, channel: 'phone' as const };
  const first = await transport.recordFollowUp(inquiryId, body, key);
  expect(await transport.recordFollowUp(inquiryId, body, key)).toEqual({ ...first, replayed: true });
  await expect(transport.recordFollowUp(inquiryId, { ...body, channel: 'email' }, key)).rejects.toMatchObject({ kind: 'conflict' });
  expect(await transport.list()).toEqual(before); expect((await transport.followUps(inquiryId)).items).toHaveLength(1);
  transport.dispose?.(); await expect(transport.followUps(inquiryId)).rejects.toMatchObject({ kind: 'expired' });
});
test('HTTP transport validates tenant/inquiry/actor/body and sends no-store with header key', async () => {
  let value: unknown = { items: [{ ...record, clinic_id: otherId }], truncated: false }; const calls: { url: string; init: RequestInit }[] = [];
  const transport = createHttpIntakeTransport({ api: 'https://example.invalid', token: 'synthetic-token', clinicId: clinic, userId: user, fetcher: (async (url, init) => { calls.push({ url: String(url), init: init! }); return Response.json(value); }) as typeof fetch });
  await expect(transport.followUps(inquiryId)).rejects.toMatchObject({ kind: 'unavailable' });
  for (const patch of [{ inquiry_id: otherId }, { actor_user_id: otherId }, { channel: 'email' }, { contact_phone: 'forbidden' }]) {
    value = { item: { ...record, ...patch }, replayed: false };
    await expect(transport.recordFollowUp(inquiryId, { kind: 'contact_attempt', channel: 'phone' }, crypto.randomUUID())).rejects.toMatchObject({ kind: 'unavailable' });
  }
  expect(calls[1]!.url).toBe(`https://example.invalid/api/v1/inquiries/${inquiryId}/follow-ups`);
  expect(calls[1]!.init).toMatchObject({ cache: 'no-store', credentials: 'omit', body: JSON.stringify({ kind: 'contact_attempt', channel: 'phone' }) });
  expect(new Headers(calls[1]!.init.headers).get('Idempotency-Key')).toBeTruthy();
  transport.dispose?.(); await expect(transport.followUps(inquiryId)).rejects.toMatchObject({ kind: 'expired' });
});

test('late HTTP response after session disposal cannot restore history or pending attempt', async () => {
  let resolve!: (response: Response) => void;
  const transport = createHttpIntakeTransport({ api: 'https://example.invalid', token: 'synthetic-token', clinicId: clinic, userId: user, fetcher: (() => new Promise<Response>(done => { resolve = done; })) as typeof fetch });
  const pending = transport.followUps(inquiryId);
  transport.pendingFollowUp.current = { inquiry: { ...inquiry, source: 'phone', status: 'new' }, body: { kind: 'contact_attempt', channel: 'phone' }, key: crypto.randomUUID() };
  transport.dispose?.(); resolve(Response.json({ items: [record], truncated: false }));
  await expect(pending).rejects.toMatchObject({ kind: 'expired' }); expect(transport.pendingFollowUp.current).toBeNull();
});
