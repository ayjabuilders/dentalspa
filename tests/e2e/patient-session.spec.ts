import { expect, test, type Page } from '@playwright/test';

const base = process.env.PATIENT_PASS_URL ?? 'http://localhost:4205';
const connectedPatientAuthEnabled = process.env.PATIENT_AUTH_E2E === '1'
  && Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL)
  && Boolean(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const userId = '10000000-0000-4000-8000-000000000001';
const clinicId = '10000000-0000-4000-8000-000000000002';
const patientId = '10000000-0000-4000-8000-000000000003';
const profile = { id: patientId, clinic_id: clinicId, display_name: 'Salma Alaoui', reference: 'DS-0001' };
const verifiedLink = { user_id: userId, clinic_id: clinicId, patient_id: patientId, verified_at: '2026-10-26T12:00:00Z' };
const authCors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Cache-Control': 'no-store' };
type PatientConnectionTrace={requests:string[];preferenceCalls:Array<{method:string;body:unknown;key:string|null}>};

async function mockPatientConnection(page: Page, options: { links?: unknown[]; patientStatus?: number } = {}) {
  const requests: string[] = [];
  const preferenceCalls:PatientConnectionTrace['preferenceCalls']=[];
  await page.route('https://patient-auth.example.invalid/auth/v1/token**', async route => {
    if (route.request().method() === 'OPTIONS') { await route.fulfill({ status: 204, headers: authCors }); return; }
    await route.fulfill({ status: 200, headers: authCors, json: {
      access_token: 'synthetic-access-token', token_type: 'bearer', refresh_token: 'synthetic-refresh-token',
      expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: userId, aud: 'authenticated', role: 'authenticated', email: 'patient@example.invalid', app_metadata: { provider: 'email' }, user_metadata: {}, created_at: '2026-10-26T10:00:00Z' },
    } });
  });
  await page.route('https://patient-auth.example.invalid/rest/v1/patient_account_links**', async route => {
    requests.push(route.request().url());
    const headers = { ...authCors, 'Content-Type': 'application/json', 'Content-Range': `0-${(options.links ?? [verifiedLink]).length - 1}/*` };
    await route.fulfill({ status: 200, headers, json: options.links ?? [verifiedLink] });
  });
  await page.route('http://localhost:4300/api/v1/me/patient', async route => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': new URL(base).origin, 'Access-Control-Allow-Headers': 'authorization,x-clinic-id', 'Access-Control-Allow-Methods': 'GET,OPTIONS' } });
      return;
    }
    requests.push(route.request().url());
    expect(route.request().headers().authorization).toBe('Bearer synthetic-access-token');
    expect(route.request().headers()['x-clinic-id']).toBe(clinicId);
    expect(route.request().postData()).toBeNull();
    await route.fulfill({ status: options.patientStatus ?? 200, json: options.patientStatus && options.patientStatus !== 200 ? { message: 'denied' } : profile });
  });
  await page.route('http://localhost:4300/api/v1/me/preferences',async route=>{
    if(route.request().method()==='OPTIONS'){
      await route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':new URL(base).origin,'Access-Control-Allow-Headers':'authorization,x-clinic-id,content-type,idempotency-key','Access-Control-Allow-Methods':'GET,POST,OPTIONS'}});return;
    }
    const method=route.request().method();
    const body=method==='POST'?route.request().postDataJSON():null;
    const key=route.request().headers()['idempotency-key']??null;
    preferenceCalls.push({method,body,key});
    expect(route.request().headers().authorization).toBe('Bearer synthetic-access-token');
    expect(route.request().headers()['x-clinic-id']).toBe(clinicId);
    if(method==='GET'){
      await route.fulfill({status:200,headers:{'Cache-Control':'no-store'},json:{schema_version:1,clinic_id:clinicId,patient_id:patientId,contact_preference:null,language:null,time_zone:null,revision:0,updated_at:null}});return;
    }
    const values=body as {expected_revision:number;contact_preference:'phone'|'email'|'no_preference'|null;language:'fr'|'ar'|'en'|'other'|'no_preference'|null;time_zone:string|null};
    await route.fulfill({status:200,headers:{'Cache-Control':'no-store'},json:{replayed:false,receipt:{clinic_id:clinicId,patient_id:patientId,previous_contact_preference:null,contact_preference:values.contact_preference,previous_language:null,language:values.language,previous_time_zone:null,time_zone:values.time_zone,previous_revision:0,revision:1,changed:true,recorded_at:'2026-10-29T12:00:00.123456Z',catalogue_version:1,event_version:1}}});
  });
  return {requests,preferenceCalls};
}

