import { expect, test, type Page } from '@playwright/test';
import { selectWorkspace, workspaceChoices, workspaceVerification } from './helpers/workspace-selection';

const clinicBase = process.env.CLINIC_OS_LOCAL_URL ?? 'http://localhost:4204';
const api = process.env.DENTAL_API_LOCAL_URL ?? 'http://127.0.0.1:4300';
const email = process.env.LOCAL_BOOKING_CONFIRM_E2E_EMAIL;
const password = process.env.LOCAL_BOOKING_CONFIRM_E2E_PASSWORD;
const salmaRequestId = process.env.LOCAL_BOOKING_CONFIRM_SALMA_REQUEST_ID;
const youssefRequestId = process.env.LOCAL_BOOKING_CONFIRM_YOUSSEF_REQUEST_ID;

for (const recovery of ['replay', 'refresh', 'invalid-receipt', 'pending-refresh', 'cancelled-after-confirmation'] as const) {
  test(`mock transport: uncertain confirmation recovers by ${recovery}`, async ({ page }) => {
    const clinic = '10000000-0000-4000-8000-000000000001';
    const id = '75000000-0000-4000-8000-000000000001';
    const timestamp = '2026-11-03T08:30:00Z';
    const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Content-Type': 'application/json' };
    const appointment = {
      id: '75000000-0000-4000-8000-000000000002', starts_at: timestamp, ends_at: '2026-11-03T09:15:00Z',
      duration_minutes: 45, confirmed_at: timestamp,
      provider_resource_id: '73000000-0000-4000-8000-000000000001', chair_resource_id: '73000000-0000-4000-8000-000000000003',
    };
    const commands: Array<{ key: string | undefined; body: string | null }> = [];
    let committed = false;
    await page.route('**/auth/v1/**', route => route.fulfill({ status: 200, headers, json: {
      access_token: 'synthetic-token', token_type: 'bearer', refresh_token: 'synthetic-refresh', expires_in: 3600,
      user: { id: clinic, aud: 'authenticated', role: 'authenticated', email: 'staff@example.invalid', app_metadata: {}, user_metadata: {}, created_at: timestamp },
    } }));
    await page.route('**/api/v1/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      if (path.endsWith('/me/workspaces')) return route.fulfill({ headers, json: workspaceChoices(clinic) });
      if (path.endsWith('/me/workspace')) return route.fulfill({ headers, json: workspaceVerification(clinic, clinic) });
      if (path.endsWith('/demo-status')) return route.fulfill({ headers, json: { enabled: true, confirmation_enabled: true } });
      if (path.endsWith('/confirm-demo')) {
        commands.push({ key: route.request().headers()['idempotency-key'], body: route.request().postData() });
        committed = true;
        if (commands.length === 1 && recovery !== 'invalid-receipt') return route.abort('failed');
        const { id: appointmentId, ...details } = appointment;
        return route.fulfill({ headers, json: { ...details, status: 'confirmed', appointment_id: appointmentId,
          booking_request_id: commands.length === 1 ? '75000000-0000-4000-8000-000000000099' : id, scenario_id: 'salma', replayed: true } });
      }
      if (path.endsWith('/booking-requests')) return route.fulfill({ headers, json: { items: [{
        id, scenario_id: 'salma', requested_date: '2026-11-03', requested_time: '09:30', created_at: timestamp,
        status: committed && (recovery !== 'pending-refresh'||commands.length>1) ? recovery==='cancelled-after-confirmation'?'cancelled':'confirmed' : 'request_received', appointment: committed && (recovery !== 'pending-refresh'||commands.length>1) ? appointment : null,
      }] } });
      return route.fulfill({ status: 404, headers, json: {} });
    });
    await page.goto(`${clinicBase}/connection`);
    await page.getByLabel('Adresse e-mail', { exact: true }).fill('staff@example.invalid');
    await page.getByLabel('Mot de passe', { exact: true }).fill('synthetic-password');
    await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
    await selectWorkspace(page);
    await page.getByRole('button', { name: 'Revoir les demandes de rendez-vous fictives' }).click();
    await page.getByText('Anciennes demandes de démonstration',{exact:true}).click();
    await page.getByRole('button', { name: 'Confirmer le rendez-vous fictif pour Salma Alaoui' }).click();
    await expect(page.getByText('Résultat à vérifier', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Ressources de démonstration')).toHaveCount(0);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (recovery === 'pending-refresh') {
      await page.getByRole('button', { name: 'Actualiser', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Actualiser', exact: true })).toBeEnabled();
      await expect(page.getByText('Résultat à vérifier', { exact: true })).toBeVisible();
      await expect(page.getByLabel('Ressources de démonstration')).toHaveCount(0);
      expect(commands).toHaveLength(1);
    }
    await page.getByRole('button', { name: recovery === 'refresh' ? 'Actualiser' : 'Reprendre la même confirmation', exact: true }).click();
    await expect(page.getByText(recovery==='cancelled-after-confirmation'?'Rendez-vous annulé':'Rendez-vous fictif confirmé · 45 min',{exact:true})).toBeVisible();
    await expect(page.getByText('Confirmation en attente de vérification', { exact: true })).toHaveCount(0);
    expect(commands).toHaveLength(recovery === 'refresh' ? 1 : 2);
    expect(commands[0]!.key).toBeTruthy();
    if (recovery !== 'refresh') expect(commands[1]).toEqual(commands[0]);
  });
}

async function signIn(page: Page) {
  let token: Promise<string> | null = null;
  page.on('response', response => {
    if (new URL(response.url()).pathname.endsWith('/auth/v1/token')) token ??= response.json().then(value => value.access_token as string);
  });
  await page.goto(`${clinicBase}/connection`);
  await page.getByLabel('Adresse e-mail', { exact: true }).fill(email!);
  await page.getByLabel('Mot de passe', { exact: true }).fill(password!);
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  await expect(page.getByText(/Cabinet actif :.*Cabinet Dentaire Atlas/)).toBeVisible();
  const accessToken = await token;
  if (!accessToken) throw new Error('Local Auth returned no access token.');
  return accessToken;
}

test('Reception confirms a synthetic request once and a colliding sample appointment is rejected', async ({ page }) => {
  test.setTimeout(60000);
  test.skip(!email || !password || !salmaRequestId || !youssefRequestId, 'Use the local demo booking-confirmation runner.');

  const token = await signIn(page);
  await page.getByRole('button', { name: 'Revoir les demandes de rendez-vous fictives' }).click();
  await page.getByText('Anciennes demandes de démonstration',{exact:true}).click();
  await expect(page.getByText(/Règles de démo uniquement : visite de 45 min/)).toBeVisible();
  const salmaRow = page.locator(`.booking-request-inbox li[data-request-id="${salmaRequestId}"]`);
  await expect(salmaRow.getByText('Demande reçue · non confirmée')).toBeVisible();
  const salmaResources = salmaRow.getByLabel('Ressources de démonstration');
  const youssefRow = page.locator(`.booking-request-inbox li[data-request-id="${youssefRequestId}"]`);
  const youssefResources = youssefRow.getByLabel('Ressources de démonstration');
  await expect(salmaResources).toHaveValue('a');
  await expect(youssefResources).toHaveValue('a');
  await youssefResources.selectOption('b');
  await expect(youssefResources).toHaveValue('b');
  await expect(salmaResources).toHaveValue('a');
  await youssefResources.selectOption('a');
  const commands: Array<{ key: string | undefined; body: string | null }> = [];
  const receipts: Array<{ appointment_id: string; replayed: boolean }> = [];
  await page.route(`**/api/v1/booking-requests/${salmaRequestId}/confirm-demo`, async route => {
    commands.push({ key: route.request().headers()['idempotency-key'], body: route.request().postData() });
    const response = await route.fetch();
    expect(response.ok()).toBeTruthy();
    receipts.push(await response.json());
    // Commit in the real local database, but lose the first response on its way to the browser.
    if (commands.length === 1) await route.abort('failed');
    else await route.fulfill({ response });
  });
  await salmaRow.getByRole('button', { name: 'Confirmer le rendez-vous fictif' }).click();
  await expect(salmaRow.getByText('Résultat à vérifier', { exact: true })).toBeVisible();
  await expect(youssefResources).toHaveCount(0);
  await page.getByRole('button', { name: 'Reprendre la même confirmation', exact: true }).click();
  await expect(salmaRow.getByText('Rendez-vous fictif confirmé · 45 min')).toBeVisible();
  expect(commands).toHaveLength(2);
  expect(commands[0]!.key).toBeTruthy();
  expect(commands[1]).toEqual(commands[0]);
  expect(receipts[0]!.replayed).toBe(false);
  expect(receipts[1]).toMatchObject({ appointment_id: receipts[0]!.appointment_id, replayed: true });

  await youssefRow.getByRole('button', { name: 'Confirmer le rendez-vous fictif' }).click();
  await expect(page.locator('.booking-request-inbox-error[role="alert"]')).toContainText('Cette ressource démo est déjà occupée');
  await expect(youssefRow.getByText('Demande reçue · non confirmée')).toBeVisible();

  const request = await page.request.get(`${api}/api/v1/booking-requests`, {
    headers: { Authorization: `Bearer ${token}`, 'X-Clinic-Id': '10000000-0000-4000-8000-000000000001' },
  });
  expect(request.ok()).toBeTruthy();
  const body = await request.json() as { items: Array<{ id: string; status: string; appointment: unknown }> };
  expect(body.items.find(item => item.id === salmaRequestId)).toMatchObject({ status: 'confirmed' });
  expect(body.items.find(item => item.id === youssefRequestId)).toMatchObject({ status: 'request_received', appointment: null });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
