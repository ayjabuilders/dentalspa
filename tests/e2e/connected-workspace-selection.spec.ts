import { expect, test, type Page } from '@playwright/test';

const base = process.env.WORKSPACE_SELECTION_UI_URL ?? 'http://localhost:4204';
const userId = '10000000-0000-4000-8000-000000000081';
const clinicA = '10000000-0000-4000-8000-000000000082';
const clinicB = '10000000-0000-4000-8000-000000000083';
const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Cache-Control': 'no-store' };
const choices = [
  { clinic_id: clinicA, clinic_name: 'Cabinet Alpha', roles: ['reception'] },
  { clinic_id: clinicB, clinic_name: 'Cabinet Beta', roles: ['manager'] },
];

async function signIn(page: Page, memberships: typeof choices, revoked: string[] = []) {
  const workspaceRequests: { path: string; method: string; clinic: string | undefined }[] = [];
  await page.route('https://workspace-auth.example.invalid/**', async route => {
    if (route.request().method() === 'OPTIONS' || route.request().url().includes('/logout')) return route.fulfill({ status: 204, headers });
    return route.fulfill({ status: 200, headers, json: {
      access_token: 'synthetic-workspace-token', token_type: 'bearer', refresh_token: 'synthetic-workspace-refresh', expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: userId, aud: 'authenticated', role: 'authenticated', email: 'staff@example.invalid', app_metadata: {}, user_metadata: {}, created_at: '2026-10-29T09:00:00Z' },
    } });
  });
  await page.route('**/api/v1/**', async route => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const url = new URL(route.request().url());
    const clinic = route.request().headers()['x-clinic-id'];
    workspaceRequests.push({ path: url.pathname, method: route.request().method(), clinic });
    if (url.pathname.endsWith('/me/workspaces')) return route.fulfill({ status: 200, headers, json: { items: memberships } });
    if (url.pathname.endsWith('/me/workspace')) {
      const selected = revoked.includes(clinic ?? '') ? undefined : memberships.find(item => item.clinic_id === clinic);
      if (!selected) return route.fulfill({ status: 403, headers, json: { message: 'forbidden' } });
      return route.fulfill({ status: 200, headers, json: { user_id: userId, clinic_id: selected.clinic_id, roles: selected.roles, mode: 'connected' } });
    }
    return route.fulfill({ status: 500, headers, json: { message: 'Unexpected workspace request' } });
  });
  await page.goto(`${base}/connection`);
  await page.getByLabel('Adresse e-mail', { exact: true }).fill('staff@example.invalid');
  await page.getByLabel('Mot de passe', { exact: true }).fill('synthetic-password');
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  return workspaceRequests;
}

test.describe('connected clinic workspace selection', () => {
  test.skip(process.env.WORKSPACE_SELECTION_CONFIGURED !== '1', 'Requires an isolated build with the reserved synthetic Supabase URL https://workspace-auth.example.invalid and a test-only key.');

  test('zero memberships keeps all clinic tools closed and explains how to proceed', async ({ page }) => {
    const calls = await signIn(page, []);
    await expect(page.getByRole('region', { name: 'Votre espace sécurisé' }).getByRole('alert')).toContainText('Aucun cabinet actif n’est associé à ce compte.');
    await expect(page.getByRole('button', { name: 'Ouvrir les demandes du cabinet' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Choisissez un cabinet' })).toHaveCount(0);
    await expect(page.getByLabel('Adresse e-mail', { exact: true })).toBeVisible();
    expect(calls.map(call => call.path)).toEqual(['/api/v1/me/workspaces']);
    expect(calls[0]?.clinic).toBeUndefined();
  });

  test('one active membership opens the matching clinic only after server verification', async ({ page }) => {
    const calls = await signIn(page, [choices[0]!]);
    await expect(page.getByText('Cabinet actif : Cabinet Alpha', { exact: false })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ouvrir les demandes du cabinet' })).toBeVisible();
    expect(calls.map(call => [call.path, call.method, call.clinic])).toEqual([
      ['/api/v1/me/workspaces', 'GET', undefined],
      ['/api/v1/me/workspace', 'GET', clinicA],
    ]);
  });

  test('multiple memberships show all authorized clinics and verify only the selected tenant', async ({ page }) => {
    const calls = await signIn(page, choices);
    await expect(page.getByRole('heading', { name: 'Choisissez un cabinet' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cabinet Alpha', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cabinet Beta', exact: true })).toBeVisible();
    await expect(page.getByText('Réception', { exact: true })).toBeVisible();
    await expect(page.getByText('Gestionnaire', { exact: true })).toBeVisible();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ path: '/api/v1/me/workspaces', clinic: undefined });

    await page.getByRole('button', { name: 'Cabinet Beta', exact: true }).click();
    await expect(page.getByText('Cabinet actif : Cabinet Beta', { exact: false })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ouvrir les demandes du cabinet' })).toBeVisible();
    expect(calls.map(call => [call.path, call.method, call.clinic])).toEqual([
      ['/api/v1/me/workspaces', 'GET', undefined],
      ['/api/v1/me/workspaces', 'GET', undefined],
      ['/api/v1/me/workspace', 'GET', clinicB],
    ]);
    await expect(page.getByRole('button', { name: 'Cabinet Alpha', exact: true })).toHaveCount(0);
  });

  test('a membership revoked after listing cannot open its clinic tools', async ({ page }) => {
    const calls = await signIn(page, choices, [clinicB]);
    await expect(page.getByRole('heading', { name: 'Choisissez un cabinet' })).toBeVisible();
    await page.getByRole('button', { name: 'Cabinet Beta', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Votre espace sécurisé' }).getByRole('alert')).toContainText('Cet accès n’est plus actif.');
    await expect(page.getByRole('button', { name: 'Ouvrir les demandes du cabinet' })).toHaveCount(0);
    expect(calls.map(call => [call.path, call.method, call.clinic])).toEqual([
      ['/api/v1/me/workspaces', 'GET', undefined],
      ['/api/v1/me/workspaces', 'GET', undefined],
      ['/api/v1/me/workspace', 'GET', clinicB],
    ]);
  });
});
