import { expect, test } from '@playwright/test';

test('clinical workspace keeps a fictional unsigned draft in page memory only', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const apiRequests: string[] = [];
  page.on('request', request => {
    if (/\/api\//.test(new URL(request.url()).pathname)) apiRequests.push(request.url());
  });

  await page.goto('http://localhost:4204/clinical');
  const workspace = page.getByRole('region', { name: 'Aperçu du parcours de consultation' });
  await expect(workspace.getByLabel('Choisir une visite fictive')).toBeVisible();
  await expect(workspace.getByRole('heading', { name: 'Salma Alaoui' })).toBeVisible();
  await expect(workspace.getByText('Souhaite discuter des options disponibles au cabinet.')).toBeVisible();
  const contextBox = await workspace.locator('.clinical-demo-context-card').boundingBox();
  expect(contextBox).not.toBeNull();
  expect(contextBox!.y + contextBox!.height).toBeLessThanOrEqual(844);

  await workspace.getByRole('button', { name: 'Ouvrir le brouillon fictif' }).click();
  await expect(workspace.getByRole('heading', { name: 'Brouillon fictif · non signé' })).toBeVisible();
  await expect(workspace.getByText(/Seul un clinicien autorisé peut créer et signer/)).toBeVisible();
  await workspace.getByRole('button', { name: 'Images' }).click();
  await expect(workspace.getByRole('heading', { name: 'Aucune image liée' })).toBeVisible();
  await workspace.getByRole('button', { name: 'Plan & consentement' }).click();
  await expect(workspace.getByRole('heading', { name: 'Aucun plan ou consentement' })).toBeVisible();

  const scenarioPicker = workspace.getByLabel('Choisir une visite fictive');
  await scenarioPicker.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(scenarioPicker).toHaveValue('DEMO-002');
  await workspace.getByRole('button', { name: 'Note' }).click();
  await expect(workspace.getByRole('heading', { name: 'Aucune note clinique' })).toBeVisible();
  await expect(workspace.getByText(/non signé/)).toHaveCount(0);
  await expect(page.getByText(/N’entrez pas de données réelles/)).toBeVisible();

  await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(apiRequests).toEqual([]);
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
});

test('desktop clinical preview keeps the visit list and no-clinical-data notice', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('http://localhost:4204/clinical');
  const workspace = page.getByRole('region', { name: 'Aperçu du parcours de consultation' });
  await expect(workspace.getByRole('button', { name: /Youssef Benali/ })).toBeVisible();
  await expect(workspace.getByLabel('Choisir une visite fictive')).toBeHidden();
  await workspace.getByRole('button', { name: /Youssef Benali/ }).click();
  await expect(workspace.getByRole('heading', { name: 'Youssef Benali' })).toBeVisible();
  await expect(page.getByText(/Aucun contenu clinique n’est créé, signé, publié ou enregistré/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
