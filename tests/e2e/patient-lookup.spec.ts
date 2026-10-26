import { expect, test, type Page, type Route } from '@playwright/test';
import { createPatientLookupTransport, PatientLookupError } from '../../apps/clinic-os/components/patient-lookup/transport';

const base = process.env.PATIENT_LOOKUP_UI_URL ?? 'http://localhost:4200';
const userId = '10000000-0000-4000-8000-000000000001';
const clinicId = '10000000-0000-4000-8000-000000000002';
const item = { id: '10000000-0000-4000-8000-000000000003', clinic_id: clinicId, reference: 'DEMO-001', display_name: 'Lina Exemple', match_basis: 'reference_exact' as const };
const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

async function verifiedLookup(page: Page, handler: (route: Route) => Promise<void>, expirySeconds = 3600) {
  const calls: { url: string; method: string; body: unknown }[] = [];
  await page.route('https://lookup-auth.example.invalid/**', async route => {
    if (route.request().method() === 'OPTIONS') { await route.fulfill({ status: 204, headers }); return; }
    if (route.request().url().includes('/logout')) { await route.fulfill({ status: 204, headers }); return; }
    await route.fulfill({ status: 200, headers, json: { access_token: 'synthetic-access-token', token_type: 'bearer', refresh_token: 'synthetic-refresh-token', expires_in: expirySeconds, expires_at: Math.floor(Date.now() / 1000) + expirySeconds, user: { id: userId, aud: 'authenticated', role: 'authenticated', email: 'staff@example.invalid', app_metadata: { provider: 'email' }, user_metadata: {}, created_at: '2026-10-26T10:00:00Z' } } });
  });
  await page.route('**/api/v1/**', async route => {
    if (route.request().method() === 'OPTIONS') { await route.fulfill({ status: 204, headers }); return; }
    calls.push({ url: route.request().url(), method: route.request().method(), body: route.request().postDataJSON() });
    if (route.request().url().endsWith('/me/workspace')) await route.fulfill({ status: 200, headers, json: { user_id: userId, clinic_id: clinicId, roles: ['reception'], mode: 'connected' } });
    else if (route.request().url().endsWith('/patients/lookup')) await handler(route);
    else await route.fulfill({ status: 500, headers, json: { message: 'Unexpected request' } });
  });
  await page.goto(`${base}/connection`);
  await page.getByLabel('Adresse e-mail', { exact: true }).fill('staff@example.invalid');
  await page.getByLabel('Mot de passe', { exact: true }).fill('synthetic-password');
  await page.getByLabel('Identifiant du cabinet de développement').fill(clinicId);
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Accès au cabinet vérifié' })).toBeVisible();
  expect(calls).toHaveLength(1);
  await page.getByRole('button', { name: 'Rechercher un patient du cabinet' }).click();
  await expect(page.getByRole('heading', { name: 'Rechercher un patient', exact: true })).toBeVisible();
  expect(calls).toHaveLength(1);
  return calls;
}

