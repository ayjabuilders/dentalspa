import { expect, test, type Page, type Route } from '@playwright/test';
import { createDemoIntakeTransport, createHttpIntakeTransport } from '../../apps/clinic-os/components/intake/transport';
const base = process.env.HISTORY_UI_URL ?? 'http://localhost:4300';
const clinic = '10000000-0000-4000-8000-000000000001', user = '10000000-0000-4000-8000-000000000002', id = '10000000-0000-4000-8000-000000000011', other = '10000000-0000-4000-8000-000000000012';
const inquiry = { id, clinic_id: clinic, owner_user_id: user, display_name: 'Lina Synthétique', contact_phone: null, contact_email: null, source: 'phone', status: 'new', created_at: '2026-10-26T09:30:00Z', follow_up_at: null };
const item = { previous_follow_up_at: null, follow_up_at: '2030-11-12T10:30:00Z', changed: true, recorded_at: '2026-10-27T10:00:00.123456Z', event_version: 1 };
const history = { inquiry_id: id, items: [item, { ...item, previous_follow_up_at: null, follow_up_at: null, changed: false }], truncated: false };
const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Cache-Control': 'no-store' };
async function connected(page: Page, handler: (route: Route) => Promise<void>) {
  let reads = 0;
  await page.route('https://schedule-auth.example.invalid/**', route => route.fulfill({ status: 200, headers, json: { access_token: 'synthetic-token', token_type: 'bearer', refresh_token: 'synthetic-refresh', expires_in: 3600, expires_at: Math.floor(Date.now()/1000)+3600, user: { id: user, aud: 'authenticated', role: 'authenticated', email: 'staff@example.invalid', app_metadata: {}, user_metadata: {}, created_at: inquiry.created_at } } }));
  await page.route('**/api/v1/**', async route => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers }); const url = route.request().url();
    if (url.endsWith('/me/workspace')) return route.fulfill({ status: 200, headers, json: { user_id: user, clinic_id: clinic, roles: ['reception'], mode: 'connected' } });
    if (url.endsWith('/history')) { reads++; return handler(route); }
    if (url.endsWith('/follow-up-schedule')) return route.abort('failed');
    if (url.endsWith('/owner-worklist')) return route.fulfill({ status: 200, headers, json: { observed_at: '2026-10-27T09:00:00Z', overdue: { items: [], truncated: false }, upcoming: { items: [], truncated: false }, undated: { items: [], truncated: false } } });
    if (url.endsWith('/follow-ups')) return route.fulfill({ status: 200, headers, json: { items: [], truncated: false } });
    if (url.endsWith('/'+id)) return route.fulfill({ status: 200, headers, json: inquiry });
    return route.fulfill({ status: 200, headers, json: { items: [inquiry,{ ...inquiry,id:other,display_name:'Adam Synthétique' }], truncated: false } });
  });
  await page.goto(base+'/connection'); await page.getByLabel('Adresse e-mail', { exact: true }).fill('staff@example.invalid'); await page.getByLabel('Mot de passe', { exact: true }).fill('synthetic-password'); await page.getByLabel('Identifiant du cabinet de développement').fill(clinic); await page.getByRole('button', { name: 'Se connecter', exact: true }).click(); await page.getByRole('button', { name: 'Ouvrir les demandes du cabinet' }).click(); await expect(page.locator('.schedule-history-disclosure')).toBeVisible(); expect(reads).toBe(0); return () => reads;
}

