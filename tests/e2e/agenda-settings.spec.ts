import { test, expect } from '@playwright/test';
import { workspaceChoices, workspaceVerification } from './helpers/workspace-selection';

test('manager edits visit-specific hours and saves/reloads verified settings', async ({ page }) => {
  const clinic = '10000000-0000-4000-8000-000000000001';
  const provider = '74000000-0000-4000-8000-000000000001';
  const chair = '74000000-0000-4000-8000-000000000003';
  const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Content-Type': 'application/json' };
  let saved: unknown = null;
  let saveCount = 0;
  await page.route('**/auth/v1/**', route => route.fulfill({ headers, json: {
    access_token: 'synthetic-token', refresh_token: 'synthetic-refresh', token_type: 'bearer', expires_in: 3600,
    user: { id: clinic, aud: 'authenticated', role: 'authenticated', email: 'staff@example.invalid', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() },
  } }));
  await page.route('**/api/v1/**', async route => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/me/workspaces')) return route.fulfill({ headers, json: workspaceChoices(clinic, ['manager']) });
    if (path.endsWith('/me/workspace')) return route.fulfill({ headers, json: workspaceVerification(clinic, clinic, ['manager']) });
    if (path.endsWith('/scheduling/resources')) return route.fulfill({ headers, json: { items: [
      { id: provider, kind: 'provider', display_name: 'Praticienne fictive A' }, { id: chair, kind: 'chair', display_name: 'Fauteuil fictif A' },
    ], observed_at: new Date().toISOString(), truncated: false } });
    if (path.endsWith('/agenda-settings')) {
      if (route.request().method() === 'POST') {
        saveCount++;
        const body = route.request().postDataJSON();
        expect(body.expected_revision).toBe(saveCount-1);
        if(body.settings.visit_types.length)expect(body.settings.visit_types[0]).toMatchObject({ name: 'Contrôle fictif', duration_minutes: 20, public_bookable: false, resource_pairs: [{ provider_id: provider, chair_id: chair }] });
        expect(route.request().headers()['x-clinic-id']).toBe(clinic);
        expect(route.request().headers()['idempotency-key']).toBeTruthy();
        saved = body.settings;
        return route.fulfill({ headers, json: { settings: saved, replayed: false } });
      }
      return route.fulfill({ headers, json: { settings: saved } });
    }
    return route.fulfill({ status: 404, headers, json: {} });
  });
  await page.goto('http://localhost:4204/connection?view=agenda-settings');
  await page.getByLabel('Adresse e-mail', { exact: true }).fill('staff@example.invalid');
  await page.getByLabel('Mot de passe', { exact: true }).fill('synthetic-password');
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Paramètres de l’agenda', exact: true })).toBeVisible();

  await expect(page.getByText(/Nouvelle configuration/)).toBeVisible();
  await page.getByRole('button',{name:'Modifier les horaires',exact:true}).click();
  let editor=page.getByRole('dialog');
  await editor.getByRole('button',{name:'Ajouter une plage — horaires du cabinet'}).click();
  await editor.getByRole('button',{name:'Enregistrer les paramètres',exact:true}).click();
  await expect(editor).toHaveCount(0);
  await page.getByRole('tab',{name:/Visites/}).click();
  editor=page.getByRole('dialog');
  await editor.getByRole('button',{name:'Ajouter un type de visite'}).click();
  await editor.getByLabel('Nom du type',{exact:true}).fill('Contrôle fictif');
  await editor.getByLabel('Durée (minutes)',{exact:true}).fill('20');
  await editor.getByRole('button',{name:'Ajouter une paire de ressources'}).click();
  await editor.getByRole('combobox',{name:'Praticien',exact:true}).selectOption(provider);
  await editor.getByRole('combobox',{name:'Fauteuil',exact:true}).selectOption(chair);
  await editor.getByRole('button',{name:'Ajouter une plage — plages de contrôle fictif'}).click();
  await editor.getByLabel('Plages de Contrôle fictif · fin 1').fill('10:30');
  await editor.getByRole('button',{name:'Enregistrer les paramètres',exact:true}).click();
  await expect(editor).toHaveCount(0);expect(saveCount).toBe(2);
  await page.getByRole('button').filter({hasText:'Contrôle fictif'}).click();
  editor=page.getByRole('dialog');
  await expect(editor.getByLabel('Nom du type',{exact:true})).toHaveValue('Contrôle fictif');
  await editor.getByLabel('Nom du type',{exact:true}).fill('Modification abandonnée');
  await editor.getByRole('button',{name:'Fermer',exact:true}).click();
  await expect(editor.getByRole('alert')).toContainText('Abandonner les modifications');
  await editor.getByRole('button',{name:'Continuer',exact:true}).click();
  await expect(editor.getByLabel('Nom du type',{exact:true})).toHaveValue('Modification abandonnée');
  await editor.getByRole('button',{name:'Fermer',exact:true}).click();
  await editor.getByRole('button',{name:'Abandonner',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('tab',{name:/Visites/}).focus();await expect(page.getByRole('tab',{name:/Visites/})).toBeFocused();await page.getByRole('tab',{name:/Visites/}).press('ArrowRight');
  await expect(page.getByRole('tab',{name:/Réservation/})).toBeFocused();
  await page.getByRole('button').filter({hasText:'Contrôle fictif'}).click();
  await expect(page.getByRole('dialog').getByLabel('Nom du type',{exact:true})).toHaveValue('Contrôle fictif');
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
