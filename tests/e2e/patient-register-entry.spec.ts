import { expect, test } from '@playwright/test';

const base = process.env.PATIENT_REGISTER_ENTRY_UI_URL ?? 'http://localhost:4204';

test('Patients workspace opens secure access for the connected register without loading demo records', async ({ page }) => {
  const apiRequests: string[] = [];
  page.on('request', request => { if (request.url().includes('/api/')) apiRequests.push(request.url()); });

  await page.goto(`${base}/patients?preview=1`);
  await expect(page.getByRole('heading', { name: 'Vos patients', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Connexion sécurisée', exact: true }).click();

  await expect(page).toHaveURL(/\/connection\?view=patients$/);
  await expect(page.getByRole('form', { name: 'Connexion au cabinet' })).toBeVisible();
  expect(apiRequests).toEqual([]);
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
});
