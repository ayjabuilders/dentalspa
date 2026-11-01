import { expect, test } from '@playwright/test';

const password = process.env.LOCAL_DEMO_PASSWORD;

test('the verified clinic can read its fictional patient directory and minimal profile only', async ({ page }) => {
  test.skip(!password, 'Run scripts/local-demo-auth.mjs and pass its one-run password as LOCAL_DEMO_PASSWORD.');

  await page.goto('http://localhost:4204/connection?view=patients');
  await page.getByLabel('Adresse e-mail', { exact: true }).fill('ghita.bennani@dentalspa.test');
  await page.getByLabel('Mot de passe', { exact: true }).fill(password!);
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();

  await expect(page.getByRole('heading', { name: 'Répertoire patient connecté' })).toBeVisible();
  const patientList = page.getByRole('region', { name: 'Patients autorisés' });
  await expect(patientList.getByRole('listitem')).toHaveCount(3);
  await expect(patientList.getByText('Salma Alaoui (FICTIF)', { exact: true })).toBeVisible();
  await expect(patientList.getByText('Nadia El Fassi (FICTIF)', { exact: true })).toHaveCount(0);

  await patientList.getByRole('button', { name: 'Ouvrir la fiche de Salma Alaoui (FICTIF)' }).click();
  const profile = page.getByRole('complementary', { name: 'Fiche administrative minimale' });
  await expect(profile.getByRole('heading', { name: 'Salma Alaoui (FICTIF)' })).toBeVisible();
  await expect(profile.getByText(/ATLAS-DEMO-001/)).toBeVisible();
  await expect(profile.getByText('Données enregistrées · lecture seule')).toBeVisible();
  await expect(profile.getByRole('tab', { name: 'Rendez-vous', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Se déconnecter' })).toHaveCount(1);
  const toolbarHeight = await page.locator('.patient-directory-page > .connection-card').evaluate(element => element.getBoundingClientRect().height);
  expect(toolbarHeight).toBeLessThan(170);
  const refreshWidth = await page.getByRole('button', { name: 'Recharger' }).evaluate(element => element.getBoundingClientRect().width);
  expect(refreshWidth).toBeLessThan(220);
});

test('the connected toolbar reflows at 320px in dark theme without horizontal overflow', async ({ page }) => {
  test.skip(!password, 'Run scripts/local-demo-auth.mjs and pass its one-run password as LOCAL_DEMO_PASSWORD.');
  await page.setViewportSize({ width: 320, height: 800 });
  await page.addInitScript(() => localStorage.setItem('dental-theme', 'dark'));
  await page.goto('http://localhost:4204/connection?view=patients');
  await page.getByLabel('Adresse e-mail', { exact: true }).fill('ghita.bennani@dentalspa.test');
  await page.getByLabel('Mot de passe', { exact: true }).fill(password!);
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Répertoire patient connecté' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Changer de cabinet' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Se déconnecter' })).toHaveCount(1);
  const dimensions = await page.evaluate(() => ({ viewport: window.innerWidth, document: document.documentElement.scrollWidth }));
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
  const surfaces = await page.locator('.patient-directory-list,.patient-directory-profile,.connection-card').evaluateAll(elements => elements.map(element => getComputedStyle(element).backgroundColor));
  expect(surfaces.every(color => color !== 'rgba(0, 0, 0, 0)')).toBeTruthy();
});
