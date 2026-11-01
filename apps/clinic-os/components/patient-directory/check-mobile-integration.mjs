/* global document, innerWidth */
import {readFileSync,mkdirSync} from 'node:fs';
import {chromium,expect} from '@playwright/test';

// Run only against the combined Clinic build. Authentication and the selected dossier are real local reads.
// Extra directory rows are browser-only synthetic fixtures to exercise page/scroll retention; no writes.
const base=process.env.CLINIC_OS_LOCAL_URL??'http://localhost:4204';
const access=JSON.parse(readFileSync('.local/owner-demo-access.json','utf8'));
const check=expect.configure({timeout:20000}),browser=await chromium.launch();
try{
  mkdirSync('.local/qa',{recursive:true});
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[],writes=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{if(request.url().includes('/api/v1/')&&!['GET','OPTIONS'].includes(request.method()))writes.push(request.method());});
  await page.route('**/api/v1/patients',async route=>{
    const response=await route.fetch();if(response.status()!==200)return route.fulfill({response});
    const records=await response.json(),record=records.find(item=>item.display_name==='Salma Alaoui (FICTIF)');
    check(record).toBeTruthy();
    const items=Array.from({length:23},(_,index)=>({...record,id:`97000000-0000-4000-8000-${String(index+1).padStart(12,'0')}`,display_name:`Patient QA ${String(index+1).padStart(2,'0')} (FICTIF)`,reference:`QA-MOBILE-${index+1}`}));
    items[11]=record;
    await route.fulfill({response,json:items});
  });
  await page.goto(base+'/connection?view=patients');
  await page.getByLabel('Adresse e-mail',{exact:true}).fill(access.email);
  await page.getByLabel('Mot de passe',{exact:true}).fill(access.password);
  await page.getByRole('button',{name:'Se connecter',exact:true}).click();
  const directory=page.getByRole('region',{name:'Patients autorisés'}),surface=page.locator('.connected-module-content');
  await check(directory.getByRole('listitem')).toHaveCount(10);
  for(const width of [320,390,430]){
    await page.setViewportSize({width,height:844});
    await check(page.locator('.patient-directory-dashboard')).toBeHidden();
    await check(page.getByLabel('Rechercher un patient dans les dossiers chargés')).toBeInViewport();
    check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({animations:'disabled',path:`.local/qa/pearl-mobile-integrated-list-${width}.png`});
  }
  await page.getByRole('button',{name:'Recherche et tri',exact:true}).click();
  const filters=page.getByRole('dialog',{name:'Recherche et tri',exact:true});
  await check(filters).toHaveAttribute('data-mobile-presentation','sheet');
  await check(filters.getByLabel('Trier les patients')).toBeVisible();
  await filters.getByRole('button',{name:'Terminer',exact:true}).click();
  await check(page.getByRole('button',{name:'Recherche et tri',exact:true})).toBeFocused();
  await page.getByLabel('Rechercher un patient dans les dossiers chargés').fill('FICTIF');
  await directory.getByRole('button',{name:'Page suivante',exact:true}).click();
  await check(directory.locator('.patient-directory-pagination')).toContainText('11–20 sur 23');
  const record=page.getByRole('button',{name:'Ouvrir la fiche de Salma Alaoui (FICTIF)',exact:true});
  await record.scrollIntoViewIfNeeded();
  const scroll=await surface.evaluate(element=>element.scrollTop);
  await record.click();
  const hub=page.getByRole('region',{name:'Dossier patient enregistré'});
  await check(hub.getByRole('tab')).toHaveCount(4);
  await check(page).toHaveURL(/view=patients.*patient=/);
  for(const width of [320,390,430]){
    await page.setViewportSize({width,height:844});
    const bounds=await hub.getByRole('tab').evaluateAll(elements=>elements.map(element=>{const rect=element.getBoundingClientRect();return {left:rect.left,right:rect.right,height:rect.height};}));
    check(bounds.every(item=>item.left>=0&&item.right<=width&&item.height>=44)).toBe(true);
    check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  await surface.evaluate(element=>{element.scrollTop=0;});
  await page.screenshot({animations:'disabled',path:'.local/qa/pearl-mobile-integrated-record.png'});
  await hub.getByRole('tab',{name:'Aperçu',exact:true}).focus();await page.keyboard.press('End');
  await check(hub.getByRole('tab',{name:'Finances',exact:true})).toBeFocused();
  const finances=hub.getByRole('group',{name:'Rubriques financières'});
  for(const name of ['Factures','Paiements','Échéanciers','Devis']){
    await finances.getByRole('button',{name,exact:true}).click();
    await check(finances.getByRole('button',{name,exact:true})).toHaveAttribute('aria-pressed','true');
  }
  await hub.getByRole('button',{name:'Nouveau devis brouillon',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Nouveau devis brouillon',exact:true});
  await check(dialog.getByRole('checkbox').first()).toBeEnabled();
  await dialog.getByRole('checkbox').first().check();
  await check(page.getByRole('region',{name:'Dossier patient enregistré',includeHidden:true}).getByRole('tab',{name:'RDV',exact:true,includeHidden:true})).toBeDisabled();
  await check(page.getByRole('button',{name:'Retour à la liste',exact:true,includeHidden:true})).toBeDisabled();
  await page.keyboard.press('Escape');
  await check(dialog.getByRole('heading',{name:'Abandonner les modifications ?',exact:true})).toBeVisible();
  await dialog.getByRole('button',{name:'Continuer la modification',exact:true}).click();
  await check(dialog.getByRole('checkbox').first()).toBeChecked();
  await page.keyboard.press('Escape');await dialog.getByRole('button',{name:'Abandonner les modifications',exact:true}).click();
  await check(dialog).toHaveCount(0);
  await hub.getByRole('tab',{name:'Aperçu',exact:true}).click();
  await hub.getByRole('button',{name:'Voir les rendez-vous',exact:true}).click();
  await check(hub.getByRole('tab',{name:'RDV',exact:true})).toHaveAttribute('aria-selected','true');
  await page.setViewportSize({width:430,height:844});
  await page.getByRole('button',{name:'Retour à la liste',exact:true}).click();
  await check(page.getByLabel('Rechercher un patient dans les dossiers chargés')).toHaveValue('FICTIF');
  await check(directory.locator('.patient-directory-pagination')).toContainText('11–20 sur 23');
  await check.poll(()=>surface.evaluate(element=>element.scrollTop)).toBe(scroll);
  await check(record).toBeFocused();
  // Playwright may scroll the focused card into pointer view; capture the position at the actual click.
  await record.evaluate(element=>element.addEventListener('click',()=>{document.documentElement.dataset.qaDirectoryOpenScroll=String(document.querySelector('.connected-module-content').scrollTop);},{capture:true,once:true}));
  await record.click();await check(hub.getByRole('tab')).toHaveCount(4);
  const secondOpenScroll=await page.evaluate(()=>Number(document.documentElement.dataset.qaDirectoryOpenScroll));
  await page.goBack();await check(directory).toBeVisible();
  await check(directory.locator('.patient-directory-pagination')).toContainText('11–20 sur 23');
  await page.screenshot({animations:'disabled',path:'.local/qa/pearl-mobile-integrated-return.png'});
  await check.poll(()=>surface.evaluate(element=>element.scrollTop)).toBe(secondOpenScroll);
  console.log(`Scroll evidence: first open ${scroll}; second pointer open ${secondOpenScroll}; browser return restored the actual second-open position.`);
  await page.goForward();await check(hub.getByRole('tab')).toHaveCount(4);
  await page.setViewportSize({width:1440,height:1000});
  await check(hub.getByRole('tab')).toHaveCount(7);
  await hub.getByRole('tab',{name:'Factures',exact:true}).click();
  await check(hub.getByRole('tab',{name:'Factures',exact:true})).toHaveAttribute('aria-selected','true');
  mkdirSync('.local/qa',{recursive:true});
  await page.screenshot({animations:'disabled',path:'.local/qa/pearl-mobile-integrated-desktop.png'});
  await page.setViewportSize({width:390,height:844});
  await hub.getByRole('tab',{name:'Aperçu',exact:true}).click();
  await surface.evaluate(element=>{element.scrollTop=0;});
  await page.screenshot({animations:'disabled',path:'.local/qa/pearl-mobile-integrated-record.png'});
  await page.getByRole('button',{name:'Retour à la liste',exact:true}).click();
  await surface.evaluate(element=>{element.scrollTop=0;});
  await page.screenshot({animations:'disabled',path:'.local/qa/pearl-mobile-integrated-list.png'});
  check(errors).toEqual([]);check(writes).toEqual([]);
  console.log('PASS integrated mobile directory: 320/390/430 bounds, search/filter/page/scroll/focus return, URL back/forward, four sections, financial access, dirty lock/discard, existing RDV shortcut, seven desktop tabs; no API writes. Directory pagination expanded only in browser.');
}finally{await browser.close();}
