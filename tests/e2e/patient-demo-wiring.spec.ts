import { expect, test, type Page } from '@playwright/test';

const base = process.env.PATIENT_DEMO_UI_URL ?? 'http://localhost:4204';
const patientPass = process.env.PATIENT_PASS_DEMO_URL ?? 'http://localhost:4205';

test('patient detail opens the matching synthetic Patient Pass demo without connecting records', async ({ page, context }) => {
  const apiRequests: string[] = [];
  page.on('request', request => { if (request.url().includes('/api/')) apiRequests.push(request.url()); });
  await page.goto(`${base}/patients?preview=1`);
  await page.getByRole('button', { name: /Yasmine Benjelloun/ }).click();
  await expect(page.getByRole('complementary', { name: 'Patient sélectionné' })).toContainText('Yasmine Benjelloun');
  await expect(page.getByRole('link', { name: 'Dossiers enregistrés', exact: true })).toHaveAttribute('href','/connection?view=patients');

  const popupPromise = context.waitForEvent('page');
  await page.getByRole('link', { name: 'Ouvrir Patient Pass' }).click();
  const popup = await popupPromise;
  await expect(popup).toHaveURL(/demoPatientId=DEMO-005/);
  await expect(popup).toHaveURL(/demoPatientName=Yasmine%20Benjelloun/);
  await expect(popup.locator('.demo-strip')).toContainText('Yasmine Benjelloun');
  await expect(popup.locator('.demo-strip')).toContainText('Démonstration · données fictives');
  await popup.getByRole('button', { name: /^(RDV|Rendez-vous)$/ }).click();
  await expect(popup.getByText(/\d{1,2} \p{L}+ 20\d{2} · 13:30/u)).toBeVisible();
  await expect(popup.getByText(/Scénario d’après-midi · non confirmé/)).toBeVisible();
  await expect(popup.getByText(/aucun dossier médical/i)).toHaveCount(0);
  expect(apiRequests).toEqual([]);
});

test('global patient search opens the selected synthetic profile directly', async ({ page }) => {
  await page.goto(`${base}/`);
  await page.getByRole('button', { name: /Rechercher un patient, un espace/ }).click();
  await page.getByRole('textbox', { name: 'Recherche globale' }).fill('Yasmine Benjelloun');
  await page.getByRole('link', { name: /Yasmine Benjelloun/ }).click();
  await expect(page).toHaveURL(/\/patients\/DEMO-005$/);
  await expect(page.getByRole('heading', { name: 'Yasmine Benjelloun', exact: true })).toBeVisible();
});

test('home separates connected tools from synthetic patient examples', async ({ page }) => {
  await page.goto(`${base}/`);
  await expect(page.getByRole('heading', { name: 'Accès au cabinet' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Voir les demandes/ })).toHaveAttribute('href', '/connection?view=intake');
  await expect(page.getByRole('link', { name: /Ouvrir l’agenda/ })).toHaveAttribute('href', '/connection?view=planning');
  await expect(page.getByRole('link', { name: /Ouvrir les patients/ })).toHaveAttribute('href', '/connection?view=patients');
  await expect(page.locator('.preview-shortcuts').getByRole('link', { name: /Catalogue tarifaire/ })).toHaveAttribute('href', '/connection?view=finance-catalog');
  await expect(page.getByRole('link', { name: /Business Pulse/ })).toHaveAttribute('href', '/business');
  await expect(page.locator('.preview-scenarios')).toContainText('Fiche illustrative');
  await page.getByRole('link', { name: /Salma Alaoui.*Fiche illustrative/ }).click();
  await expect(page).toHaveURL(/\/patients\/DEMO-001$/);
  await expect(page.getByRole('heading', { name: 'Salma Alaoui', exact: true })).toBeVisible();
});

