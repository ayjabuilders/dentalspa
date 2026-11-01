/* global document, innerWidth */
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
import {chromium,expect} from '@playwright/test';
import pg from 'pg';
const check=expect.configure({timeout:25000}),base=process.env.CLINIC_OS_LOCAL_URL??'http://localhost:4204';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname),'This check is local only.');
const clinic='10000000-0000-4000-8000-000000000001',patient='20000000-0000-4000-8000-000000000001';
const db=new pg.Client({host:'127.0.0.1',port:54322,user:'postgres',password:'postgres',database:'postgres',connectionTimeoutMillis:5000});
const browser=await chromium.launch();
try{
 await db.connect();const original=(await db.query('select id from private.finance_quotes where clinic_id=$1 and patient_id=$2 order by id',[clinic,patient])).rows.map(row=>row.id);
 const access=JSON.parse(readFileSync('.local/owner-demo-access.json','utf8')),page=await browser.newPage({viewport:{width:1440,height:1000}}),commands=[];let receipt;
 await page.route('**/api/v1/finance/patients/*/quotes',async route=>{
  const request=route.request();if(request.method()!=='POST')return route.continue();
  assert.ok(new URL(request.url()).pathname.endsWith('/patients/'+patient+'/quotes'));
  const key=request.headers()['idempotency-key'],body=request.postDataJSON();assert.match(key,/^[0-9a-f-]{36}$/i);commands.push({key,body});
  const response=await route.fetch();assert.equal(response.status(),201);receipt=await response.json();assert.equal(receipt.patient_id,patient);
  if(commands.length===1){
   mkdirSync('.local/qa',{recursive:true});const file='.local/qa/pearl-native-quote-records.json',records=existsSync(file)?JSON.parse(readFileSync(file,'utf8')):[];
   records.push({purpose:'Pearl quote modal actual save/lost-response replay QA',createdAt:new Date().toISOString(),clinicId:clinic,patientId:patient,quoteId:receipt.quote_id,requestKey:key,baselineQuoteCount:original.length});writeFileSync(file,JSON.stringify(records,null,2));
   return route.abort('failed');
  }
  return route.fulfill({response});
 });
 await page.goto(base+'/connection?view=patients');await page.getByLabel('Adresse e-mail',{exact:true}).fill(access.email);await page.getByLabel('Mot de passe',{exact:true}).fill(access.password);await page.getByRole('button',{name:'Se connecter',exact:true}).click();
 await page.getByRole('button',{name:'Ouvrir la fiche de Salma Alaoui (FICTIF)',exact:true}).click();await page.getByRole('tab',{name:'Devis',exact:true}).click();await page.getByRole('button',{name:'Nouveau devis brouillon',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Nouveau devis brouillon',exact:true});await check(dialog.getByRole('checkbox').first()).toBeEnabled();await dialog.getByRole('checkbox').first().check();await dialog.getByLabel('Quantité',{exact:true}).fill('2');await dialog.getByRole('button',{name:'Enregistrer le brouillon',exact:true}).click();
 await check(dialog.getByRole('alert')).toContainText('Résultat à vérifier');await page.keyboard.press('Escape');await check(dialog).toBeVisible();await check(dialog.getByRole('button',{name:'Fermer',exact:true})).toBeDisabled();await check(dialog.getByRole('checkbox').first()).toBeDisabled();await dialog.screenshot({path:'.local/qa/pearl-quote-native-uncertain.png'});
 await dialog.getByRole('button',{name:'Réessayer la même création',exact:true}).click();await check(dialog).toHaveCount(0);assert.equal(commands.length,2);assert.deepEqual(commands[0],commands[1]);assert.equal(receipt.replayed,true);
 const after=(await db.query('select id from private.finance_quotes where clinic_id=$1 and patient_id=$2 order by id',[clinic,patient])).rows.map(row=>row.id);assert.equal(after.length,original.length+1);assert.deepEqual(after.filter(id=>id!==receipt.quote_id),original);
 const persisted=(await db.query('select receipt from private.finance_draft_commands where clinic_id=$1 and request_key=$2',[clinic,commands[0].key])).rows;assert.equal(persisted.length,1);assert.equal(persisted[0].receipt.quote_id,receipt.quote_id);
 assert.equal((await db.query("select count(*)::int n from private.outbox_events where clinic_id=$1 and correlation_id=$2 and event_type='LocalQuoteDraftCreated'",[clinic,commands[0].key])).rows[0].n,1);
 assert.equal((await db.query('select count(*)::int n from private.audit_events where clinic_id=$1 and correlation_id=$2',[clinic,commands[0].key])).rows[0].n,1);
 await page.reload();await check(page.getByRole('button',{name:'Ouvrir la fiche de Salma Alaoui (FICTIF)',exact:true})).toBeVisible();const read=page.waitForResponse(response=>new URL(response.url()).pathname.endsWith('/patients/'+patient+'/hub')&&response.status()===200);await page.getByRole('button',{name:'Ouvrir la fiche de Salma Alaoui (FICTIF)',exact:true}).click();const hub=await(await read).json();assert.ok(hub.quotes.some(quote=>quote.id===receipt.quote_id&&quote.total_minor===receipt.total_minor));await page.getByRole('tab',{name:'Devis',exact:true}).click();await check(page.locator('.patient-quotes>.patient-quote')).toHaveCount(original.length+1);await check.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:'.local/qa/pearl-quote-native-restored.png'});
 console.log('PASS actual local quote save, lost-response same-key replay, one quote/command/audit/outbox delta and read after reload. Existing quotes preserved. QA record retained:',receipt.quote_id);
}finally{await browser.close();await db.end();}
