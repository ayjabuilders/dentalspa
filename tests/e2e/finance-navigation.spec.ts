import { expect, test } from '@playwright/test';

const base = process.env.CLINIC_OS_LOCAL_URL ?? 'http://localhost:4204';

for (const width of [1440, 390]) {
  test(`Finance navigation reaches the connected workspace at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${base}/`);
    if (width === 390) await page.getByRole('button', { name: 'Ouvrir la navigation' }).click();
    await page.getByRole('link', { name: 'Finance', exact: true }).click();
    await expect(page).toHaveURL(/\/connection\?view=finance$/);
    await expect(page.getByText('Simulation fictive · sans paiement réel')).toHaveCount(0);
  });
}

test('both finance entry URLs resolve to the connected workspace', async ({ page }) => {
  for (const path of ['/finance', '/business']) {
    await page.goto(`${base}${path}`);
    await expect(page).toHaveURL(/\/connection\?view=finance$/);
  }
});

test('explicit local finance preview remains available', async ({ page }) => {
  await page.goto(`${base}/business?preview=1`);
  await expect(page.getByRole('heading', { name: 'Devis & règlements' })).toBeVisible();
  await expect(page.getByText('Simulation fictive · sans paiement réel')).toBeVisible();
});
