/* global document, innerWidth, getComputedStyle */
import {chromium} from '@playwright/test';
const browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1440,height:1050}});const errors=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
await page.goto((process.env.PEARL_UI_URL??'http://127.0.0.1:4206')+'/design-lab/system');await page.locator('[data-ready=true]').waitFor();
await page.screenshot({path:'qa/pearl-catalogue-desktop.png',fullPage:true,animations:'disabled',caret:'initial'});
await page.getByRole('button',{name:'Ouvrir le formulaire'}).click();await page.getByRole('button',{name:'Valider l’exemple'}).click();
await page.getByText('Saisissez un nom fictif.',{exact:true}).waitFor();if(await page.getByLabel('Nom fictif').getAttribute('aria-invalid')!=='true')throw Error('invalid field');
await page.getByLabel('Nom fictif').fill('Exemple catalogue');await page.getByRole('button',{name:'Valider l’exemple'}).click();
await page.getByRole('button',{name:'Validation…'}).waitFor();await page.getByRole('dialog').waitFor({state:'hidden'});if(!await page.getByRole('button',{name:'Ouvrir le formulaire'}).evaluate(e=>e===document.activeElement))throw Error('focus restore');
await page.getByRole('switch',{name:'Densité compacte'}).click();await page.getByRole('switch',{name:'Réduire les animations'}).click();await page.getByRole('button',{name:'Ouvrir le panneau'}).click();
if(await page.getByRole('dialog').evaluate(e=>getComputedStyle(e).getPropertyValue('--ds-primary').trim())!=='#6942cb')throw Error('portal tokens');
if(await page.getByRole('dialog').evaluate(e=>getComputedStyle(e).getPropertyValue('--ds-enter').trim())!=='0ms')throw Error('portal motion');
await page.getByRole('button',{name:'Marquer comme lu'}).click();await page.getByRole('heading',{name:'Tout est lu'}).waitFor();await page.screenshot({path:'qa/pearl-catalogue-drawer.png',fullPage:false,animations:'disabled',caret:'initial'});
for(let i=0;i<8;i++){await page.keyboard.press('Tab');if(!await page.getByRole('dialog').evaluate(e=>e.contains(document.activeElement)))throw Error('focus escaped');}
await page.keyboard.press('Escape');
await page.getByRole('tab',{name:'Identité',exact:true}).focus();await page.keyboard.press('ArrowRight');if(await page.getByRole('tab',{name:'Historique',exact:true}).getAttribute('aria-selected')!=='true')throw Error('tabs keyboard');
await page.getByRole('switch',{name:'Aperçu RTL'}).click();await page.getByRole('tab',{name:'Historique',exact:true}).focus();await page.keyboard.press('ArrowLeft');if(await page.getByRole('tab',{name:'Documents',exact:true}).getAttribute('aria-selected')!=='true')throw Error('RTL tabs');await page.getByRole('switch',{name:'Aperçu RTL'}).click();
await page.getByLabel('Rechercher dans les exemples').fill('zzzzz');await page.getByRole('heading',{name:'Aucun exemple trouvé'}).waitFor();await page.getByRole('button',{name:'Réinitialiser',exact:true}).click();await page.getByRole('button',{name:'Page suivante'}).click();await page.getByText('Prénom composé de démonstration — nom volontairement très long',{exact:true}).waitFor();
await page.getByRole('button',{name:'Rabat : 1'}).click();await page.getByText('Rabat · 1 exemple(s)',{exact:true}).waitFor();
for(const width of [1280,768,390]){await page.setViewportSize({width,height:900});if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('overflow '+width);await page.screenshot({path:`qa/pearl-catalogue-${width}.png`,fullPage:true,animations:'disabled',caret:'initial'});}
await page.emulateMedia({reducedMotion:'reduce'});await page.getByRole('switch',{name:'Réduire les animations'}).click();if(await page.locator('.ds-spinner').evaluate(e=>getComputedStyle(e).animationName)!=='none')throw Error('system motion');
// Scoped styles must not change existing generic button or body styles after navigation.
await page.goto((process.env.PEARL_UI_URL??'http://127.0.0.1:4206')+'/design-lab/patients');await page.locator('[data-ready=true]').waitFor();await page.getByRole('button',{name:/Salma Bennani/}).first().click();
await page.locator('.ds-badge').first().waitFor();await page.getByRole('button',{name:'Retirer le tag Accueil à préparer'}).click();if(await page.getByRole('button',{name:'Retirer le tag Accueil à préparer'}).count())throw Error('shared badge removal');
console.log('PASS catalogue form/error/loading/success, portal tokens, focus trap/return, RTL tabs, table/filter/empty, pagination, chart, responsive, reduced motion, shared patient badge',errors);await browser.close();if(errors.length)process.exitCode=1;
