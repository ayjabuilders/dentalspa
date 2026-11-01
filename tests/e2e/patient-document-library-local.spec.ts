import { test, expect } from '@playwright/test';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0xkAAAAASUVORK5CYII=','base64');
for(const width of [1440,390]) test(`category-first library batch metadata and archive ${width}`,async({page})=>{
 const suffix=Date.now().toString(36), first=`Panoramique-fictive-${suffix}.png`, second=`Image-fictive-${suffix}.png`;
 await page.setViewportSize({width,height:width===390?844:1000});
 const requests:string[]=[]; page.on('request',request=>requests.push(request.url()));
 await page.goto((process.env.LOCAL_DOCUMENT_APP_URL??'http://localhost:4204')+'/connection?view=patients&patient=20000000-0000-4000-8000-000000000001');
 await page.getByLabel('Adresse e-mail',{exact:true}).fill(process.env.LOCAL_DOCUMENT_MANAGER_EMAIL!);
 await page.getByLabel('Mot de passe',{exact:true}).fill(process.env.LOCAL_DOCUMENT_MANAGER_PASSWORD!);
 await page.getByRole('button',{name:'Se connecter',exact:true}).click();
 await page.getByRole('tab',{name:width===390?'Médical':'Dossier médical',exact:true}).click();
 await page.getByRole('button',{name:'Ajouter des documents',exact:true}).click();
 const upload=page.getByRole('dialog',{name:'Ajouter des documents',exact:true});
 await expect(upload.getByLabel('Fichiers à importer',{exact:true})).toHaveCount(0);
 await upload.getByLabel('Catégorie',{exact:true}).selectOption('imaging');
 await upload.getByLabel('Type de document',{exact:true}).selectOption('panoramic');
 await upload.getByLabel('Notes (facultatives)',{exact:true}).fill('Fichiers fictifs pour vérifier le classement.');
 await upload.getByRole('button',{name:'Choisir les fichiers',exact:true}).click();
 await upload.getByLabel('Fichiers à importer',{exact:true}).setInputFiles([{name:first,mimeType:'image/png',buffer:png},{name:second,mimeType:'image/png',buffer:png}]);
 await upload.getByRole('button',{name:'Importer les fichiers',exact:true}).click();
 await upload.getByRole('button',{name:'Terminer',exact:true}).click();
 await expect(upload).toHaveCount(0);
 const originalTitle=first;
 const edit=page.getByRole('button',{name:'Modifier '+originalTitle,exact:true});
 await expect(edit).toBeVisible();
 await page.screenshot({path:`.local/qa/document-library-${width}.png`,animations:'disabled'});
 await edit.click();
 const editor=page.getByRole('dialog',{name:'Modifier le classement',exact:true});
 const title='Panoramique reclassée FICTIF '+suffix;
 await editor.getByLabel('Titre (facultatif)',{exact:true}).fill(title);
 await editor.getByRole('button',{name:'Enregistrer les modifications',exact:true}).click();
 await expect(editor).toHaveCount(0);
 await page.reload();
 await page.getByRole('tab',{name:width===390?'Médical':'Dossier médical',exact:true}).click();
 await page.getByRole('button',{name:'Consulter '+title,exact:true}).click();
 await expect(page.getByRole('dialog')).toBeVisible();
 // A private preview and its list must disappear on connection loss, then be
 // fetched again after recovery rather than retaining an offline snapshot.
 try {
  await page.context().setOffline(true);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Consulter '+title,exact:true})).toHaveCount(0);
  await expect(page.getByText('Hors connexion. Retrouvez le réseau pour continuer.',{exact:true})).toBeVisible();
 } finally { await page.context().setOffline(false); }
 await expect(page.getByRole('button',{name:'Consulter '+title,exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Consulter '+title,exact:true}).click();
 await expect(page.getByRole('dialog')).toBeVisible();
 await page.getByRole('dialog').getByRole('button',{name:'Fermer',exact:true}).first().click();
 await page.getByRole('button',{name:'Supprimer '+title,exact:true}).click();
 const confirm=page.getByRole('dialog',{name:'Supprimer ce document',exact:true});
 await confirm.getByRole('button',{name:'Supprimer ce document',exact:true}).click();
 await expect(confirm).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Consulter '+title,exact:true})).toHaveCount(0);
 await page.getByRole('tab',{name:width===390?'Administratif':'Dossier administratif',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Dossier administratif',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Ajouter des documents',exact:true}).click();
 const admin=page.getByRole('dialog',{name:'Ajouter des documents',exact:true});
 await expect(admin.getByLabel('Catégorie',{exact:true}).locator('option')).toHaveCount(2);
 await admin.getByRole('button',{name:'Annuler',exact:true}).click();
 await page.getByRole('tab',{name:'Finances',exact:true}).click();
 const finance=page.getByRole('group',{name:'Rubriques financières'});
 for(const [label,region] of [['Factures','Factures du patient'],['Paiements','Paiements du patient'],['Échéanciers','Échéanciers du patient']]) {
   await finance.getByRole('button',{name:label,exact:true}).click();
   await expect(page.getByRole('region',{name:region,exact:true})).toBeVisible();
   await expect(page.getByRole('region',{name:region,exact:true})).toHaveAttribute('aria-busy','false');
   await expect(page.getByRole('region',{name:region,exact:true}).getByRole('alert')).toHaveCount(0);
 }
 await page.screenshot({path:'.local/qa/patient-finance-'+width+'.png',animations:'disabled'});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 if(process.env.LOCAL_DOCUMENT_DIRECT_TRANSFER==='true'){
   expect(requests.some(url=>url.includes('/library/uploads/start'))).toBe(true);
   expect(requests.some(url=>url.includes('/library/uploads/finish'))).toBe(true);
   expect(requests.some(url=>url.includes('/storage/v1/object/upload/sign/'))).toBe(true);
   expect(requests.some(url=>url.includes('/content-link'))).toBe(true);
   expect(requests.some(url=>url.includes('/storage/v1/object/sign/'))).toBe(true);
 }
});
