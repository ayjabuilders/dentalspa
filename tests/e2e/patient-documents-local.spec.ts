import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const origin = 'http://localhost:4204';
const fixture = process.env;
const runId = Date.now().toString(36);
const output = '.local/qa/patient-documents-native';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0xkAAAAASUVORK5CYII=', 'base64');

async function login(page: Page, role: 'DENTIST'|'ASSISTANT'|'MANAGER') {
  const email = fixture[`LOCAL_DOCUMENT_${role}_EMAIL`], password = fixture[`LOCAL_DOCUMENT_${role}_PASSWORD`];
  expect(email).toBeTruthy(); expect(password).toBeTruthy();
  // Forward requests unchanged to the lifecycle-owned native API. No fabricated API responses.
  if (fixture.LOCAL_DOCUMENT_PROXY === 'true') await page.route('**/api/v1/**', async route => {
    const url = new URL(route.request().url());
    const response = await route.fetch({ url: fixture.LOCAL_DOCUMENT_API + url.pathname + url.search });
    await route.fulfill({ response });
  });
  await page.goto(origin + '/connection?view=patients&patient=' + fixture.LOCAL_DOCUMENT_PATIENT_ID);
  await page.getByLabel('Adresse e-mail', { exact: true }).fill(email!);
  await page.getByLabel('Mot de passe', { exact: true }).fill(password!);
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  if (role !== 'ASSISTANT') await page.getByRole('tab', { name: 'Documents', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Administratif', exact: true })).toBeVisible();
}

async function upload(page: Page, title: string) {
  title += ' ' + runId;
  await page.getByRole('button', { name: 'Ajouter un fichier', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Importer un document', exact: true });
  await dialog.getByLabel('Fichier', { exact: true }).setInputFiles({ name: 'document-fictif.png', mimeType: 'image/png', buffer: png });
  await dialog.getByLabel('Titre du document', { exact: true }).fill(title);
  await dialog.getByRole('button', { name: 'Importer le fichier', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Consulter ' + title, exact: true })).toBeVisible();
}

async function bounds(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

for (const width of [1440, 390]) test(`native documents clinician lifecycle ${width}px`, async ({ page }) => {
  test.skip(!fixture.LOCAL_DOCUMENT_API, 'Run through the native document fixture runner.');
  mkdirSync(output, { recursive: true });
  await page.setViewportSize({ width, height: width > 1000 ? 1000 : 844 });
  await login(page, 'DENTIST');
  const title = 'Pièce administrative fictive ' + width;
  await upload(page, title);
  await page.getByRole('tab', { name: 'Dossier médical', exact: true }).click();
  await upload(page, 'Image clinique fictive ' + width);
  await expect(page.getByRole('button', { name: 'Consulter ' + title, exact: true })).toHaveCount(0);
  await bounds(page);
  await page.screenshot({ path: `${output}/medical-${width}.png`, animations: 'disabled' });
  await page.getByRole('button', { name: 'Nouvelle ordonnance', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Rédiger une ordonnance', exact: true });
  await expect(editor).toBeVisible();
  await expect(editor.getByRole('textbox', { name: 'Contenu du document', exact: true })).toHaveValue('');
  const draftTitle = 'Ordonnance fictive QA ' + width + ' ' + runId;
  await editor.getByLabel('Titre du document', { exact: true }).fill(draftTitle);
  await editor.getByRole('textbox', { name: 'Contenu du document', exact: true }).fill('Document de démonstration. Aucun médicament prescrit.');
  await editor.getByRole('button', { name: 'Enregistrer le brouillon', exact: true }).click();
  await expect(editor.getByRole('status').filter({ hasText: /Brouillon enregistré · version/ })).toBeVisible();
  await editor.getByRole('button', { name: 'Fermer', exact: true }).last().click();
  await expect(editor).toHaveCount(0);
  await page.getByRole('button', { name: 'Mes ordonnances', exact: true }).click();
  await page.getByRole('button', { name: 'Modifier ' + draftTitle, exact: true }).click();
  await expect(editor.getByRole('textbox', { name: 'Contenu du document', exact: true })).toHaveValue('Document de démonstration. Aucun médicament prescrit.');
  await editor.getByRole('textbox', { name: 'Contenu du document', exact: true }).fill('Version révisée fictive. Aucun médicament prescrit.');
  await editor.getByRole('button', { name: 'Enregistrer le brouillon', exact: true }).click();
  await expect(editor.getByRole('status').filter({ hasText: /Brouillon enregistré · version/ })).toBeVisible();
  await editor.getByRole('button', { name: 'Fermer', exact: true }).last().click();
  await expect(editor).toHaveCount(0);
  await page.getByRole('button', { name: 'Modifier ' + draftTitle, exact: true }).click();
  await editor.getByRole('button', { name: 'Valider cette version', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Je confirme avoir relu cette version.', exact: true }).check();
  await page.getByRole('button', { name: 'Confirmer la validation', exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Consulter ' + draftTitle, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Consulter ' + draftTitle, exact: true }).click();
  await expect(page.getByText('Version révisée fictive. Aucun médicament prescrit.', { exact: true })).toBeVisible();
  await bounds(page);
  await page.screenshot({ path: `${output}/validated-${width}.png`, animations: 'disabled' });
  await page.reload();
  await page.getByRole('tab', { name: 'Documents', exact: true }).click();
  await page.getByRole('tab', { name: 'Dossier médical', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Consulter ' + draftTitle, exact: true })).toBeVisible();
});

test('assistant documentary access without financial hub or prescription authority', async ({ page }) => {
  test.skip(!fixture.LOCAL_DOCUMENT_API, 'Native fixture required.');
  const hubReads: string[] = [];
  page.on('request', request => { if (new URL(request.url()).pathname.endsWith('/hub')) hubReads.push('hub'); });
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, 'ASSISTANT');
  await page.getByRole('tab', { name: 'Dossier médical', exact: true }).click();
  await upload(page, 'Import assistant fictif');
  await expect(page.getByRole('button', { name: 'Nouvelle ordonnance', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Nouveau compte rendu', exact: true })).toBeVisible();
  expect(hubReads).toEqual([]);
  await bounds(page);
});

test('manager imports administrative and medical documents without clinical authoring', async ({ page }) => {
  test.skip(!fixture.LOCAL_DOCUMENT_API, 'Native fixture required.');
  await login(page, 'MANAGER');
  await upload(page, 'Import gestionnaire fictif');
  const medical = page.getByRole('tab', { name: 'Dossier médical', exact: true });
  await medical.click();
  await upload(page, 'Import médical gestionnaire fictif');
  await page.screenshot({ path: output + '/manager-medical.png', animations: 'disabled' });
  await expect(page.getByRole('button', { name: 'Nouveau compte rendu', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Nouvelle ordonnance', exact: true })).toHaveCount(0);
  await bounds(page);
});
