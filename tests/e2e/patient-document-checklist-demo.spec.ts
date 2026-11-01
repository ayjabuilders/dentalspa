import { expect, test } from '@playwright/test';

const base = process.env.PATIENT_DEMO_UI_URL ?? 'http://localhost:4204';

test('manual document checklist preview is responsive, session-only and never uploads or stores files', async ({ page }) => {
  const apiRequests: string[] = [];
  page.on('request', request => { if (request.url().includes('/api/')) apiRequests.push(request.url()); });
  await page.setViewportSize({ width: 320, height: 780 });
  await page.goto(`${base}/patients/DEMO-004#patient-checklist`);

  const checklist = page.getByRole('region', { name: 'Checklist documentaire' });
  await expect(checklist).toBeVisible();
  await expect(checklist.getByText(/Exemple de statuts administratifs/)).toBeVisible();
  const status = checklist.getByRole('combobox', { name: 'Consentement administratif · statut de démonstration' });
  await expect(status.locator('option')).toHaveCount(5);
  await status.selectOption('missing');
  await expect(checklist.getByRole('status')).toHaveText('Aperçu modifié · non enregistré');
  await expect(checklist).toContainText('Aucun formulaire, calcul, dépôt de demande ou résultat assureur.');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);

  await page.reload();
  await expect(page.getByRole('region', { name: 'Checklist documentaire' }).getByRole('combobox', { name: 'Consentement administratif · statut de démonstration' })).toHaveValue('received');
  expect(apiRequests).toEqual([]);
});
