/* global document, innerWidth */
import {chromium,expect} from '@playwright/test';
import {mkdirSync} from 'node:fs';
const base=process.env.CLINIC_OS_LOCAL_URL??'http://localhost:4204';
const check=expect.configure({timeout:15000});
const browser=await chromium.launch();
mkdirSync('.local/qa',{recursive:true});
const errors=[];
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 const user='10000000-0000-4000-8000-000000000081',a='10000000-0000-4000-8000-000000000082',b='10000000-0000-4000-8000-000000000083';
 const headers={'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*'};
 const choices=[{clinic_id:a,clinic_name:'Cabinet Alpha',roles:['reception']},{clinic_id:b,clinic_name:'Cabinet Beta',roles:['manager']}];
 const calls=[];
 await page.route('**/api/clinic-session',route=>{const body=route.request().postDataJSON();return route.fulfill({status:body.action==='resume'?401:200,json:body.action==='start'?{access_token:'synthetic-ui-token',expires_at:Math.floor(Date.now()/1000)+3600,user_id:user}:{}});});
 await page.route('**/auth/v1/**',route=>route.fulfill({status:route.request().method()==='OPTIONS'?204:200,headers,json:route.request().method()==='OPTIONS'?undefined:{access_token:'synthetic-ui-token',token_type:'bearer',refresh_token:'synthetic-ui-refresh',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user:{id:user,aud:'authenticated',role:'authenticated',email:'staff@example.invalid',app_metadata:{},user_metadata:{},created_at:'2026-10-29T09:00:00Z'}}}));
 await page.route('**/api/v1/**',route=>{if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers});const path=new URL(route.request().url()).pathname;calls.push({path,clinic:route.request().headers()['x-clinic-id']});return path.endsWith('/me/workspaces')?route.fulfill({status:200,headers,json:{items:choices}}):route.fulfill({status:403,headers,json:{message:'forbidden'}});});
 await page.goto(base+'/connection');await check(page.getByRole('button',{name:'Se connecter',exact:true})).toBeEnabled();
 await check(page.locator('.access-shell')).toHaveAttribute('data-ds','pearl');
 await page.screenshot({path:'.local/qa/pearl-entry-desktop.png'});
 await page.getByLabel('Adresse e-mail',{exact:true}).fill('staff@example.invalid');await page.getByLabel('Mot de passe',{exact:true}).fill('synthetic-password');
 await page.getByRole('button',{name:'Afficher le mot de passe',exact:true}).click();await check(page.getByLabel('Mot de passe',{exact:true})).toHaveAttribute('type','text');
 await page.getByRole('button',{name:'Masquer le mot de passe',exact:true}).click();
 await page.getByRole('button',{name:'Se connecter',exact:true}).click();await check(page.getByRole('heading',{name:'Choisissez un cabinet',exact:true})).toBeFocused();
 await check(page.getByRole('button',{name:'Cabinet Beta',exact:true})).toBeVisible();await check(page.getByRole('navigation',{name:'Modules du cabinet'})).toHaveCount(0);
 await page.screenshot({path:'.local/qa/pearl-chooser-desktop.png'});
 await page.setViewportSize({width:390,height:844});await check.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'.local/qa/pearl-chooser-mobile.png',fullPage:true});
 await page.getByRole('button',{name:'Cabinet Beta',exact:true}).click();await check(page.locator('.access-failure')).toBeVisible();if(calls.at(-1).clinic!==b)throw Error('Selected tenant was not verified');
 await context.close();
 const demo=await browser.newContext({viewport:{width:1440,height:1000}}),p=await demo.newPage();p.on('pageerror',e=>errors.push(e.message));
 await p.goto(base+'/clinical');await p.getByLabel('Rechercher une visite fictive').fill('Youssef');await check(p.locator('.clinical-demo-queue-item')).toHaveCount(1);await p.locator('.clinical-demo-queue-item').click();await check(p.locator('.clinical-demo-patient h2')).toHaveText('Youssef Benali');await p.getByLabel('Rechercher une visite fictive').fill('');
 await p.getByRole('button',{name:'Profil précédent',exact:true}).click();await check(p.locator('.clinical-demo-patient h2')).toHaveText('Salma Alaoui');await p.getByRole('button',{name:'Ouvrir le brouillon fictif',exact:true}).click();await check(p.getByRole('heading',{name:'Brouillon fictif · non signé',exact:true})).toBeVisible();
 await p.getByRole('button',{name:'Profil suivant',exact:true}).click();await p.getByRole('button',{name:'Note',exact:true}).click();await check(p.getByRole('heading',{name:'Aucune note clinique',exact:true})).toBeVisible();await p.screenshot({path:'.local/qa/pearl-clinical-desktop.png'});
 await p.goto(base+'/business');await p.getByRole('button',{name:'Continuer vers la simulation',exact:true}).click();
 for(let i=0;i<6;i++){await p.getByLabel('Montant fictif · MAD').fill('10,50');await p.getByLabel('Moyen de règlement fictif').selectOption(i===5?'bank-transfer':'cash');await p.getByRole('button',{name:'Simuler le versement',exact:true}).click();}
 await check(p.locator('.finance-demo-events li')).toHaveCount(1);await check(p.locator('.finance-demo-history-pages')).toContainText('2 / 2');
 await p.getByRole('group',{name:'Filtrer les versements fictifs'}).getByRole('button',{name:'Simulés',exact:true}).click();await check(p.locator('.finance-demo-events li')).toHaveCount(5);
 await p.getByRole('group',{name:'Filtrer les versements fictifs'}).getByRole('button',{name:'En attente',exact:true}).click();await check(p.locator('.finance-demo-events li')).toHaveCount(1);
 await p.getByRole('button',{name:'Prévisualiser le reçu fictif',exact:true}).click();await check(p.locator('.finance-demo-receipt')).toBeVisible();await p.screenshot({path:'.local/qa/pearl-finance-desktop.png'});
 for(const width of [1440,1024,768,390,320]){await p.setViewportSize({width,height:900});for(const path of ['/connection','/clinical','/business']){await p.goto(base+path);await check.poll(()=>p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);if(width===390)await p.screenshot({path:'.local/qa/pearl-'+(path==='/connection'?'entry':path.slice(1))+'-mobile.png',fullPage:true});}}
 if(errors.length)throw Error(errors.join('\n'));
 console.log('PASS auth visibility/password/chooser/focus/denied tenant; clinical search/navigation/draft reset; finance decimal payment/status filter/5-row pagination/receipt; 1440,1024,768,390,320 no overflow. Auth mocked; demos have no backend writes.');
 await demo.close();
}finally{await browser.close();}
