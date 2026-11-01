import { expect, test, type Page } from '@playwright/test';

const publicBase = process.env.PUBLIC_BOOKING_LOCAL_URL ?? 'http://localhost:4202';
const clinicBase = process.env.CLINIC_OS_LOCAL_URL ?? 'http://localhost:4204';
const api = process.env.DENTAL_API_LOCAL_URL ?? 'http://127.0.0.1:4300';
const password = process.env.LOCAL_DEMO_PASSWORD;
const atlasId = '10000000-0000-4000-8000-000000000001';
const saleId = '10000000-0000-4000-8000-000000000002';

async function signIn(page: Page, email: string) {
  await page.goto(`${clinicBase}/connection`);
  await page.getByLabel('Adresse e-mail', { exact: true }).fill(email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(password!);
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
}

test('local public synthetic request persists once and is visible only to same-clinic reception/manager', async ({ page, request }) => {
  test.setTimeout(60000);
  test.skip(!password, 'Run local demo auth setup and pass LOCAL_DEMO_PASSWORD.');

  let receptionistToken: Promise<string> | null = null;
  page.on('response', response => {
    if (new URL(response.url()).pathname.endsWith('/auth/v1/token')) {
      receptionistToken ??= response.json().then(payload => payload.access_token as string);
    }
  });

  await page.goto(publicBase);
  await page.getByRole('button', { name: 'Préparer ma première visite' }).click();
  await expect(page.getByRole('heading', { name: 'Demande de rendez-vous fictive' })).toBeVisible();
  await page.getByLabel('Scénario de demande fictive').selectOption('salma');
  const timeControl = page.getByLabel(/Créneau proposé/);
  const requestedTime = await timeControl.locator('option').nth(1).getAttribute('value');
  expect(requestedTime).toBeTruthy();
  await timeControl.selectOption(requestedTime!);
  await page.getByRole('button', { name: 'Prévisualiser la demande fictive' }).click();
  await expect(page.getByText(/Le cabinet ne l’a pas reçue/)).toBeVisible();
  const requestNotBefore = Date.now() - 1000;
  const submit = page.waitForRequest(event => event.url() === `${api}/api/v1/booking-requests/demo` && event.method() === 'POST');
  const response = page.waitForResponse(event => event.url() === `${api}/api/v1/booking-requests/demo` && event.request().method() === 'POST');
  await page.getByRole('button', { name: 'Enregistrer la demande fictive locale' }).click();
  const requestEvent = await submit;
  expect(requestEvent.postDataJSON()).toEqual({ scenario_id: 'salma', requested_date: expect.any(String), requested_time: requestedTime });
  const acknowledgement = await (await response).json();
  expect(acknowledgement).toEqual({ status: 'request_received' });
  await expect(page.locator('.booking-request-saved')).toContainText('aucun rendez-vous n’est confirmé');

  const anonymousRead = await request.get(`${api}/api/v1/booking-requests`, { headers: { 'X-Clinic-Id': atlasId } });
  expect(anonymousRead.status()).toBe(401);

  await signIn(page, 'ghita.bennani@dentalspa.test');
  await expect(page.getByText(/Cabinet actif :.*Cabinet Dentaire Atlas/)).toBeVisible();
  await page.getByRole('button', { name: 'Revoir les demandes de rendez-vous fictives' }).click();
  await page.getByText('Anciennes demandes de démonstration',{exact:true}).click();
  await expect(page.getByRole('heading', { name: 'Demandes de rendez-vous fictives' })).toBeVisible();
  await expect(page.getByText('Salma Alaoui · FICTIF').first()).toBeVisible();
  await expect(page.getByText('À revoir · non confirmé').first()).toBeVisible();
  const verifiedReceptionistToken = await receptionistToken;
  expect(verifiedReceptionistToken).toBeTruthy();
  const ownClinicRead = await request.get(`${api}/api/v1/booking-requests`, {
    headers: { Authorization: `Bearer ${verifiedReceptionistToken!}`, 'X-Clinic-Id': atlasId },
  });
  expect(ownClinicRead.ok(), `Staff read failed (${ownClinicRead.status()}): ${await ownClinicRead.text()}`).toBeTruthy();
  const ownClinicItems = (await ownClinicRead.json()).items as Array<{ scenario_id: string; requested_time: string; status: string; created_at: string }>;
  expect(ownClinicItems.some(item => item.scenario_id === 'salma' && item.requested_time === requestedTime && item.status === 'request_received' && Date.parse(item.created_at) >= requestNotBefore)).toBeTruthy();

  const context = page.context();
  const managerPage = await context.newPage();
  let managerToken: Promise<string> | null = null;
  managerPage.on('response', response => {
    if (new URL(response.url()).pathname.endsWith('/auth/v1/token')) {
      managerToken ??= response.json().then(payload => payload.access_token as string);
    }
  });
  await signIn(managerPage, 'youssef.elidrissi@dentalspa.test');
  await managerPage.getByRole('button', { name: /Cabinet Sourire de Sale/ }).click();
  await expect(managerPage.getByText(/Cabinet actif :.*Cabinet Sourire/)).toBeVisible();
  const verifiedManagerToken = await managerToken;
  expect(verifiedManagerToken).toBeTruthy();
  const foreignRead = await request.get(`${api}/api/v1/booking-requests`, {
    headers: { Authorization: `Bearer ${verifiedManagerToken!}`, 'X-Clinic-Id': saleId },
  });
  expect(foreignRead.ok()).toBeTruthy();
  await expect(foreignRead.json()).resolves.toEqual({ items: [] });
  await managerPage.close();
});
