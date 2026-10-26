import { expect, test } from '@playwright/test';

test('installed display mode hides install guidance', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(navigator, 'standalone', { value: true }); });
  await page.goto('http://localhost:4200');
  await expect(page.getByRole('button', { name: 'Installer l’application' })).toHaveCount(0);
});

test('failed native install prompt recovers to browser guidance', async ({ page }) => {
  await page.goto('http://localhost:4200');
  await page.getByRole('button', { name: 'Installer l’application' }).click();
  await page.evaluate(() => {
    const event = new Event('beforeinstallprompt', { cancelable: true });
    Object.assign(event, { prompt: async () => { throw new Error('Synthetic prompt rejection'); }, userChoice: Promise.resolve({ outcome: 'dismissed' }) });
    window.dispatchEvent(event);
  });
  await page.getByRole('button', { name: 'Installer Dental Spa', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('n’a pas pu démarrer');
  await expect(page.getByRole('dialog')).toContainText('Chrome / Edge');
});

test('an available update requires explicit confirmation before activation', async ({ page }) => {
  await page.addInitScript(() => {
    const container = new EventTarget();
    Object.assign(container, {
      controller: {},
      register: async () => Object.assign(new EventTarget(), {
        waiting: { postMessage: () => { document.documentElement.dataset.updateActivated = 'yes'; } },
        installing: null,
      }),
    });
    Object.defineProperty(navigator, 'serviceWorker', { value: container });
  });
  await page.goto('http://localhost:4200');
  const update = page.getByRole('button', { name: 'Mise à jour disponible' });
  await expect(update).toBeVisible();
  await expect(page.locator('html')).not.toHaveAttribute('data-update-activated');
  page.once('dialog', dialog => dialog.dismiss());
  await update.click();
  await expect(page.locator('html')).not.toHaveAttribute('data-update-activated');
  page.once('dialog', dialog => dialog.accept());
  await update.click();
  await expect(page.locator('html')).toHaveAttribute('data-update-activated', 'yes');
  await expect(page.getByRole('button', { name: 'Actualisation…' })).toBeDisabled();
});