test('homepage connected actions form a readable two-column mobile grid', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/`);
  const actions = page.locator('.preview-shortcut-grid > a');
  await expect(actions).toHaveCount(4);
  const topPositions = await actions.evaluateAll(elements => elements.map(element => element.getBoundingClientRect().top));
  expect(topPositions[1]!).toBe(topPositions[0]!);
  expect(topPositions[2]!).toBeGreaterThan(topPositions[1]!);
  expect(topPositions[3]!).toBe(topPositions[2]!);
  for(const action of await actions.all())expect((await action.boundingBox())!.width).toBeGreaterThan(150);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('patients workspace switches from list to profile on mobile and restores focus', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/patients?preview=1`);
  const workspace = page.locator('.patient-workspace');
  await expect(workspace).toHaveAttribute('data-mobile-view', 'list');
  const directory = page.getByRole('region', { name: 'Répertoire des patients' });
  await expect(page.getByRole('columnheader', { name: 'Coordonnées fictives' })).toBeHidden();
  await expect(page.getByRole('columnheader', { name: 'Visite illustrative' })).toBeHidden();
  expect(await directory.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  const patient = page.getByRole('button', { name: /Youssef Benali/ });
  await patient.focus();
  await page.keyboard.press('Enter');
  await expect(workspace).toHaveAttribute('data-mobile-view', 'detail');
  await expect(page.getByRole('complementary', { name: 'Patient sélectionné' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Youssef Benali', exact: true })).toBeFocused();
  await expect(page.getByRole('complementary', { name: 'Patient sélectionné' }).getByText('+212 6XX XX XX 02')).toBeVisible();
  const back = page.getByRole('button', { name: 'Retour à la liste' });
  await back.focus();
  await page.keyboard.press('Enter');
  await expect(workspace).toHaveAttribute('data-mobile-view', 'list');
  await expect(patient).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('patient directory keeps its desktop master-detail columns', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(`${base}/patients?preview=1`);
  const directory = page.getByRole('region', { name: 'Répertoire des patients' });
  await expect(page.getByRole('columnheader', { name: 'Coordonnées fictives' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Visite illustrative' })).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Patient sélectionné' })).toBeVisible();
  expect(await directory.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('patient demo scenarios show the matching appointment example or explicit no-appointment state', async ({ page }) => {
  await page.goto(`${patientPass}/?demoPatientId=DEMO-005&demoPatientName=Yasmine%20Benjelloun`);
  await page.getByRole('button', { name: /^(RDV|Rendez-vous)$/ }).click();
  await expect(page.getByText(/\d{1,2} \p{L}+ 20\d{2} · 13:30/u)).toBeVisible();
  await expect(page.getByText(/aucune réservation réelle/)).toBeVisible();

  await page.goto(`${patientPass}/?demoPatientId=DEMO-006&demoPatientName=Adam%20Berrada`);
  await page.getByRole('button', { name: /^(RDV|Rendez-vous)$/ }).click();
  await expect(page.getByRole('heading', { name: 'Mes rendez-vous' })).toBeVisible();
  await expect(page.getByText('Aucun rendez-vous dans ce scénario')).toBeVisible();
  await expect(page.getByText(/\d{1,2} \p{L}+ 20\d{2} · 10:30/u)).toHaveCount(0);
});

test('Patient Pass shows only demo logistics and no invented clinical preparation', async ({ page }) => {
  const apiRequests: string[] = [];
  page.on('request', request => { if (request.url().includes('/api/')) apiRequests.push(request.url()); });
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto(`${patientPass}/?demoPatientId=DEMO-005&demoPatientName=Yasmine%20Benjelloun`);
  await page.getByRole('button', { name: /^(RDV|Rendez-vous)$/ }).click();
  await expect(page.getByRole('heading', { name: 'Préparer cette visite' })).toBeVisible();
  await expect(page.getByText(/aucune consigne de santé n’est partagé[e]?/i)).toBeVisible();
  await expect(page.getByText(/aucune action réelle n’est demandée/i)).toBeVisible();
  await page.getByRole('button', { name: 'Prévisualiser un texte de rappel fictif' }).click();
  const reminder = page.getByRole('status').filter({ hasText: 'Texte fictif · non envoyé' });
  await expect(reminder).toContainText('Rien n’est programmé, transmis ou enregistré');
  await expect(reminder).toContainText('Le délai et les règles de rappel ne sont pas configurés');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
  expect(apiRequests).toEqual([]);

  await page.goto(`${patientPass}/?demoPatientId=DEMO-005&demoPatientName=Yasmine%20Benjelloun&demoAppointmentStartsAt=2026-12-01T13%3A00%3A00.000Z&demoAppointmentAction=cancelled`);
  await page.getByRole('button', { name: /^(RDV|Rendez-vous)$/ }).click();
  await expect(page.getByText(/Cette annulation est simulée/)).toBeVisible();
  expect(apiRequests).toEqual([]);
});

test('Patient Pass local administrative messaging offers French and Arabic drafts without sending or saving', async ({ page }) => {
  const apiRequests: string[] = [];
  page.on('request', request => { if (request.url().includes('/api/')) apiRequests.push(request.url()); });
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto(`${patientPass}/?demoPatientId=DEMO-005&demoPatientName=Yasmine%20Benjelloun`);
  await page.getByRole('button', { name: 'Messages' }).click();

  await expect(page.getByRole('heading', { name: 'Votre équipe' })).toBeVisible();
  await expect(page.locator('.messages-demo-patient').getByText('Yasmine Benjelloun', { exact: true })).toBeVisible();
  await expect(page.getByText(/Conversation fictive : aucun envoi/i)).toBeVisible();
  await page.getByRole('button', { name: 'العربية' }).click();
  const arabicThread = page.getByRole('article', { name: 'Conversation fictive en arabe' });
  await expect(arabicThread).toHaveAttribute('dir', 'rtl');
  await expect(arabicThread).toContainText('هذه المحادثة ضمن العرض التوضيحي فقط');

  await page.getByRole('button', { name: 'Français' }).click();
  await page.getByRole('button', { name: 'Marquer l’exemple comme lu' }).click();
  await expect(page.getByText('Lu dans cet aperçu')).toBeVisible();
  await page.getByLabel('Votre brouillon fictif').fill('Bonjour, ceci est un brouillon de démonstration.');
  await page.getByRole('button', { name: 'Aperçu uniquement' }).click();
  await expect(page.getByRole('status')).toContainText('Aperçu du brouillon · non envoyé');
  await expect(page.getByRole('status')).toContainText('Aucune transmission, requête API ou sauvegarde n’a eu lieu.');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
  expect(apiRequests).toEqual([]);
});

test('Patient Pass derives future visit dates at runtime without a hydration mismatch', async ({ page }) => {
  await page.clock.install({ time: new Date('2027-01-10T12:00:00.000Z') });
  const hydrationErrors: string[] = [];
  page.on('console', message => {
    if (message.type() === 'error' && /hydration|server rendered html/i.test(message.text())) hydrationErrors.push(message.text());
  });
  await page.goto(patientPass);
  await selectPassScenario(page, 'Yasmine Benjelloun');
  await page.getByRole('button', { name: /^(RDV|Rendez-vous)$/ }).click();
  await expect(page.getByText('11 janvier 2027 · 13:30')).toBeVisible();
  expect(hydrationErrors).toEqual([]);
});

test('Patient Pass lets a client switch among fictional Moroccan profiles in memory', async ({ page }) => {
  const apiRequests: string[] = [];
  await page.setViewportSize({ width: 320, height: 740 });
  page.on('request', request => { if (request.url().includes('/api/')) apiRequests.push(request.url()); });
  await page.goto(patientPass);
  await expect(page.getByRole('button', { name: 'Changer d’exemple' })).toBeVisible();
  await selectPassScenario(page, 'Imane El Idrissi');
  await expect(page.getByText('Aucun rendez-vous dans ce scénario')).toBeVisible();
  await selectPassScenario(page, 'Yasmine Benjelloun');
  await page.getByRole('button', { name: /^(RDV|Rendez-vous)$/ }).click();
  await expect(page.getByText(/\d{1,2} \p{L}+ 20\d{2} · 13:30/u)).toBeVisible();
  await expect(page.getByText(/Exemple uniquement · aucune réservation réelle/)).toBeVisible();
  await expect.poll(() => page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(apiRequests).toEqual([]);
  await page.reload();
  await page.getByRole('button', { name: 'Changer d’exemple' }).click();
  await expect(page.getByRole('dialog').getByRole('button', { name: /Salma Alaoui/ })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
});

test('un unpaired synthetic patient name cannot select a different demo schedule', async ({ page }) => {
  await page.goto(`${patientPass}/?demoPatientId=DEMO-005&demoPatientName=Adam%20Berrada`);
  await expect(page.locator('.demo-strip')).not.toContainText('Adam Berrada');
  await expect(page.locator('.demo-strip')).not.toContainText('Yasmine Benjelloun');
  await page.getByRole('button', { name: /^(RDV|Rendez-vous)$/ }).click();
  await expect(page.getByText('Aucun rendez-vous dans ce scénario')).toBeVisible();
});

async function selectPassScenario(page: Page, name: string) {
  await page.getByRole('button', { name: 'Changer d’exemple' }).click();
  const dialog = page.getByRole('dialog', { name: 'Explorer un profil fictif' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: new RegExp(name) }).click();
  await expect(dialog).toHaveCount(0);
}
