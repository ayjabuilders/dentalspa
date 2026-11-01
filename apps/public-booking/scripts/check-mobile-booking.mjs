/* global document, window */
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium,expect} from '@playwright/test';

const check=expect.configure({timeout:15000});
const output='.local/qa/public-booking-mobile';mkdirSync(output,{recursive:true});
const browser=await chromium.launch();
const visitId='10000000-0000-4000-8000-000000000001';
try {
  for(const width of [320,390,1440]) {
    const page=await browser.newPage({viewport:{width,height:900}});
    const errors=[],commands=[];let availabilityFailure=true;
    page.on('pageerror',error=>errors.push(error.stack || error.message || String(error)));
    // Both reads and commands are synthetic; no booking is persisted.
    await page.route('**/api/v1/booking-requests/**',async route=>{
      const request=route.request(),url=new URL(request.url());
      if(request.method()==='OPTIONS'){await route.fulfill({status:204});return;}
      if(request.method()==='POST') {
        commands.push({key:request.headers()['idempotency-key'],body:request.postDataJSON()});
        if(commands.length===1){await route.fulfill({status:409,json:{message:'Synthetic conflict'}});return;}
        if(commands.length===2){await route.fulfill({status:503,json:{message:'Synthetic uncertain outcome'}});return;}
        await route.fulfill({json:{request_id:'20000000-0000-4000-8000-000000000001',status:'request_received',replayed:true}});return;
      }
      if(availabilityFailure){availabilityFailure=false;await route.fulfill({status:503,json:{message:'Synthetic unavailable'}});return;}
      const date=url.searchParams.get('date'),selected=url.searchParams.get('visit_type_id');
      await route.fulfill({json:{date,time_zone:'Africa/Casablanca',revision:1,informational:true,selected_visit_type_id:selected,request_enabled:true,confirmation_mode:'staff_review',visit_types:[{id:visitId,name:'Consultation et bilan — démo',duration_minutes:30}],slots:selected?[{starts_at:date+'T09:00:00Z',ends_at:date+'T09:30:00Z'},{starts_at:date+'T10:00:00Z',ends_at:date+'T10:30:00Z'}]:[]}});
    });
    await page.goto(process.env.BOOKING_QA_URL||'http://localhost:4202');
    await page.getByRole('button',{name:'Commencer',exact:true}).click();
    await check(page.locator('.booking-error[role=alert]')).toContainText('disponibilités');
    await page.getByRole('button',{name:'Réessayer',exact:true}).click();
    await check(page.locator('.booking-service')).toBeEnabled();
    
    if(width<760) await check.poll(async () => (await page.locator('.booking-service').boundingBox()).y).toBeLessThan(500);
    await page.screenshot({path:`${output}/after-services-${width}.png`,fullPage:true});
    await page.locator('.booking-service').click();
    await check(page.getByRole('heading',{name:'Bienvenue chez Dental Spa',exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Continuer',exact:true}).click();
    await page.getByRole('button',{name:'Choisir mon créneau',exact:true}).click();
    await check(page.locator('.booking-calendar-grid button[aria-pressed=true]')).toHaveCount(1);
    await page.getByRole('button',{name:'Mois suivant',exact:true}).click();
    await page.locator('.booking-calendar-grid button:not(:disabled)').first().click();
    await check(page.locator('.booking-calendar-grid button[aria-pressed=true]')).toHaveCount(1);
    await page.getByRole('button',{name:'Jour suivant',exact:true}).click();
    await check(page.locator('.availability-results li>button')).toHaveCount(2);
    await page.screenshot({path:`${output}/after-slots-${width}.png`,fullPage:true});
    await page.locator('.availability-results li>button').first().click();
    await page.getByLabel('Nom complet',{exact:true}).fill('Patiente Fictive');
    await page.getByLabel('Adresse e-mail de test',{exact:true}).fill('mobile@example.test');
    await page.getByLabel('Téléphone',{exact:true}).fill('+212 600 000 001');
    await page.getByRole('checkbox').check();
    await page.screenshot({path:`${output}/after-contact-${width}.png`,fullPage:true});
    await page.getByRole('button',{name:'Vérifier ma visite',exact:true}).click();
    await page.getByRole('button',{name:'Modifier mes coordonnées',exact:true}).click();
    await check(page.getByLabel('Nom complet',{exact:true})).toHaveValue('Patiente Fictive');
    await page.getByRole('button',{name:'Vérifier ma visite',exact:true}).click();
    await page.screenshot({path:`${output}/after-review-${width}.png`,fullPage:true});
    await page.getByRole('button',{name:'Envoyer ma demande',exact:true}).click();
    await check(page.locator('.booking-error[role=alert]')).toContainText('créneau ou ses paramètres ont changé');
    await page.getByRole('button',{name:'Choisir un autre créneau',exact:true}).click();
    await page.locator('.availability-results li>button').last().click();
    await check(page.getByLabel('Adresse e-mail de test',{exact:true})).toHaveValue('mobile@example.test');
    await check(page.getByRole('checkbox')).toBeChecked();
    await page.getByRole('button',{name:'Vérifier ma visite',exact:true}).click();
    await page.getByRole('button',{name:'Envoyer ma demande',exact:true}).click();
    await check(page.locator('.booking-error[role=alert]')).toContainText('résultat reste à vérifier');
    await check(page.getByRole('button',{name:'Changer de créneau',exact:true})).toBeDisabled();
    await page.getByRole('button',{name:'Vérifier la même demande',exact:true}).click();
    await check(page.getByRole('heading',{name:'Votre demande est reçue',exact:true})).toBeVisible();
    await check(page.getByRole('status')).toContainText('Aucun créneau n’est réservé');
    await page.screenshot({path:`${output}/after-receipt-${width}.png`,fullPage:true});
    await page.getByRole('button',{name:'Découvrir notre accompagnement',exact:true}).click();
    await check(page.getByRole('heading',{name:'À vos côtés, à chaque étape.',exact:true})).toBeVisible();
    await check(page.getByRole('heading',{name:'Votre demande est reçue',exact:true})).not.toBeVisible();
    await page.getByRole('button',{name:'Continuer',exact:true}).click();
    await page.getByRole('button',{name:'Revoir ma demande',exact:true}).click();
    await check(page.getByRole('heading',{name:'Votre demande est reçue',exact:true})).toBeVisible();
    await check(page.locator('.booking-receipt-reference')).toContainText('20000000-0000-4000-8000-000000000001');
    assert.notEqual(commands[0].key,commands[1].key,'Definitive conflict starts a fresh command');
    assert.deepEqual(commands[1],commands[2],'Uncertain retry keeps identical key and payload');
    assert.equal(commands.length,3);
    assert.equal(commands[2].body.contact_phone,'+212600000001');
    await check.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
    const undersized=await page.locator('.booking-page button:visible').evaluateAll(elements=>elements.filter(element=>element.getBoundingClientRect().height<44).map(element=>element.textContent));
    assert.deepEqual(undersized,[]);assert.deepEqual(errors,[]);
    await page.close();
  }
  console.log('PASS 320/390/1440 booking: availability error/retry, all steps, retained contact, definitive conflict/new key, uncertain retry/same key, pending receipt, overflow/touch bounds. All API writes mocked.');
} finally {await browser.close();}


