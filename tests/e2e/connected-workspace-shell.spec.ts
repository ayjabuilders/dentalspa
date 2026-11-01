import {test,expect} from '@playwright/test';
import {workspaceChoices,workspaceVerification} from './helpers/workspace-selection';
for(const role of ['manager','dentist','assistant']){
  test(`${role}: one session and role-scoped workspace navigation`,async({page})=>{
    const clinic='10000000-0000-4000-8000-000000000001';
    const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Content-Type':'application/json'};
    let logins=0;
    await page.route('**/auth/v1/**',route=>{if(route.request().url().includes('/token'))logins++;return route.fulfill({headers,json:{access_token:'synthetic-token',refresh_token:'synthetic-refresh',token_type:'bearer',expires_in:3600,user:{id:clinic,aud:'authenticated',role:'authenticated',email:'staff@example.invalid',app_metadata:{},user_metadata:{},created_at:'2026-10-31T10:00:00Z'}}});});
    await page.route('**/api/v1/**',route=>{
      if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers});
      const path=new URL(route.request().url()).pathname;
      if(path.endsWith('/me/workspaces'))return route.fulfill({headers,json:workspaceChoices(clinic,[role])});
      if(path.endsWith('/me/workspace'))return route.fulfill({headers,json:workspaceVerification(clinic,clinic,[role])});
      if(path.endsWith('/appointments'))return route.fulfill({headers,json:{items:[],truncated:false}});
      return route.fulfill({status:404,headers,json:{}});
    });
    await page.goto('http://localhost:4204/connection?view=agenda-settings');
    await page.getByLabel('Adresse e-mail',{exact:true}).fill('staff@example.invalid');
    await page.getByLabel('Mot de passe',{exact:true}).fill('synthetic-password');
    await page.getByRole('button',{name:'Se connecter',exact:true}).click();
    const nav=page.getByRole('navigation',{name:'Modules du cabinet'});
    await expect(nav).toBeVisible();
    await expect(nav.getByRole('button',{name:'Paramètres agenda',exact:true})).toHaveCount(role==='manager'?1:0);
    await expect(nav.getByRole('button',{name:'Catalogue tarifaire',exact:true})).toHaveCount(role==='manager'?1:0);
    await expect(nav.getByRole('button',{name:'Agenda',exact:true})).toHaveCount(role==='assistant'?0:1);
    await expect(nav.getByRole('button',{name:'Réservations',exact:true})).toHaveCount(role==='manager'?1:0);
    // A denied deep link falls back to an allowed module, without rendering manager tools.
    if(role!=='manager')await expect(page.getByRole('heading',{name:'Paramètres de l’agenda',exact:true})).toHaveCount(0);
    await nav.getByRole('button',{name:'Patients',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Répertoire patient connecté'})).toBeVisible();
    await expect(page.getByRole('form',{name:'Connexion au cabinet'})).toHaveCount(0);
    await nav.getByRole('button',{name:'Recherche patient',exact:true}).click();
    await expect(nav.getByRole('button',{name:'Recherche patient',exact:true})).toHaveAttribute('aria-current','page');
    const pathNav=page.getByRole('navigation',{name:'Parcours entre modules'});
    await pathNav.getByRole('button',{name:'Précédent',exact:true}).click();
    await expect(nav.getByRole('button',{name:'Patients',exact:true})).toHaveAttribute('aria-current','page');
    await pathNav.getByRole('button',{name:'Suivant',exact:true}).click();
    await expect(nav.getByRole('button',{name:'Recherche patient',exact:true})).toHaveAttribute('aria-current','page');
    await pathNav.getByRole('button',{name:'Précédent',exact:true}).click();
    await nav.getByRole('button',{name:'Demandes',exact:true}).click();
    await expect(pathNav.getByRole('button',{name:'Suivant',exact:true})).toBeDisabled();
    expect(logins).toBe(1);
    const desktop=await page.locator('.connected-module-content').boundingBox();
    expect(desktop!.width).toBeGreaterThan(800);
    await page.setViewportSize({width:390,height:844});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await expect(nav).toBeVisible();
    await page.screenshot({path:`.local/qa/connected-shell-${role}-mobile.png`});
  });
}

test('module entry routes lead to connected workspace; previews are explicit',async({page})=>{
  test.setTimeout(90000);
  for(const module of ['patients','planning','intake','inbox','team']){await page.goto('http://localhost:4204/'+module);await expect(page).toHaveURL('http://localhost:4204/connection?view='+module);await expect(page.getByRole('form',{name:'Connexion au cabinet'})).toBeVisible();}
  await page.goto('http://localhost:4204/patients?preview=1');await expect(page.getByText('10 fiches fictives')).toBeVisible();
});
