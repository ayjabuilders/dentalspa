import { expect, test } from '@playwright/test';
test('clinic navigation, search, filtering, theme, notification and modal keyboard flows', async ({ page }) => {
  await page.goto('http://localhost:4200');
  await expect(page.getByRole('heading',{name:'Une belle journée commence ici.'})).toBeVisible();
  await page.getByRole('button',{name:'Activer le thème sombre'}).click();
  await page.reload(); await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  await page.keyboard.press('Control+k');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('textbox',{name:'Recherche globale'}).fill('Patients');
  await page.getByRole('dialog').getByRole('link',{name:'Patients Espace'}).click();
  await expect(page).toHaveURL(/patients$/);
  await page.getByRole('textbox',{name:'Rechercher dans les patients'}).fill('Nora');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await page.getByRole('button',{name:'Nora Exemple Profil synthétique'}).click();
  await expect(page.getByRole('complementary',{name:'Patient sélectionné'})).toContainText('Nora Exemple');
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
for (const width of [1536,1280,768,390]) test(`clinic layout has no page overflow at ${width}px, both themes`, async ({ page }) => {
  await page.setViewportSize({width,height:1000});
  for (const path of ['/','/patients','/clinical']) {
    await page.goto(`http://localhost:4200${path}`);
    for (const theme of ['light','dark']) {
      await page.evaluate(theme => { document.documentElement.dataset.theme=theme; },theme);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
  }
});
test('patient tabs, own empty dossier and sheet dismissal', async ({ page }) => {
  await page.setViewportSize({width:390,height:844}); await page.goto('http://localhost:4201');
  await page.getByRole('button',{name:'Voir les détails'}).click();
  await expect(page.getByRole('dialog')).toContainText('aucun créneau réservé');
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Dossier',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Aucun document partagé'})).toBeVisible();
  await page.getByRole('button',{name:'Messages',exact:true}).click();
  await expect(page.getByText('La messagerie arrive bientôt')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
test('public visit CTA never claims confirmation or collects PHI', async ({ page }) => {
  await page.goto('http://localhost:4202'); await page.getByRole('button',{name:'Préparer ma première visite'}).click();
  await expect(page.getByRole('status')).toContainText('ne réserve aucun créneau'); await expect(page.locator('input')).toHaveCount(0);
});
test('reduced motion stops orb and preserves keyboard focus', async ({ page }) => {
  await page.emulateMedia({reducedMotion:'reduce'}); await page.goto('http://localhost:4200');
  await page.keyboard.press('Tab'); await expect(page.getByRole('link',{name:'Aller au contenu'})).toBeFocused();
  expect(await page.locator('.pulse-orb').first().evaluate(el=>getComputedStyle(el).animationName)).toBe('none');
});
test('offline reopening yields only safe static fallback', async ({ page, context }) => {
  await page.goto('http://localhost:4201');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await context.setOffline(true);
  await page.goto('http://localhost:4201/');
  await expect(page.getByRole('heading',{name:'Retrouvons-nous bientôt.'})).toBeVisible();
  await expect(page.locator('body')).not.toContainText('28 octobre');
  await context.setOffline(false);
});
