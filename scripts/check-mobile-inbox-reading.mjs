/* global document */
import {readFileSync} from 'node:fs';
import {chromium,expect} from '@playwright/test';
const check=expect.configure({timeout:20000}),access=JSON.parse(readFileSync('.local/owner-demo-access.json','utf8'));
const browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:320,height:844},reducedMotion:'reduce'}),errors=[],writes=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/v1/**',r=>{if(!['GET','OPTIONS'].includes(r.request().method())){writes.push(r.request().method());return r.abort();}return r.continue();});
 await page.goto('http://localhost:4204/connection?view=inbox');
 await page.getByLabel('Adresse e-mail',{exact:true}).fill(access.email);await page.getByLabel('Mot de passe',{exact:true}).fill(access.password);await page.getByRole('button',{name:'Se connecter',exact:true}).click();
 const opener=page.getByRole('navigation',{name:'Conversations de simulation'}).getByRole('button').first();
 await opener.click();const list=page.getByRole('list',{name:'Historique des messages'}),back=page.getByRole('button',{name:'Retour aux conversations',exact:true});
 await check.poll(()=>list.evaluate(e=>Math.abs(e.scrollHeight-e.clientHeight-e.scrollTop)<2)).toBe(true);
 const box=await back.boundingBox();check(box.width).toBeGreaterThanOrEqual(44);check(box.height).toBeGreaterThanOrEqual(44);
 await page.screenshot({path:'.local/qa/inbox-latest-mobile.png',animations:'disabled'});
 await list.evaluate(e=>e.scrollTop=120);await check.poll(()=>list.evaluate(e=>e.scrollTop)).toBe(120);
 await back.click();await check(opener).toBeFocused();await opener.click();await check.poll(()=>list.evaluate(e=>e.scrollTop)).toBe(120);
 await page.getByRole('button',{name:'Actualiser les messages',exact:true}).click();await check(page.locator('.fake-inbox')).toHaveAttribute('aria-busy','false');await check.poll(()=>list.evaluate(e=>e.scrollTop)).toBe(120);
 await page.locator('.workspace-mobile-nav').getByRole('button',{name:'Patients',exact:true}).click();await page.getByRole('button',{name:'Ouvrir la fiche de Salma Alaoui (FICTIF)',exact:true}).click();
 const docs=page.getByRole('tab',{name:'Documents',exact:true});await check(docs).toBeVisible();
 check(await docs.evaluate(e=>{const r=document.createRange();r.selectNodeContents(e);return r.getBoundingClientRect().width<=e.clientWidth;})).toBe(true);
 await docs.click();await page.screenshot({path:'.local/qa/patient-documents-mobile-fit.png',animations:'disabled'});
 check(writes).toEqual([]);check(errors).toEqual([]);console.log('PASS inbox opens at latest, preserves older reading position across return and refresh, 44px back, patient Documents label fits at320; no domain writes.');
}finally{await browser.close();}
