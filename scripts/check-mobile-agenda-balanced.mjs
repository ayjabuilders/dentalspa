/* global document, window */
import assert from 'node:assert/strict';
import {mkdirSync, readFileSync} from 'node:fs';
import {chromium, expect} from '@playwright/test';

// Authenticated synthetic environment; appointment reads are mocked and domain writes blocked.
const check=expect.configure({timeout:30000});
const credentials=JSON.parse(readFileSync('.local/owner-demo-access.json','utf8'));
mkdirSync('.local/qa/mobile-agenda-balanced',{recursive:true});
const browser=await chromium.launch();
try {
  const page=await browser.newPage({viewport:{width:320,height:800}});
  const errors=[],writes=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/v1/**',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(!['GET','HEAD','OPTIONS'].includes(request.method())){writes.push(request.method()+' '+url.pathname);await route.abort();return;}
    if(url.pathname==='/api/v1/appointments'){
      const date=url.searchParams.get('from');
      await route.fulfill({json:{items:[{id:'10000000-0000-4000-8000-000000000001',starts_at:date+'T09:00:00Z',ends_at:date+'T09:45:00Z',status:'confirmed',version:1,patient:null,contact_name:'Patiente fictive · QA mobile',provider_name:'Praticien fictif',chair_name:'Fauteuil démo',source:'configured',visit_name:'Détartrage — démo'}],truncated:false}});return;
    }
    await route.continue();
  });
  await page.goto('http://localhost:4204/connection?view=planning');
  await page.getByLabel('Adresse e-mail',{exact:true}).fill(credentials.email);
  await page.getByLabel('Mot de passe',{exact:true}).fill(credentials.password);
  await page.getByRole('button',{name:'Se connecter',exact:true}).click();
  const timeline=page.locator('.recorded-mobile-timeline');
  await check(timeline).toBeVisible();
  await check(page.locator('.recorded-timeline-card')).toHaveCount(1);
  assert.equal(await page.locator('.agenda-time-grid').count(),0);
  assert.ok((await page.locator('.recorded-timeline-card').boundingBox()).y<500,'Appointments appear above the initial fold');
  await check.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:'.local/qa/mobile-agenda-balanced/timeline-320.png'});
  await page.locator('.recorded-timeline-card').click();
  let dialog=page.getByRole('dialog',{name:'Détails du rendez-vous',exact:true});
  await check(dialog).toBeVisible();
  await check(dialog.getByText('identité non vérifiée',{exact:false})).toBeVisible();
  await dialog.getByRole('button',{name:'Fermer',exact:true}).click();
  await check(page.locator('.recorded-timeline-card')).toBeFocused();
  await page.getByRole('button',{name:'Options de l’agenda',exact:true}).click();
  dialog=page.getByRole('dialog',{name:'Options de l’agenda',exact:true});
  await dialog.getByRole('button',{name:'Liste',exact:true}).click();
  await dialog.getByRole('button',{name:'Afficher l’agenda',exact:true}).click();
  await check(timeline).toHaveCount(0);
  await page.setViewportSize({width:1440,height:1000});
  await check(page.getByRole('button',{name:'Liste',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.setViewportSize({width:320,height:800});
  await page.getByRole('button',{name:'Options de l’agenda',exact:true}).click();
  dialog=page.getByRole('dialog',{name:'Options de l’agenda',exact:true});
  await check(dialog.getByRole('button',{name:'Liste',exact:true})).toHaveAttribute('aria-pressed','true');
  await dialog.getByRole('button',{name:'Paramètres',exact:true}).click();
  await check(page.locator('.agenda-settings-cards')).toBeVisible();
  const add=page.getByRole('button',{name:'Ajouter une prestation',exact:true});
  const bounds=await add.boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=320,'Add service action fits');
  await page.screenshot({path:'.local/qa/mobile-agenda-balanced/settings-320.png'});
  await page.getByRole('button',{name:'Modifier les horaires',exact:true}).click();
  dialog=page.getByRole('dialog',{name:'Horaires du cabinet',exact:true});
  await check(dialog).toBeVisible();
  await check.poll(()=>dialog.evaluate(element=>element.scrollWidth<=element.clientWidth)).toBe(true);
  await page.screenshot({path:'.local/qa/mobile-agenda-balanced/settings-sheet-320.png'});
  await dialog.getByRole('button',{name:'Fermer',exact:true}).click();
  await page.getByRole('button',{name:'Retour à l’agenda',exact:true}).click();
  await check(timeline).toHaveCount(0);
  await page.getByRole('button',{name:'Options de l’agenda',exact:true}).click();
  dialog=page.getByRole('dialog',{name:'Options de l’agenda',exact:true});
  await check(dialog.getByRole('button',{name:'Liste',exact:true})).toHaveAttribute('aria-pressed','true');
  assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);
  console.log('PASS mobile timeline, detail/focus, explicit view persistence across resize/settings round trip, settings action/sheet bounds; no domain writes.');
} finally {await browser.close();}