test('verified patient sees only their returned profile and unavailable features stay unavailable', async ({ page }) => {
  test.skip(!connectedPatientAuthEnabled, 'Connected Patient Pass checks need explicit public Supabase test configuration; the default local preview keeps Auth off.');
  const {requests} = await mockPatientConnection(page);
  await page.goto(`${base}/?demoPatientId=DEMO-001&demoPatientName=Salma%20Alaoui`);
  await page.getByRole('button', { name: 'Compte', exact: true }).click();
  await page.getByLabel('Adresse e-mail').fill('patient@example.invalid');
  await page.getByRole('textbox', { name: 'Mot de passe', exact: true }).fill('synthetic-password');
  await page.getByRole('button', { name: 'Se connecter' }).click();

  await expect(page.getByRole('heading', { name: 'Salma Alaoui' })).toBeVisible();
  await expect(page.getByText('Session vérifiée · contenu limité à votre compte')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Se déconnecter' })).toBeVisible();
  await expect(page).not.toHaveURL(/demoPatient/);
  await page.getByRole('button', { name: /^(RDV|Rendez-vous)$/ }).click();
  await expect(page.getByText(/rendez-vous de ce compte ne sont pas encore disponibles/i)).toBeVisible();
  await expect(page.getByText('28 octobre · 10:30')).toHaveCount(0);
  await page.getByRole('button', { name: 'Dossier' }).click();
  await expect(page.getByText(/Aucun contenu patient affiché dans cet aperçu/)).toBeVisible();
  await expect(page.getByText('Aucun document partagé')).toHaveCount(0);
  expect(requests.some(url => url.endsWith('/api/v1/me/patient'))).toBe(true);
  expect(requests.every(url => !url.includes(patientId))).toBe(true);
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);

  await page.getByRole('button', { name: 'Compte', exact: true }).click();
  await page.getByRole('button', { name: 'Se déconnecter' }).click();
  await expect(page.getByRole('heading', { name: 'Connexion sécurisée' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Mot de passe', exact: true })).toHaveValue('');
  await expect(page.getByText('Salma Alaoui')).toHaveCount(0);
});

test('verified patient saves only their stated communication preferences',async({page})=>{
  test.skip(!connectedPatientAuthEnabled, 'Connected Patient Pass checks need explicit public Supabase test configuration; the default local preview keeps Auth off.');
  const {preferenceCalls}=await mockPatientConnection(page);
  await page.goto(base);
  await page.getByRole('button',{name:'Compte',exact:true}).click();
  await page.getByLabel('Adresse e-mail').fill('patient@example.invalid');
  await page.getByRole('textbox',{name:'Mot de passe',exact:true}).fill('synthetic-password');
  await page.getByRole('button',{name:'Se connecter'}).click();
  await expect(page.getByRole('heading',{name:'Salma Alaoui'})).toBeVisible();
  await page.getByLabel('Canal préféré').selectOption('phone');
  await page.getByLabel('Langue préférée').selectOption('ar');
  await page.getByLabel('Fuseau horaire').selectOption('Africa/Casablanca');
  await page.getByRole('button',{name:'Enregistrer mes préférences'}).click();
  await expect(page.getByRole('status')).toContainText('Aucun message n’a été envoyé');
  expect(preferenceCalls.map(call=>call.method)).toEqual(['GET','POST']);
  expect(preferenceCalls[1]?.body).toEqual({expected_revision:0,contact_preference:'phone',language:'ar',time_zone:'Africa/Casablanca'});
  expect(preferenceCalls[1]?.key).toMatch(/^[0-9a-f-]{36}$/i);
  expect(JSON.stringify(preferenceCalls)).not.toMatch(/patient_id|Salma|example\.invalid/i);
  expect(await page.evaluate(()=>localStorage.length+sessionStorage.length)).toBe(0);
});

test('local communication preferences stay in memory and never leave the demo page',async({page})=>{
  const outgoing:string[]=[];
  page.on('request',request=>{if(request.url().includes('/api/v1/me/preferences')||request.url().includes('/rest/v1/')||request.url().includes('/auth/v1/'))outgoing.push(request.url());});
  await page.goto(base);
  await page.getByRole('button',{name:'Compte',exact:true}).click();
  await page.getByLabel('Canal préféré').selectOption('phone');
  await page.getByLabel('Langue préférée').selectOption('ar');
  await page.getByLabel('Fuseau horaire').selectOption('Africa/Casablanca');
  await page.getByRole('button',{name:'Enregistrer cet aperçu'}).click();
  await expect(page.getByRole('status')).toContainText('Rien n’a été envoyé');
  expect(outgoing).toEqual([]);
  expect(await page.evaluate(()=>localStorage.length+sessionStorage.length)).toBe(0);
  await page.reload();
  await page.getByRole('button',{name:'Compte',exact:true}).click();
  await expect(page.getByLabel('Canal préféré')).toHaveValue('');
  await expect(page.getByLabel('Langue préférée')).toHaveValue('');
  await expect(page.getByLabel('Fuseau horaire')).toHaveValue('');
  expect(outgoing).toEqual([]);
});

test('missing or ambiguous clinic-verified links never call the patient API', async ({ page }) => {
  test.skip(!connectedPatientAuthEnabled, 'Connected Patient Pass checks need explicit public Supabase test configuration; the default local preview keeps Auth off.');
  const {requests} = await mockPatientConnection(page, { links: [verifiedLink, { ...verifiedLink, clinic_id: '10000000-0000-4000-8000-000000000004' }] });
  await page.goto(base);
  await page.getByRole('button', { name: 'Compte', exact: true }).click();
  await page.getByLabel('Adresse e-mail').fill('patient@example.invalid');
  await page.getByRole('textbox', { name: 'Mot de passe', exact: true }).fill('synthetic-password');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.locator('.patient-session-error')).toContainText('vérifié par le cabinet');
  expect(requests.some(url => url.endsWith('/api/v1/me/patient'))).toBe(false);
  await expect(page.getByRole('heading', { name: 'Connexion sécurisée' })).toBeVisible();
});

test('a backend denial never shows a patient profile', async ({ page }) => {
  test.skip(!connectedPatientAuthEnabled, 'Connected Patient Pass checks need explicit public Supabase test configuration; the default local preview keeps Auth off.');
  await mockPatientConnection(page, { patientStatus: 403 });
  await page.goto(base);
  await page.getByRole('button', { name: 'Compte', exact: true }).click();
  await page.getByLabel('Adresse e-mail').fill('patient@example.invalid');
  await page.getByRole('textbox', { name: 'Mot de passe', exact: true }).fill('synthetic-password');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.locator('.patient-session-error')).toContainText('vérifié par le cabinet');
  await expect(page.getByRole('heading', { name: 'Salma Alaoui' })).toHaveCount(0);
});
