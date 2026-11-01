import { expect, test } from '@playwright/test';

test('patient onboarding is a clear, accessible, local-only three-step demo', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const apiRequests: string[] = [];
  page.on('request', request => {
    if (request.url().includes('/api/')) apiRequests.push(request.url());
  });

  await page.goto('http://localhost:4205');
  await page.getByRole('button', { name: /Première visite/ }).click();

  const progress = page.getByRole('progressbar', { name: 'Progression du guide' });
  await expect(progress).toHaveAttribute('aria-valuenow', '1');
  await expect(page.getByRole('heading', { name: 'Bienvenue sur Patient Pass' })).toBeFocused();
  await expect(page.getByText(/ne demande aucun renseignement personnel ou médical/)).toBeVisible();
  await page.getByRole('button', { name: 'Continuer' }).click();

  await expect(progress).toHaveAttribute('aria-valuenow', '2');
  await expect(page.getByRole('heading', { name: 'Choisissez votre confort de lecture' })).toBeFocused();
  const enlarge = page.getByRole('button', { name: 'Agrandir les textes' });
  await enlarge.click();
  await expect(enlarge).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.pass-frame')).toHaveClass(/pass-large-text/);
  await page.getByRole('button', { name: 'Continuer' }).click();

  await expect(progress).toHaveAttribute('aria-valuenow', '3');
  await expect(page.getByRole('heading', { name: 'Votre aperçu est prêt' })).toBeFocused();
  await expect(page.getByText(/Aucun rendez-vous n’est confirmé/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Terminer' })).toHaveCSS('min-height', '48px');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.getByRole('button', { name: 'Terminer' }).click();
  await expect(page.getByRole('heading', { name: 'Votre sourire. Votre espace.' })).toBeVisible();
  expect(apiRequests).toEqual([]);
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
});

test('onboarding supports going back, closing, keyboard focus and narrow mobile widths', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('http://localhost:4205');
  // Reselecting the current scenario stays on Home and must not steal the guide's focus.
  await page.getByRole('button', { name: 'Changer d’exemple' }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Salma Alaoui/ }).click();
  await page.getByRole('button', { name: /Première visite/ }).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Continuer' }).click();
  await page.getByRole('button', { name: /Précédent/ }).click();

  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
  await expect(page.getByRole('heading', { name: 'Bienvenue sur Patient Pass' })).toBeFocused();
  expect(await documentWidth(page)).toBeLessThanOrEqual(320);
  await page.getByRole('button', { name: 'Quitter le guide' }).click();
  await expect(page.getByRole('button', { name: /Première visite/ })).toBeVisible();
});

async function documentWidth(page: import('@playwright/test').Page) {
  return page.evaluate(() => document.documentElement.scrollWidth);
}
