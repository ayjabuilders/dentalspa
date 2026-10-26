import { expect, test } from '@playwright/test';

test('global search does not overwrite a patient list filter', async ({ page }) => {
  await page.goto('http://localhost:4200/patients');
  const patientSearch = page.getByRole('textbox', { name: 'Rechercher dans les patients' });
  await patientSearch.fill('Nora');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await page.getByRole('button', { name: /Rechercher un patient, un espace/ }).click();
  await page.getByRole('textbox', { name: 'Recherche globale' }).fill('Agenda');
  await page.keyboard.press('Escape');
  await expect(patientSearch).toHaveValue('Nora');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await page.keyboard.press('Control+k');
  await expect(page.getByRole('textbox', { name: 'Recherche globale' })).toHaveValue('');
  await page.keyboard.press('Escape');
  await expect(patientSearch).toHaveValue('Nora');
});

test('help explains the preview and secure connection without opening AI Pulse', async ({ page }) => {
  await page.goto('http://localhost:4200/patients');
  const help = page.getByRole('button', { name: 'Aide & accompagnement' });
  await help.click();
  await expect(page.getByRole('dialog')).toContainText('Votre espace, simplement');
  await expect(page.getByRole('dialog')).toContainText('Aucun message');
  await expect(page.getByRole('dialog').getByRole('link', { name: 'Ouvrir la connexion sécurisée' })).toHaveAttribute('href', '/connection');
  await page.keyboard.press('Escape');
  await expect(help).toBeFocused();
});

test('unconfigured connection explains the boundary and keeps the preview accessible', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://localhost:4200/connection');
  test.skip(!await page.getByText('Connexion en préparation', { exact: true }).isVisible(), 'This check targets builds without Supabase public configuration.');
  await expect(page.getByRole('button', { name: 'Se connecter', exact: true })).toBeDisabled();
  await expect(page.getByLabel('Adresse e-mail', { exact: true })).toBeDisabled();
  await expect(page.getByLabel('Mot de passe', { exact: true })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('link', { name: 'Retour à l’aperçu' }).click();
  await expect(page.getByRole('heading', { name: 'Une belle journée commence ici.' })).toBeVisible();
});
