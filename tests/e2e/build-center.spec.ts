import { test, expect } from '@playwright/test';
const base = process.env.BUILD_CENTER_URL ?? 'http://localhost:4204';

test('full PRD scope is distinct from delivery counts and links open truthful demos', async ({ page, context }) => {
  await page.goto(`${base}/build`);
  const published = await page.request.get(`${base}/api/build-status`);
  expect(published.ok()).toBe(true);
  const current = await published.json() as { productModules: Array<{ id: string; progress: { percent: number } }>; tasks: Array<{ state: string }> };
  const m01 = current.productModules.find(module => module.id === 'M01');
  expect(m01).toBeDefined();
  const tour = page.getByRole('region', { name: 'Visiter la démo locale' });
  await page.locator('.build-tour-disclosure > summary').click();
  await expect(tour.getByRole('listitem')).toHaveCount(7);
  await expect(tour).toContainText('Écriture locale persistée');
  await expect(tour).toContainText('Demande locale · résultat du serveur');
  await expect(tour).toContainText('Les étapes 01–04 utilisent la base locale.');
  await expect(tour.getByRole('link', { name: 'Ouvrir Clinic OS connecté' })).toHaveAttribute('href', '/connection');
  await expect(tour.getByRole('link', { name: 'Ouvrir le répertoire' })).toHaveAttribute('href', '/connection?view=patients');
  await expect(tour.getByRole('link', { name: 'Explorer le planning' })).toHaveAttribute('href', '/connection?view=planning');
  const localHost = new URL(base);
  await expect(tour.getByRole('link', { name: 'Ouvrir Public Booking' })).toHaveAttribute('href', `${localHost.protocol}//${localHost.hostname}:4202/`);
  await expect(tour.getByRole('link', { name: 'Ouvrir Patient Pass' })).toHaveAttribute('href', `${localHost.protocol}//${localHost.hostname}:4205/`);
  await expect(page.locator('[data-module-id]')).toHaveCount(21);
  await expect(page.getByRole('progressbar')).toHaveCount(21);
  await expect(page.locator('[data-module-id="M01"]').getByRole('progressbar')).toHaveAttribute('aria-valuenow', String(m01!.progress.percent));
  await expect(page.locator('[data-module-id="M21"]')).toContainText('Academy & Network Enablement');
  await expect(page.locator('[data-module-id="M16"]').getByRole('link', { name: 'Tester Équipe & activité' })).toBeVisible();
  await expect(page.locator('.build-hero')).not.toContainText('%');
  await expect(page.locator('[data-module-id="M18"] a')).toHaveCount(0);
  const popupPromise = context.waitForEvent('page');
  await page.locator('[data-module-id="M01"]').getByRole('link', { name: 'Tester les demandes' }).click();
  const popup = await popupPromise;
  await expect(popup).toHaveURL(`${base}/intake?preview=1`);
  await expect(popup.getByRole('heading', { name: /demandes/i }).first()).toBeVisible();
  await popup.close();
  await page.getByRole('button', { name: /Infrastructure/ }).click();
  await expect(page.locator('.scope-card')).toHaveCount(10);
  await expect(page.getByText('Hébergement, restauration & exploitation', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Phases de livraison/ }).click();
  await expect(page.locator('.milestone-card')).toHaveCount(7);
  await page.getByRole('button', { name: /Gates & validations/ }).click();
  await expect(page.locator('.scope-card')).toHaveCount(7);
  await expect(page.getByText('D1 APPROUVÉ · D2–D8 ET REVUE EN ATTENTE')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Un résultat enregistré reste un « possible match ».' })).toBeVisible();
  await expect(page.getByText(/Cette décision seule n’autorise pas à relier un vrai dossier patient/)).toBeVisible();
  await expect(page.getByText(/La démonstration locale avec des profils fictifs continue/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Relire le dossier D1–D8' })).toBeVisible();
  await page.getByRole('button', { name: /Journal des slices/ }).click();
  await expect(page.locator('.build-task')).toHaveCount(current.tasks.length);
  await expect(page.getByText('Décisions sur les ressources du cabinet', { exact: true })).toBeVisible();
  const activityTask = page.locator('.build-task').filter({ hasText: 'Journal d’activité Équipe' });
  await expect(activityTask).toBeVisible();
  await expect(activityTask.getByRole('link', { name: 'Tester l’activité Équipe' })).toBeVisible();
  await page.getByRole('button', { name: /Bloqué/ }).click();
  await expect(page.locator('.build-task')).toHaveCount(current.tasks.filter(task => task.state === 'blocked').length);
  await expect(page.getByText('Fondation de la plateforme', { exact: true })).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText('DentalSpa-worktrees');
});

test('successful snapshots refresh progress in place and failures retain the last evidence', async ({ page, request }) => {
  const published = await request.get(`${base}/api/build-status`);
  expect(published.ok()).toBe(true);
  expect(published.headers()['cache-control']).toBe('no-store');
  const initial = await published.json();
  const initialPercent = initial.productModules[0].progress.percent as number;
  let snapshot = initial;
  let failing = false;
  await page.route('**/api/build-status', route => failing ? route.fulfill({ status: 503, json: {} }) : route.fulfill({ json: snapshot }));
  await page.goto(`${base}/build`);
  await expect(page.getByRole('status')).toContainText('Dernier build réussi');
  await page.getByRole('button', { name: 'Fonctionnel partiel', exact: true }).click();
  snapshot = structuredClone(initial);
  snapshot.snapshotId = 'synthetic-next-build';
  snapshot.successfulAt = new Date(Date.parse(initial.successfulAt) + 1000).toISOString();
  snapshot.productModules[0].progress.percent = initialPercent + 8;
  snapshot.productModules[0].progress.points = initial.productModules[0].progress.points + 0.5;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.locator('[data-module-id="M01"]').getByRole('progressbar')).toHaveAttribute('aria-valuenow', String(initialPercent + 8));
  await expect(page.locator('[data-module-id]')).toHaveCount(initial.productModules.filter((module: { state: string }) => module.state === 'partial').length);
  snapshot = initial;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.locator('[data-module-id="M01"]').getByRole('progressbar')).toHaveAttribute('aria-valuenow', String(initialPercent));
  failing = true;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('status')).toContainText('dernier état conservé');
  await expect(page.locator('[data-module-id="M01"]').getByRole('progressbar')).toHaveAttribute('aria-valuenow', String(initialPercent));
});

test('scope views remain usable in both themes and compact layouts', async ({ page }) => {
  await page.goto(`${base}/build`);
  await page.locator('.build-tour-disclosure > summary').click();
  const published = await page.request.get(`${base}/api/build-status`);
  expect(published.ok()).toBe(true);
  const current = await published.json() as { productModules: Array<{ state: string }> };
  const partialCount = current.productModules.filter(module => module.state === 'partial').length;
  const previewCount = current.productModules.filter(module => module.state === 'preview').length;
  for (const width of [1536, 1280, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByRole('region', { name: 'Visiter la démo locale' }).getByRole('listitem')).toHaveCount(7);
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
  await expect(page.locator('[data-module-id]')).toHaveCount(partialCount);
  await page.getByRole('button', { name: 'Aperçus UI', exact: true }).click();
  await expect(page.locator('[data-module-id]')).toHaveCount(previewCount);
  await page.getByRole('button', { name: 'Tous les modules', exact: true }).click();
  await expect(page.locator('[data-module-id]')).toHaveCount(21);
});
