/* global document,innerWidth,innerHeight,getComputedStyle */
import {chromium} from '@playwright/test';
import {mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const base=new URL('./.qa/',import.meta.url);mkdirSync(base,{recursive:true});
const b=await chromium.launch();const p=await b.newPage({viewport:{width:390,height:844}});const errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
await p.goto('http://127.0.0.1:4216/design-lab/patients/mobile',{timeout:120000});await p.locator('[data-ready=true]').waitFor();
for(const width of [320,390,430]){await p.setViewportSize({width,height:844});if(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('overflow '+width);await p.screenshot({path:fileURLToPath(new URL(`list-${width}.png`,base)),animations:'disabled',caret:'initial'});}
await p.setViewportSize({width:390,height:844});
await p.getByLabel('Rechercher un patient').fill('zzzz');await p.getByRole('heading',{name:'Aucun résultat'}).waitFor();await p.getByRole('button',{name:'Réinitialiser',exact:true}).click();
await p.getByRole('button',{name:'Filtres patients'}).click();await p.getByRole('dialog').getByRole('button',{name:'À compléter',exact:true}).click();await p.getByRole('button',{name:'Afficher les résultats'}).click();
await p.getByRole('button',{name:'Salma Bennani',exact:false}).click();
await p.getByRole('tab',{name:'Aperçu',exact:true}).focus();await p.keyboard.press('ArrowRight');if(await p.getByRole('tab',{name:'RDV',exact:true}).getAttribute('aria-selected')!=='true')throw Error('tab');
await p.getByRole('tab',{name:'Documents',exact:true}).click();await p.getByRole('button',{name:'Fiche d’accueil',exact:false}).click();await p.getByRole('dialog').waitFor();await p.keyboard.press('Escape');
await p.getByRole('tab',{name:'Finances',exact:true}).click();await p.getByText('600 DH',{exact:true}).waitFor();await p.getByRole('tab',{name:'Aperçu',exact:true}).click();
await p.screenshot({path:fileURLToPath(new URL('profile-390.png',base)),animations:'disabled',caret:'initial'});
await p.getByRole('button',{name:'Simuler un rendez-vous'}).click();await p.getByLabel('Date illustrative').fill('2026-11-03');await p.getByRole('button',{name:'Ajouter en mémoire'}).click();await p.getByText('2026-11-03 · 10:00',{exact:true}).waitFor();
await p.getByRole('button',{name:'Retour à la liste'}).click();if(await p.getByRole('button',{name:'À compléter',exact:true}).getAttribute('aria-pressed')!=='true')throw Error('filter lost');
await p.getByRole('button',{name:'Nouveau patient',exact:true}).click();await p.getByRole('button',{name:'Ajouter en mémoire'}).click();await p.getByRole('dialog').getByRole('alert').waitFor();
await p.screenshot({path:fileURLToPath(new URL('sheet-error-390.png',base)),animations:'disabled',caret:'initial'});
for(const width of [320,390,430]){await p.setViewportSize({width,height:844});if(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('sheet overflow '+width);await p.screenshot({path:fileURLToPath(new URL(`sheet-${width}.png`,base)),animations:'disabled',caret:'initial'});}
await p.setViewportSize({width:390,height:480});if(!await p.getByRole('dialog').evaluate(e=>{const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight+1;}))throw Error('short viewport sheet');await p.setViewportSize({width:390,height:844});
await p.getByLabel('Nom fictif').fill('Yasmine Mobile');await p.getByRole('button',{name:'Annuler',exact:true}).click();await p.getByRole('heading',{name:'Quitter le formulaire ?'}).waitFor();await p.getByRole('button',{name:'Continuer la saisie'}).click();if(await p.getByLabel('Nom fictif').inputValue()!=='Yasmine Mobile')throw Error('draft lost');
for(let i=0;i<9;i++){await p.keyboard.press('Tab');if(!await p.getByRole('dialog').evaluate(e=>e.contains(document.activeElement)))throw Error('focus trap');}
await p.getByRole('button',{name:'Ajouter en mémoire'}).click();await p.getByRole('button',{name:'Yasmine Mobile',exact:false}).waitFor();
await p.getByRole('button',{name:'Agenda',exact:true}).click();await p.getByRole('heading',{name:'Au fil de la journée'}).waitFor();await p.screenshot({path:fileURLToPath(new URL('agenda-390.png',base)),animations:'disabled',caret:'initial'});
await p.getByRole('button',{name:'Activité',exact:true}).click();await p.getByRole('button',{name:'Marquer comme lu'}).click();await p.getByRole('heading',{name:'Vous êtes à jour'}).waitFor();await p.getByRole('button',{name:'Patients',exact:true}).click();
await p.getByLabel('Rechercher un patient').fill('Salma');await p.getByRole('button',{name:'Salma Bennani',exact:false}).click();await p.getByRole('button',{name:'Retour à la liste'}).click();if(await p.getByLabel('Rechercher un patient').inputValue()!=='Salma')throw Error('search lost');
await p.emulateMedia({reducedMotion:'reduce'});await p.getByRole('button',{name:'Nouveau patient',exact:true}).click();if(await p.getByRole('dialog').evaluate(e=>getComputedStyle(e).animationName)!=='none')throw Error('motion');await p.keyboard.press('Escape');if(!await p.getByRole('button',{name:'Nouveau patient',exact:true}).evaluate(e=>e===document.activeElement))throw Error('focus return');
await p.reload();await p.locator('[data-ready=true]').waitFor();await p.getByLabel('Rechercher un patient').fill('Yasmine Mobile');await p.getByRole('heading',{name:'Aucun résultat'}).waitFor();
await p.getByRole('button',{name:'Réinitialiser',exact:true}).click();await p.getByRole('button',{name:'Afficher les 4 autres dossiers'}).click();await p.getByRole('button',{name:'Rayan Sabri',exact:false}).scrollIntoViewIfNeeded();const before=await p.getByRole('main').evaluate(e=>e.scrollTop);await p.getByRole('button',{name:'Rayan Sabri',exact:false}).click();await p.getByRole('button',{name:'Retour à la liste'}).click();const after=await p.getByRole('main').evaluate(e=>e.scrollTop);if(Math.abs(before-after)>2)throw Error('scroll restoration');
console.log('PASS mobile320/390/430, search, filters, tabs, document, appointment, create/error/draft, focus, navigation, reduced-motion, reset',errors);await b.close();if(errors.length)process.exitCode=1;
