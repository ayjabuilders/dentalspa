import { expect, test } from '@playwright/test';

const base = process.env.PATIENT_DEMO_UI_URL ?? 'http://localhost:4204';
const destinations = [
  ['Vue d’ensemble', 'patient-overview'], ['Documents', 'patient-checklist'],
  ['Parcours', 'patient-journey'], ['Dossier & échanges', 'patient-records'],
] as const;

test('directory opens the selected patient and returns to the same selection', async ({ page }) => {
  await page.goto(`${base}/patients?preview=1`);
  await page.getByRole('button', { name: /Mehdi Amrani/ }).click();
  await expect(page.getByRole('link', { name: 'Voir la fiche patient', exact: true })).toHaveAttribute('href', '/patients/DEMO-004');
  await page.getByRole('link', { name: 'Voir la fiche patient', exact: true }).click();
  await expect(page).toHaveURL(/\/patients\/DEMO-004$/, { timeout: 15000 });
  await expect(page.locator('#patient-profile-title')).toHaveText('Mehdi Amrani');
  await expect(page.getByRole('heading', { name: 'Visite du scénario', exact: true })).toBeInViewport();
  await page.getByRole('link', { name: 'Tous les patients', exact: true }).click();
  await expect(page.getByRole('button', { name: /Mehdi Amrani/ })).toHaveAttribute('aria-pressed', 'true');
});

test('patient tabs display exactly one panel without losing identity or local document changes', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${base}/patients/DEMO-001`);
  const tabs = page.getByRole('tablist', { name: 'Sections de la fiche patient' });
  await expect(tabs).toBeVisible();
  await expect(page.getByRole('tabpanel')).toHaveCount(1);
  await expect(page.getByRole('tabpanel', { includeHidden: true })).toHaveCount(4);
  await expect(page.getByRole('heading', { name: 'Checklist documentaire' })).toHaveCount(0);
  await expect(page.getByTestId('patient-documents-to-review')).toHaveText('2');
  await expect(page.locator('#workspace > div').last()).toHaveCSS('opacity', '1');
  await page.screenshot({ path: testInfo.outputPath('patient-tabs-overview.png') });
  for (const [label, id] of destinations) {
    await tabs.getByRole('tab', { name: label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`#${id}$`));
    await expect(page.getByRole('tabpanel')).toHaveCount(1);
    await expect(page.getByRole('tabpanel', { name: label, exact: true })).toBeVisible();
    await expect(page.getByRole('tab', { name: label, exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#patient-profile-title')).toBeInViewport();
  }
  await tabs.getByRole('tab', { name: 'Documents', exact: true }).click();
  const documentStatus = page.getByRole('combobox', { name: 'Consentement administratif · statut de démonstration' });
  await documentStatus.selectOption('missing');
  await page.screenshot({ path: testInfo.outputPath('patient-tabs-documents.png') });
  await tabs.getByRole('tab', { name: 'Parcours', exact: true }).click();
  await expect(documentStatus).toHaveCount(0);
  await expect(page.getByText(/ne sont pas l’historique de cette personne/)).toBeVisible();
  await tabs.getByRole('tab', { name: 'Documents', exact: true }).click();
  await expect(documentStatus).toHaveValue('missing');
  await tabs.getByRole('tab', { name: 'Vue d’ensemble', exact: true }).click();
  await expect(page.getByTestId('patient-documents-to-review')).toHaveText('3');
  await page.getByRole('button', { name: 'Documents : 3 éléments à revoir. Ouvrir la checklist', exact: true }).click();
  await expect(page.getByRole('tabpanel', { name: 'Documents', exact: true })).toBeVisible();
  await tabs.getByRole('tab', { name: 'Vue d’ensemble', exact: true }).click();
  await page.getByRole('button', { name: 'Voir la prochaine étape dans le parcours', exact: true }).click();
  await expect(page.getByRole('tabpanel', { name: 'Parcours', exact: true })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.length + localStorage.length)).toBe(0);
  await tabs.getByRole('tab', { name: 'Vue d’ensemble', exact: true }).click();
  await page.getByRole('button', { name: 'Activer le thème sombre', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.screenshot({ path: testInfo.outputPath('patient-tabs-dark.png') });
});

test('patient section deep link and browser history restore the selected panel', async ({ page }) => {
  await page.goto(`${base}/patients/DEMO-004#patient-checklist`);
  await expect(page.getByRole('tab', { name: 'Documents', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel', { name: 'Documents', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Parcours', exact: true }).click();
  await page.goBack();
  await expect(page.getByRole('tab', { name: 'Documents', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.reload();
  await expect(page.getByRole('tabpanel')).toHaveCount(1);
  await expect(page.getByRole('tabpanel', { name: 'Documents', exact: true })).toBeVisible();
  await page.goto(`${base}/patients/DEMO-004#patient-clinical`);
  await expect(page.getByRole('tabpanel', { name: 'Dossier & échanges', exact: true })).toBeVisible();
});

for (const width of [320, 390]) {
  test(`patient tabs support arrow Home End navigation without overflow at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    if (width === 390) await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`${base}/patients/DEMO-001`);
    const overview = page.getByRole('tab', { name: 'Vue d’ensemble', exact: true });
    await overview.focus();
    await page.keyboard.press('ArrowRight');
    const documents = page.getByRole('tab', { name: 'Documents', exact: true });
    await expect(documents).toBeFocused();
    await expect(documents).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tabpanel')).toHaveCount(1);
    await page.keyboard.press('End');
    await expect(page.getByRole('tab', { name: 'Dossier & échanges', exact: true })).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(overview).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByRole('tab', { name: 'Dossier & échanges', exact: true })).toBeFocused();
    await page.keyboard.press('Home');
    await expect(overview).toBeFocused();
    await expect(page.locator('#workspace > div').last()).toHaveCSS('opacity', '1');
    await page.screenshot({ path: testInfo.outputPath(`patient-tabs-${width}.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
