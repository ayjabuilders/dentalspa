import { expect, test } from '@playwright/test';

const base = process.env.CLINIC_OS_LOCAL_URL ?? 'http://localhost:4204';

test('daily workflows and Finance stay visible while secondary spaces collapse accessibly', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(`${base}/clinical`);

  const navigation = page.locator('.sidebar nav');
  const hrefs = await navigation.locator('a.nav-item').evaluateAll(links => links.map(link => (link as HTMLAnchorElement).getAttribute('href')));
  expect(hrefs.slice(0, 7)).toEqual(['/', '/connection?view=intake', '/connection?view=patients', '/connection?view=planning', '/clinical', '/connection?view=inbox', '/business']);
  expect(new Set(hrefs)).toEqual(new Set([
    '/', '/connection?view=intake', '/connection?view=patients', '/business', '/connection?view=planning', '/clinical', '/connection?view=inbox',
    '/aftercare', '/operations', '/connection?view=team', '/playbook', '/build',
  ]));

  const overflow = navigation.locator('details.nav-overflow');
  await expect(overflow).not.toHaveAttribute('open', '');
  const navBox = await navigation.boundingBox();
  expect(navBox).not.toBeNull();
  for (const href of ['/', '/connection?view=intake', '/connection?view=patients', '/connection?view=planning', '/clinical', '/connection?view=inbox', '/business']) {
    const box = await navigation.locator(`a.nav-item[href="${href}"]`).boundingBox();
    expect(box, `${href} should be in the primary navigation`).not.toBeNull();
    expect(box!.y).toBeGreaterThanOrEqual(navBox!.y);
    expect(box!.y + box!.height).toBeLessThanOrEqual(navBox!.y + navBox!.height);
  }

  await page.goto(`${base}/team?preview=1`);
  const teamOverflow = page.locator('.sidebar nav details.nav-overflow');
  await expect(teamOverflow).toHaveAttribute('open', '');
  await expect(teamOverflow.getByRole('link', { name: 'Équipe' })).toBeVisible();

  const summary = teamOverflow.locator('summary');
  await summary.focus();
  await page.keyboard.press('Enter');
  await expect(teamOverflow).not.toHaveAttribute('open', '');
  await page.keyboard.press('Enter');
  await expect(teamOverflow).toHaveAttribute('open', '');
});

test('all destinations remain available through the mobile navigation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/patients?preview=1`);
  await page.getByRole('button', { name: 'Ouvrir la navigation' }).click();

  const mobileNavigation = page.getByRole('navigation', { name: 'Votre espace de travail' });
  await expect(mobileNavigation.getByRole('link', { name: 'Finance · aperçu' })).toBeVisible();
  await expect(mobileNavigation.getByRole('link', { name: 'Consultations' })).toBeVisible();
  await expect(mobileNavigation.getByRole('link', { name: 'Construction' })).toBeVisible();
  await mobileNavigation.getByRole('link', { name: 'Finance · aperçu' }).click();
  await expect(page).toHaveURL(/\/business$/);
  await expect(page.getByRole('heading', { name: 'Devis & règlements' })).toBeVisible();
});
