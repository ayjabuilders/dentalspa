import { expect, test } from '@playwright/test';

const base = process.env.INTAKE_UI_URL ?? 'http://localhost:4204';

test('approved contact vocabulary is a synthetic event preview only', async ({ page }) => {
  const apiRequests: string[] = [];
  page.on('request', request => {
    if (/\/api\/v1\/|supabase/i.test(request.url())) apiRequests.push(`${request.method()} ${request.url()}`);
  });
  await page.goto(`${base}/intake?preview=1`);
  const preview = page.locator('.demo-contact-outcome');
  await expect(preview.getByRole('heading', { name: 'Résultat de contact' })).toBeVisible();
  await expect(preview.getByText('Sans tentative', { exact: true })).toBeVisible();
  await expect(preview.getByText(/aucune séquence ni transition métier n’est définie/)).toBeVisible();

  const select = preview.getByLabel('Simuler un résultat observé');
  for (const [value, label] of [
    ['attempted_no_answer', 'Tenté sans réponse'],
    ['reached', 'Joint'],
    ['requested_callback', 'A demandé un rappel'],
    ['declined', 'A refusé'],
    ['unable_to_proceed', 'Impossible à poursuivre'],
  ] as const) {
    await select.selectOption(value);
    await preview.getByRole('button', { name: 'Simuler ce résultat' }).click();
    await expect(preview.locator('.demo-contact-outcome-history li').last()).toContainText(label);
  }
  await expect(preview.locator('.demo-contact-outcome-history li')).toHaveCount(5);
  expect(apiRequests).toEqual([]);
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toMatch(/Tenté sans réponse|Joint|A demandé un rappel|A refusé|Impossible à poursuivre/);

  await preview.getByRole('button', { name: 'Réinitialiser l’aperçu' }).click();
  await expect(preview.locator('.demo-contact-outcome-history li')).toHaveCount(0);
  await select.selectOption('declined');
  await preview.getByRole('button', { name: 'Simuler ce résultat' }).click();
  await page.reload();
  await expect(page.locator('.demo-contact-outcome-history li')).toHaveCount(0);
  expect(apiRequests).toEqual([]);
});

test('contact outcome preview fits mobile with accessible touch targets', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 780 });
  await page.goto(`${base}/intake?preview=1`);
  const preview = page.locator('.demo-contact-outcome');
  await expect(preview).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await preview.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  expect((await preview.getByLabel('Simuler un résultat observé').boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect((await preview.getByRole('button', { name: 'Simuler ce résultat' }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await page.screenshot({ animations: 'disabled', path: 'test-results/inquiry-contact-outcome-demo-320.png' });
});
