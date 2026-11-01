import { expect, test } from '@playwright/test';
test('clinic navigation, search, filtering, theme, notification and modal keyboard flows', async ({ page }) => {
  await page.goto('http://localhost:4204');
  await expect(page.getByRole('heading',{name:'Une belle journée commence ici.'})).toBeVisible();
  await page.getByRole('button',{name:'Activer le thème sombre'}).click();
  await page.reload(); await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  await page.keyboard.press('Control+k');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('textbox',{name:'Recherche globale'}).fill('Patients');
  await page.getByRole('dialog').getByRole('link',{name:'Patients Espace'}).click();
  await expect(page).toHaveURL(/connection\?view=patients$/);
  await page.goto('http://localhost:4204/patients?preview=1');
  await page.getByRole('textbox',{name:'Rechercher dans les patients'}).fill('Imane');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await page.getByRole('button',{name:'Imane El Idrissi DEMO-003'}).click();
  await expect(page.getByRole('complementary',{name:'Patient sélectionné'})).toContainText('Imane El Idrissi');
  await page.getByRole('button',{name:'Effacer la recherche'}).click();
  await page.getByRole('button',{name:'Afficher seulement les patients à accueillir'}).click();
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await page.getByRole('button',{name:/Notifications, 2/}).click();
  await page.getByRole('button',{name:'Tout lire'}).click();
  await page.getByRole('button',{name:'Non lues',exact:true}).click();
  await expect(page.getByText('Vous êtes à jour')).toBeVisible();
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button',{name:'Installer l’application'}).click();
  await expect(page.getByRole('dialog')).toContainText('propre fenêtre');
});
test('patient directory shows Moroccan fictional scenarios and a safe local contact preview', async ({ page }) => {
  await page.goto('http://localhost:4204/patients?preview=1');
  await expect(page.getByText('10 fiches fictives')).toBeVisible();
  await expect(page.locator('tbody tr')).toHaveCount(10);
  await expect(page.getByRole('columnheader',{name:'Coordonnées fictives'})).toBeVisible();
  await expect(page.getByRole('columnheader',{name:'Visite illustrative'})).toBeVisible();
  await expect(page.locator('tbody')).toContainText('salma.alaoui@example.test');
  await expect(page.locator('tbody')).toContainText('Scénario d’accueil · non réservé');
  expect(await page.locator('tbody img').evaluateAll(images => images.every(image => (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
  await page.getByRole('textbox', { name: 'Rechercher dans les patients' }).fill('+212 6XX XX XX 05');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await page.getByRole('textbox', { name: 'Rechercher dans les patients' }).fill('');
  await page.getByRole('button', { name: 'Yasmine Benjelloun DEMO-005' }).click();
  const detail = page.getByRole('complementary', { name: 'Patient sélectionné' });
  await expect(detail).toContainText('yasmine.benjelloun@example.test');
  await expect(detail).toContainText('+212 6XX XX XX 05');
  await expect(detail).toContainText('Aucun dossier réel ni rendez-vous confirmé.');
  await page.getByRole('textbox', { name: 'Rechercher dans les patients' }).fill('Sans résultat');
  await expect(page.getByRole('heading', { name: 'Aucun patient trouvé' })).toBeVisible();
});
for (const width of [1536,1280,768,390]) test(`clinic layout has no page overflow at ${width}px, both themes`, async ({ page }) => {
  await page.setViewportSize({width,height:1000});
  for (const path of ['/','/patients?preview=1','/clinical']) {
    await page.goto(`http://localhost:4204${path}`);
    for (const theme of ['light','dark']) {
      const toggle=page.getByRole('button',{name:theme==='dark'?'Activer le thème sombre':'Activer le thème clair',exact:true});
      if(await toggle.isVisible())await toggle.click();
      await expect(page.locator('.preview-shell')).toHaveAttribute('data-theme',theme);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
  }
});
test('patient tabs, own empty dossier and sheet dismissal', async ({ page }) => {
  await page.setViewportSize({width:390,height:844}); await page.goto('http://localhost:4205');
  await page.getByRole('button',{name:'Voir l’exemple'}).click();
  await expect(page.getByRole('dialog')).toContainText('aucune réservation réelle');
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Dossier',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Aucun document partagé'})).toBeVisible();
  await page.getByRole('button',{name:'Messages',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Votre équipe'})).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
test('public visit CTA runs a fictional local request without sending or booking', async ({ page }) => {
  const apiRequests: string[] = [];
  page.on('request', request => { if (request.url().includes('/api/')) apiRequests.push(request.url()); });
  await page.goto('http://localhost:4202/preview');
  await page.getByRole('button',{name:'Préparer ma première visite'}).click();
  const contactDemo = page.getByRole('region',{name:'Démo locale de demande de contact'});
  const contactForm = contactDemo.locator('.request-content form');
  await expect(contactDemo.getByText(/utilisez uniquement l’exemple fictif/)).toBeVisible();
  await contactForm.getByRole('button',{name:'Charger l’exemple fictif'}).click();
  await expect(contactForm.getByLabel('Nom fictif')).toHaveValue('Salma Alaoui (FICTIF)');
  await expect(contactForm.getByLabel('Courriel fictif')).toHaveValue('salma.alaoui@example.test');
  await contactForm.getByRole('button',{name:'Préparer la demande fictive'}).click();
  await expect(contactDemo.getByRole('status')).toContainText('Le cabinet ne l’a pas reçue et aucun créneau n’est réservé.');
  expect(apiRequests).toEqual([]);
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
  await page.reload();
  await page.getByRole('button',{name:'Préparer ma première visite'}).click();
  await expect(page.getByRole('status')).toHaveCount(0);
});
test('reduced motion stops orb and preserves keyboard focus', async ({ page }) => {
  await page.emulateMedia({reducedMotion:'reduce'}); await page.goto('http://localhost:4204');
  await page.keyboard.press('Tab'); await expect(page.getByRole('link',{name:'Aller au contenu'})).toBeFocused();
  expect(await page.locator('.pulse-orb').first().evaluate(el=>getComputedStyle(el).animationName)).toBe('none');
});
test('offline reopening yields only safe static fallback', async ({ page, context }) => {
  await page.goto('http://localhost:4205');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await context.setOffline(true);
  await page.goto('http://localhost:4205/');
  await expect(page.getByRole('heading',{name:'Retrouvons-nous bientôt.'})).toBeVisible();
  await expect(page.locator('body')).not.toContainText('28 octobre');
  await context.setOffline(false);
});
