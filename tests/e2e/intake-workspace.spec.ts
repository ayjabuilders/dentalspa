import { expect, test } from '@playwright/test';
import { createDemoIntakeTransport, createHttpIntakeTransport, inquiryAttempt, IntakeError } from '../../apps/clinic-os/components/intake/transport';
import type { CreateInquiry } from '../../packages/contracts/src/intake';

const base = process.env.INTAKE_UI_URL ?? 'http://localhost:4200';

test('intake demo supports source filtering, validated create and selected details without persistence', async ({ page }) => {
  await page.goto(`${base}/intake`);
  await expect(page.getByRole('heading', { name: 'Vos nouvelles demandes' })).toBeVisible();
  await expect(page.getByText('Aperçu synthétique · mémoire temporaire')).toBeVisible();
  await page.getByLabel('Filtrer par source').selectOption('website');
  await expect(page.locator('.intake-row')).toHaveCount(1);
  await expect(page.getByRole('complementary', { name: 'Demande sélectionnée' })).toContainText('Adam Exemple');
  await page.getByLabel('Rechercher une demande').fill('inconnu');
  await expect(page.getByRole('heading', { name: 'Aucune demande trouvée' })).toBeVisible();
  await page.getByRole('button', { name: 'Réinitialiser les filtres' }).click();
  await page.getByRole('button', { name: 'Nouvelle demande', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Enregistrer la demande' }).click();
  await expect(dialog.getByRole('alert')).toContainText('informations sont à vérifier');
  await dialog.getByLabel('Nom du contact').fill('Salma Exemple Test');
  await dialog.getByLabel('Source du premier contact').selectOption('email');
  await dialog.getByLabel('E-mail', { exact: false }).fill('salma@example.invalid');
  await dialog.getByRole('button', { name: 'Enregistrer la demande' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: 'Demande ajoutée' })).toBeVisible();
  const detail = page.getByRole('complementary', { name: 'Demande sélectionnée' });
  await expect(detail.getByRole('heading', { name: 'Salma Exemple Test' })).toBeVisible();
  await expect(detail).toContainText('salma@example.invalid');
  await expect(detail).toContainText('Aucun message envoyé et aucun rendez-vous confirmé');
  await page.reload();
  await expect(page.locator('.intake-row')).toHaveCount(3);
  await expect(page.getByText('Salma Exemple Test')).toHaveCount(0);
});

test('intake remains contained in both themes and prevents offline submission', async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/intake`);
  await expect(page.locator('.intake-row')).toHaveCount(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Activer le thème sombre' }).click();
  await page.getByRole('button', { name: 'Nouvelle demande', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await context.setOffline(true);
  await expect(page.getByRole('button', { name: 'Enregistrer la demande' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Nouvelle demande', exact: true })).toBeDisabled();
  await context.setOffline(false);
  await expect(page.getByRole('button', { name: 'Nouvelle demande', exact: true })).toBeEnabled();
});

const body: CreateInquiry = { display_name: 'Test synthétique', contact_email: null, contact_phone: null, source: 'phone', follow_up_at: null };
const clinicId = '10000000-0000-4000-8000-000000000001';
const userId = '10000000-0000-4000-8000-000000000002';

test('unchanged retry keeps its key and demo replay cannot create a second record', async () => {
  const demo = createDemoIntakeTransport();
  const initial = inquiryAttempt(null, body);
  const retry = inquiryAttempt(initial, { ...body, display_name: ' Test synthétique ' });
  expect(retry.key).toBe(initial.key);
  const first = await demo.create(body, initial.key);
  const second = await demo.create(body, retry.key);
  expect(second).toEqual({ item: first.item, replayed: true });
  expect((await demo.list()).items).toHaveLength(4);
  await expect(demo.create({ ...body, source: 'email' }, initial.key)).rejects.toMatchObject({ kind: 'conflict' });
  expect(inquiryAttempt(initial, { ...body, source: 'email' }).key).not.toBe(initial.key);
  expect(inquiryAttempt(null, body).key).not.toBe(initial.key);
});

test('HTTP transport waits for verified response, preserves retry key and maps disabled or denied commands', async () => {
  const attempts: RequestInit[] = [];
  let release: ((value: Response) => void) | undefined;
  const fetcher: typeof fetch = async (_url, init) => {
    attempts.push(init!);
    if (attempts.length === 1) return new Promise<Response>(resolve => { release = resolve; });
    return new Response(null, { status: 403 });
  };
  const transport = createHttpIntakeTransport({ api: 'https://example.invalid', token: 'synthetic-token', clinicId, userId, fetcher });
  const key = inquiryAttempt(null, body).key;
  let settled = false;
  const pending = transport.create(body, key).then(() => { settled = true; }, error => { settled = true; return error; });
  await Promise.resolve(); expect(settled).toBe(false);
  release!(Response.json({ code: 'intake_disabled' }, { status: 503 }));
  expect(await pending).toMatchObject({ kind: 'disabled' });
  await expect(transport.create(body, key)).rejects.toMatchObject({ kind: 'denied' });
  expect(attempts.map(attempt => new Headers(attempt.headers).get('Idempotency-Key'))).toEqual([key, key]);
  expect(attempts.every(attempt => attempt.cache === 'no-store' && attempt.credentials === 'omit')).toBe(true);
  transport.dispose?.();
  await expect(transport.list()).rejects.toEqual(new IntakeError('expired'));
  expect(attempts).toHaveLength(2);
});

test('HTTP transport rejects another clinic and malformed success instead of showing saved', async () => {
  const item = { ...body, id: '10000000-0000-4000-8000-000000000003', clinic_id: '20000000-0000-4000-8000-000000000001', owner_user_id: userId, status: 'new', created_at: '2026-10-26T10:00:00Z' };
  const transport = createHttpIntakeTransport({ api: 'https://example.invalid', token: 'synthetic-token', clinicId, userId, fetcher: async (_url, init) => Response.json(init?.method === 'GET' ? { items: [item], truncated: false } : { item, replayed: false }) });
  await expect(transport.list()).rejects.toMatchObject({ kind: 'unavailable' });
  await expect(transport.create(body, crypto.randomUUID())).rejects.toMatchObject({ kind: 'unavailable' });
  const malformed = createHttpIntakeTransport({ api: 'https://example.invalid', token: 'synthetic-token', clinicId, userId, fetcher: async () => Response.json({ saved: true }) });
  await expect(malformed.create(body, crypto.randomUUID())).rejects.toMatchObject({ kind: 'unavailable' });
  const providerDown = createHttpIntakeTransport({ api: 'https://example.invalid', token: 'synthetic-token', clinicId, userId, fetcher: async () => Response.json({ message: 'provider details must not appear in UI' }, { status: 503 }) });
  await expect(providerDown.create(body, crypto.randomUUID())).rejects.toMatchObject({ kind: 'unavailable' });
});
