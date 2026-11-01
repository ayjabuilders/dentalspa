import { createHmac, randomInt, randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';

const clinicBase = process.env.CLINIC_OS_LOCAL_URL ?? 'http://localhost:4204';
const api = process.env.DENTAL_API_LOCAL_URL ?? 'http://127.0.0.1:4300';
const password = process.env.LOCAL_DEMO_PASSWORD;
const secret = process.env.DEMO_FAKE_INBOX_HMAC_SECRET;
const atlasId = '10000000-0000-4000-8000-000000000001';
const saleId = '10000000-0000-4000-8000-000000000002';
const allowedText = 'Bonjour, le cabinet est-il ouvert samedi ?';

async function signIn(page: Page, email: string) {
  await page.goto(`${clinicBase}/connection?view=inbox`);
  await page.getByLabel('Adresse e-mail', { exact: true }).fill(email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(password!);
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
}

function signedBody(value: unknown, key: string) {
  const raw = Buffer.from(JSON.stringify(value), 'utf8');
  const signature = `sha256=${createHmac('sha256', key).update(raw).digest('hex')}`;
  return { raw, signature };
}

test('local signed synthetic webhook persists across staff inbox with tenant isolation', async ({ page, request }) => {
  test.setTimeout(60000);
  test.skip(!password || !secret, 'Run local demo auth and webhook setup; provide local synthetic test credentials.');

  const suffix = `${randomInt(100, 1000)}-${randomInt(100, 1000)}`;
  const event = {
    provider_event_id: randomUUID(),
    conversation_ref: 'DEMO-CHAT-001',
    sequence: Date.now() % 1_000_000 || 1,
    occurred_at: new Date().toISOString(),
    kind: 'message.inbound',
    message_ref: `DEMO-MSG-${suffix}`,
    text: allowedText,
  };
  const signed = signedBody(event, secret!);
  const unsigned = await request.post(`${api}/api/v1/communications/demo-webhook`, {
    data: signed.raw, headers: { 'Content-Type': 'application/json', 'X-Demo-Signature': 'sha256=' + '0'.repeat(64) },
  });
  expect(unsigned.status(), await unsigned.text()).toBe(401);
  const sensitive = signedBody({ ...event, provider_event_id: randomUUID(), message_ref: `DEMO-MSG-${randomInt(100, 1000)}-${randomInt(100, 1000)}`, text: 'J’ai mal à une dent' }, secret!);
  const sensitiveResponse = await request.post(`${api}/api/v1/communications/demo-webhook`, {
    data: sensitive.raw, headers: { 'Content-Type': 'application/json', 'X-Demo-Signature': sensitive.signature },
  });
  expect(sensitiveResponse.status()).toBe(400);
  const nonLocalOrigin = await request.post(`${api}/api/v1/communications/demo-webhook`, {
    data: signed.raw,
    headers: { 'Content-Type': 'application/json', 'X-Demo-Signature': signed.signature, Origin: 'http://192.168.11.102:4204' },
  });
  expect(nonLocalOrigin.status()).toBe(401);

  const accepted = await request.post(`${api}/api/v1/communications/demo-webhook`, {
    data: signed.raw, headers: { 'Content-Type': 'application/json', 'X-Demo-Signature': signed.signature },
  });
  expect(accepted.status()).toBe(201);
  await expect(accepted.json()).resolves.toEqual({ accepted: true, disposition: 'recorded-inbound' });
  const replay = await request.post(`${api}/api/v1/communications/demo-webhook`, {
    data: signed.raw, headers: { 'Content-Type': 'application/json', 'X-Demo-Signature': signed.signature },
  });
  await expect(replay.json()).resolves.toEqual({ accepted: true, disposition: 'duplicate-event' });

  const anonymous = await request.get(`${api}/api/v1/communications/demo-inbox`, { headers: { 'X-Clinic-Id': atlasId } });
  expect(anonymous.status()).toBe(401);

  await page.goto(`${clinicBase}/inbox`);
  await expect(page.getByRole('heading', { name: 'Boîte de réception' })).toBeVisible();
  const connectedEntry = page.getByRole('link', { name: 'Ouvrir la boîte connectée' });
  await expect(connectedEntry).toHaveAttribute('href', '/connection?view=inbox');
  await connectedEntry.click();
  await expect(page).toHaveURL(/\/connection\?view=inbox$/);

  let receptionistToken: Promise<string> | null = null;
  page.on('response', response => {
    if (new URL(response.url()).pathname.endsWith('/auth/v1/token')) receptionistToken ??= response.json().then(payload => payload.access_token as string);
  });
  await signIn(page, 'ghita.bennani@dentalspa.test');
  await expect(page.getByText(/Cabinet actif :.*Cabinet Dentaire Atlas/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Boîte de réception' })).toBeVisible();
  await expect(page.getByText(allowedText).first()).toBeVisible();
  await expect(page.getByText('Aucun numéro, nom de patient ou dossier n’est associé. Aucun canal réel, envoi, état de livraison ou lecture opérateur n’est activé.')).toBeVisible();
  const search = page.getByRole('textbox', { name: 'Rechercher dans les conversations locales' });
  await search.fill(event.message_ref);
  await expect(page.getByRole('heading', { name: 'Conversation 001' })).toBeVisible();
  await search.fill('aucun-evenement-correspondant');
  await expect(page.getByText('Aucun résultat', { exact: true })).toBeVisible();
  await search.fill('');

  const receptionToken = await receptionistToken;
  expect(receptionToken).toBeTruthy();
  const ownClinicRead = await request.get(`${api}/api/v1/communications/demo-inbox`, {
    headers: { Authorization: `Bearer ${receptionToken!}`, 'X-Clinic-Id': atlasId },
  });
  expect(ownClinicRead.ok()).toBeTruthy();
  const ownItems = (await ownClinicRead.json()).items as Array<{ conversation_ref: string; message_ref: string; text: string }>;
  expect(ownItems.some(item => item.conversation_ref === event.conversation_ref && item.message_ref === event.message_ref && item.text === allowedText)).toBe(true);

  const managerPage = await page.context().newPage();
  let managerToken: Promise<string> | null = null;
  managerPage.on('response', response => {
    if (new URL(response.url()).pathname.endsWith('/auth/v1/token')) managerToken ??= response.json().then(payload => payload.access_token as string);
  });
  await signIn(managerPage, 'youssef.elidrissi@dentalspa.test');
  await managerPage.getByRole('button', { name: /Cabinet Sourire de Sale/ }).click();
  await expect(managerPage.getByText(/Cabinet actif :.*Cabinet Sourire/)).toBeVisible();
  const saleToken = await managerToken;
  expect(saleToken).toBeTruthy();
  const foreignRead = await request.get(`${api}/api/v1/communications/demo-inbox`, {
    headers: { Authorization: `Bearer ${saleToken!}`, 'X-Clinic-Id': saleId },
  });
  expect(foreignRead.ok()).toBeTruthy();
  await expect(foreignRead.json()).resolves.toEqual({ items: [] });
  await managerPage.close();
});
