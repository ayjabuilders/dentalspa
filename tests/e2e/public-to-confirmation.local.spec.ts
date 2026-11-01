import { expect, test, type Page } from '@playwright/test';

const publicBase = process.env.PUBLIC_BOOKING_LOCAL_URL ?? 'http://localhost:4202';
const clinicBase = process.env.CLINIC_OS_LOCAL_URL ?? 'http://localhost:4204';
const api = process.env.DENTAL_API_LOCAL_URL ?? 'http://127.0.0.1:4300';
const email = process.env.LOCAL_BOOKING_CONFIRM_E2E_EMAIL;
const password = process.env.LOCAL_BOOKING_CONFIRM_E2E_PASSWORD;
const requestKey = process.env.LOCAL_PUBLIC_BOOKING_REQUEST_KEY;

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

test('fictional public request stays pending until Reception confirms that same request', async ({ page }) => {
  test.setTimeout(60000);
  test.skip(!email || !password || !requestKey, 'Use the local public-to-confirmation runner.');
  const publicUrl = new URL(publicBase);
  const apiUrl = new URL(api);
  expect(['localhost', '127.0.0.1']).toContain(publicUrl.hostname);
  expect(['localhost', '127.0.0.1']).toContain(apiUrl.hostname);

  await page.route(`${apiUrl.origin}/api/v1/booking-requests/demo`, async route => {
    await route.continue({ headers: { ...route.request().headers(), 'idempotency-key': requestKey! } });
  });
  await page.goto(publicBase);
  await page.getByRole('button', { name: 'Préparer ma première visite' }).click();
  await expect(page.getByRole('heading', { name: 'Demande de rendez-vous fictive' })).toBeVisible();
  const steps = page.getByRole('list', { name: 'Étapes de la demande fictive' });
  await expect(steps.getByRole('listitem').nth(0)).toHaveAttribute('aria-current', 'step');
  await page.getByLabel('Scénario de demande fictive').selectOption('salma');
  const dateControl = page.getByRole('textbox', { name: 'Date souhaitée · préférence' });
  const requestedDate = await dateControl.inputValue();
  const timeControl = page.getByLabel(/Créneau proposé/);
  const requestedTime = await timeControl.locator('option').nth(1).getAttribute('value');
  expect(requestedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(requestedTime).toBeTruthy();
  await timeControl.selectOption(requestedTime!);
  await page.getByRole('button', { name: 'Prévisualiser la demande fictive' }).click();
  await expect(steps.getByRole('listitem').nth(1)).toHaveAttribute('aria-current', 'step');
  await expect(page.getByText(/Le cabinet ne l’a pas reçue/)).toBeVisible();
  const requestNotBefore = Date.now() - 2000;
  const submission = page.waitForResponse(response => response.url() === `${apiUrl.origin}/api/v1/booking-requests/demo` && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Enregistrer la demande fictive locale' }).click();
  const acknowledgement = await (await submission).json();
  expect(acknowledgement).toEqual({ status: 'request_received' });
  await expect(page.locator('.booking-request-saved')).toContainText('aucun rendez-vous n’est confirmé');

  const staffPage = await page.context().newPage();
  const token = await signIn(staffPage);
  const listResponse = staffPage.waitForResponse(response => response.url() === `${apiUrl.origin}/api/v1/booking-requests` && response.request().method() === 'GET');
  await staffPage.getByRole('button', { name: 'Revoir les demandes de rendez-vous fictives' }).click();
  await staffPage.getByText('Anciennes demandes de démonstration',{exact:true}).click();
  await expect(staffPage.getByRole('heading', { name: 'Demandes de rendez-vous fictives' })).toBeVisible();
  const requests = await (await listResponse).json() as { items: Array<{ id: string; scenario_id: string; requested_date: string; requested_time: string; status: string; created_at: string; appointment: unknown }> };
  const submittedRequest = requests.items.find(item => item.scenario_id === 'salma' && item.requested_date === requestedDate && item.requested_time === requestedTime && Date.parse(item.created_at) >= requestNotBefore);
  expect(submittedRequest).toBeTruthy();
  expect(submittedRequest).toMatchObject({ status: 'request_received', appointment: null });
  const row = staffPage.locator(`.booking-request-inbox li[data-request-id="${submittedRequest!.id}"]`);
  await expect(row.getByText('Demande reçue · non confirmée')).toBeVisible();
  await row.getByRole('button', { name: 'Confirmer le rendez-vous fictif' }).click();
  await expect(row.getByText('Rendez-vous fictif confirmé · 45 min')).toBeVisible();

  const finalRead = await staffPage.request.get(`${apiUrl.origin}/api/v1/booking-requests`, {
    headers: { Authorization: `Bearer ${token}`, 'X-Clinic-Id': '10000000-0000-4000-8000-000000000001' },
  });
  expect(finalRead.ok()).toBeTruthy();
  const finalBody = await finalRead.json() as typeof requests;
  expect(finalBody.items.find(item => item.id === submittedRequest!.id)).toMatchObject({ status: 'confirmed', appointment: { duration_minutes: 45 } });
  await staffPage.close();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
