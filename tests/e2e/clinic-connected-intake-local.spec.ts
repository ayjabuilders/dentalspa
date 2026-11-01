import { expect, test } from '@playwright/test';

const email = process.env.LOCAL_DEMO_EMAIL ?? 'ghita.bennani@dentalspa.test';
const password = process.env.LOCAL_DEMO_PASSWORD;

async function signInAndOpenIntake(page: import('@playwright/test').Page) {
  await page.goto('http://localhost:4204/connection');
  await page.getByLabel('Adresse e-mail', { exact: true }).fill(email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(password!);
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  await expect(page.getByText('Cabinet actif : Cabinet Dentaire Atlas', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Ouvrir les demandes du cabinet' }).click();
  await expect(page.getByRole('heading', { name: 'Vos nouvelles demandes' })).toBeVisible();
  await expect(page.getByText('Cabinet vérifié · accès connecté')).toBeVisible();
}

test('local Auth can create a synthetic inquiry that remains after reload and a fresh sign-in', async ({ page }) => {
  test.skip(!password, 'Run scripts/local-demo-auth.mjs and pass its one-run password as LOCAL_DEMO_PASSWORD.');

  const name = `Oumaima Chraibi (FICTIF) ${crypto.randomUUID().slice(0, 8)}`;
  await signInAndOpenIntake(page);
  await page.getByRole('button', { name: 'Nouvelle demande' }).click();
  await page.getByLabel(/Nom du contact/).fill(name);
  await page.getByLabel('Source du premier contact').selectOption('website');
  await page.getByRole('button', { name: 'Enregistrer la demande' }).click();
  await expect(page.locator('.intake-success')).toContainText('Demande enregistrée par le cabinet');
  await expect(page.getByRole('heading', { name })).toBeVisible();

  await page.reload();
  await signInAndOpenIntake(page);
  await expect(page.getByRole('heading', { name })).toBeVisible();
});
