import {test,expect} from '@playwright/test';
test('native public request survives a lost response without a duplicate',async({page},info)=>{
  const {LOCAL_REQUEST_EMAIL:email,LOCAL_REQUEST_DATE:date}=process.env;
  const automatic=process.env.LOCAL_REQUEST_AUTOMATIC==='true';
  test.skip(!email||!date,'Use the native configured request runner.');test.setTimeout(120000);
  let submissions=0;
  await page.route('**/api/v1/booking-requests/configured',async route=>{
    submissions++;
    if(submissions===1){const response=await route.fetch();expect(response.status()).toBe(201);await route.abort('failed');}
    else await route.continue();
  });
  await page.goto('http://localhost:4202/#availability');const section=page.locator('#availability');
  await section.getByRole('button',{name:/Première visite — fictive/}).click();
  await section.getByLabel('Date de visite',{exact:true}).fill(date!);
  await section.getByRole('button',{name:`${automatic?'Réserver':'Demander'} le créneau de 09:00`,exact:true}).click();
  await expect(page.locator('.booking-steps [aria-current=step]')).toContainText('Coordonnées');
  await expect(page.getByLabel('Date de visite',{exact:true})).toBeHidden();
  await page.setViewportSize({width:1280,height:900});
  await page.screenshot({path:info.outputPath('public-booking-desktop.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:info.outputPath('public-booking-mobile.png'),fullPage:true});
  await section.getByLabel('Nom complet',{exact:true}).fill('Salma Alaoui — FICTIF');
  await section.getByLabel('Adresse e-mail de test',{exact:true}).fill(email!);
  await section.getByRole('checkbox').check();
  await section.getByRole('button',{name:'Vérifier ma visite',exact:true}).click();
  await expect(page.locator('.booking-steps [aria-current=step]')).toContainText('Vérification');
  await section.getByRole('button',{name:automatic?'Confirmer la réservation':'Envoyer ma demande',exact:true}).click();
  await expect(section.getByRole('alert')).toContainText('résultat reste à vérifier');
  await expect(section.getByRole('button',{name:'Modifier mes coordonnées',exact:true})).toBeDisabled();
  await expect(section.getByRole('button',{name:'Changer de créneau',exact:true})).toBeDisabled();
  await expect(section.getByRole('button',{name:'Retour',exact:true})).toBeDisabled();
  await section.getByRole('button',{name:'Vérifier la même demande',exact:true}).click();
  await expect(section.getByRole('heading',{name:automatic?'Votre rendez-vous est confirmé':'Votre demande est reçue',exact:true})).toBeVisible();
  if(!automatic)await expect(section.getByText('L’équipe doit encore valider votre demande. Aucun créneau n’est réservé pour le moment.',{exact:true})).toBeVisible();
  expect(submissions).toBe(2);
  await expect(page.locator('.booking-steps [data-complete=true]')).toHaveCount(4);
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await section.screenshot({path:info.outputPath('configured-request-native-mobile.png')});
  const staffEmail=process.env.LOCAL_REQUEST_STAFF_EMAIL,staffPassword=process.env.LOCAL_REQUEST_STAFF_PASSWORD;
  expect(staffEmail).toBeTruthy();expect(staffPassword).toBeTruthy();
  await page.goto('http://localhost:4204/connection?view=booking-requests');
  await page.getByLabel('Adresse e-mail',{exact:true}).fill(staffEmail!);await page.getByLabel('Mot de passe',{exact:true}).fill(staffPassword!);
  await page.getByRole('button',{name:'Se connecter',exact:true}).click();
  const inbox=page.getByRole('region',{name:'Demandes de rendez-vous',exact:true});
  await expect(inbox.getByText(email!,{exact:true})).toBeVisible();
  const request=inbox.locator('li').filter({hasText:email!});
  await expect(request.getByText(automatic?'Confirmé':'À examiner',{exact:true})).toBeVisible();
  await expect(request.getByText('Première visite — fictive',{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await inbox.screenshot({path:info.outputPath('configured-request-reception-mobile.png')});
  await inbox.getByRole('button',{name:'Retour à l’agenda',exact:true}).click();
  await page.locator('.recorded-appointments').getByRole('button',{name:'Demandes',exact:true}).click();
  await expect(inbox.getByText(email!,{exact:true})).toBeVisible();
  await expect(page.getByLabel('Mot de passe',{exact:true})).toHaveCount(0);
  if(process.env.LOCAL_REQUEST_CONFIRM==='true'){
    if(!automatic){
    let confirmations=0;const commands:{key:string|undefined;body:unknown}[]=[];
    await page.route('**/api/v1/booking-requests/configured/*/confirm',async route=>{
      confirmations++;commands.push({key:route.request().headers()['idempotency-key'],body:route.request().postDataJSON()});
      if(confirmations===1){const response=await route.fetch();expect(response.status()).toBe(201);await route.abort('failed');}else await route.continue();
    });
    await request.getByRole('button',{name:'Confirmer',exact:true}).click();
    const confirmationDialog=page.getByRole('dialog',{name:'Confirmer le rendez-vous',exact:true});
    await confirmationDialog.getByRole('button',{name:'Confirmer le créneau',exact:true}).click();
    await expect(confirmationDialog.getByRole('alert')).toContainText('Résultat à vérifier');
    await expect(inbox.getByRole('button',{name:'Retour à l’agenda',exact:true})).toBeDisabled();
    await expect(confirmationDialog.getByRole('button',{name:'Retour',exact:true})).toBeDisabled();
    await confirmationDialog.getByRole('button',{name:'Réessayer la même confirmation',exact:true}).click();
    await expect(request.getByText('Confirmé',{exact:true})).toBeVisible();
    expect(confirmations).toBe(2);expect(commands[0]).toEqual(commands[1]);expect(commands[0]!.key).toBeTruthy();
    }
    await inbox.getByRole('button',{name:'Actualiser les demandes',exact:true}).click();
    await expect(request.getByText('Confirmé',{exact:true})).toBeVisible();
    await inbox.getByRole('button',{name:'Retour à l’agenda',exact:true}).click();
    const agenda=page.locator('.recorded-appointments');await agenda.getByLabel('À partir du',{exact:true}).fill(date!);
    await page.setViewportSize({width:1440,height:1000});
    const event=page.locator('.agenda-grid-event').filter({hasText:'Salma Alaoui — FICTIF'});
    await expect(event).toBeVisible();
    await page.screenshot({path:info.outputPath('agenda-calendar-desktop.png')});
    await event.click();
    const detail=page.getByRole('dialog',{name:'Détails du rendez-vous'});
    await expect(detail.getByText('Salma Alaoui — FICTIF',{exact:true})).toBeVisible();
    await expect(detail.getByRole('button',{name:'Déplacer',exact:true})).toBeVisible();
    await page.screenshot({path:info.outputPath('agenda-calendar-details.png')});
    await detail.getByRole('button',{name:'Fermer',exact:true}).click();
    await expect(event).toBeFocused();
    await page.setViewportSize({width:390,height:844});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:info.outputPath('agenda-calendar-mobile.png')});
    await agenda.getByRole('button',{name:'Liste',exact:true}).click();
    const appointment=agenda.locator('li').filter({hasText:'Salma Alaoui — FICTIF'});
    await expect(appointment.getByText('Confirmé',{exact:true})).toBeVisible();
    await expect(appointment.getByText(/identité non vérifiée/)).toBeVisible();
    await expect(appointment.getByRole('button',{name:'Annuler',exact:true})).toBeVisible();
    await agenda.getByRole('button',{name:'Actualiser',exact:true}).click();
    await expect(appointment.getByText('Confirmé',{exact:true})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await agenda.screenshot({path:info.outputPath('configured-confirmation-agenda-mobile.png')});
    if(process.env.LOCAL_REQUEST_MOVE==='true'){
      const moves:{key:string|undefined;body:unknown}[]=[];
      await page.route('**/api/v1/appointments/*/configured-commands',async route=>{
        moves.push({key:route.request().headers()['idempotency-key'],body:route.request().postDataJSON()});
        if(moves.length===1){const response=await route.fetch();expect(response.status()).toBe(201);await route.abort('failed');}else await route.continue();
      });
      await appointment.getByRole('button',{name:'Déplacer',exact:true}).click();
      const form=appointment.getByRole('form',{name:'Déplacer le rendez-vous configurable'});
      await form.getByLabel('Nouvelle date',{exact:true}).fill(date!);
      await form.getByRole('button',{name:'15:00',exact:true}).click();
      await form.getByRole('button',{name:'Enregistrer le déplacement',exact:true}).click();
      await expect(form.getByRole('alert')).toContainText('Résultat à vérifier');
      await expect(form.getByLabel('Nouvelle date',{exact:true})).toBeDisabled();
      await expect(form.getByRole('button',{name:'Retour',exact:true})).toBeDisabled();
      await form.getByRole('button',{name:'Réessayer le même déplacement',exact:true}).click();
      await expect(appointment.locator('time')).toHaveText('15:00');
      expect(moves).toHaveLength(2);expect(moves[0]).toEqual(moves[1]);
      await agenda.getByRole('button',{name:'Actualiser',exact:true}).click();await expect(appointment.locator('time')).toHaveText('15:00');
      await agenda.screenshot({path:info.outputPath('configured-reschedule-agenda-mobile.png')});
      await page.unroute('**/api/v1/appointments/*/configured-commands');
    }
    if(process.env.LOCAL_REQUEST_CANCEL==='true'){
      const cancellations:{key:string|undefined;body:unknown}[]=[];
      await page.route('**/api/v1/appointments/*/configured-commands',async route=>{
        cancellations.push({key:route.request().headers()['idempotency-key'],body:route.request().postDataJSON()});
        if(cancellations.length===1){const response=await route.fetch();expect(response.status()).toBe(201);await route.abort('failed');}else await route.continue();
      });
      await appointment.getByRole('button',{name:'Annuler',exact:true}).click();
      await appointment.getByRole('button',{name:'Confirmer l’annulation',exact:true}).click();
      await expect(appointment.getByRole('alert')).toContainText('Résultat à vérifier');
      await expect(agenda.getByLabel('À partir du',{exact:true})).toBeDisabled();
      await expect(appointment.getByRole('button',{name:'Retour',exact:true})).toBeDisabled();
      await appointment.getByRole('button',{name:'Réessayer la même commande',exact:true}).click();
      await expect(appointment.getByText('Annulé',{exact:true})).toBeVisible();
      expect(cancellations).toHaveLength(2);expect(cancellations[0]).toEqual(cancellations[1]);
      await agenda.getByRole('button',{name:'Actualiser',exact:true}).click();
      await expect(appointment.getByText('Annulé',{exact:true})).toBeVisible();
      await agenda.getByRole('button',{name:'Demandes',exact:true}).click();
      await expect(request.getByText('Annulé',{exact:true})).toBeVisible();
      await expect(request.getByRole('button',{name:'Confirmer',exact:true})).toHaveCount(0);
    }
  }
});
