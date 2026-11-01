import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const fixture = {
  email: process.env.LOCAL_REMINDER_EMAIL, password: process.env.LOCAL_REMINDER_PASSWORD,
  api: process.env.LOCAL_REMINDER_API, patientId: process.env.LOCAL_REMINDER_PATIENT_ID,
  planId: process.env.LOCAL_REMINDER_PLAN_ID, version: Number(process.env.LOCAL_REMINDER_VERSION ?? '2'),
};
const output = '.local/qa/installment-reminders-native';
const clinicUrl = process.env.LOCAL_REMINDER_CLINIC_URL ?? 'http://localhost:4204';
type ReminderRead = { query: string; afterDue: string | null; afterId: string | null; status: number; count: number; patients: string[]; versions: number[]; nextCursor: { due_on: string; line_id: string } | null };
async function noPageOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

for (const width of [1440, 390, 320]) test(`native reminder search, exact agreement and return at ${width}px`, async ({ page }) => {
  test.skip(!fixture.email || !fixture.password || !fixture.api || !fixture.patientId || !fixture.planId,
    'Run through check-local-invoice-api --payments --installment-allocations --reminder-queue --reminder-browser.');
  mkdirSync(output, { recursive: true });
  await page.setViewportSize({ width, height: width > 1000 ? 1000 : 844 });
  const writes: string[] = [], pageErrors: string[] = [], reads: ReminderRead[] = [], detailReads: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  // Forward browser GETs to the lifecycle-owned native API. No fixture response is fabricated.
  // Session start/renew stays with the clinic server and no token/header/body is logged.
  await page.route('**/api/v1/**', async route => {
    const request = route.request(), url = new URL(request.url());
    if (!['GET', 'OPTIONS'].includes(request.method())) { writes.push(request.method() + ' ' + url.pathname); return route.abort(); }
    const response = await route.fetch({ url: fixture.api + url.pathname + url.search });
    if (url.pathname.endsWith('/finance/installment-reminders') && request.method() === 'GET') {
      const data = response.ok() ? await response.json() : null;
      reads.push({ query: url.searchParams.get('q') ?? '', afterDue: url.searchParams.get('after_due'), afterId: url.searchParams.get('after_id'), status: response.status(), count: data?.items?.length ?? 0, patients: data?.items?.map((item: { patient_id: string }) => item.patient_id) ?? [], versions: data?.items?.map((item: { version: number }) => item.version) ?? [], nextCursor: data?.next_cursor ?? null });
    }
    if (url.pathname === `/api/v1/finance/patients/${fixture.patientId}/installments/${fixture.planId}/versions/${fixture.version}` && response.ok()) detailReads.push(url.pathname);
    await route.fulfill({ response });
  });
  await page.goto(clinicUrl + '/connection?view=finance-reminders');
  await page.getByLabel('Adresse e-mail', { exact: true }).fill(fixture.email!);
  await page.getByLabel('Mot de passe', { exact: true }).fill(fixture.password!);
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  const queue = page.locator('.installment-reminders'), rows = queue.locator('.reminder-list > li');
  await expect(queue.getByRole('heading', { name: 'Échéances à suivre', exact: true })).toBeVisible();
  await expect(rows).toHaveCount(10);
  await expect(rows.first()).toContainText('Yassine QA (FICTIF)');
  expect(reads[0]?.patients.every(id => id !== fixture.patientId)).toBe(true);
  await noPageOverflow(page);
  await page.screenshot({ path: `${output}/queue-unfiltered-${width}.png`, animations: 'disabled' });

  const search = queue.getByLabel('Rechercher un patient', { exact: true });
  await search.fill('Salma');
  await queue.getByRole('button', { name: 'Rechercher', exact: true }).click();
  await expect(rows).toHaveCount(10);
  await expect(rows.first()).toContainText('Salma Alaoui (FICTIF)');
  await expect(queue.locator('.reminder-page-total')).toContainText('cette page');
  await expect(queue.locator('.reminder-page-total')).toContainText('90,00');
  await expect(queue.getByRole('button', { name: 'Page précédente', exact: true })).toBeDisabled();
  await expect(queue.getByRole('button', { name: 'Page suivante', exact: true })).toBeEnabled();
  const firstSearch = reads.find(read => read.query === 'Salma' && !read.afterId)!;
  expect(firstSearch.count).toBe(10); expect(firstSearch.nextCursor).not.toBeNull();
  expect(firstSearch.patients.every(id => id === fixture.patientId)).toBe(true);
  expect(firstSearch.versions.every(version => version === fixture.version)).toBe(true);
  await noPageOverflow(page);
  await page.screenshot({ path: `${output}/queue-search-${width}.png`, animations: 'disabled' });

  await queue.getByRole('button', { name: 'Page suivante', exact: true }).click();
  await expect(rows).toHaveCount(1);
  await expect(queue.locator('.reminder-pagination nav')).toContainText('Page 2');
  await expect(queue.locator('.reminder-page-total')).toContainText('11,00');
  await expect(queue.getByRole('button', { name: 'Page suivante', exact: true })).toBeDisabled();
  await expect(rows.first()).toContainText('Accord v2');
  await expect(rows.first()).toContainText('En retard');
  const last = reads.at(-1)!;
  expect(last.query).toBe('Salma'); expect(last.afterDue).toBe(firstSearch.nextCursor!.due_on); expect(last.afterId).toBe(firstSearch.nextCursor!.line_id);
  expect(last.count).toBe(1); expect(last.patients).toEqual([fixture.patientId]);
  await rows.first().scrollIntoViewIfNeeded();
  await noPageOverflow(page);
  await page.screenshot({ path: `${output}/queue-page2-${width}.png`, animations: 'disabled' });
  if (width < 640) {
    const targets = await queue.locator('button:visible').evaluateAll(elements => elements.map(element => ({ height: element.getBoundingClientRect().height, width: element.getBoundingClientRect().width })));
    expect(targets.every(rect => rect.height >= 44 && rect.width >= 44)).toBe(true);
  }

  await rows.first().getByRole('button', { name: 'Ouvrir l’accord version 2 de Salma Alaoui (FICTIF)', exact: true }).click();
  const agreement = page.getByRole('region', { name: 'Échéanciers du patient', exact: true }).locator('.installment-detail');
  await expect(agreement.getByRole('heading', { name: 'Version 2', exact: true })).toBeVisible();
  await expect(agreement.getByRole('heading', { name: 'Version 2', exact: true })).toBeFocused();
  await expect(agreement).toContainText('Pagination QA');
  await expect(agreement).toContainText('Acceptation enregistrée');
  await expect(agreement).toContainText('101');
  expect(detailReads.length).toBeGreaterThan(0);
  const expectAgreementUrl = async () => {
    await expect.poll(() => {
      const query = new URL(page.url()).searchParams;
      return { view: query.get('view'), patient: query.get('patient'), plan: query.get('plan'), version: query.get('version') };
    }).toEqual({ view: 'patients', patient: fixture.patientId, plan: fixture.planId, version: String(fixture.version) });
  };
  await expectAgreementUrl();
  await noPageOverflow(page);
  await page.screenshot({ path: `${output}/agreement-v2-${width}.png`, animations: 'disabled' });
  if (width === 1440) {
    await page.goBack();
    await expect(rows).toHaveCount(1);
    await expect(search).toHaveValue('Salma');
    await expect(queue.locator('.reminder-pagination nav')).toContainText('Page 2');
    await expect(page.locator('#installment-reminders-title')).toBeFocused();
    expect(reads.at(-1)).toMatchObject({ query: 'Salma', afterId: last.afterId, afterDue: last.afterDue, count: 1 });
    await page.goForward();
    await expectAgreementUrl();
    await expect(agreement.getByRole('heading', { name: 'Version 2', exact: true })).toBeVisible();
    await expect(agreement).toContainText('Pagination QA');
    await expect(agreement).toContainText('Acceptation enregistrée');
    await page.screenshot({ path: `${output}/agreement-browser-forward-${width}.png`, animations: 'disabled' });
  }
  const readsBeforeReturn = reads.length;
  await page.getByRole('button', { name: 'Retour aux échéances', exact: true }).click();
  await expect(rows).toHaveCount(1);
  await expect(search).toHaveValue('Salma');
  await expect(queue.locator('.reminder-pagination nav')).toContainText('Page 2');
  await expect(page.locator('#installment-reminders-title')).toBeFocused();
  expect(reads.length).toBeGreaterThan(readsBeforeReturn);
  expect(reads.at(-1)).toMatchObject({ query: 'Salma', afterId: last.afterId, afterDue: last.afterDue, count: 1 });
  await noPageOverflow(page);
  await page.screenshot({ path: `${output}/queue-return-${width}.png`, animations: 'disabled' });

  await queue.getByRole('button', { name: 'Page précédente', exact: true }).click();
  await expect(rows).toHaveCount(10);
  await expect(queue.locator('.reminder-pagination nav')).toContainText('Page 1');
  await search.fill('QA-1');
  await queue.getByRole('button', { name: 'Rechercher', exact: true }).click();
  await expect.poll(() => reads.at(-1)?.query).toBe('QA-1');
  await expect(rows).toHaveCount(10);
  expect(reads.at(-1)?.afterId).toBeNull();
  expect(reads.at(-1)?.patients.every(id => id === fixture.patientId)).toBe(true);
  await search.fill('%_'); await queue.getByRole('button', { name: 'Rechercher', exact: true }).click();
  await expect(queue.getByRole('heading', { name: 'Aucune échéance pour cette recherche', exact: true })).toBeVisible();
  await expect(rows).toHaveCount(0);
  await noPageOverflow(page);
  await page.screenshot({ path: `${output}/queue-empty-literal-${width}.png`, animations: 'disabled' });
  if (width === 1440) {
    await search.fill('Salma');
    await queue.getByRole('button', { name: 'Rechercher', exact: true }).click();
    await expect(rows).toHaveCount(10);
    await queue.getByRole('button', { name: 'Page suivante', exact: true }).click();
    await expect(rows).toHaveCount(1);
    await rows.first().getByRole('button', { name: 'Ouvrir l’accord version 2 de Salma Alaoui (FICTIF)', exact: true }).click();
    await expectAgreementUrl();
    await expect(agreement.getByRole('heading', { name: 'Version 2', exact: true })).toBeVisible();
    const detailsBeforeReload = detailReads.length;
    await page.reload();
    await expectAgreementUrl();
    await expect(agreement.getByRole('heading', { name: 'Version 2', exact: true })).toBeVisible();
    await expect(agreement).toContainText('Pagination QA');
    await expect(agreement).toContainText('Acceptation enregistrée');
    await expect(page.getByRole('button', { name: 'Se connecter', exact: true })).toHaveCount(0);
    expect(detailReads.length).toBeGreaterThan(detailsBeforeReload);
    await noPageOverflow(page);
    await page.screenshot({ path: `${output}/agreement-session-reload-${width}.png`, animations: 'disabled' });
  }
  expect(writes).toEqual([]); expect(pageErrors).toEqual([]);
  writeFileSync(`${output}/evidence-${width}.json`, JSON.stringify({ width, nativeApi: true, fabricatedResponses: false, requestMethods: ['GET'], exactAgreementVersion: fixture.version, exactAgreementUrl: true, desktopDeepLink: width === 1440 ? { browserBackQueueState: true, browserForwardExactVersion: true, reloadSessionRestored: true, reloadExactVersion: true } : null, searchAcrossAllPatients: true, returnSearchAndPage: true, focusRestored: true, noOverflow: true, reads, detailReads, writes, pageErrors }, null, 2));
});
