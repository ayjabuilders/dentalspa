import { test, expect } from '@playwright/test';
const base = process.env.BUILD_CENTER_URL ?? 'http://localhost:4200';

test('full PRD scope is distinct from delivery counts and links open truthful demos', async ({ page, context }) => {
  await page.goto(`${base}/build`);
  await expect(page.locator('[data-module-id]')).toHaveCount(21);
  await expect(page.getByRole('progressbar')).toHaveCount(21);
  await expect(page.locator('[data-module-id="M01"]').getByRole('progressbar')).toHaveAttribute('aria-valuenow', '17');
  await expect(page.locator('[data-module-id="M21"]')).toContainText('Academy & Network Enablement');
  await expect(page.locator('.build-hero')).not.toContainText('%');
  await expect(page.locator('[data-module-id="M18"] a')).toHaveCount(0);
  const popupPromise = context.waitForEvent('page');
  await page.locator('[data-module-id="M01"]').getByRole('link', { name: 'Tester les demandes' }).click();
  const popup = await popupPromise;
  await expect(popup).toHaveURL(`${base}/intake`);
  await expect(popup.getByRole('heading', { name: /demandes/i }).first()).toBeVisible();
  await popup.close();
  await page.getByRole('button', { name: /Infrastructure/ }).click();
  await expect(page.locator('.scope-card')).toHaveCount(10);
  await expect(page.getByText('Hébergement, restauration & exploitation', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Phases de livraison/ }).click();
  await expect(page.locator('.milestone-card')).toHaveCount(7);
  await page.getByRole('button', { name: /Gates & validations/ }).click();
  await expect(page.locator('.scope-card')).toHaveCount(7);
  await expect(page.getByRole('link', { name: 'Lire les décisions' })).toBeVisible();
  const statusResponse = await page.request.get(`${base}/api/build-status`);
  expect(statusResponse.ok()).toBe(true);
  const status = await statusResponse.json() as { tasks: Array<{ state: string }> };
  await page.getByRole('button', { name: /Journal des slices/ }).click();
  await expect(page.locator('.build-task')).toHaveCount(status.tasks.length);
  await expect(page.getByText('Décisions sur les ressources du cabinet', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Bloqué/ }).click();
  await expect(page.locator('.build-task')).toHaveCount(status.tasks.filter(task => task.state === 'blocked').length);
  await expect(page.getByText('Fondation de la plateforme', { exact: true })).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText('DentalSpa-worktrees');
});

test('successful snapshots refresh progress in place and failures retain the last evidence', async ({ page, request }) => {
  const published = await request.get(`${base}/api/build-status`);
  expect(published.ok()).toBe(true);
  expect(published.headers()['cache-control']).toBe('no-store');
  const initial = await published.json();
  let snapshot = initial;
  let failing = false;
  await page.route('**/api/build-status', route => failing ? route.fulfill({ status: 503, json: {} }) : route.fulfill({ json: snapshot }));
  await page.goto(`${base}/build`);
  await expect(page.getByRole('status')).toContainText('Dernier build réussi');
  await page.getByRole('button', { name: 'Fonctionnel partiel', exact: true }).click();
  snapshot = structuredClone(initial);
  snapshot.snapshotId = 'synthetic-next-build';
  snapshot.successfulAt = new Date(Date.parse(initial.successfulAt) + 1000).toISOString();
  snapshot.productModules[0].progress.percent = 25;
  snapshot.productModules[0].progress.points = 1.5;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.locator('[data-module-id="M01"]').getByRole('progressbar')).toHaveAttribute('aria-valuenow', '25');
  await expect(page.locator('[data-module-id]')).toHaveCount(3);
  snapshot = initial;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.locator('[data-module-id="M01"]').getByRole('progressbar')).toHaveAttribute('aria-valuenow', '17');
  failing = true;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('status')).toContainText('dernier état conservé');
  await expect(page.locator('[data-module-id="M01"]').getByRole('progressbar')).toHaveAttribute('aria-valuenow', '17');
});

test('scope views remain usable in both themes and compact layouts', async ({ page }) => {
  await page.goto(`${base}/build`);
  for (const width of [1536, 1280, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ['sombre', 'clair']) {
      await page.getByRole('button', { name: `Activer le thème ${theme}` }).click();
      for (const view of ['Produit complet', 'Infrastructure', 'Phases de livraison', 'Gates & validations', 'Journal des slices']) {
        await page.getByRole('button', { name: new RegExp(view) }).click();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      }
    }
  }
  await page.getByRole('button', { name: /Produit complet/ }).click();
  await page.getByRole('button', { name: 'Fonctionnel partiel', exact: true }).click();
  await expect(page.locator('[data-module-id]')).toHaveCount(3);
  await page.getByRole('button', { name: 'Aperçus UI', exact: true }).click();
  await expect(page.locator('[data-module-id]')).toHaveCount(6);
  await page.getByRole('button', { name: 'Tous les modules', exact: true }).click();
  await expect(page.locator('[data-module-id]')).toHaveCount(21);
});
