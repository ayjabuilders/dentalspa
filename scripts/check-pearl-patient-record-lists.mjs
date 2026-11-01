/* global document, innerWidth */
import { readFileSync } from 'node:fs';
import { chromium, expect } from '@playwright/test';

// Real local authentication/read; the expanded histories exist only in this browser response.
const credentials = JSON.parse(readFileSync('.local/owner-demo-access.json', 'utf8'));
const browser = await chromium.launch();
const check = expect.configure({ timeout: 20000 });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [], writes = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (request.url().includes('/api/v1/') && !['GET', 'OPTIONS'].includes(request.method())) writes.push(request.method()); });
  await page.route('**/api/v1/patients/*/hub', async route => {
    const response = await route.fetch();
    check(response.status()).toBe(200);
    const data = await response.json();
    check(data.appointments.length).toBeGreaterThan(0);
    check(data.quotes.length).toBeGreaterThan(0);
    const appointment = data.appointments[0], quote = data.quotes[0];
    data.appointments = Array.from({ length: 23 }, (_, index) => ({ ...appointment, id: `99000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`, starts_at: `2026-11-${String(index + 1).padStart(2, '0')}T09:00:00Z`, ends_at: `2026-11-${String(index + 1).padStart(2, '0')}T09:45:00Z`, status: index < 4 ? 'cancelled' : 'confirmed' }));
    data.quotes = Array.from({ length: 23 }, (_, index) => ({ ...quote, history: [], id: `98000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`, details: quote.details ? { ...quote.details, lines: quote.details.lines.map(line => ({ ...line, label: index === 22 ? 'Contrôle synthétique ciblé' : line.label })) } : quote.details }));
    data.appointments[22].starts_at = '2026-05-23T23:30:00Z';
    data.appointments[22].ends_at = '2026-05-24T00:15:00Z';
    await route.fulfill({ response, json: data });
  });
  await page.goto('http://localhost:4204/connection?view=patients');
  await page.getByLabel('Adresse e-mail', { exact: true }).fill(credentials.email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(credentials.password);
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  await page.getByRole('button', { name: 'Ouvrir la fiche de Salma Alaoui (FICTIF)', exact: true }).click();
  const hub = page.getByRole('region', { name: 'Dossier patient enregistré' });
  await hub.getByRole('tab', { name: 'Rendez-vous', exact: true }).click();
  await check(hub.getByRole('tab', { name: 'Rendez-vous', exact: true })).toHaveCSS('color', 'rgb(255, 255, 255)');
  const rows = hub.getByRole('list', { name: 'Rendez-vous du patient' }).getByRole('listitem');
  await check(rows).toHaveCount(10);
  await hub.getByRole('button', { name: 'Rendez-vous · page suivante', exact: true }).click();
  await check(rows).toHaveCount(10);
  await hub.getByRole('button', { name: 'Rendez-vous · page suivante', exact: true }).click();
  await check(rows).toHaveCount(3);
  await hub.getByRole('tab', { name: 'Documents', exact: true }).click();
  await hub.getByRole('tab', { name: 'Rendez-vous', exact: true }).click();
  await check(rows).toHaveCount(3);
  await hub.getByLabel('État des rendez-vous du patient').selectOption('cancelled');
  await check(rows).toHaveCount(4);
  await hub.getByLabel('Rechercher un rendez-vous par date').fill('2026-11-02');
  await check(rows).toHaveCount(1);
  await hub.getByLabel('Rechercher un rendez-vous par date').fill('aucun');
  await check(hub.getByText('Aucun rendez-vous pour ces filtres.')).toBeVisible();
  await hub.getByRole('button', { name: 'Réinitialiser les filtres' }).click();
  await check(rows).toHaveCount(10);
  await hub.getByLabel('Rechercher un rendez-vous par date').fill('2026-05-24');
  await check(rows).toHaveCount(1);
  await check(rows.first()).toContainText('24 mai 2026');
  await hub.getByLabel('Rechercher un rendez-vous par date').fill('2026-05-23');
  await check(hub.getByText('Aucun rendez-vous pour ces filtres.')).toBeVisible();
  await hub.getByRole('button', { name: 'Réinitialiser les filtres' }).click();
  await page.screenshot({ path: '.local/qa/patient-records-appointments-desktop.png' });
  await hub.getByRole('tab', { name: 'Devis', exact: true }).click();
  const quotes = hub.locator('.patient-quotes > .patient-quote');
  await check(quotes).toHaveCount(10);
  await hub.getByRole('button', { name: 'Devis · page suivante', exact: true }).click();
  await hub.getByRole('button', { name: 'Devis · page suivante', exact: true }).click();
  await check(quotes).toHaveCount(3);
  await check(quotes.first().locator(':scope > summary')).toContainText('Devis 21');
  await hub.getByLabel('Rechercher un devis').fill('controle synthetique cible');
  await check(quotes).toHaveCount(1);
  await check(quotes.first().locator(':scope > summary')).toContainText('Devis 23');
  await hub.getByRole('tab', { name: 'Synthèse', exact: true }).click();
  await hub.getByRole('tab', { name: 'Devis', exact: true }).click();
  await check(hub.getByLabel('Rechercher un devis')).toHaveValue('controle synthetique cible');
  await quotes.first().locator(':scope > summary').click();
  await check(quotes.first().getByText('Contrôle synthétique ciblé').first()).toBeVisible();
  await page.screenshot({ path: '.local/qa/patient-records-quotes-desktop.png' });
  for (const width of [768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await check.poll(() => hub.getByRole('tab', { name: 'Devis', exact: true }).evaluate(element => {
      const item = element.getBoundingClientRect(), strip = element.parentElement.getBoundingClientRect();
      return item.left >= strip.left - 1 && item.right <= strip.right + 1;
    })).toBe(true);
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    check(await hub.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  }
  await page.screenshot({ path: '.local/qa/patient-records-quotes-mobile.png' });
  await hub.getByLabel('Rechercher un devis').fill('introuvable');
  await check(hub.getByText('Aucun devis pour cette recherche.')).toBeVisible();
  await hub.getByRole('button', { name: 'Effacer la recherche' }).click();
  await check(quotes).toHaveCount(10);
  check(errors).toEqual([]);
  check(writes).toEqual([]);
  console.log('PASS histories: 23 records,10/10/3 pages,stable quote numbering,date/status/accent search,empty reset,tab-state retention,desktop/mobile bounds;zero API mutations.');
} finally { await browser.close(); }