test.describe('verified patient lookup browser flow', () => {
  test.skip(process.env.PATIENT_LOOKUP_CONFIGURED !== '1', 'Requires isolated build with synthetic Supabase URL https://lookup-auth.example.invalid and a synthetic public key.');

  test('explicit search, preview only, edit clearing and no URL/storage leakage', async ({ page }) => {
    const calls = await verifiedLookup(page, async route => { await route.fulfill({ status: 200, headers, json: { items: [item], truncated: false } }); });
    await expect(page.getByRole('button', { name: 'Rechercher', exact: true })).toBeDisabled();
    await page.getByRole('radio', { name: /Référence exacte/ }).check();
    await page.getByLabel('Référence complète', { exact: true }).fill('  DEMO-001  ');
    expect(calls).toHaveLength(1);
    await page.getByRole('button', { name: 'Rechercher', exact: true }).click();
    await expect(page.locator('.lookup-result-list li')).toHaveCount(1);
    expect(calls[1]).toMatchObject({ method: 'POST', body: { mode: 'reference_exact', query: 'DEMO-001' } });
    expect(calls[1]!.url).not.toContain('DEMO-001');
    await expect(page.getByRole('complementary', { name: 'Aperçu du résultat consulté' })).toContainText('Aucun résultat n’est retenu automatiquement');
    await page.getByRole('button', { name: 'Voir l’aperçu de Lina Exemple' }).click();
    const preview = page.getByRole('complementary', { name: 'Aperçu du résultat consulté' });
    await expect(preview.getByRole('heading', { name: 'Lina Exemple' })).toBeVisible();
    await expect(preview).toContainText('Identité non vérifiée');
    await page.getByLabel('Référence complète', { exact: true }).fill('DEMO-002');
    await expect(page.locator('.lookup-result-list li')).toHaveCount(0);
    await expect(preview).not.toContainText('Lina Exemple');
    expect(calls).toHaveLength(2);
    expect(await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage }, href: location.href }))).not.toMatch(/DEMO-00|Lina|synthetic-access-token/);
    await page.getByRole('button', { name: 'Se déconnecter', exact: true }).first().click();
    await expect(page.locator('.patient-lookup')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Se connecter', exact: true })).toBeVisible();
  });

  test('name prefix preserves literal input, distinguishes truncation and empty results', async ({ page }) => {
    let count = 0;
    await verifiedLookup(page, async route => {
      count++;
      const items = Array.from({ length: 20 }, (_, index) => ({ ...item, id: `10000000-0000-4000-8000-${String(index + 10).padStart(12, '0')}`, reference: `REF-${index}`, display_name: `Élise Exemple ${index}`, match_basis: 'name_prefix' }));
      await route.fulfill({ status: 200, headers, json: { items: count === 1 ? items : [], truncated: count === 1 } });
      expect(route.request().postDataJSON()).toEqual({ mode: 'name_prefix', query: count === 1 ? 'Él' : 'Autre' });
    });
    await page.getByRole('radio', { name: /Début du nom/ }).check();
    await page.getByLabel('Début du nom', { exact: true }).fill('Él');
    await page.getByRole('button', { name: 'Rechercher', exact: true }).click();
    await expect(page.getByText('Résultats incomplets : affinez votre recherche.')).toBeVisible();
    await expect(page.getByText('Suggestions de recherche · identité non vérifiée')).toBeVisible();
    await expect(page.locator('.lookup-result-list li')).toHaveCount(20);
    await page.getByLabel('Début du nom', { exact: true }).fill('Autre');
    await page.getByRole('button', { name: 'Rechercher', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Aucun résultat pour cette recherche.' })).toBeVisible();
    await expect(page.getByText('Ce résultat ne prouve pas l’absence', { exact: false })).toBeVisible();
  });

  test('pending searches are aborted on edit and late responses cannot restore prior results', async ({ page }) => {
    let delayed: Route | undefined;
    await verifiedLookup(page, async route => {
      if (route.request().postDataJSON().query === 'DEMO-001') { delayed = route; return; }
      await route.fulfill({ status: 200, headers, json: { items: [], truncated: false } });
    });
    await page.getByRole('radio', { name: /Référence exacte/ }).check();
    await page.getByLabel('Référence complète', { exact: true }).fill('DEMO-001');
    await page.getByRole('button', { name: 'Rechercher', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Recherche dans votre cabinet…' })).toBeVisible();
    await page.getByLabel('Référence complète', { exact: true }).fill('OTHER');
    await page.getByRole('button', { name: 'Rechercher', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Aucun résultat pour cette recherche.' })).toBeVisible();
    await delayed?.fulfill({ status: 200, headers, json: { items: [item], truncated: false } }).catch(() => undefined);
    await expect(page.locator('.lookup-result-list li')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Aucun résultat pour cette recherche.' })).toBeVisible();
  });

  test('denied, unavailable retry and expired session clear connected data', async ({ page }) => {
    let count = 0;
    await verifiedLookup(page, async route => { count++; await route.fulfill({ status: count === 1 ? 403 : count === 2 ? 503 : 401, headers, json: { message: 'raw provider error must never be rendered' } }); });
    await page.getByRole('radio', { name: /Référence exacte/ }).check();
    await page.getByLabel('Référence complète', { exact: true }).fill('DEMO-001');
    await page.getByRole('button', { name: 'Rechercher', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Accès non autorisé' })).toBeVisible();
    await page.getByLabel('Référence complète', { exact: true }).fill('DEMO-002');
    await page.getByRole('button', { name: 'Rechercher', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Recherche indisponible' })).toBeVisible();
    await expect(page.getByText('raw provider error must never be rendered')).toHaveCount(0);
    await page.getByRole('button', { name: 'Réessayer la recherche' }).click();
    await expect(page.locator('.patient-lookup')).toHaveCount(0);
    await expect(page.getByText('Votre session a expiré. La recherche et ses résultats ont été effacés.')).toBeVisible();
  });

  test('offline clears results and mobile remains within the viewport', async ({ page, context }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await verifiedLookup(page, async route => { await route.fulfill({ status: 200, headers, json: { items: [item], truncated: false } }); });
    await page.getByRole('radio', { name: /Référence exacte/ }).check();
    await page.getByLabel('Référence complète', { exact: true }).fill('DEMO-001');
    await page.getByRole('button', { name: 'Rechercher', exact: true }).click();
    await expect(page.locator('.lookup-result-list li')).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await context.setOffline(true);
    await expect(page.locator('.lookup-result-list li')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Rechercher', exact: true })).toBeDisabled();
    await context.setOffline(false);
    await expect(page.getByRole('button', { name: 'Rechercher', exact: true })).toBeEnabled();
    await expect(page.locator('.lookup-result-list li')).toHaveCount(0);
  });

  test('session deadline unmounts the lookup and clears its query and results', async ({ page }) => {
    await page.clock.install();
    await verifiedLookup(page, async route => { await route.fulfill({ status: 200, headers, json: { items: [item], truncated: false } }); });
    await page.getByRole('radio', { name: /Référence exacte/ }).check();
    await page.getByLabel('Référence complète', { exact: true }).fill('DEMO-001');
    await page.getByRole('button', { name: 'Rechercher', exact: true }).click();
    await expect(page.locator('.lookup-result-list li')).toHaveCount(1);
    await page.clock.fastForward(3_601_000);
    await expect(page.locator('.patient-lookup')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Se connecter', exact: true })).toBeVisible();
    await expect(page.getByText('Votre session a expiré. Les recherches et les données consultées ont été effacées.')).toBeVisible();
  });
});

test('patient lookup transport protects body-only queries, clinic and response shape', async () => {
  const sent: { url: string; init?: RequestInit }[] = [];
  const transport = createPatientLookupTransport({ api: 'https://example.invalid', token: 'synthetic-token', clinicId, fetcher: async (url, init) => { sent.push({ url: String(url), init }); return Response.json({ items: [item], truncated: false }); } });
  await expect(transport.lookup({ mode: 'reference_exact', query: ' DEMO-001 ' })).resolves.toEqual({ items: [item], truncated: false });
  expect(sent[0]!.url).toBe('https://example.invalid/api/v1/patients/lookup');
  expect(sent[0]!.init).toMatchObject({ method: 'POST', cache: 'no-store', credentials: 'omit', body: JSON.stringify({ mode: 'reference_exact', query: 'DEMO-001' }) });
  const foreign = createPatientLookupTransport({ api: 'https://example.invalid', token: 'synthetic-token', clinicId, fetcher: async () => Response.json({ items: [{ ...item, clinic_id: userId }], truncated: false }) });
  await expect(foreign.lookup({ mode: 'reference_exact', query: 'DEMO-001' })).rejects.toMatchObject({ kind: 'unavailable' });
  const extra = createPatientLookupTransport({ api: 'https://example.invalid', token: 'synthetic-token', clinicId, fetcher: async () => Response.json({ items: [{ ...item, email: 'never@example.invalid' }], truncated: false }) });
  await expect(extra.lookup({ mode: 'reference_exact', query: 'DEMO-001' })).rejects.toMatchObject({ kind: 'unavailable' });
  transport.dispose();
  await expect(transport.lookup({ mode: 'reference_exact', query: 'DEMO-001' })).rejects.toEqual(new PatientLookupError('expired'));
  expect(sent).toHaveLength(1);
});

test('disposed lookup ignores a late response even when fetch does not honor abort', async () => {
  let release: ((response: Response) => void) | undefined;
  const transport = createPatientLookupTransport({ api: 'https://example.invalid', token: 'synthetic-token', clinicId, fetcher: async () => new Promise<Response>(resolve => { release = resolve; }) });
  const pending = transport.lookup({ mode: 'reference_exact', query: 'DEMO-001' });
  transport.dispose(); release!(Response.json({ items: [item], truncated: false }));
  await expect(pending).rejects.toMatchObject({ kind: 'expired' });
});
