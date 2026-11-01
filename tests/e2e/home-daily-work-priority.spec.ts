import { expect, test } from '@playwright/test';

const base = process.env.CLINIC_DEMO_UI_URL ?? 'http://localhost:4204';

test('today’s synthetic appointment overview appears before the demo tour at laptop height', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(`${base}/`);

  await expect(page.getByRole('heading', { name: 'Une belle journée commence ici.' })).toBeVisible();
  const firstAppointment = page.locator('.day-grid .appointment').first();
  await expect(firstAppointment).toContainText('Salma Alaoui');
  await expect(firstAppointment).toContainText('Rendez-vous fictif');
  const bounds = await firstAppointment.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(720);

  await expect(page.getByRole('heading', { name: 'Commencer la visite' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Explorer Finance/ })).toHaveAttribute('href', '/finance');
});

test('the first appointment remains readable on a narrow phone viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/`);
  const firstAppointment = page.locator('.day-grid .appointment').first();
  await expect(firstAppointment).toContainText('Salma Alaoui');
  await expect(firstAppointment).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
