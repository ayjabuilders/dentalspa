import { expect, test } from '@playwright/test';

const clinicBase = process.env.CLINIC_OS_LOCAL_URL ?? 'http://localhost:4204';
const api = process.env.DENTAL_API_LOCAL_URL ?? 'http://127.0.0.1:4300';
const password = process.env.LOCAL_DEMO_PASSWORD;
const atlasId = '10000000-0000-4000-8000-000000000001';
const saleId = '10000000-0000-4000-8000-000000000002';
const providers = ['74000000-0000-4000-8000-000000000001', '74000000-0000-4000-8000-000000000002'];
const chairs = ['74000000-0000-4000-8000-000000000003', '74000000-0000-4000-8000-000000000004'];

function nextOpenDemoDay() {
  for (let offset = 1; offset <= 7; offset++) {
    const date = new Date(Date.now() + offset * 86400000);
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' }).formatToParts(date);
    const value = (key: string) => parts.find(part => part.type === key)?.value ?? '';
    if (value('weekday') !== 'Sun') return `${value('year')}-${value('month')}-${value('day')}`;
  }
  throw new Error('No synthetic demo day found.');
}

test('connected local Agenda persists temporary holds and enforces tenant access', async ({ page, request }) => {
  test.setTimeout(60000);
  test.skip(!password, 'Set LOCAL_DEMO_PASSWORD from the local synthetic-auth setup.');
  await page.goto(`${clinicBase}/planning`);
  await expect(page).toHaveURL(/\/connection\?view=planning$/);

  let token: Promise<string> | null = null;
  page.on('response', response => {
    if (new URL(response.url()).pathname.endsWith('/auth/v1/token')) token ??= response.json().then(payload => payload.access_token as string);
  });
  await page.getByLabel('Adresse e-mail', { exact: true }).fill('ghita.bennani@dentalspa.test');
  await page.getByLabel('Mot de passe', { exact: true }).fill(password!);
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  await expect(page.locator('.connected-topbar').getByText(/Cabinet Dentaire Atlas/)).toBeVisible();
  await page.getByText('Options temporaires sur les ressources', { exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Votre agenda de ressources' })).toBeVisible();
  await expect(page.getByText(/horaires affichés sont fictifs/i)).toBeVisible();
  await expect(page.locator('.connection-card-compact')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ouvrir les demandes du cabinet' })).toHaveCount(0);

  const auth = await token;
  expect(auth).toBeTruthy();
  const anonymous = await request.get(`${api}/api/v1/scheduling/resources`, { headers: { 'X-Clinic-Id': atlasId } });
  expect(anonymous.status()).toBe(401);
  const foreign = await request.get(`${api}/api/v1/scheduling/resources`, { headers: { Authorization: `Bearer ${auth!}`, 'X-Clinic-Id': saleId } });
  expect(foreign.status()).toBe(403);

  await page.getByRole('button', { name: 'Charger les ressources' }).click();
  await expect(page.getByLabel('Praticien', { exact: true }).locator('option')).toHaveCount(3);
  await page.getByLabel('Praticien', { exact: true }).selectOption(providers[0]!);
  await page.getByLabel('Fauteuil', { exact: true }).selectOption(chairs[0]!);
  await page.getByLabel('Journée à Casablanca').fill(nextOpenDemoDay());
  await page.getByLabel('Début · heure locale').fill('09:00');
  await page.getByLabel('Fin · heure locale').fill('18:00');
  await page.getByRole('button', { name: 'Vérifier les disponibilités' }).click();
  await expect(page.getByText(/Disponible au dernier contrôle · non réservé/)).toBeVisible();
  await expect(page.locator('.schedule-slots li')).toHaveCount(2);
  await page.getByRole('button', { name: 'Proposer' }).first().click();
  await expect(page.getByLabel('Durée souhaitée (minutes)')).toHaveValue('45');

  const created = page.waitForResponse(response => response.url().includes('/api/v1/scheduling/holds') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Poser une option temporaire' }).click();
  const createdResponse = await created;
  expect(createdResponse.status()).toBe(201);
  const receipt = await createdResponse.json() as { item: { id: string; clinic_id: string; status: string; starts_at: string; ends_at: string } };
  expect(receipt.item.clinic_id).toBe(atlasId);
  expect(receipt.item.status).toBe('held');
  expect(Date.parse(receipt.item.ends_at) - Date.parse(receipt.item.starts_at)).toBe(45 * 60000);
  await expect(page.getByRole('heading', { name: 'Option temporaire active' })).toBeVisible();

  const read = await request.get(`${api}/api/v1/scheduling/holds/${receipt.item.id}`, { headers: { Authorization: `Bearer ${auth!}`, 'X-Clinic-Id': atlasId } });
  expect(read.status()).toBe(200);
  expect((await read.json()).item.status).toBe('held');
  const foreignRead = await request.get(`${api}/api/v1/scheduling/holds/${receipt.item.id}`, { headers: { Authorization: `Bearer ${auth!}`, 'X-Clinic-Id': saleId } });
  expect(foreignRead.status()).toBe(403);

  await page.getByRole('button', { name: 'Libérer l’option' }).click();
  await expect(page.getByRole('heading', { name: 'Option libérée' })).toBeVisible();
  const released = await request.get(`${api}/api/v1/scheduling/holds/${receipt.item.id}`, { headers: { Authorization: `Bearer ${auth!}`, 'X-Clinic-Id': atlasId } });
  expect(released.status()).toBe(200);
  expect((await released.json()).item.status).toBe('released');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(await page.locator('.schedule-layout').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(1);
});
