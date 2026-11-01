/* global document, window, getComputedStyle */
import { chromium, expect } from '@playwright/test';
const check=expect.configure({timeout:20000});
const browser=await chromium.launch();
try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://localhost:4204/');
  await check(page.getByRole('heading',{name:'Une belle journée commence ici.'})).toBeVisible();
  await check(page.locator('.preview-shell')).toHaveAttribute('data-ds','pearl');
  await check(page.locator('.photo-card')).toHaveCount(6);
  await check(page.getByRole('link',{name:'Entrer dans le cabinet'})).toHaveAttribute('href','/connection?view=planning');
  await page.getByRole('button',{name:'Développer le menu',exact:true}).click();
  await check(page.locator('.preview-shell')).toHaveAttribute('data-expanded','true');
  await page.getByRole('button',{name:'Réduire le menu',exact:true}).click();
  await page.keyboard.press('Control+k');
  await check(page.getByLabel('Recherche globale')).toBeFocused();
  await page.getByLabel('Recherche globale').fill('Finance');
  await check(page.getByRole('dialog').getByRole('link',{name:/Finance/})).toBeVisible();
  await page.keyboard.press('Escape');
  await page.screenshot({path:'.local/qa/whole-clinic-home.png'});
  await page.getByRole('button',{name:'Activer le thème sombre'}).click();
  await page.getByRole('link',{name:'Entrer dans le cabinet'}).hover();
  await check(page.getByRole('link',{name:'Entrer dans le cabinet'})).toHaveCSS('color','rgb(32, 21, 47)');
  await page.getByRole('button',{name:/Notifications, /}).click();
  await check(page.getByRole('dialog')).toHaveClass(/preview-dialog-dark/);
  await check.poll(()=>page.getByRole('dialog').evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgb(32, 32, 46)');
  await page.screenshot({path:'.local/qa/whole-clinic-dark-dialog.png'});
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Activer le thème clair'}).click();
  for(const path of ['/business','/clinical','/playbook']){
    await page.goto(`http://localhost:4204${path}`);
    await page.getByRole('button',{name:'Activer le thème sombre'}).click();
    const primary=path==='/business'?page.locator('.finance-demo-steps button[aria-current=step]'):path==='/clinical'?page.locator('.clinical-demo-primary'):page.locator('.workflow-draft-primary').first();
    if(await primary.count())await check(primary).toHaveCSS('color','rgb(32, 21, 47)');
    if(path==='/business')await page.screenshot({path:'.local/qa/whole-clinic-finance-dark.png'});
    await page.getByRole('button',{name:'Activer le thème clair'}).click();
  }
  for(const width of [1280,768,390,320]){
    await page.setViewportSize({width,height:900});
    for(const path of ['/','/patients/DEMO-001','/patients?preview=1','/intake?preview=1','/planning?preview=1','/inbox?preview=1','/team?preview=1','/aftercare','/clinical','/business','/playbook','/build','/settings','/operations','/smile','/lab']){
      await page.goto(`http://localhost:4204${path}`);
      await check(page.locator('.preview-content>div')).toHaveCSS('opacity','1');
      await check.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
      const spill=await page.locator('.preview-content').evaluate(el=>el.scrollWidth>el.clientWidth+1);
      if(spill)throw Error(`Content overflow ${path} at ${width}`);
    }
    console.log(`PASS preview routes at ${width}px`);
  }
  await page.setViewportSize({width:390,height:844});
  await page.goto('http://localhost:4204/');
  await check(page.locator('.preview-content>div')).toHaveCSS('opacity','1');
  await page.screenshot({path:'.local/qa/whole-clinic-home-mobile.png'});
  const dock=page.getByRole('navigation',{name:'Navigation mobile',exact:true});
  await check(dock).toBeVisible();await check(dock.getByRole('link')).toHaveCount(3);
  const before=await dock.boundingBox();await page.locator('.preview-content').evaluate(el=>{el.scrollTop=el.scrollHeight});
  await check.poll(async()=>(await dock.boundingBox()).y).toBe(before.y);
  await check.poll(()=>page.evaluate(()=>document.documentElement.scrollHeight<=window.innerHeight+1)).toBe(true);
  await page.getByRole('button',{name:'Tous les espaces',exact:true}).click();
  await check(page.getByRole('dialog')).toHaveAttribute('data-mobile-presentation','sheet');
  await check(page.getByRole('dialog').getByRole('link',{name:'Consultations',exact:true})).toBeVisible();
  await page.keyboard.press('Escape');
  await check(page.getByRole('button',{name:'Tous les espaces',exact:true})).toBeFocused();
  await page.goto('http://localhost:4204/aftercare');
  await page.getByLabel('Rechercher un suivi').fill('Salma');
  await check(page.locator('.aftercare-demo-card')).toHaveCount(1);
  await page.getByLabel('État illustratif').selectOption('completed');
  await page.getByRole('button',{name:/Terminés · démo/}).click();
  await check(page.locator('.aftercare-demo-card')).toHaveCount(1);
  await page.getByRole('button',{name:/À poursuivre/}).click();
  await check(page.getByRole('heading',{name:'Aucun suivi dans cette vue'})).toBeVisible();
  await page.getByRole('button',{name:'Réinitialiser les filtres'}).click();
  await check(page.locator('.aftercare-demo-card')).toHaveCount(4);
  await page.setViewportSize({width:1440,height:1000});
  await page.screenshot({path:'.local/qa/whole-clinic-aftercare.png'});
  if(errors.length)throw Error(errors.join('\n'));
  console.log('PASS Pearl preview shell, home navigation, photos, dark dialog, keyboard, responsive routes and aftercare filtering/state.');
}finally{await browser.close();}