test('demo history follows stored no-op receipts and cannot replay them', async ({ page }) => {
  await page.goto(base+'/intake'); await page.locator('.schedule-history-disclosure').click(); await expect(page.locator('.schedule-history')).toContainText('Aucun résultat de commande');
  await page.getByRole('button', { name: 'Replanifier le suivi', exact: true }).click(); await page.getByRole('button', { name: 'Enregistrer l’échéance' }).click(); await expect(page.getByRole('dialog')).toContainText('Aucun changement nécessaire'); await page.getByRole('button', { name: 'Fermer', exact: true }).last().click();
  await expect(page.locator('.schedule-history-disclosure')).toHaveAttribute('aria-expanded','false'); await page.locator('.schedule-history-disclosure').click(); await expect(page.locator('.schedule-history-entry-heading')).toHaveText('Sans changement'); await expect(page.locator('.schedule-history-scroll li')).toHaveCount(1);
  await expect(page.locator('.schedule-history')).toContainText('Vos actions récentes uniquement'); await expect(page.locator('.schedule-history')).toContainText('pas l’échéance actuelle'); await expect(page.locator('.schedule-history').getByRole('button', { name: /Rejouer|Exporter|Modifier/ })).toHaveCount(0);
});

test.describe('verified schedule history', () => {
  test.skip(process.env.SCHEDULE_HISTORY_CONFIGURED !== '1', 'Requires isolated synthetic authentication build.');
test('pearl/navy responsive values, keyboard disclosure, named timezone and reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await connected(page, route => route.fulfill({ status: 200, headers, json: history }));
  await page.locator('.schedule-history-disclosure').focus(); await page.keyboard.press('Enter'); await expect(page.locator('.schedule-history-scroll li')).toHaveCount(2);
  for (const theme of ['pearl','navy']) {
    if (theme === 'navy') await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
    for (const width of [1536,1280,768,390]) { await page.setViewportSize({ width,height:1100 }); await page.locator('.schedule-history').evaluate(el => el.scrollIntoView({ block: 'start' })); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await page.screenshot({ animations: 'disabled', path: `test-results/schedule-history-${theme}-${width}.png` }); }
  }
  expect((await page.locator('.schedule-history-disclosure').boundingBox())!.height).toBeGreaterThanOrEqual(44); expect(await page.locator('.schedule-history-scroll li').first().evaluate(el => getComputedStyle(el).animationName)).toBe('none'); await expect(page.locator('.schedule-history-zone')).toContainText(await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone));
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage,...sessionStorage }))).not.toMatch(/2030|Lina|synthetic-token/);
});

test('explicit partial read shows 50+ personal outcomes and preserves uncertain schedule attempt', async ({ page }) => {
  await connected(page, route => route.fulfill({ status: 200, headers, json: { ...history,items:Array.from({length:50},()=>item),truncated:true } }));
  await page.getByRole('button', { name: 'Replanifier le suivi', exact: true }).click(); await page.getByRole('button', { name: 'Enregistrer l’échéance' }).click(); await expect(page.getByRole('dialog')).toContainText('Résultat à vérifier'); await page.getByRole('button', { name: 'Fermer', exact: true }).last().click();
  await page.locator('.schedule-history-disclosure').click(); await expect(page.locator('.schedule-history-toolbar strong')).toHaveText('50+'); await expect(page.locator('.schedule-history-scroll li')).toHaveCount(50); await expect(page.getByRole('button',{name:'Vérifier la replanification'})).toBeVisible();
  await page.locator('.schedule-history-disclosure').click(); await expect(page.getByRole('button',{name:'Vérifier la replanification'})).toBeVisible();
});

for (const status of [403,404,401]) test(`history ${status} clears selected private inquiry and pending verification`, async ({ page }) => {
  await connected(page, route => route.fulfill({ status,headers,json:{} }));
  await page.getByRole('button', { name: 'Replanifier le suivi', exact: true }).click(); await page.getByRole('button', { name: 'Enregistrer l’échéance' }).click(); await expect(page.getByRole('dialog')).toContainText('Résultat à vérifier'); await page.getByRole('button', { name: 'Fermer', exact: true }).last().click(); await page.locator('.schedule-history-disclosure').click();
  await expect(page.getByText('Lina Synthétique',{exact:true})).toHaveCount(0); await expect(page.getByRole('button',{name:'Vérifier la replanification'})).toHaveCount(0); await expect(page.locator('.schedule-history-scroll li')).toHaveCount(0);
  if (status === 401) await expect(page.getByRole('button',{name:'Se connecter',exact:true})).toBeVisible(); else await expect(page.locator('.schedule-history-state')).toContainText(status === 403 ? 'non autorisé' : 'réattribuée');
});

