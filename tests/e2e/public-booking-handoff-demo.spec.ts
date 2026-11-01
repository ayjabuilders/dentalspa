import { expect, test } from '@playwright/test';

const publicUrl = process.env.PUBLIC_BOOKING_DEMO_UI_URL ?? 'http://localhost:4202/preview';
const clinicUrl = process.env.CLINIC_DEMO_UI_URL ?? 'http://localhost:4204';

test('a fictional local booking scenario opens a reception preview without transmitting or storing a request', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  const nonLocalRequests: string[] = [];
  const apiRequests: string[] = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (!['localhost', '127.0.0.1', '192.168.11.102'].includes(url.hostname)) nonLocalRequests.push(request.url());
    if (/\/api\//.test(url.pathname)) apiRequests.push(request.url());
  });

  await page.goto(publicUrl);
  await page.getByRole('button', { name: 'Préparer ma première visite' }).click();
  await page.getByLabel('Scénario de demande fictive').selectOption('salma');
  const slot = page.getByLabel('Créneau proposé · calendrier fictif uniquement');
  expect(await slot.locator('option').count()).toBeGreaterThan(1);
  await slot.selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Prévisualiser la demande fictive' }).click();
  await expect(page.getByText('Le cabinet ne l’a pas reçue')).toBeVisible();
  const handoff = page.getByRole('link', { name: 'Ouvrir l’aperçu fictif côté réception' });
  const href = await handoff.getAttribute('href');
  expect(href).toBeTruthy();
  const handoffUrl = new URL(href!);
  expect(handoffUrl.hostname).toBe(new URL(publicUrl).hostname);
  expect(handoffUrl.port).toBe('4204');
  expect(handoffUrl.pathname).toBe('/booking-review');
  expect(handoffUrl.searchParams.get('scenario')).toBe('salma');
  expect(href).not.toMatch(/name=|email=|phone=/);
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);

  await page.goto(href!);
  await page.setViewportSize({ width: 320, height: 800 });
  await expect(page.getByRole('heading', { name: 'Aperçu de réception' })).toBeVisible();
  await expect(page.getByRole('article', { name: 'Demande fictive de Salma Alaoui (FICTIF)' })).toBeVisible();
  await expect(page.getByText('Préférence · non confirmée')).toBeVisible();
  await expect(page.getByText(/aucun dossier patient n’est associé/)).toBeVisible();
  await expect(page.getByText(/Aucun formulaire n’a été reçu par le cabinet/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Voir les demandes d’exemple' })).toHaveAttribute('href', '/intake?preview=1');
  await page.getByText('À propos de ce scénario', { exact: true }).click();
  await expect(page.getByText(/les horaires, ressources et durées sont des exemples/)).toBeVisible();
  await page.getByText('À propos de ce scénario', { exact: true }).click();
  const reviewButton = page.locator('.booking-review-actions button');
  await reviewButton.click();
  await expect(reviewButton).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('status')).toContainText('Aucun résultat, dossier, rendez-vous ou événement n’a été enregistré.');
  await expect(page.getByRole('button', { name: 'Réinitialiser l’examen fictif' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Simuler l’examen administratif' })).toBeVisible();

  await page.goto(`${clinicUrl}/booking-review?scenario=other&date=2026-11-02&time=10%3A15&visit=standard-demo&provider=provider-demo-b`);
  await expect(page.locator('.booking-review-invalid')).toContainText('Aucun scénario reconnu');
  await expect(page.getByRole('link', { name: 'Ouvrir les demandes fictives' })).toHaveAttribute('href', '/intake?preview=1');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
  expect(apiRequests).toEqual([]);
  expect(nonLocalRequests).toEqual([]);
});
