/* global document, innerWidth, window, Event */
import {readFileSync,mkdirSync} from 'node:fs';
import {chromium,expect} from '@playwright/test';
const check=expect.configure({timeout:20000}),base=process.env.CLINIC_OS_LOCAL_URL??'http://localhost:4204';
const uuid=index=>'79000000-0000-4000-8000-'+String(index).padStart(12,'0');
const details={subtotal_minor:12500,discount_minor:0,tax_minor:0,valid_until:null,lines:[{line_number:1,label:'Consultation QA fictive',quantity:1,unit_amount_minor:12500,subtotal_minor:12500,discount_minor:0,tax_minor:0,total_minor:12500}]};
const quote={id:uuid(8000),version:1,state:'draft',currency_code:'MAD',total_minor:12500,details};
const browser=await chromium.launch();
try{
 const access=JSON.parse(readFileSync('.local/owner-demo-access.json','utf8'));
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],commands=[];let clinicId,patient,prepared=false;
 const hasUnloadGuard=()=>page.evaluate(()=>{const event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event);return event.defaultPrevented;});
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/api/v1/patients/*/hub',async route=>{
  const response=await route.fetch(),hub=await response.json();patient=hub.patient;clinicId=route.request().headers()['x-clinic-id'];
  await route.fulfill({response,json:{...hub,quotes:[{...quote,id:uuid(9001)},quote]}});
 });
 function record(index,draft=false){
  const source=draft?quote:{...quote,id:uuid(9000+index)},person={id:patient.id,reference:patient.reference,display_name:patient.display_name};
  return {invoice_id:uuid(10000+index),patient_id:patient.id,quote_id:source.id,quote_version:1,state:draft?'draft':'issued',number:draft?null:'DEMO-UX-'+index,issued_at:draft?null:'2026-10-31T10:00:00Z',created_at:'2026-10-31T10:00:00Z',total_minor:12500,currency_code:'MAD',snapshot:{schema_version:1,synthetic_only:true,clinic:{id:clinicId,name:'Cabinet UX (FICTIF)'},patient:person,payer:person,payer_basis:'patient_self_synthetic_fixture',quote:source,disclaimer:'LOCAL SYNTHETIC DOCUMENT - NOT A STATUTORY INVOICE'}};
 }
 await page.route('**/api/v1/finance/patients/*/invoices',async route=>{
  const request=route.request();
  if(request.method()==='GET')return route.fulfill({headers:{'Access-Control-Allow-Origin':'*'},json:{synthetic_only:true,items:[...(prepared?[record(99,true)]:[]),...Array.from({length:12},(_,index)=>record(index+1))],truncated:false}});
  if(request.method()!=='POST')return route.continue();
  commands.push({key:request.headers()['idempotency-key'],body:request.postDataJSON()});
  if(commands.length===1)return route.fulfill({status:409,json:{message:'Synthetic conflict'},headers:{'Access-Control-Allow-Origin':'*'}});
  prepared=true;if(commands.length===2)return route.abort('failed');
  return route.fulfill({status:201,headers:{'Access-Control-Allow-Origin':'*'},json:{invoice_id:uuid(10099),patient_id:patient.id,quote_id:quote.id,quote_version:1,state:'draft',total_minor:12500,currency_code:'MAD',synthetic_only:true,replayed:true}});
 });
 await page.goto(base+'/connection?view=patients');await page.getByLabel('Adresse e-mail',{exact:true}).fill(access.email);await page.getByLabel('Mot de passe',{exact:true}).fill(access.password);await page.getByRole('button',{name:'Se connecter',exact:true}).click();
 await page.getByRole('button',{name:'Ouvrir la fiche de Salma Alaoui (FICTIF)',exact:true}).click();await page.getByRole('tab',{name:'Factures',exact:true}).click();
 const invoices=page.getByRole('region',{name:'Factures du patient'}),cards=invoices.locator('.invoice-register>.invoice-card'),search=invoices.getByRole('textbox',{name:'Rechercher une facture'});
 await check(cards).toHaveCount(10);await invoices.getByRole('button',{name:'Factures suivantes',exact:true}).click();await check(cards).toHaveCount(2);await check(cards.first()).toContainText('DEMO-UX-11');
 await search.fill('DEMO-UX-12');await check(cards).toHaveCount(1);await search.fill('introuvable');await check(cards).toHaveCount(0);await check(invoices.getByRole('heading',{name:'Aucune facture pour ces filtres'})).toBeVisible();await invoices.getByRole('button',{name:'Réinitialiser les filtres'}).click();await check(cards).toHaveCount(10);
 await invoices.getByRole('button',{name:/Brouillons/}).click();await check(cards).toHaveCount(0);await invoices.getByRole('button',{name:/Émises/}).click();await check(cards).toHaveCount(10);
 mkdirSync('.local/qa',{recursive:true});await invoices.screenshot({path:'.local/qa/pearl-invoices-register-desktop.png'});
 const trigger=invoices.getByRole('button',{name:'Nouvelle facture',exact:true});await trigger.click();const modal=page.getByRole('dialog',{name:'Préparer une facture',exact:true}),select=modal.getByLabel('Devis source',{exact:true});
 await check(modal).toHaveAttribute('data-ds','pearl');await check(select).toBeFocused();await check(modal.getByRole('button',{name:'Préparer la facture',exact:true})).toBeDisabled();check(await hasUnloadGuard()).toBe(false);
 await check(select.getByRole('option',{name:/Devis 2/})).toHaveAttribute('value',quote.id);await check(select.getByRole('option')).toHaveCount(2);
 await select.selectOption(quote.id);await check.poll(hasUnloadGuard).toBe(true);await page.keyboard.press('Escape');await check(modal.getByRole('heading',{name:'Abandonner cette préparation ?',exact:true})).toBeVisible();await modal.getByRole('button',{name:'Continuer la préparation',exact:true}).click();await check(select).toHaveValue(quote.id);
 await modal.getByRole('button',{name:'Annuler',exact:true}).click();await modal.getByRole('button',{name:'Abandonner la préparation',exact:true}).click();await check(modal).toHaveCount(0);await check(trigger).toBeFocused();check(commands).toHaveLength(0);
 await trigger.click();await check(select).toHaveValue('');await select.selectOption(quote.id);await modal.getByRole('button',{name:'Préparer la facture',exact:true}).click();await check(modal.getByRole('alert')).toContainText('a changé');await check(select).toBeEnabled();
 await modal.getByRole('button',{name:'Préparer la facture',exact:true}).click();await check(modal.getByRole('alert')).toContainText('Résultat à vérifier');await page.keyboard.press('Escape');await check(modal).toBeVisible();await check(select).toBeDisabled();await check(modal.getByRole('button',{name:'Fermer',exact:true})).toBeDisabled();await check(page.getByRole('tab',{name:'Devis',exact:true,includeHidden:true})).toBeDisabled();
 await check.poll(hasUnloadGuard).toBe(true);await modal.screenshot({path:'.local/qa/pearl-invoices-modal-uncertain.png'});await page.setViewportSize({width:390,height:844});await check.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await check.poll(()=>modal.evaluate(element=>element.scrollWidth<=element.clientWidth)).toBe(true);await modal.screenshot({path:'.local/qa/pearl-invoices-modal-mobile.png'});
 await modal.getByRole('button',{name:'Réessayer la même commande',exact:true}).click();await check(modal).toHaveCount(0);check(commands).toHaveLength(3);check(commands[0].key).not.toEqual(commands[1].key);check(commands[1]).toEqual(commands[2]);check(commands[2].body).toEqual({quote_id:quote.id,quote_version:1});
 await check(cards).toHaveCount(1);await check(cards.first()).toContainText('Facture brouillon');await check(trigger).toBeFocused();await check.poll(hasUnloadGuard).toBe(false);await invoices.getByRole('button',{name:/Toutes/}).click();await check(cards).toHaveCount(10);await check.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await invoices.screenshot({path:'.local/qa/pearl-invoices-register-mobile.png'});
 await page.setViewportSize({width:320,height:740});await check.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await trigger.click();await check(modal.getByText('Aucun devis disponible',{exact:true})).toBeVisible();await check(modal.getByRole('button',{name:'Préparer la facture',exact:true})).toBeDisabled();await modal.getByRole('button',{name:'Fermer',exact:true}).click();await check(trigger).toBeFocused();
 if(errors.length)throw Error(errors.join('\n'));
 console.log('PASS invoice register 10-row paging/search/status/empty reset; prepare modal focus/discard/no-quote; known conflict unlock; uncertain close/edit/navigation locks; identical retry; 390/320px fit. Invoice writes and hub quotes mocked; no financial writes.');
}finally{await browser.close();}
