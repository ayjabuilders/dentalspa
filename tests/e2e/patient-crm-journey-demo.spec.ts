import { expect, test } from '@playwright/test';

const base = process.env.PATIENT_DEMO_UI_URL ?? 'http://localhost:4204';
const profiles = [
  ['DEMO-001', 'Salma Alaoui'], ['DEMO-002', 'Youssef Benali'], ['DEMO-003', 'Imane El Idrissi'],
  ['DEMO-004', 'Mehdi Amrani'], ['DEMO-005', 'Yasmine Benjelloun'], ['DEMO-006', 'Adam Berrada'],
  ['DEMO-007', 'Nour Idrissi'], ['DEMO-008', 'Omar Bennani'], ['DEMO-009', 'Samira Amrani'], ['DEMO-010', 'Hamza Chraibi'],
] as const;

test('patient CRM demo shows distinct synthetic journeys without network or persistence', async ({ page }) => {
  test.setTimeout(60000); // Visits all ten routes, including development compilation.
  const apiRequests: string[] = [];
  page.on('request', request => { if (request.url().includes('/api/')) apiRequests.push(request.url()); });
  await page.setViewportSize({ width: 320, height: 780 });

  for (const [id, name] of profiles) {
    await page.goto(`${base}/patients/${id}#patient-journey`);
    await expect(page.getByRole('heading', { name: `${name} ·` })).toBeVisible();
    const journey = page.locator('section.patient-journey');
    await expect(journey).toBeVisible();
    await expect(journey.getByText('Scénario fictif')).toBeVisible();
    expect(await journey.locator('ol > li').count()).toBeGreaterThanOrEqual(3);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
  }

  await page.goto(`${base}/patients/DEMO-003#patient-journey`);
  const imaneJourney = page.locator('section.patient-journey');
  await expect(imaneJourney).toContainText('Non vérifié');
  await expect(imaneJourney).toContainText('aucun dossier lié');
  await expect(imaneJourney).toContainText('Aucun rendez-vous');
  await expect(imaneJourney).toContainText('Aucune conversion patient');
  await expect(imaneJourney).toContainText('ne sont pas l’historique de cette personne');
  expect(apiRequests).toEqual([]);
});
