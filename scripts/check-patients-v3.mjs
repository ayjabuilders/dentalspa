/* global document, innerWidth */
import {chromium} from '@playwright/test';
const browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1440,height:1050}});const errors=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
await page.goto('http://127.0.0.1:4206/design-lab/patients');await page.locator('[data-ready=true]').waitFor();
await page.getByRole('button',{name:'Cartes',exact:true}).click();
await page.getByLabel('Filtrer par ville').selectOption('Rabat');await page.getByLabel('Trier les patients').selectOption('Nom A–Z');
if(await page.locator('[class*=patientTile]').count()!==5)throw Error('city filter');
await page.screenshot({path:'qa/patients-v3-cards.png',fullPage:true,animations:'disabled',caret:'initial'});
await page.getByRole('button',{name:/Nour El Idrissi/}).click();
await page.getByLabel('Identité administrative vérifiée').check();await page.getByLabel('Note administrative fictive').fill('Accueil en français — exemple fictif.');await page.getByRole('button',{name:'Enregistrer la note démo'}).click();
await page.getByRole('button',{name:'Retour aux patients',exact:true}).click();
if(await page.getByLabel('Filtrer par ville').inputValue()!=='Rabat')throw Error('city lost');
await page.getByRole('button',{name:/Nour El Idrissi/}).click();
if(!await page.getByLabel('Identité administrative vérifiée').isChecked())throw Error('checklist lost');
if(!(await page.getByLabel('Note administrative fictive').inputValue()).includes('français'))throw Error('note lost');
await page.screenshot({path:'qa/patients-v3-profile.png',fullPage:true,animations:'disabled',caret:'initial'});
await page.getByRole('button',{name:'Préférences de présentation'}).click();await page.getByRole('switch',{name:'Affichage compact'}).click();await page.getByRole('switch',{name:'Animations du prototype'}).click();
await page.screenshot({path:'qa/patients-v3-settings.png',fullPage:false,animations:'disabled',caret:'initial'});await page.keyboard.press('Escape');
if(await page.locator('[data-ready]').getAttribute('data-compact')!=='true')throw Error('density');
await page.getByRole('button',{name:'Centre de notifications'}).click();await page.getByRole('button',{name:'Voir les dossiers',exact:true}).click();if(await page.getByLabel('Filtrer les dossiers').inputValue()!=='À compléter')throw Error('notification action');
await page.getByRole('button',{name:'Centre de notifications'}).click();await page.getByRole('button',{name:'Non lues',exact:true}).click();await page.getByRole('heading',{name:'Vous êtes à jour'}).waitFor();await page.keyboard.press('Escape');
await page.getByLabel('Filtrer les dossiers').selectOption('Tous');await page.getByLabel('Trier les patients').selectOption('Ordre initial');await page.getByRole('button',{name:'Liste',exact:true}).click();
await page.screenshot({path:'qa/patients-v3-desktop.png',fullPage:true,animations:'disabled',caret:'initial'});
for(const width of [1280,768,390]){await page.setViewportSize({width,height:900});if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('overflow '+width);await page.screenshot({path:`qa/patients-v3-${width}.png`,fullPage:true,animations:'disabled',caret:'initial'});}
await page.getByRole('button',{name:'Cartes',exact:true}).click();await page.getByRole('button',{name:/Salma Bennani/}).first().click();await page.screenshot({path:'qa/patients-v3-mobile-profile.png',fullPage:true,animations:'disabled',caret:'initial'});
if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('profile mobile overflow');
await page.reload();await page.locator('[data-ready=true]').waitFor();await page.getByRole('button',{name:/Nour El Idrissi/}).first().click();if(await page.getByLabel('Note administrative fictive').inputValue()!=='')throw Error('unexpected persistence');
console.log('PASS cards, city, sorting, state restoration, checklist, notes, preferences, notification navigation, unread empty, responsive and reload reset',errors);await browser.close();if(errors.length)process.exitCode=1;