test('selection change aborts late history; retry distinguishes unavailable and empty', async ({ page }) => {
  let release!:()=>void; let count=0;
  await connected(page, async route => { count++; if(count===1){await new Promise<void>(resolve=>{release=resolve;}); await route.fulfill({status:200,headers,json:history}).catch(()=>undefined);return;} return route.fulfill({status:count===2?503:200,headers,json:count===2?{}:{inquiry_id:other,items:[],truncated:false}}); });
  await page.locator('.schedule-history-disclosure').click(); await expect.poll(()=>Boolean(release)).toBe(true); await page.locator('.intake-row').filter({hasText:'Adam Synthétique'}).click(); release(); await expect(page.locator('.schedule-history-disclosure')).toHaveAttribute('aria-expanded','false'); await expect(page.locator('.schedule-history-scroll li')).toHaveCount(0);
  await page.locator('.schedule-history-disclosure').click(); await expect(page.locator('.schedule-history-state')).toContainText('indisponible'); await page.getByRole('button',{name:'Réessayer l’historique des échéances'}).click(); await expect(page.locator('.schedule-history-state')).toContainText('Aucun résultat');
});

test('offline clears loaded history and logout disposes it', async ({ page,context }) => {
  await connected(page, route=>route.fulfill({status:200,headers,json:history})); await page.locator('.schedule-history-disclosure').click(); await expect(page.locator('.schedule-history-scroll li')).toHaveCount(2); await context.setOffline(true); await expect(page.locator('.schedule-history-scroll li')).toHaveCount(0); await expect(page.getByText('Lina Synthétique',{exact:true})).toHaveCount(0); await context.setOffline(false); await expect(page.locator('.schedule-history-scroll li')).toHaveCount(0); await page.getByRole('button',{name:'Se déconnecter',exact:true}).first().click(); await expect(page.locator('.schedule-history')).toHaveCount(0);
});

});

test('strict history transport rejects foreign identity/private fields and preserves GET no-store', async () => {
  let payload:unknown=history; let options:RequestInit|undefined;
  const transport=createHttpIntakeTransport({api:'https://example.invalid',token:'synthetic',clinicId:clinic,userId:user,fetcher:(async (_url,init)=>{options=init;return Response.json(payload);}) as typeof fetch});
  expect(await transport.scheduleHistory(id)).toEqual(history); expect(options).toMatchObject({method:'GET',cache:'no-store',credentials:'omit'}); expect(options?.body).toBeUndefined();
  for(const value of [{...history,inquiry_id:other},{...history,owner_user_id:user},{...history,items:[{...item,request_key:user}]},{...history,items:[{...item,changed:false}]}]){payload=value;await expect(transport.scheduleHistory(id)).rejects.toMatchObject({kind:'unavailable'});}
  transport.dispose!(); await expect(transport.scheduleHistory(id)).rejects.toMatchObject({kind:'expired'});
});

test('demo history projects one minimal outcome per accepted command including no-ops and replay does not duplicate',async()=>{
  const demo=createDemoIntakeTransport();const body={expected_follow_up_at:null,follow_up_at:null};const key=crypto.randomUUID();await demo.setSchedule(id,body,key);await demo.setSchedule(id,body,key);const result=await demo.scheduleHistory(id);expect(result.items).toHaveLength(1);expect(result.items[0]?.changed).toBe(false);expect(Object.keys(result.items[0]!)).toEqual(['previous_follow_up_at','follow_up_at','changed','recorded_at','event_version']);
});
