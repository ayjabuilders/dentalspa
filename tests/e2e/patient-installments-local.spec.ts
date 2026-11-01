import {test,expect} from '@playwright/test';
test('native installment create retry approve accept revise and immutable history',async({page})=>{
 test.setTimeout(120000);
 const email=process.env.LOCAL_INVOICE_EMAIL,password=process.env.LOCAL_INVOICE_PASSWORD,api=process.env.LOCAL_INVOICE_API,number=process.env.LOCAL_INSTALLMENT_NUMBER;
 test.skip(!email||!password||!api||!number,'Use native invoice runner --installments --payments --installment-browser.');
 const commands:Array<{key:string|undefined;body:unknown}>=[];let lose=true;
 await page.route('**/api/v1/**',async route=>{const req=route.request(),url=new URL(req.url());const response=await route.fetch({url:api+url.pathname+url.search});if(req.method()==='POST'&&url.pathname.endsWith('/installments')){commands.push({key:req.headers()['idempotency-key'],body:req.postDataJSON()});expect(response.status()).toBe(201);if(lose){lose=false;return route.abort('failed');}}return route.fulfill({response});});
 let authenticated=false;
 const open=async()=>{await page.goto('http://localhost:4204/connection?view=patients');if(!authenticated){await page.getByLabel('Adresse e-mail',{exact:true}).fill(email!);await page.getByLabel('Mot de passe',{exact:true}).fill(password!);await page.getByRole('button',{name:'Se connecter',exact:true}).click();authenticated=true;}await page.getByRole('button',{name:'Ouvrir la fiche de Salma Alaoui (FICTIF)',exact:true}).click();await page.getByRole('tab',{name:'Échéanciers',exact:true}).click();};
 await open();const area=page.getByRole('region',{name:'Échéanciers du patient'});
 await area.getByRole('button',{name:'Nouvel échéancier',exact:true}).click();let dialog=page.getByRole('dialog');await dialog.getByLabel('Motif de l’accord').fill('Accord navigateur fictif');await dialog.getByRole('checkbox',{name:new RegExp(number!)}).check();await dialog.getByLabel('Date 1',{exact:true}).fill('2027-01-15');await dialog.getByLabel('Montant MAD 1',{exact:true}).fill('50');await dialog.getByRole('button',{name:'Enregistrer le brouillon'}).click();await expect(dialog.getByRole('alert')).toContainText('entièrement répartie');expect(commands).toHaveLength(0);
 await dialog.getByRole('button',{name:'Ajouter une échéance'}).click();await dialog.getByLabel('Date 2',{exact:true}).fill('2027-02-15');await dialog.getByLabel('Montant MAD 2',{exact:true}).fill('75,50');await dialog.getByRole('button',{name:'Enregistrer le brouillon'}).click();await expect(dialog.getByRole('alert')).toContainText('Résultat à vérifier');await page.keyboard.press('Escape');await expect(dialog).toBeVisible();await expect(page.getByRole('tab',{name:'Factures',exact:true,includeHidden:true})).toBeDisabled();await dialog.getByRole('button',{name:'Réessayer la même commande'}).click();await expect(dialog).toHaveCount(0);expect(commands).toHaveLength(2);expect(commands[0]).toEqual(commands[1]);await expect(area.getByRole('heading',{name:'Version 1',exact:true})).toBeVisible();await expect(area.locator('tbody tr')).toHaveCount(2);
 for(const [button,ref] of [['Approuver cette version','DEMO-APPROVED-UI'],['Enregistrer l’acceptation','DEMO-ACCEPTED-UI']]){await area.getByRole('button',{name:button,exact:true}).click();dialog=page.getByRole('dialog');await dialog.getByLabel('Référence de validation').fill(ref!);await dialog.getByRole('button',{name:'Confirmer',exact:true}).click();await expect(dialog).toHaveCount(0);}
 await expect(area.getByText('Acceptation enregistrée',{exact:true})).toBeVisible();await area.getByRole('button',{name:'Réviser l’échéancier'}).click();dialog=page.getByRole('dialog');await dialog.getByLabel('Motif de l’accord').fill('Décalage convenu fictif');await dialog.getByLabel('Date 1',{exact:true}).fill('2027-01-20');await dialog.getByRole('button',{name:'Enregistrer le brouillon'}).click();await expect(dialog).toHaveCount(0);await expect(area.getByRole('heading',{name:'Version 2',exact:true})).toBeVisible();await area.getByRole('button',{name:'Version précédente'}).click();await expect(area.locator('tbody')).toContainText('15/01/2027');await expect(area.getByText(/DEMO-ACCEPTED-UI/)).toBeVisible();await expect(area.getByRole('button',{name:'Réviser l’échéancier'})).toHaveCount(0);await area.screenshot({path:'.local/qa/installments-desktop.png'});
 await open();await expect(area.getByRole('button',{name:/Accord/})).toHaveCount(2);await area.getByRole('button',{name:/125,50/}).click();await expect(area.getByRole('heading',{name:'Version 2',exact:true})).toBeVisible();await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await area.screenshot({path:'.local/qa/installments-mobile.png'});
});

