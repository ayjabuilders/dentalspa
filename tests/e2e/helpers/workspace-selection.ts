import type { Page } from '@playwright/test';

export const clinicName = 'Cabinet de démonstration';

export function workspaceChoices(clinicId: string, roles: string[] = ['reception']) {
  return { items: [{ clinic_id: clinicId, clinic_name: clinicName, roles }] };
}

export function workspaceVerification(userId: string, clinicId: string, roles: string[] = ['reception']) {
  return { user_id: userId, clinic_id: clinicId, roles, mode: 'connected' as const };
}

export async function selectWorkspace(page: Page) {
  const choice = page.getByRole('button', { name: clinicName, exact: true });
  const verified = page.getByRole('navigation', { name: 'Modules du cabinet', exact: true });
  const selectionRequired = await Promise.any([
    choice.waitFor({ state: 'visible' }).then(() => true),
    verified.waitFor({ state: 'visible' }).then(() => false),
  ]);
  if (selectionRequired) await choice.click();
}
