/* global document, innerWidth */
import {readFileSync,mkdirSync} from 'node:fs';
import {chromium,expect} from '@playwright/test';
const check=expect.configure({timeout:20000}),base=process.env.CLINIC_OS_LOCAL_URL??'http://localhost:4204';
const browser=await chromium.launch();
try{
 const access=JSON.parse(readFileSync('.local/owner-demo-access.json','utf8'));
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],commands=[];
 page.on('pageerror',error=>errors.push(error.message));
 const catalog={synthetic_only:true,items:Array.from({length:12},(_,index)=>({service_id:'79000000-0000-4000-8000-'+String(index+501).padStart(12,'0'),label:'Prestation QA '+String(index+1).padStart(2,'0'),price_version:1,unit_amount_minor:10000,currency_code:'MAD'}))};
 await page.route('**/api/v1/finance/catalog',route=>route.request().method()==='GET'?route.fulfill({json:catalog,headers:{'Access-Control-Allow-Origin':'*'}}):route.continue());
 await page.route('**/api/v1/finance/patients/*/quotes',async route=>{
  if(route.request().method()!=='POST')return route.continue();
  const request=route.request(),body=request.postDataJSON();commands.push({key:request.headers()['idempotency-key'],body});
  if(commands.length===1)return route.abort('failed');
  const patient_id=new URL(request.url()).pathname.split('/').at(-2);
  return route.fulfill({status:201,headers:{'Access-Control-Allow-Origin':'*'},json:{quote_id:'79000000-0000-4000-8000-000000009999',patient_id,version:1,state:'draft',currency_code:'MAD',total_minor:body.lines.reduce((sum,line)=>sum+line.quantity*10000,0),replayed:true}});
 });
 await page.goto(base+'/connection?view=patients');await page.getByLabel('Adresse e-mail',{exact:true}).fill(access.email);await page.getByLabel('Mot de passe',{exact:true}).fill(access.password);await page.getByRole('button',{name:'Se connecter',exact:true}).click();
 await page.getByRole('button',{name:'Ouvrir la fiche de Salma Alaoui (FICTIF)',exact:true}).click();await page.getByRole('tab',{name:'Devis',exact:true}).click();
 const trigger=page.getByRole('button',{name:'Nouveau devis brouillon',exact:true});await trigger.click();let dialog=page.getByRole('dialog',{name:'Nouveau devis brouillon',exact:true});
 await check(dialog).toHaveAttribute('data-ds','pearl');await check(dialog.getByLabel('Rechercher une prestation pour le devis')).toBeFocused();await check(dialog.getByRole('checkbox')).toHaveCount(6);
 await dialog.getByRole('button',{name:'Prestations suivantes',exact:true}).click();await dialog.getByRole('checkbox',{name:/Prestation QA 07/}).check();await dialog.getByLabel('Quantité',{exact:true}).fill('2');
 await dialog.getByLabel('Rechercher une prestation pour le devis').fill('01');await check(dialog.getByRole('checkbox')).toHaveCount(1);await dialog.getByRole('checkbox',{name:/Prestation QA 01/}).check();await dialog.getByLabel('Rechercher une prestation pour le devis').fill('');
 await dialog.getByRole('button',{name:/Sélection 2/}).click();await check(dialog.getByRole('checkbox')).toHaveCount(2);await check(dialog.locator('.quote-draft-total strong')).toContainText('300');
 await page.keyboard.press('Escape');await check(dialog.getByRole('heading',{name:'Abandonner les modifications ?',exact:true})).toBeVisible();await dialog.getByRole('button',{name:'Continuer la modification',exact:true}).click();await check(dialog.getByRole('checkbox')).toHaveCount(2);
 mkdirSync('.local/qa',{recursive:true});await dialog.screenshot({path:'.local/qa/pearl-quote-modal-desktop.png'});
 await page.setViewportSize({width:390,height:844});await check.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await dialog.screenshot({path:'.local/qa/pearl-quote-modal-mobile.png'});
 await dialog.getByRole('button',{name:'Enregistrer le brouillon',exact:true}).click();await check(dialog.getByRole('alert')).toContainText('Résultat à vérifier');await page.keyboard.press('Escape');await check(dialog).toBeVisible();await check(dialog.getByRole('button',{name:'Fermer',exact:true})).toBeDisabled();await check(dialog.getByRole('checkbox').first()).toBeDisabled();
 await dialog.getByRole('button',{name:'Réessayer la même création',exact:true}).click();await check(dialog).toHaveCount(0);check(commands).toHaveLength(2);check(commands[0].key).toBeTruthy();check(commands[0]).toEqual(commands[1]);
 await check(trigger).toBeVisible();await trigger.click();dialog=page.getByRole('dialog',{name:'Nouveau devis brouillon',exact:true});await check(dialog.getByRole('checkbox')).toHaveCount(6);await dialog.getByRole('button',{name:'Fermer',exact:true}).click();await check(trigger).toBeFocused();
 if(errors.length)throw Error(errors.join('\n'));
 console.log('PASS quote modal focus/restoration, six-row catalogue pagination/search/selection persistence, discard guard, mobile fit, uncertain close/edit lock and identical retry command. Catalogue and quote POST mocked; no financial writes.');
}finally{await browser.close();}
