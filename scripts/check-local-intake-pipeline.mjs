/* global document, innerWidth */
import {readFileSync,writeFileSync} from 'node:fs';
import {chromium,expect} from '@playwright/test';
const check=expect.configure({timeout:30000});
const credentials=JSON.parse(readFileSync('.local/owner-demo-access.json','utf8'));
const browser=await chromium.launch();
try {
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  await page.goto('http://localhost:4204/connection?view=intake');
  await page.getByLabel('Adresse e-mail',{exact:true}).fill(credentials.email);
  await page.getByLabel('Mot de passe',{exact:true}).fill(credentials.password);
  await page.getByRole('button',{name:'Se connecter',exact:true}).click();
  const detail=page.getByRole('complementary',{name:'Demande sélectionnée'});
  const detailTab=name=>detail.getByRole('tab',{name,exact:true});
  await check(detail.getByRole('button',{name:'Changer de responsable',exact:true})).toBeVisible();
  if(process.argv.includes('--resume')||process.argv.includes('--finish')) {
    await page.getByLabel('Rechercher une demande',{exact:true}).fill('Nadia El Fassi');
    await page.locator('.intake-row').filter({hasText:'Nadia El Fassi'}).first().click();
  } else {
    await page.getByRole('button',{name:'Nouvelle demande',exact:true}).click();
    const create=page.getByRole('dialog');
    await create.getByLabel(/Nom du contact/).fill('Nadia El Fassi (FICTIF)');
    await create.getByLabel('Source du premier contact').selectOption('whatsapp');
    const createdResponse=page.waitForResponse(r=>r.url().endsWith('/api/v1/inquiries')&&r.request().method()==='POST');
    await create.getByRole('button',{name:'Enregistrer la demande',exact:true}).click();
    const created=await (await createdResponse).json();
    if(!created.item?.id)throw Error('No persisted inquiry');
    writeFileSync('.local/qa/intake-pipeline-record.json',JSON.stringify({id:created.item.id,name:created.item.display_name}));
    await check(create).toHaveCount(0);
    await check(detail.getByRole('heading',{name:'Nadia El Fassi (FICTIF)',exact:true})).toBeVisible();
    await check(detail.locator('.inquiry-source-badge')).toContainText('WhatsApp');
  }
  await check(detailTab('Contact')).toHaveAttribute('aria-selected','true');
  await check(detail.locator('#intake-next-action')).toBeHidden();
  if(!process.argv.includes('--finish')) {
    await detail.getByRole('button',{name:'Changer de responsable',exact:true}).click();
    await detail.getByLabel('Transférer à un membre actif').selectOption({label:'Ghita Bennani · accueil'});
    await detail.getByRole('button',{name:'Confirmer le responsable',exact:true}).click();
    await check(detail.getByRole('button',{name:'M’attribuer la demande',exact:true})).toBeVisible();
    await detailTab('Historique').click();
    await check(detail.getByRole('button',{name:'Consigner un suivi',exact:true})).toHaveCount(0);
    await detailTab('Contact').click();
    let dropped=false;
    await page.route('**/api/v1/inquiries/*/owner',async route=>{
      if(!dropped&&route.request().method()==='POST'){dropped=true;await route.fetch();await route.abort('failed');}
      else await route.continue();
    });
    await detail.getByRole('button',{name:'M’attribuer la demande',exact:true}).click();
    await check(detail.getByRole('button',{name:'Vérifier le résultat',exact:true})).toBeVisible();
    await check(detail.getByLabel('Transférer à un membre actif')).toBeDisabled();
    await check(detailTab('Suivi')).toBeDisabled();
    await check(detailTab('Historique')).toBeDisabled();
    await detail.getByRole('button',{name:'Vérifier le résultat',exact:true}).click();
    await check(detailTab('Historique')).toBeEnabled();
    await detailTab('Historique').click();
    await check(detail.getByRole('button',{name:'Consigner un suivi',exact:true})).toBeVisible();
    await page.unroute('**/api/v1/inquiries/*/owner');
    await detail.getByRole('button',{name:'Consigner un suivi',exact:true}).click();
    const follow=page.getByRole('dialog',{name:'Consigner un suivi',exact:true});
    await follow.getByLabel('Action constatée').selectOption('contact_attempt');
    await follow.getByLabel('Canal observé').selectOption('phone');
    await follow.getByRole('button',{name:'Enregistrer le suivi',exact:true}).click();
    await check(detail.locator('.follow-up-history')).toContainText('Tentative de contact');
    if(await follow.isVisible())await follow.getByRole('button',{name:'Fermer',exact:true}).last().click();
  }
  await detailTab('Suivi').click();
  await check(detail.locator('#intake-contact')).toBeHidden();
  await detail.getByRole('button',{name:/^(Renseigner|Modifier) l’action prévue$/}).click();
  const intent=page.getByRole('dialog');
  await intent.getByLabel('Action administrative prévue').selectOption('review_follow_up');
  await intent.getByRole('button',{name:'Enregistrer l’intention',exact:true}).click();
  await check(intent).toContainText('État actuel relu');
  await intent.getByRole('button',{name:'Fermer',exact:true}).last().click();
  await detail.getByRole('button',{name:'Replanifier le suivi',exact:true}).click();
  const schedule=page.getByRole('dialog',{name:'Replanifier le suivi',exact:true});
  await schedule.getByLabel('Sans date',{exact:true}).uncheck();
  await schedule.getByLabel('Nouvelle échéance locale').fill('2026-11-05T10:30');
  await schedule.getByRole('button',{name:'Enregistrer l’échéance',exact:true}).click();
  await check(schedule).toContainText('État actuel relu');
  await schedule.getByRole('button',{name:'Fermer',exact:true}).last().click();
  await page.reload();
  await page.getByLabel('Rechercher une demande',{exact:true}).fill('Nadia El Fassi');
  await page.locator('.intake-row').filter({hasText:'Nadia El Fassi'}).first().click();
  await detailTab('Historique').click();
  await check(detail.locator('.follow-up-history')).toContainText('Tentative de contact');
  await detailTab('Suivi').click();
  await check(detail).toContainText('Examiner l’historique du suivi');
  await page.screenshot({path:'.local/qa/intake-source-actions-desktop.png'});
  await page.setViewportSize({width:390,height:844});
  await check.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await check(page.getByRole('region',{name:'Liste des demandes'})).toBeHidden();
  await detail.getByRole('button',{name:'Toutes les demandes',exact:true}).click();
  await check(detail).toBeHidden();
  await check(page.getByLabel('Rechercher une demande',{exact:true})).toHaveValue('Nadia El Fassi');
  await page.locator('.intake-row').filter({hasText:'Nadia El Fassi'}).first().click();
  await check(detail).toBeVisible();
  await check(detailTab('Contact')).toHaveAttribute('aria-selected','true');
  await page.screenshot({path:'.local/qa/intake-source-actions-mobile.png'});
  console.log('PASS native create, WhatsApp badge, transfer, self-assignment, lost-response retry and tab locks, owner-only controls, factual follow-up, planned intention, persisted reload, distinct detail tabs and mobile list/detail/back. No external message sent.');
} catch(error) {console.error(error);process.exitCode=1;} finally {await browser.close();}
