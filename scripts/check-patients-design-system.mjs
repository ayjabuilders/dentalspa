/* global document, innerWidth, window, getComputedStyle */
import {chromium} from '@playwright/test';
const browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1440,height:1050}});const errors=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
await page.goto('http://127.0.0.1:4206/design-lab/patients');await page.locator('[data-ready=true]').waitFor();
await page.getByRole('button',{name:'Salma Bennani',exact:false}).first().click();
await page.getByRole('button',{name:'Gérer les tags'}).click();await page.getByRole('button',{name:'Préfère le matin',exact:true}).click();
await page.getByRole('button',{name:'Retirer le tag Préfère le matin'}).waitFor();
await page.screenshot({path:'qa/patients-v2-tags.png',fullPage:true,animations:'disabled',caret:'initial'});
await page.getByRole('button',{name:'Design system',exact:true}).click();
await page.screenshot({path:'qa/patients-v2-system.png',fullPage:true,animations:'disabled',caret:'initial'});
await page.getByRole('button',{name:'Confirmation',exact:true}).click();await page.getByRole('button',{name:'Confirmer en démo'}).click();await page.getByText('Préférence démo activée.',{exact:true}).waitFor();await page.getByRole('button',{name:'Fermer la notification',exact:true}).click();
await page.getByRole('button',{name:'Notifications',exact:true}).click();await page.getByRole('button',{name:'Non lues uniquement'}).click();await page.getByRole('button',{name:'Tout marquer lu'}).click();await page.getByRole('heading',{name:'Tout est à jour'}).waitFor();
await page.screenshot({path:'qa/patients-v2-notifications.png',fullPage:true,animations:'disabled',caret:'initial'});
await page.keyboard.press('Escape');
await page.getByRole('button',{name:'Profil en panneau'}).click();await page.getByRole('button',{name:'Épingler ce profil démo'}).click();await page.getByRole('button',{name:'Retirer des favoris démo'}).waitFor();await page.keyboard.press('Escape');
await page.getByRole('switch').click();if(await page.getByRole('switch').getAttribute('aria-checked')!=='false')throw Error('switch');
await page.getByLabel('Compact',{exact:true}).check();
await page.getByRole('button',{name:'Cartes & graphiques',exact:true}).click();await page.getByLabel('Mesure du graphique').selectOption('Dossiers');await page.getByRole('button',{name:'À compléter : 4 dossiers'}).click();
await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:'qa/patients-v2-cards.png',fullPage:true,animations:'disabled',caret:'initial'});
await page.getByRole('button',{name:'Fondations',exact:true}).click();await page.getByRole('heading',{name:'Le clavier a sa place.'}).waitFor();
await page.setViewportSize({width:390,height:900});
for(const name of ['Composants','Cartes & graphiques','Fondations']){await page.getByRole('button',{name,exact:true}).click();if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('overflow '+name);await page.screenshot({path:'qa/patients-v2-mobile-'+(name==='Composants'?'components':name==='Fondations'?'tokens':'cards')+'.png',fullPage:true,animations:'disabled',caret:'initial'});}
await page.getByRole('button',{name:'Composants',exact:true}).click();await page.getByRole('button',{name:'Profil en panneau'}).click();await page.screenshot({path:'qa/patients-v2-mobile-profile.png',fullPage:false,animations:'disabled',caret:'initial'});await page.keyboard.press('Escape');
await page.emulateMedia({reducedMotion:'reduce'});await page.getByRole('switch').click();
if(await page.locator('[class*=motionOrb]').evaluate(e=>getComputedStyle(e).animationName)!=='none')throw Error('reduced motion');
await page.getByRole('button',{name:'Formulaire patient'}).click();await page.getByLabel('Nom complet fictif').fill('Profil Galerie');await page.getByRole('button',{name:'Ajouter en mémoire'}).click();
await page.getByRole('button',{name:'Profil Galerie',exact:false}).first().waitFor();
console.log('PASS tags, confirmation, notifications/read/empty, profile drawer, toast, controls, chart selection, foundations, form, mobile, reduced motion',errors);await browser.close();if(errors.length)process.exitCode=1;
