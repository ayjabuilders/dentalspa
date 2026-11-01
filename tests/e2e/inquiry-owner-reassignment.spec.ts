import { expect, test } from '@playwright/test';
import { createHttpIntakeTransport, ownerAssignmentAttempt } from '../../apps/clinic-os/components/intake/transport';

const base = process.env.INQUIRY_OWNER_REASSIGNMENT_URL ?? 'http://localhost:4204';
const clinic = '10000000-0000-4000-8000-000000000001';
const user = '10000000-0000-4000-8000-000000000002';
const target = '10000000-0000-4000-8000-000000000014';
const inquiryId = '10000000-0000-4000-8000-000000000011';

test('manager demo reassigns to an eligible Moroccan team member and removes owner-only actions', async ({ page }) => {
  await page.goto(`${base}/intake?preview=1`);
  const detail = page.getByRole('complementary', { name: 'Demande sélectionnée' });
  await expect(detail.getByRole('heading', { name: 'Responsable de la demande' })).toBeVisible();
  const candidates = await detail.locator('select option').allTextContents();
  expect(candidates.join(' ')).toContain('Salma Alaoui');
  expect(candidates.join(' ')).toContain('Imane El Idrissi');
  expect(candidates.join(' ')).toContain('Mehdi Amrani');
  await detail.getByLabel('Transférer à un membre actif').selectOption(target);
  await detail.getByRole('button', { name: 'Confirmer le responsable' }).click();
  await expect(detail.locator('.inquiry-owner-message.positive')).toContainText('Mehdi Amrani est maintenant responsable');
  await expect(detail).toContainText('Après transfert, seuls les droits de gestion du cabinet restent disponibles');
  await expect(detail.getByRole('button', { name: 'Consigner un suivi', exact: true })).toHaveCount(0);
  await expect(detail.getByText('Mehdi Amrani', { exact: true })).toBeVisible();
  await expect(detail).toContainText('Cette modification disparaîtra au rechargement');
  await page.reload();
  await expect(page.getByRole('complementary', { name: 'Demande sélectionnée' }).getByLabel('Transférer à un membre actif')).toBeEnabled();
});

test('HTTP manager transport reads complete clinic roster and validates exact no-store assignment receipt', async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const roster = { observed_at: '2026-10-28T10:00:00.000Z', truncated: false, members: [
    { user_id: user, clinic_id: clinic, display_name: 'Youssef Benali', roles: ['manager'] },
    { user_id: target, clinic_id: clinic, display_name: 'Mehdi Amrani', roles: ['reception'] },
    { user_id: '10000000-0000-4000-8000-000000000021', clinic_id: clinic, display_name: 'Assistant uniquement', roles: ['assistant'] },
  ] };
  const result = { receipt: { inquiry_id: inquiryId, clinic_id: clinic, previous_owner_user_id: user, owner_user_id: target, changed: true, recorded_at: '2026-10-28T10:01:00.000Z', event_version: 1 }, replayed: false };
  const transport = createHttpIntakeTransport({ api: 'https://api.example.invalid', token: 'synthetic', clinicId: clinic, userId: user, roles: ['manager'], fetcher: async (url, init) => {
    calls.push({ url: String(url), init });
    return String(url).endsWith('/team/roster') ? Response.json(roster) : Response.json(result, { status: 201 });
  } });
  await expect(transport.ownerCandidates()).resolves.toEqual(roster.members.slice(0, 2));
  const body = { expected_owner_user_id: user, owner_user_id: target };
  const attempt = ownerAssignmentAttempt(null, inquiryId, body);
  expect(ownerAssignmentAttempt(attempt, inquiryId, body)).toEqual(attempt);
  await expect(transport.reassignOwner(inquiryId, attempt.body, attempt.key)).resolves.toEqual(result);
  expect(calls.map(call => call.url)).toEqual(['https://api.example.invalid/api/v1/team/roster', `https://api.example.invalid/api/v1/inquiries/${inquiryId}/owner`]);
  expect(calls.every(call => call.init?.cache === 'no-store' && call.init?.credentials === 'omit')).toBe(true);
  expect(calls[0]?.init?.method).toBe('GET');
  expect(calls[1]?.init).toMatchObject({ method: 'POST', body: JSON.stringify(body) });
  expect(new Headers(calls[1]?.init?.headers).get('Idempotency-Key')).toBe(attempt.key);
  transport.dispose?.();
});

test('non-manager and incomplete or cross-clinic candidate lists fail closed without assignment', async () => {
  let calls = 0;
  const denied = createHttpIntakeTransport({ api: 'https://api.example.invalid', token: 'synthetic', clinicId: clinic, userId: user, roles: ['reception'], fetcher: async () => { calls++; return Response.json({}); } });
  await expect(denied.ownerCandidates()).rejects.toMatchObject({ kind: 'denied' });
  await expect(denied.reassignOwner(inquiryId, { expected_owner_user_id: user, owner_user_id: target }, crypto.randomUUID())).rejects.toMatchObject({ kind: 'denied' });
  expect(calls).toBe(0);
  denied.dispose?.();

  for (const roster of [
    { observed_at: '2026-10-28T10:00:00.000Z', truncated: true, members: [] },
    { observed_at: '2026-10-28T10:00:00.000Z', truncated: false, members: [{ user_id: target, clinic_id: '20000000-0000-4000-8000-000000000001', display_name: 'Foreign member', roles: ['reception'] }] },
  ]) {
    const manager = createHttpIntakeTransport({ api: 'https://api.example.invalid', token: 'synthetic', clinicId: clinic, userId: user, roles: ['manager'], fetcher: async () => Response.json(roster) });
    await expect(manager.ownerCandidates()).rejects.toMatchObject({ kind: 'unavailable' });
    manager.dispose?.();
  }
});
