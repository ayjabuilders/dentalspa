import { expect, test } from '@playwright/test';

const financeDemoUrl = process.env.FINANCE_DEMO_UI_URL ?? 'http://localhost:4204';

test('local finance walkthrough uses fictional amounts only and keeps payment state ephemeral', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  const apiRequests: string[] = [];
  page.on('request', request => {
    if (/\/api\//.test(new URL(request.url()).pathname)) apiRequests.push(request.url());
  });

  await page.goto(`${financeDemoUrl}/business`);
  await expect(page.getByRole('heading', { name: 'Devis & règlements' })).toBeVisible();
  await expect(page.getByText('Simulation fictive · sans paiement réel')).toBeVisible();
  await page.getByText('Limites de l’aperçu', { exact: true }).click();
  await expect(page.getByText('Tarifs d’exemple uniquement; aucune facture, dette ou opération n’est créée.')).toBeVisible();
  await page.getByText('Limites de l’aperçu', { exact: true }).click();
  await expect(page.getByText('Prestation d’exemple A')).toBeVisible();
  await expect(page.getByText('Prestation d’exemple B')).toBeVisible();

  const calculation = page.locator('.finance-demo-calculation');
  await page.getByText('Scénario de calcul complet · chiffres fictifs').click();
  await expect(calculation).toContainText('total :');
  await expect(calculation).toContainText('solde total');
  await expect(calculation).toContainText('Nouvel essai idempotent compté 1 fois');
  await expect(calculation).toContainText('écart');
  await expect(calculation).toContainText('Aucun devis, reçu, paiement ou solde n’est créé.');

  const storageBefore = await page.evaluate(() => JSON.stringify(Object.keys(localStorage).sort()));
  const total = page.locator('.finance-demo-total strong');
  const digits = (value: string | null) => (value ?? '').replace(/\D/g, '');
  expect(digits(await total.textContent())).toBe('1850');

  await page.getByRole('button', { name: 'Simuler un versement' }).first().click();
  await page.getByLabel('Montant fictif · MAD').fill('500');
  await page.getByLabel('Moyen de règlement fictif').selectOption('bank-transfer');
  await page.getByRole('button', { name: 'Simuler le versement' }).click();
  await expect(page.getByText('En attente · non compté')).toBeVisible();
  expect(digits(await page.locator('.finance-demo-due strong').textContent())).toBe('1850');
  expect(digits(await page.locator('.finance-demo-amounts > div:nth-child(3) strong').textContent())).toBe('500');

  await page.getByLabel('Montant fictif · MAD').fill('300');
  await page.getByLabel('Moyen de règlement fictif').selectOption('cash');
  await page.getByRole('button', { name: 'Simuler le versement' }).click();
  await expect(page.getByText('Simulé · non encaissé')).toBeVisible();
  expect(digits(await page.locator('.finance-demo-due strong').textContent())).toBe('1550');
  await page.getByRole('button', { name: 'Prévisualiser le reçu fictif' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Reçu de démonstration · non comptable' })).toContainText('Seuls les versements simulés apparaissent');
  expect(await page.evaluate(() => JSON.stringify(Object.keys(localStorage).sort()))).toBe(storageBefore);

  await page.getByLabel('1 · Choisir un scénario fictif').selectOption('DEMO-002');
  await page.getByRole('button', { name: 'Simuler un versement' }).first().click();
  expect(digits(await total.textContent())).toBe('1350');
  expect(digits(await page.locator('.finance-demo-amounts > div:nth-child(2) strong').textContent())).toBe('0');
  await page.getByLabel('Montant fictif · MAD').fill('450');
  await page.getByRole('button', { name: 'Simuler le versement' }).click();
  expect(digits(await page.locator('.finance-demo-due strong').textContent())).toBe('900');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(apiRequests).toEqual([]);

  await page.reload();
  await expect(page.getByLabel('1 · Choisir un scénario fictif')).toHaveValue('DEMO-001');
  await page.getByRole('button', { name: 'Simuler un versement' }).first().click();
  expect(digits(await page.locator('.finance-demo-amounts > div:nth-child(2) strong').textContent())).toBe('0');
  await expect(page.getByText('Reçu de démonstration · non comptable')).toHaveCount(0);
  expect(apiRequests).toEqual([]);
});

test('Finance preserves centimes and supports keyboard submission with a readable history', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${financeDemoUrl}/business`);
  await expect(page.locator('#workspace > div').filter({ has: page.locator('.finance-demo') })).toHaveCSS('opacity', '1');
  await expect(page.locator('.finance-demo-about')).not.toHaveAttribute('open', '');
  await page.screenshot({ path: testInfo.outputPath('finance-quote-desktop.png'), fullPage: true });
  await page.getByRole('button', { name: 'Continuer vers la simulation' }).click();
  await expect(page.getByText('Aucun versement simulé pour ce profil.')).toBeVisible();
  await page.getByLabel('Montant fictif · MAD').fill('12,50');
  await page.getByLabel('Montant fictif · MAD').press('Enter');
  const expected = new Intl.NumberFormat('fr-MA', { style: 'currency', currency: 'MAD', currencyDisplay: 'code', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(12.5);
  await expect(page.locator('.finance-demo-amounts > div:nth-child(2) strong')).toHaveText(expected);
  await expect(page.locator('.finance-demo-events b')).toHaveText(expected);
  await expect(page.getByText('Simulé · non encaissé')).toBeVisible();
  await page.getByLabel('Montant fictif · MAD').fill('abc');
  await page.getByLabel('Montant fictif · MAD').press('Enter');
  await expect(page.locator('#finance-amount-error[role="alert"]')).toContainText('Saisissez un montant positif en MAD');
  await expect(page.locator('.finance-demo-events li')).toHaveCount(1);
  await page.getByLabel('Montant fictif · MAD').fill('300');
  await page.screenshot({ path: testInfo.outputPath('finance-payment-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('finance-payment-mobile.png'), fullPage: true });
  await page.getByRole('button', { name: 'Relire le devis' }).click();
  await page.screenshot({ path: testInfo.outputPath('finance-quote-mobile.png'), fullPage: true });
});

test('Finance starts with a readable quote-first step and advances by keyboard without overflow', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(`${financeDemoUrl}/business`);
  await expect(page.getByRole('heading', { name: 'Devis & règlements' })).toBeVisible();
  await expect(page.getByText('Simulation fictive · sans paiement réel')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Relire le devis' })).toHaveAttribute('aria-current', 'step');
  const continueButton = page.getByRole('button', { name: 'Continuer vers la simulation' });
  const box = await continueButton.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y + box!.height).toBeLessThanOrEqual(720);
  await continueButton.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Simuler un versement' }).first()).toHaveAttribute('aria-current', 'step');
  await expect(page.getByRole('heading', { name: 'Règlements', exact: true })).toBeFocused();
  await expect(page.getByLabel('Montant fictif · MAD')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Relire le devis' }).click();
  await expect(page.getByRole('button', { name: 'Relire le devis' })).toBeVisible();
  const mobileContinue = await continueButton.boundingBox();
  expect(mobileContinue).not.toBeNull();
  expect(mobileContinue!.y + mobileContinue!.height).toBeLessThanOrEqual(844);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('guided finance fixture steps through separate balances without writing or sending anything', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  const apiRequests: string[] = [];
  page.on('request', request => {
    if (/\/api\//.test(new URL(request.url()).pathname)) apiRequests.push(request.url());
  });
  await page.goto(`${financeDemoUrl}/business`);
  await page.getByText('Scénario de calcul complet · chiffres fictifs').click();
  await page.getByRole('button', { name: 'Parcourir les étapes' }).click();

  const step = page.locator('.finance-demo-walkthrough-current');
  const expected: [string, string][] = [
    ['Devis fictif préparé', '900'],
    ['Acompte simulé', '600'],
    ['Échéances illustratives', '300'],
    ['Versement partiel simulé', '400'],
    ['Nouvel essai idempotent', '1 reprise ignorée'],
    ['Remboursement distinct', '500'],
    ['Avoir distinct', '400'],
    ['Écart de caisse à expliquer', '-10'],
  ];
  const progress = page.getByRole('progressbar', { name: 'Progression du parcours financier fictif' });
  for (let index = 0; index < expected.length; index++) {
    await expect(step).toHaveAttribute('aria-label', `Étape ${index + 1} sur ${expected.length}`);
    await expect(progress).toHaveAttribute('aria-valuenow', String(index + 1));
    await expect(progress).toHaveAttribute('aria-valuetext', `Étape ${index + 1} sur ${expected.length}`);
    await expect(step.getByRole('heading', { name: expected[index]![0] })).toBeVisible();
    await expect(step).toContainText(expected[index]![1]);
    if (index < expected.length - 1) await page.getByRole('button', { name: 'Étape suivante' }).click();
  }

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
  expect(apiRequests).toEqual([]);
  await page.getByRole('button', { name: 'Terminer le parcours' }).click();
  await expect(page.getByRole('button', { name: 'Parcourir les étapes' })).toBeVisible();
  await page.reload();
  await page.getByText('Scénario de calcul complet · chiffres fictifs').click();
  await expect(page.getByRole('button', { name: 'Parcourir les étapes' })).toBeVisible();
  expect(apiRequests).toEqual([]);
});
