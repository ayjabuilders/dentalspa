import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const base = process.env.CLINIC_OS_LOCAL_URL ?? 'http://localhost:4204';
const api = process.env.DENTAL_API_LOCAL_URL ?? 'http://127.0.0.1:4300';
const password = process.env.LOCAL_DEMO_PASSWORD;
const manager = 'youssef.elidrissi@dentalspa.test';
const receptionist = 'ghita.bennani@dentalspa.test';
const atlasId = '10000000-0000-4000-8000-000000000001';
const saleId = '10000000-0000-4000-8000-000000000002';

async function signIn(page: Page, email: string) {
  await page.goto(`${base}/connection`);
  await page.getByLabel('Adresse e-mail', { exact: true }).fill(email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(password!);
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
}

async function openIntake(page: Page) {
  await page.getByRole('button', { name: 'Ouvrir les demandes du cabinet' }).click();
  await expect(page.getByRole('heading', { name: 'Vos nouvelles demandes' })).toBeVisible();
  await expect(page.getByText('Cabinet vérifié · accès connecté')).toBeVisible();
}

async function apiGet(request: APIRequestContext, token: string, clinicId: string, path: string) {
  return request.get(`${api}/api/v1${path}`, {
    headers: { Authorization: `Bearer ${token}`, 'X-Clinic-Id': clinicId },
  });
}

test('local connected intake persists administrative work, enforces tenant scope, and keeps gated outcomes disabled', async ({ page, request }) => {
  test.skip(!password, 'Run scripts/local-demo-auth.mjs and pass its one-run password as LOCAL_DEMO_PASSWORD.');

  let token = '';
  let receptionistToken = '';
  let captureReceptionistToken = false;
  page.on('request', requestEvent => {
    if (requestEvent.url().startsWith(`${api}/api/v1/`)) {
      const observed = requestEvent.headers()['authorization']?.replace(/^Bearer\s+/i, '') ?? '';
      if (observed && !token) token = observed;
      else if (observed && captureReceptionistToken) receptionistToken = observed;
    }
  });

  await signIn(page, manager);
  await expect(page.getByRole('heading', { name: 'Choisissez un cabinet' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Cabinet Dentaire Atlas - Casablanca/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Cabinet Sourire de Sale/ })).toBeVisible();
  await page.getByRole('button', { name: /Cabinet Dentaire Atlas - Casablanca/ }).click();
  await expect(page.getByText(/Cabinet actif :.*Cabinet Dentaire Atlas/)).toBeVisible();
  await openIntake(page);

  const displayName = `Oumaima Chraibi (FICTIF) ${crypto.randomUUID().slice(0, 8)}`;
  await page.getByRole('button', { name: 'Nouvelle demande' }).click();
  await page.getByLabel(/Nom du contact/).fill(displayName);
  await page.getByLabel('Source du premier contact').selectOption('website');
  const createdResponse = page.waitForResponse(response => response.url() === `${api}/api/v1/inquiries` && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Enregistrer la demande' }).click();
  const created = await (await createdResponse).json() as { item?: { id?: string; clinic_id?: string; owner_user_id?: string } };
  const inquiryId = created.item?.id;
  expect(inquiryId).toMatch(/^[0-9a-f-]{36}$/i);
  expect(created.item?.clinic_id).toBe(atlasId);
  await expect(page.getByRole('heading', { name: displayName })).toBeVisible();
  expect(token).toBeTruthy();

  await page.getByRole('button', { name: 'Renseigner l’action prévue', exact: true }).click();
  await expect(page.getByLabel('Action administrative prévue')).toBeVisible();
  await page.getByLabel('Action administrative prévue').selectOption('review_follow_up');
  await page.getByRole('button', { name: 'Enregistrer l’intention', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Intention enregistrée. État actuel relu : Prévu : Examiner l’historique du suivi');
  await page.getByRole('button', { name: 'Fermer', exact: true }).last().click();
  await page.getByRole('button', { name: /Historique des intentions/ }).click();
  await expect(page.getByRole('region', { name: 'Historique personnel des intentions' })).toContainText('Examiner l’historique du suivi');
  await page.getByRole('button', { name: /Historique des intentions/ }).click();

  await page.getByRole('button', { name: 'Replanifier le suivi', exact: true }).click();
  await expect(page.getByLabel('Nouvelle échéance locale')).toBeVisible();
  await page.getByLabel('Sans date', { exact: true }).uncheck();
  await page.getByLabel('Nouvelle échéance locale').fill('2030-11-12T10:30');
  await page.getByRole('button', { name: 'Enregistrer l’échéance', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Replanification enregistrée');
  await page.getByRole('button', { name: 'Fermer', exact: true }).last().click();
  await page.getByRole('button', { name: /Historique des échéances/ }).click();
  await expect(page.getByRole('region', { name: 'Historique des échéances de la demande' })).toContainText('Échéance modifiée');

  const outcomes = await apiGet(request, token, atlasId, `/inquiries/${inquiryId}/contact-outcomes`);
  expect(outcomes.status()).toBe(503);
  await expect(outcomes.json()).resolves.toMatchObject({ code: 'contact_outcomes_disabled' });

  const rosterResponse = await apiGet(request, token, atlasId, '/team/roster');
  expect(rosterResponse.ok()).toBeTruthy();
  const roster = await rosterResponse.json() as { members: Array<{ user_id: string; display_name: string }> };
  const ghita = roster.members.find(member => member.display_name === 'Ghita Bennani');
  expect(ghita).toBeTruthy();

  await page.getByLabel('Transférer à un membre actif').selectOption({ label: 'Ghita Bennani · accueil' });
  await page.getByRole('button', { name: 'Confirmer le responsable', exact: true }).click();
  await expect(page.locator('.inquiry-owner-message.positive')).toContainText('Le cabinet a confirmé le nouveau responsable');

  const foreignClinicRead = await apiGet(request, token, saleId, `/inquiries/${inquiryId}`);
  expect(foreignClinicRead.status()).toBe(404);

  captureReceptionistToken = true;
  await signIn(page, receptionist);
  await expect(page.getByText(/Cabinet actif :.*Cabinet Dentaire Atlas/)).toBeVisible();
  await openIntake(page);
  await expect(page.getByRole('button', { name: displayName, exact: false })).toBeVisible();
  await page.getByRole('button', { name: displayName, exact: false }).click();
  await expect(page.getByRole('complementary', { name: 'Demande sélectionnée' })).toContainText('ResponsableVous');
  await expect(page.getByRole('complementary', { name: 'Demande sélectionnée' })).toContainText('Examiner l’historique du suivi');
  expect(receptionistToken).toBeTruthy();
  const ownedInquiry = await apiGet(request, receptionistToken, atlasId, `/inquiries/${inquiryId}`);
  expect(ownedInquiry.ok()).toBeTruthy();
  await expect(ownedInquiry.json()).resolves.toMatchObject({ owner_user_id: ghita!.user_id, clinic_id: atlasId, follow_up_at: expect.any(String) });
});
