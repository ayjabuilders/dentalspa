# Pearl Mobile — pilote Cabinet (31 octobre 2026)

URL : http://127.0.0.1:4216/design-lab/patients/mobile

## Périmètre

Surface dédiée dans le Design Lab. Le prototype desktop `/design-lab/patients` reste inchangé. Stack Next.js, React et CSS Modules ; aucune bibliothèque ajoutée, aucun changement de backend, auth, permission, cache privé ou service worker. Polices Manrope/DM Sans locales existantes, licences OFL copiées dans le runtime ignoré. Icônes Lucide existantes. Pas de promesse App Store ni d’installation native.

## Architecture d’expérience

- `MobileCabinetFrame` à extraire : hauteur 100dvh, en-tête contextuel, petit indicateur de démo, une seule zone de défilement, dock d’action et navigation basse hors du scroll. Le contenu ne passe jamais sous les contrôles.
- `MobileCabinetNav` : Patients / Agenda / Activité, état actif lisible par couleur et aria-current. Ces destinations sont des exemples de Cabinet, pas une navigation Patient Pass.
- `PatientListScreen` : recherche immédiate, trois filtres rapides, filtre en panneau bas, cartes denses entièrement cliquables, chargement supplémentaire borné. Pas de grand tableau défilant latéralement ni de dashboard avant la liste.
- `PatientRecordScreen` : retour contextuel, identité, quatre onglets visibles sans défilement horizontal à 320 px ; Aperçu, RDV, Documents, Finances. Synthèse → rubrique par carte cliquable. Action principale dans le dock.
- `MobileActionDock` : nouveau dossier depuis la liste, rendez-vous depuis le dossier ; cible d’au moins 48 px. Navigation basse indépendante de l’action.
- `MobileSheet` : panneau bas, hauteur bornée, scroll interne, fermeture explicite/Échap, focus contenu et restauré, indication d’erreur reliée au champ, protection de la saisie avant abandon. Trait de préhension décoratif : aucun faux geste de glissement annoncé.
- Clavier : champs à 16 px, `visualViewport` ajuste le décalage et la hauteur maximale du panneau, safe areas haut/bas ; aucun viewport qui interdit le zoom. Les contrôles derrière le dialogue sont inertes via showModal.
- Mouvement : apparition courte du panneau et de la rubrique, pression discrète ; neutralisation sous prefers-reduced-motion. Pas d’animation clinique ni de vibration simulée.

## État et contrats à préserver à l’intégration

La démonstration possède uniquement des fixtures marocaines fictives et un état mémoire. Recherche, filtre, limite affichée, écran d’origine et position de scroll sont conservés au retour. Les ajouts en mémoire s’effacent au rechargement. Un RDV simulé remplace la valeur illustrative du dossier ; l’agenda représente une journée fixe et n’est pas un moteur de disponibilité. Aucun téléchargement de document, facture ni message n’est émis.

Pour l’intégration coordonnée, brancher ces écrans sur les données, commandes et autorisations EXISTANTES. Le pilote n’est pas un modèle de domaine. Réutiliser la garde de brouillon et les protections de commande incertaine déjà présentes. Remplacer le dialogue HTML local par un mode mobile/bottom-sheet des primitives accessibles partagées après revue ; ne pas modifier leur comportement desktop ni contourner closeDisabled.

Conserver le router Next et les URLs métier. Le bouton retour interne de ce pilote restaure l’état ; le retour navigateur/Android et les liens profonds devront utiliser la navigation réelle du shell et ses gardes. Ne pas copier un routeur à état local dans la production. Les filtres et brouillons doivent être conservés par le propriétaire de l’état approprié et vidés à la déconnexion/changement de cabinet selon les règles existantes.

## Direction Pass / public

Patient Pass : conserver ses rubriques patient, FR/AR, statut connecté/hors-ligne et contraintes de publication. Reprendre l’en-tête contextuel, le dock et les panneaux, jamais la patientèle ou les soldes Cabinet.

Réservation publique : privilégier un parcours étape par étape, retour d’étape et bouton Continuer dans un dock. Pas de navigation Cabinet à trois destinations. Conserver les états serveur, conflits de créneaux et reprise idempotente existants.

## Runtime isolé

Le projet de démonstration est dans `.local/pearl-mobile-runtime/` à la racine du checkout (ignoré, hors de app/), avec son propre `next-env.d.ts`, tsconfig et `.next-mobile-runtime`. Il réexporte la page source du pilote et charge seulement un reset minimal et les fontes locales. Il n’utilise ni le shell connecté ni ses données. Port 4216 ; aucun redémarrage de 4202/4204/4205/4300. `.qa/` contient les captures. Les CSS partagés ne sont pas modifiés.

Validation et limites appareil : voir les résultats finaux de `check-mobile.mjs`. Les vérifications Chromium à tailles mobiles sont des tests navigateur, pas une certification iOS/Android installé. Clavier logiciel réel, encoche, retour Android, rotation et lancement PWA sur appareil restent à tester lors du pilote intégré.

Démarrage reproductible : node apps/clinic-os/app/design-lab/patients/mobile/start-preview.mjs [port]. Le script refuse un port occupé. Ne jamais créer de runtime Next sous app/ : ses sorties sont découvertes comme routes au build principal.


## Preuves finales

`node apps/clinic-os/app/design-lab/patients/mobile/check-mobile.mjs` : PASS après déplacement du runtime hors de app/. Tests : 320/390/430 sans débordement, recherche/vide/filtres, rubriques clavier, document, ajout RDV simulé, formulaire invalide, reprise de brouillon, piège/restauration de focus, navigation basse, état et position de scroll conservés, hauteur disponible de 480 px, reduced-motion et effacement au rechargement. Zéro erreur console JavaScript. ESLint ciblé passé. Contrôle TypeScript Clinic lancé avec incremental=false pour éviter d’écrire le cache partagé du coordinateur.

Captures revues : `.qa/list-320.png`, `list-390.png`, `list-430.png`, `profile-390.png`, `sheet-320.png`, `sheet-390.png`, `sheet-430.png`, `agenda-390.png`. Les tests à hauteur réduite sont une approximation du clavier ; le vrai clavier iOS/Android et les safe areas physiques restent à valider.

Incident d’intégration résolu : un premier runtime imbriqué sous app/ était découvert comme routes lors du build principal. Il a été déplacé avec vérification des chemins, hors de app/, à `.local/pearl-mobile-runtime`. Seul le processus de preview 4216 et son parent vérifié ont été arrêtés puis relancés. Aucun source pilote supprimé, aucun service métier relancé. Le script de démarrage utilise désormais exclusivement le runtime racine.
Résultat final : TypeScript Clinic --noEmit --incremental false PASS. La garde du lanceur refuse bien le port 4216 occupé sans interrompre son service. Runtime source sous app/ absent (Test-Path = False).