test('installment list searches authorized summaries and pages ten at a time without writes',async({page})=>{
 test.setTimeout(60000);
 const email=process.env.LOCAL_INVOICE_EMAIL,password=process.env.LOCAL_INVOICE_PASSWORD,api=process.env.LOCAL_INVOICE_API;
 test.skip(!email||!password||!api,'Use the native installment browser runner for an isolated local account.');
 const writes:string[]=[];
 await page.route('**/api/v1/**',async route=>{
  const req=route.request(),url=new URL(req.url());
  if(req.method()==='POST')writes.push(url.pathname);
  const response=await route.fetch({url:api+url.pathname+url.search});
  if(req.method()==='GET'&&url.pathname.endsWith('/installments')){
   expect(response.ok()).toBe(true);const actual=await response.json();
   const items=Array.from({length:23},(_,index)=>({plan_id:'20000000-0000-4000-8000-'+String(index+1).padStart(12,'0'),latest_version:1,accepted_version:index%3===2?1:null,agreed_minor:(index+1)*10000,currency_code:'MAD',status:['draft','approved','accepted'][index%3],created_at:'2026-10-30T10:00:00.000Z'}));
   return route.fulfill({response,json:{...actual,items,truncated:false}});
  }
  return route.fulfill({response});
 });
 await page.goto('http://localhost:4204/connection?view=patients');await page.getByLabel('Adresse e-mail',{exact:true}).fill(email!);await page.getByLabel('Mot de passe',{exact:true}).fill(password!);await page.getByRole('button',{name:'Se connecter',exact:true}).click();await page.getByRole('button',{name:'Ouvrir la fiche de Salma Alaoui (FICTIF)',exact:true}).click();await page.getByRole('tab',{name:'Échéanciers',exact:true}).click();
 const area=page.getByRole('region',{name:'Échéanciers du patient'}),cards=area.locator('.installment-list>button'),search=area.getByRole('searchbox',{name:'Rechercher un échéancier'}),next=area.getByRole('button',{name:'Page suivante des échéanciers'}),previous=area.getByRole('button',{name:'Page précédente des échéanciers'});
 await expect(cards).toHaveCount(10);await expect(cards.first()).toContainText('Accord 1');await expect(previous).toBeDisabled();
 await next.click();await expect(cards).toHaveCount(10);await expect(cards.first()).toContainText('Accord 11');
 await next.click();await expect(cards).toHaveCount(3);await expect(cards.first()).toContainText('Accord 21');await expect(next).toBeDisabled();
 await search.fill('Accord 23');await expect(cards).toHaveCount(1);await expect(cards.first()).toContainText('Accord 23');await expect(area.getByText('Page 1 / 1',{exact:true})).toBeVisible();
 await search.fill('accepte');await expect(cards).toHaveCount(7);for(const card of await cards.all())await expect(card).toContainText('Accepté');
 await search.fill('aucun résultat fictif');await expect(cards).toHaveCount(0);await expect(area.getByText('Aucun accord ne correspond à votre recherche.')).toBeVisible();await area.getByRole('button',{name:'Effacer la recherche'}).click();await expect(cards).toHaveCount(10);
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await area.screenshot({path:'.local/qa/installment-pagination-mobile.png'});expect(writes).toEqual([]);
});
