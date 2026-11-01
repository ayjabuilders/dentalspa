import { expect, test } from '@playwright/test';

for (const reducedMotion of ['reduce', 'no-preference'] as const) {
  test(`shared entrance hydration stays consistent with ${reducedMotion}`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.emulateMedia({ reducedMotion });
    await page.goto('http://localhost:4204/business');
    await expect(page.getByRole('heading', { name: 'Devis & règlements', exact: true })).toBeVisible();
    await page.getByRole('button', { name: /Simuler un versement/ }).click();
    await expect(page.getByLabel('Montant fictif · MAD', { exact: true })).toBeVisible();
    expect(errors.filter(error => /hydrat|server rendered|didn't match/i.test(error))).toEqual([]);
  });
}
