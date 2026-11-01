import { expect, test } from '@playwright/test';

const clinicBase = process.env.CLINIC_OS_LOCAL_URL ?? 'http://localhost:4204';

test('clinic inbox stays an ephemeral synthetic communication preview', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 820 });
  const apiRequests: string[] = [];
  page.on('request', request => {
    if (/\/api\//.test(new URL(request.url()).pathname)) apiRequests.push(request.url());
  });

  await page.goto(`${clinicBase}/inbox?preview=1`);
  await expect(page.getByRole('heading', { name: 'Boîte de réception' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Ouvrir la boîte connectée' })).toHaveAttribute('href', '/connection?view=inbox');
  await expect(page.getByText('Canal fictif · non connecté')).toBeVisible();
  await expect(page.getByText('aucun message reçu ou envoyé')).toBeVisible();
  await expect(page.getByRole('button', { name: /Meryem El Fassi/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Hamza Berrada/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Salma Alaoui/ })).toBeVisible();

  const storageBefore = await page.evaluate(() => JSON.stringify({ local: Object.keys(localStorage).sort(), session: Object.keys(sessionStorage).sort() }));
  await page.getByRole('button', { name: /Non lues/ }).click();
  await expect(page.getByRole('button', { name: /Meryem El Fassi/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Salma Alaoui/ })).toHaveCount(0);
  await page.getByRole('button', { name: /Meryem El Fassi/ }).click();
  await page.getByRole('button', { name: /Marquer comme lu/ }).click();
  await expect(page.getByRole('button', { name: /Meryem El Fassi/ })).toHaveCount(0);

  await page.getByRole('button', { name: /Toutes/ }).click();
  await page.getByRole('button', { name: /Hamza Berrada/ }).click();
  await page.getByLabel('Brouillon administratif').fill('Bonjour, voici un brouillon fictif.');
  await expect(page.getByText('Envoi désactivé dans la démo. Vérifiez le contenu avant tout usage réel.')).toBeVisible();
  await expect(page.getByText('Brouillon conservé en mémoire pour cette session.')).toBeVisible();
  await page.getByRole('button', { name: 'Conversations', exact: true }).click();
  await page.getByRole('button', { name: /Salma Alaoui/ }).click();
  await expect(page.getByLabel('Brouillon administratif')).toHaveValue('');

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.evaluate(() => JSON.stringify({ local: Object.keys(localStorage).sort(), session: Object.keys(sessionStorage).sort() }))).toBe(storageBefore);
  expect(apiRequests).toEqual([]);
  await page.reload();
  await expect(page.getByRole('button', { name: /Meryem El Fassi/ })).toBeVisible();
  await page.getByRole('button', { name: /Salma Alaoui/ }).click();
  await expect(page.getByLabel('Brouillon administratif')).toHaveValue('');
  expect(apiRequests).toEqual([]);
});

test('inbox uses a focused mobile conversation view and keeps disclosure accessible', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${clinicBase}/inbox?preview=1`);
  await expect(page.getByRole('region', { name: 'Conversations fictives' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Détail de la conversation fictive' })).toBeHidden();
  await page.getByRole('button', { name: /Hamza Berrada/ }).click();
  const thread = page.getByRole('region', { name: 'Détail de la conversation fictive' });
  await expect(thread).toBeVisible();
  await expect(thread.getByRole('heading', { name: 'Hamza Berrada' })).toBeFocused();
  await expect(page.getByRole('region', { name: 'Conversations fictives' })).toBeHidden();
  await page.screenshot({ path: '.local/qa/inbox-mobile-thread.png', animations: 'disabled' });
  await page.getByRole('button', { name: 'Conversations', exact: true }).click();
  await expect(page.getByRole('button', { name: /Hamza Berrada/ })).toBeFocused();
  await page.getByText('À savoir', { exact: true }).click();
  await expect(page.getByText(/Aucun compte WhatsApp relié/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(thread).toBeVisible();
  await expect(page.getByRole('region', { name: 'Conversations fictives' })).toBeVisible();
  await page.getByText('À savoir', { exact: true }).click();
  await page.screenshot({ path: '.local/qa/inbox-desktop.png', animations: 'disabled' });
});
