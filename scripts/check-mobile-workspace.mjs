/* global document, innerWidth, innerHeight */
import {readFileSync} from 'node:fs';
import {chromium,expect} from '@playwright/test';
const access=JSON.parse(readFileSync('.local/owner-demo-access.json','utf8'));
const browser=await chromium.launch(),check=expect.configure({timeout:20000});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[],writes=[];
 page.on('pageerror',error=>errors.push(error.message));
 page.on('request',request=>{if(request.url().includes('/api/v1/')&&request.method()==='POST')writes.push(request.url());});
 await page.goto('http://localhost:4204/connection?view=patients');
 await page.getByLabel('Adresse e-mail',{exact:true}).fill(access.email);await page.getByLabel('Mot de passe',{exact:true}).fill(access.password);await page.getByRole('button',{name:'Se connecter',exact:true}).click();
 const nav=page.locator('.workspace-mobile-nav');await check(nav).toBeVisible();
 await check(page.getByRole('button',{name:'Ouvrir la fiche de Salma Alaoui (FICTIF)',exact:true})).toBeVisible();
 await page.screenshot({animations:'disabled',path:'.local/qa/mobile-patients-real.png'});
 for(const width of [320,390,430]){
  await page.setViewportSize({width,height:844});
  await check.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight+1)).toBe(true);
  const before=await nav.boundingBox();await page.locator('.connected-module-content').evaluate(el=>{el.scrollTop=el.scrollHeight;});
  await check.poll(async()=>(await nav.boundingBox()).y).toBe(before.y);
  await check(nav.getByRole('button')).toHaveCount(4);
 }
 await page.setViewportSize({width:390,height:844});
 await nav.getByRole('button',{name:'Agenda',exact:true}).click();await check(page).toHaveURL(/view=planning/);
 await page.goBack();await check(page).toHaveURL(/view=patients/);await check(nav.getByRole('button',{name:'Patients',exact:true})).toHaveAttribute('aria-current','page');
 await page.goForward();await check(nav.getByRole('button',{name:'Agenda',exact:true})).toHaveAttribute('aria-current','page');
 await nav.getByRole('button',{name:'Tous les espaces du cabinet',exact:true}).click();
 const spaces=page.getByRole('dialog',{name:'Espaces du cabinet',exact:true});await check(spaces).toHaveAttribute('data-mobile-presentation','sheet');
 await check(spaces).toBeVisible();await page.screenshot({animations:'disabled',path:'.local/qa/mobile-spaces.png'});
 await spaces.getByRole('button',{name:/Catalogue tarifaire/}).click();await check(spaces).toHaveCount(0);await check(page).toHaveURL(/view=finance-catalog/);
 await page.getByRole('button',{name:'Ajouter une prestation',exact:true}).click();
 const editor=page.getByRole('dialog',{name:'Nouvelle prestation',exact:true});await check(editor).toHaveAttribute('data-mobile-presentation','sheet');
 await editor.getByRole('textbox').first().fill('Contrôle UX fictif');
 await page.goBack();await check(page).toHaveURL(/view=finance-catalog/);await check(editor).toBeVisible();await check(editor.getByRole('textbox').first()).toHaveValue('Contrôle UX fictif');
 await page.screenshot({animations:'disabled',path:'.local/qa/mobile-catalog-sheet.png'});
 await editor.getByRole('button',{name:'Fermer',exact:true}).last().click();await editor.getByRole('button',{name:'Abandonner les modifications',exact:true}).click();await check(editor).toHaveCount(0);
 await nav.getByRole('button',{name:'Patients',exact:true}).click();
 await page.getByRole('button',{name:'Ouvrir la fiche de Salma Alaoui (FICTIF)',exact:true}).click();await check(page).toHaveURL(/patient=[0-9a-f-]{36}/);
 await check(page.getByRole('region',{name:'Dossier patient enregistré'})).toBeVisible();
 await check(page.getByRole('tab',{name:'Aperçu',exact:true})).toBeVisible();
 await page.screenshot({animations:'disabled',path:'.local/qa/mobile-patient-real.png'});
 await page.goBack();await check(page).not.toHaveURL(/patient=/);await check(page.getByRole('button',{name:'Ouvrir la fiche de Salma Alaoui (FICTIF)',exact:true})).toBeVisible();
 await page.goForward();await check(page.getByRole('region',{name:'Dossier patient enregistré'})).toBeVisible();
 await page.setViewportSize({width:1440,height:1000});await check(nav).toBeHidden();await check(page.locator('.workspace-rail')).toBeVisible();
 check(writes).toEqual([]);check(errors).toEqual([]);
 const assistant=await browser.newPage({viewport:{width:390,height:844}});
 // Presentation-only role fixture: real account/backend authorization is unchanged.
 await assistant.route('**/api/v1/me/workspace',async route=>{const response=await route.fetch();await route.fulfill({response,json:{...await response.json(),roles:['assistant']}});});
 await assistant.goto('http://localhost:4204/connection?view=patients');
 await assistant.getByLabel('Adresse e-mail',{exact:true}).fill(access.email);await assistant.getByLabel('Mot de passe',{exact:true}).fill(access.password);await assistant.getByRole('button',{name:'Se connecter',exact:true}).click();
 const limitedNav=assistant.locator('.workspace-mobile-nav');await check(limitedNav).toBeVisible();await check(limitedNav.getByRole('button',{name:'Agenda',exact:true})).toHaveCount(0);
 await limitedNav.getByRole('button',{name:'Tous les espaces du cabinet',exact:true}).click();
 const limitedMenu=assistant.getByRole('dialog',{name:'Espaces du cabinet',exact:true});
 for(const label of ['Catalogue tarifaire','Paramètres agenda','Réservations','Messagerie'])await check(limitedMenu.getByRole('button',{name:new RegExp(label)})).toHaveCount(0);
 await check(limitedMenu.getByRole('button',{name:/Patients/})).toBeVisible();
 console.log('PASS mobile dock 320/390/430, bounded scroll, menu/sheet, browser back/forward, dirty-form protection, patient deep-link/back, desktop rail unchanged. Assistant role presentation mocked: restricted modules absent. No API writes.');
}finally{await browser.close();}
