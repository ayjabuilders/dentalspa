import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chromium,expect} from '@playwright/test';
const credentials=JSON.parse(readFileSync('.local/owner-demo-access.json','utf8'));
const browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 await page.goto('http://localhost:4204/connection?view=planning');
 await page.getByLabel('Adresse e-mail',{exact:true}).fill(credentials.email);await page.getByLabel('Mot de passe',{exact:true}).fill(credentials.password);await page.getByRole('button',{name:'Se connecter',exact:true}).click();
 const nav=page.getByRole('navigation',{name:'Modules du cabinet'}),agenda=page.locator('.recorded-appointments');
 await expect(agenda).toHaveAttribute('aria-busy','false');await expect(agenda.getByRole('heading',{name:'Agenda des patients'})).toBeVisible();
 assert.ok((await page.locator('.connected-path').boundingBox()).height<55,'History toolbar too tall');
 assert.ok((await agenda.locator('.recorded-calendar-summary').boundingBox()).height<60,'Status filters too tall');
 await expect(agenda.getByRole('combobox',{name:'Période',exact:true})).toHaveCount(0);
 await page.screenshot({path:'.local/qa/agenda-compact-desktop.png'});
 await nav.getByRole('button',{name:'Paramètres agenda',exact:true}).click();const settings=page.locator('.agenda-settings');await expect(settings).toHaveAttribute('aria-busy','false');
 const card=await settings.boundingBox(),tabs=await settings.getByRole('tablist').boundingBox();assert.ok(tabs.y-card.y<225,'Settings controls consume too much vertical space');await expect(settings.getByText(/chargée depuis le serveur/)).toHaveCount(0);await expect(settings.locator('.agenda-settings-help')).not.toHaveAttribute('open','');
 await page.screenshot({path:'.local/qa/agenda-settings-compact-desktop.png'});
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>globalThis.document.documentElement.scrollWidth<=globalThis.innerWidth),true);await page.screenshot({path:'.local/qa/agenda-settings-compact-mobile.png'});
 await page.setViewportSize({width:1440,height:1000});await nav.getByRole('button',{name:'Patients',exact:true}).click();await page.getByRole('region',{name:'Patients autorisés'}).getByRole('button').first().click();const hub=page.getByRole('region',{name:'Dossier patient enregistré'});await expect(hub.getByRole('heading',{name:'Coordonnées',exact:true})).toBeVisible();await expect(hub.getByRole('tabpanel')).toHaveCount(1);await page.screenshot({path:'.local/qa/patient-sections-desktop.png'});
 console.log('PASS native read-only compact agenda/settings geometry, one period selector, mobile bounds and separated patient sections.');
}finally{await browser.close();}
