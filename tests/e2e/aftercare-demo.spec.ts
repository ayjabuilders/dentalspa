import { expect, test } from '@playwright/test';

test('administrative aftercare preview stays fictional, neutral and ephemeral', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 820 });
  const apiRequests: string[] = [];
  page.on('request', request => {
    if (/\/api\//.test(new URL(request.url()).pathname)) apiRequests.push(request.url());
  });

  await page.goto('http://localhost:4204/aftercare');
  await expect(page.getByRole('heading', { name: 'Suivi & retours' })).toBeVisible();
  await expect(page.getByText('Aucun appel, rappel, avis ou message n’est envoyé')).toBeVisible();
  await expect(page.getByText('Salma Alaoui')).toBeVisible();
  await expect(page.getByText('Youssef Benali')).toBeVisible();
  await expect(page.getByText('Retour privé fictif · 2/5')).toBeVisible();
  await expect(page.getByText('Retour privé fictif · 5/5')).toBeVisible();

  const storageBefore = await page.evaluate(() => JSON.stringify({ local: Object.keys(localStorage).sort(), session: Object.keys(sessionStorage).sort() }));
  const salmaStatus = page.getByLabel('État illustratif').nth(0);
  await salmaStatus.selectOption('completed');
  await expect(salmaStatus).toHaveValue('completed');
  await expect(page.getByRole('button', { name: 'Voir l’aperçu neutre' })).toBeVisible();
  await page.getByRole('button', { name: 'Voir l’aperçu neutre' }).click();
  const invitation = page.getByRole('status').filter({ hasText: 'Invitation fictive · non envoyée' });
  await expect(invitation).toContainText('Votre avis est libre et facultatif');
  await expect(invitation).toContainText('aucun lien externe ni envoi n’est actif');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.evaluate(() => JSON.stringify({ local: Object.keys(localStorage).sort(), session: Object.keys(sessionStorage).sort() }))).toBe(storageBefore);
  expect(apiRequests).toEqual([]);

  await page.reload();
  await expect(page.getByLabel('État illustratif').nth(0)).toHaveValue('pending');
  await expect(page.getByText('Invitation fictive · non envoyée')).toHaveCount(0);
  expect(apiRequests).toEqual([]);
});
