import { test, expect } from '@playwright/test';
import { workspaceChoices, workspaceVerification } from './helpers/workspace-selection';

test('connected agenda filters real responses, preserves uncertain command and links settings', async ({ page }) => {
  test.setTimeout(90000);
  const clinic='10000000-0000-4000-8000-000000000001';
  const id='74000000-0000-4000-8000-000000000011';
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Content-Type':'application/json'};
  const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Africa/Casablanca',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const starts_at=`${today}T10:00:00Z`,ends_at=`${today}T10:45:00Z`;
  let cancelled=false; const commands:{key:string|undefined;body:unknown}[]=[];
  const agendaReads:string[]=[];
  await page.route('**/auth/v1/**',route=>route.fulfill({headers,json:{access_token:'synthetic-token',refresh_token:'synthetic-refresh',token_type:'bearer',expires_in:3600,user:{id:clinic,aud:'authenticated',role:'authenticated',email:'staff@example.invalid',app_metadata:{},user_metadata:{},created_at:starts_at}}}));
  await page.route('**/api/v1/**',async route=>{
    if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers});
    const path=new URL(route.request().url()).pathname;
    if(path.endsWith('/me/workspaces'))return route.fulfill({headers,json:workspaceChoices(clinic,['manager'])});
    if(path.endsWith('/me/workspace'))return route.fulfill({headers,json:workspaceVerification(clinic,clinic,['manager'])});
    if(path.endsWith('/agenda-settings'))return route.fulfill({headers,json:{settings:null}});
    if(path.endsWith('/booking-requests/configured'))return route.fulfill({headers,json:{items:[],truncated:false}});
    if(path.endsWith('/scheduling/resources'))return route.fulfill({headers,json:{items:[],observed_at:starts_at,truncated:false}});
    if(path.endsWith('/commands')){
      commands.push({key:route.request().headers()['idempotency-key'],body:route.request().postDataJSON()});
      if(commands.length===1)return route.abort('failed');
      cancelled=true;return route.fulfill({headers,json:{appointment_id:id,status:'cancelled',version:2,starts_at,ends_at,replayed:true}});
    }
    if(path.endsWith('/appointments')){agendaReads.push(route.request().url());return route.fulfill({headers,json:{items:[
      {id,starts_at,ends_at,status:cancelled?'cancelled':'confirmed',version:cancelled?2:1,patient:{id:clinic,display_name:'Salma Alaoui · FICTIF',reference:'P-001'},provider_name:'Dr Amine · FICTIF',chair_name:'Fauteuil A'},
      {id:'74000000-0000-4000-8000-000000000012',starts_at,ends_at,status:'cancelled',version:2,patient:null,provider_name:'Dr Imane · FICTIF',chair_name:'Fauteuil B'},
    ],truncated:false}});}
    return route.fulfill({status:404,headers,json:{}});
  });
  await page.goto('http://localhost:4204/');
  await page.getByRole('link',{name:'Agenda',exact:true}).first().click();
  await expect(page).toHaveURL(/\/connection\?view=planning$/);
  await page.getByLabel('Adresse e-mail',{exact:true}).fill('staff@example.invalid');
  await page.getByLabel('Mot de passe',{exact:true}).fill('synthetic-password');
  await page.getByRole('button',{name:'Se connecter',exact:true}).click();
  const shellNav=page.getByRole('navigation',{name:'Modules du cabinet'});
  await expect(shellNav).toBeVisible();
  const agenda=page.locator('.recorded-appointments');
  await expect(agenda.getByRole('heading',{name:'Agenda des patients'})).toBeVisible();
  const summary=agenda.getByLabel('Rendez-vous de la période chargée');
  await expect(summary.getByRole('button',{name:'Tous 2',exact:true})).toBeVisible();
  const duration=agenda.getByRole('group',{name:'Durée affichée'});
  await duration.getByRole('button',{name:'Jour',exact:true}).click();
  await expect(agenda.getByRole('group',{name:'Durée affichée'}).getByRole('button',{name:'Jour',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(summary.getByRole('button',{name:'Tous 2',exact:true})).toBeVisible();
  expect(new URL(agendaReads.at(-1)!).searchParams.get('until')).toBe(today);
  await duration.getByRole('button',{name:'7 jours',exact:true}).click();
  await expect(duration.getByRole('button',{name:'7 jours',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(summary.getByRole('button',{name:'Tous 2',exact:true})).toBeVisible();
  await duration.getByRole('button',{name:'7 jours',exact:true}).click();
  await expect(agenda.locator('li:visible')).toHaveCount(2);
  await summary.getByRole('button',{name:'Confirmés 1',exact:true}).click();
  await expect(agenda.locator('li:visible')).toHaveCount(1);
  await agenda.getByRole('textbox',{name:'Rechercher un patient ou une ressource dans l’agenda'}).fill('inconnu');
  await expect(agenda.getByRole('heading',{name:'Aucun résultat pour ces filtres'})).toBeVisible();
  await agenda.getByRole('button',{name:'Réinitialiser les filtres'}).click();
  await expect(agenda.locator('li:visible')).toHaveCount(2);
  await agenda.screenshot({path:'.local/qa/agenda-connected-desktop.png'});
  const row=agenda.locator(`[data-appointment-id="${id}"]`);
  await row.getByRole('button',{name:'Déplacer',exact:true}).click();
  await expect(row.getByLabel('Rendez-vous actuel')).toContainText('Salma Alaoui');
  await expect(row.getByLabel('Nouvelle date',{exact:true})).toHaveValue(today);
  await row.getByRole('button',{name:'Retour',exact:true}).click();
  await row.getByRole('button',{name:'Annuler',exact:true}).click();
  await expect(row.getByLabel('Rendez-vous actuel')).toContainText('Salma Alaoui');
  await row.screenshot({path:'.local/qa/agenda-cancel-context.png'});
  await expect(shellNav.getByRole('button',{name:'Patients',exact:true})).toBeDisabled();
  await expect(agenda.getByLabel('À partir du',{exact:true})).toBeDisabled();
  await expect(duration.getByRole('button',{name:'Jour',exact:true})).toBeDisabled();
  await row.getByRole('button',{name:'Confirmer l’annulation',exact:true}).click();
  await expect(row.getByRole('alert')).toContainText('Résultat à vérifier');
  await expect(row.getByRole('button',{name:'Retour',exact:true})).toBeDisabled();
  await row.getByRole('button',{name:'Réessayer la même commande'}).click();
  await expect(row.getByText('Annulé',{exact:true})).toBeVisible();
  expect(commands).toHaveLength(2);expect(commands[0]).toEqual(commands[1]);expect(commands[0]!.key).toBeTruthy();
  await expect(agenda.getByLabel('À partir du',{exact:true})).toBeEnabled();
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await agenda.screenshot({path:'.local/qa/agenda-connected-mobile.png'});
  await agenda.getByRole('button',{name:'Paramètres',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Paramètres de l’agenda',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Retour à l’agenda',exact:true}).click();
  await expect(agenda.getByRole('heading',{name:'Agenda des patients'})).toBeVisible();
  await expect(agenda.getByRole('heading',{name:'Agenda des patients'})).toBeFocused();

  // Leaving the module must preserve the selected working period, while returning
  // performs a fresh authorized read rather than reusing previously loaded records.
  const selectedFrom=new Date(Date.parse(`${today}T12:00:00Z`)-2*86400000).toISOString().slice(0,10);
  await agenda.getByRole('group',{name:'Durée affichée'}).getByRole('button',{name:'14 jours',exact:true}).click();
  await agenda.getByLabel('À partir du',{exact:true}).fill(selectedFrom);
  await expect(summary.getByRole('button',{name:'Annulés 2',exact:true})).toBeVisible();
  await summary.getByRole('button',{name:'Annulés 2',exact:true}).click();
  await agenda.getByRole('textbox',{name:'Rechercher un patient ou une ressource dans l’agenda'}).fill('Salma');
  await expect(agenda.locator('li:visible')).toHaveCount(1);
  for(const destination of ['Paramètres','Demandes','Ouvrir le dossier de Salma Alaoui · FICTIF']){
    const readsBefore=agendaReads.length;
    await agenda.getByRole('button',{name:destination,exact:true}).click();
    await expect(agenda).toHaveCount(0);
    await page.getByRole('button',{name:'Retour à l’agenda',exact:true}).click();
    await expect(agenda.getByLabel('À partir du',{exact:true})).toHaveValue(selectedFrom);
    await expect(agenda.getByRole('group',{name:'Durée affichée'}).getByRole('button',{name:'14 jours',exact:true})).toHaveAttribute('aria-pressed','true');
    await expect(agenda.getByRole('textbox',{name:'Rechercher un patient ou une ressource dans l’agenda'})).toHaveValue('Salma');
    await expect(summary.getByRole('button',{name:'Annulés 2',exact:true})).toHaveAttribute('aria-pressed','true');
    await expect(agenda.locator('li:visible')).toHaveCount(1);
    expect(agendaReads.length).toBeGreaterThan(readsBefore);
    expect(new URL(agendaReads.at(-1)!).searchParams.get('from')).toBe(selectedFrom);
    await expect(agenda.getByRole('heading',{name:'Agenda des patients'})).toBeFocused();
  }
  // Search and view preferences must not carry over to another authenticated session.
  await page.getByRole('button',{name:'Se déconnecter',exact:true}).filter({visible:true}).click();
  await page.getByLabel('Adresse e-mail',{exact:true}).fill('staff@example.invalid');
  await page.getByLabel('Mot de passe',{exact:true}).fill('synthetic-password');
  await page.getByRole('button',{name:'Se connecter',exact:true}).click();
  await expect(agenda.getByLabel('À partir du',{exact:true})).toHaveValue(today);
  await expect(agenda.getByRole('group',{name:'Durée affichée'}).getByRole('button',{name:'7 jours',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(agenda.getByRole('textbox',{name:'Rechercher un patient ou une ressource dans l’agenda'})).toHaveValue('');
  await expect(summary.getByRole('button',{name:'Tous 2',exact:true})).toHaveAttribute('aria-pressed','true');
});
