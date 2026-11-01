import { expect, test } from '@playwright/test';

test('public appointment request remains a local fictional preference, never a booking', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const apiRequests: string[] = [];
  page.on('request', request => {
    if (/\/api\//.test(new URL(request.url()).pathname)) apiRequests.push(request.url());
  });

  await page.goto('http://localhost:4202/preview');
  await page.getByRole('button', { name: /Préparer ma première visite/ }).click();
  const demo = page.getByRole('region', { name: 'Demande de rendez-vous fictive' });
  await expect(demo.getByText(/options et durées fictives/)).toBeVisible();
  const steps = demo.getByRole('list', { name: 'Étapes de la demande fictive' });
  await expect(steps.getByRole('listitem').nth(0)).toHaveAttribute('aria-current', 'step');
  await expect(steps.getByRole('listitem').nth(1)).not.toHaveAttribute('aria-current');
  await demo.getByLabel('Scénario de demande fictive').selectOption('salma');
  await expect(demo.getByLabel('Format de démonstration')).toHaveValue('standard-demo');
  await expect(demo.getByLabel('Praticien·ne de démonstration')).toHaveValue('provider-demo-b');
  const resourceBundle = demo.getByLabel('Ressources fictives associées');
  await expect(resourceBundle).toContainText('Salle démo 02');
  await expect(resourceBundle).toContainText('Fauteuil démo 02');
  await expect(resourceBundle).toContainText('Équipe de démo B');
  await expect(resourceBundle).toContainText('Équipement démo 02');
  await expect(resourceBundle).toContainText('Simulation illustrative uniquement');
  const dateInput = demo.getByLabel('Date souhaitée · préférence uniquement');
  const openDate = await dateInput.inputValue();
  const sunday = new Date(`${openDate}T12:00:00Z`);
  sunday.setUTCDate(sunday.getUTCDate() + (7 - sunday.getUTCDay()));
  await dateInput.fill(sunday.toISOString().slice(0, 10));
  await expect(demo.getByText('Aucun créneau fictif pour ces choix.')).toBeVisible();
  await expect(demo.getByLabel('Créneau proposé · calendrier fictif uniquement')).toBeDisabled();
  const alternativeDate = demo.getByLabel('Date alternative souhaitée · aperçu fictif');
  const waitlistButton = demo.getByRole('button', { name: 'Préparer une préférence d’attente fictive' });
  await expect(waitlistButton).toBeDisabled();
  await alternativeDate.fill(sunday.toISOString().slice(0, 10));
  await expect(waitlistButton).toBeDisabled();
  await expect(demo.getByRole('status').filter({ hasText: 'Choisissez un autre jour d’ouverture' })).toBeVisible();
  await alternativeDate.fill(openDate);
  await expect(waitlistButton).toBeEnabled();
  await waitlistButton.click();
  await expect(demo.getByRole('status').last()).toContainText('Préférence alternative fictive préparée · non transmise');
  await expect(demo.getByRole('status').last()).toContainText(`autre jour souhaité : ${openDate}`);
  await expect(demo.getByRole('status').last()).toContainText('Vous n’êtes inscrit à aucune liste d’attente réelle');
  await expect(demo.getByRole('status').last()).toContainText('aucune priorité et aucune notification ne sont créés');
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
  await dateInput.fill(openDate);
  await expect(demo.getByRole('button', { name: 'Préparer une préférence d’attente fictive' })).toHaveCount(0);
  await demo.getByLabel('Créneau proposé · calendrier fictif uniquement').selectOption('10:30');
  await demo.getByRole('button', { name: 'Prévisualiser la demande fictive' }).click();
  await expect(steps.getByRole('listitem').nth(1)).toHaveAttribute('aria-current', 'step');
  await expect(demo.getByRole('status')).toContainText('Demande fictive de Salma Alaoui (FICTIF) préparée pour la démonstration.');
  await expect(demo.getByRole('status')).toContainText('Ce créneau n’existe que dans le scénario fictif');
  expect(apiRequests).toEqual([]);
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('public booking exposes distinct fictional Moroccan scenarios without saving or sending them', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  const apiRequests: string[] = [];
  page.on('request', request => {
    if (/\/api\//.test(new URL(request.url()).pathname)) apiRequests.push(request.url());
  });

  await page.goto('http://localhost:4202/preview');
  await page.getByRole('button', { name: /Préparer ma première visite/ }).click();
  const demo = page.getByRole('region', { name: 'Demande de rendez-vous fictive' });
  const scenario = demo.getByLabel('Scénario de demande fictive');

  await expect(scenario.locator('option')).toHaveText([
    'Saisir un exemple manuellement',
    'Salma Alaoui · créneau exemple',
    'Youssef El Mansouri · après-midi',
    'Imane Berrada · aucun créneau',
  ]);
  await scenario.selectOption('youssef');
  await expect(demo.getByLabel('Nom fictif')).toHaveValue('Youssef El Mansouri (FICTIF)');
  await expect(demo.getByLabel('Format de démonstration')).toHaveValue('short-demo');
  await expect(demo.getByLabel('Moment souhaité · préférence uniquement')).toHaveValue('afternoon');
  await expect(demo.getByLabel('Créneau proposé · calendrier fictif uniquement')).toBeEnabled();

  await scenario.selectOption('imane');
  await expect(demo.getByLabel('Nom fictif')).toHaveValue('Imane Berrada (FICTIF)');
  await expect(demo.getByText('Aucun créneau fictif pour ces choix.')).toBeVisible();
  await expect(demo.getByLabel('Créneau proposé · calendrier fictif uniquement')).toBeDisabled();
  expect(apiRequests).toEqual([]);
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
