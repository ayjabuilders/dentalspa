import { expect, test } from '@playwright/test';

const base = process.env.CLINIC_DEMO_UI_URL ?? 'http://localhost:4204';

test('home screen sends unfinished workspaces to the progress guide', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${base}/`);

  await expect(page.getByRole('link', { name: /Patients & expérience/ })).toHaveAttribute('href', '/patients');
  await expect(page.getByRole('link', { name: /Espace clinique/ })).toHaveAttribute('href', '/clinical');
  await expect(page.getByRole('link', { name: /Business Pulse/ })).toHaveAttribute('href', '/business');

  const futureWorkspace = page.getByRole('link', { name: 'New Smile Studio · à venir. Consulter la progression' });
  await expect(futureWorkspace).toHaveAttribute('href', '/build');
  await expect(page.getByRole('link', { name: 'Laboratoire digital · à venir. Consulter la progression' })).toHaveAttribute('href', '/build');
  await expect(page.getByRole('link', { name: 'Vie du cabinet · à venir. Consulter la progression' })).toHaveAttribute('href', '/build');

  await futureWorkspace.click();
  await expect(page).toHaveURL(/\/build$/);
  await expect(page.getByRole('heading', { name: /Le produit à construire/ })).toBeVisible();
});

test('unfinished workspace cards stay clear and usable on a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto(`${base}/`);

  const futureWorkspace = page.getByRole('link', { name: 'Laboratoire digital · à venir. Consulter la progression' });
  await expect(futureWorkspace).toBeVisible();
  await expect(futureWorkspace.locator('.workspace-status-badge')).toHaveText('À venir');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await futureWorkspace.click();
  await expect(page).toHaveURL(/\/build$/);
});
