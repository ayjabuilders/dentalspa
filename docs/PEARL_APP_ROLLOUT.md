# Pearl — adoption dans toute l’application

Objectif propriétaire : appliquer la direction approuvée aux parcours complets, à la navigation, aux cartes, aux formulaires et aux états, et pas seulement aux couleurs. Application locale, données fictives, aucun déploiement distant. La refonte ne crédite aucune capacité métier supplémentaire dans MODULE_PROGRESS.

## Contrat d’expérience

- Même langage violet/perle/menthe, Manrope/DM Sans locaux, icônes et états sémantiques. Photographies existantes conservées sur les surfaces de découverte.
- Shell stable, navigation contextuelle, retour avec état conservé, recherche au sein du module, listes bornées lorsque nécessaires.
- Formulaires courts en modale, retour de focus, confirmation d’abandon si modifiés, fermeture verrouillée pendant une commande incertaine.
- Desktop et téléphone adaptés à leur usage; pas de colonne mobile étroite sur ordinateur, ni de débordement global. Animations respectant reduced-motion.
- Loading, vide, erreur, conflit et succès liés à l’état réel. Pas de notification ou d’action simulée présentée comme réellement exécutée.
- Cabinet, public et patient restent des applications distinctes. Rôles, isolation, consentement, contrats, idempotence, publication clinique et cache privé inchangés.

## Matrice de livraison et preuves

État au 31 octobre 2026. « Vérifié » signifie contrôles locaux ciblés, pas acceptation opérationnelle ou clinique.

| Surface | Composition et preuve | État |
|---|---|---|
| Huit modules connectés + shell | Rail, recherche Ctrl K, compte, liste/détail, onglets et éditeurs; check-pearl-connected / workspace-ux / modules-ux, pipeline Intake et agenda-settings | Vérifié; nouvelle non-régression connexion/navigation/huit modules passée sur pearl-patient-verified |
| Accueil et shell des aperçus | Accès connectés distincts des scénarios; cartes photo, recherche, navigation dépliable, thèmes et portails; check-pearl-preview-shell | Build local et navigateur vérifiés à 1280/768/390/320 |
| Connexion et choix cabinet | Contexte photo + formulaire, phases, choix avec rôles, erreurs; check-pearl-entry-demos | Vérifié, captures pearl-entry / chooser; aucune modification Auth |
| Patients fictifs et parcours vers Pass | Identité, rubriques exclusives, navigation précédent/suivant, notice compacte; patient-profile-quick-nav et patient-demo-wiring | Parcours vérifié; patient-demo-wiring 12/12 et régression clinique ciblée passée |
| Consultation fictive | File recherchable, contexte, navigation dossier, sections et actions | Première version vérifiée; tests clinical-demo 2/2 |
| Finance fictive | Devis/paiements, résumé, guide, historique filtré et paginé | Vérifié avec Consultation : six tests navigateur passés; captures desktop/mobile revues |
| Suivi fictif | Statistiques filtrantes, recherche, file et invitation neutre; aftercare-demo + check-pearl-preview-shell | Vérifié, aucun envoi/stockage ajouté |
| Build Center | Navigation plus tôt, visite en disclosure, décision dans validations, textes de visite alignés aux routes | Trois tests passés sur pearl-whole-polish, thèmes et quatre largeurs. Calculs/preuves/instantané inchangés |
| Réception de préférence fictive | Résumé, prochaine action, détails secondaires, liens vers véritable aperçu | Test de parcours et captures desktop/mobile vérifiés; whole-workflow / whole-handoff |
| Modèles de tâches | Liste des tâches + un éditeur, dépendances, focus, confirmation d’effacement | Tests navigateur passés avec handoff (3/3), clavier, cycles, ordre, suppression et confirmation |
| Devis connecté / document facture | Éditeur modal, catalogue recherché/paginé, contrôles de reprise et portail Pearl | Sauvegarde et reprise natives vérifiées : un devis, une commande, un audit et un outbox. Portail facture desktop/mobile vérifié |
| Configuration paiement / échéanciers | Éditeur modal, recherche et pages, commandes existantes | Deux tests échéanciers et un test paiement natifs passés; focus, abandon, reprise et persistance après rechargement |
| Historiques patient et formulaires financiers imbriqués | Rendez-vous/devis recherchables et paginés, conservation de recherche entre rubriques; factures et paiements en modales, registres bornés | Vérifié sur pearl-patient-verified : 23 éléments sur trois pages, numérotation stable, filtres et rubriques, onglet sélectionné visible en mobile. Facture native 1/1, paiements natifs 2/2; focus, abandon, reprise, relecture et droits conservés |
| Public Booking | Prestation → créneau → coordonnées → récapitulatif → reçu serveur; erreurs/conflits/reprise | Build et QA passés; réponse perdue/reprise = une ligne en base par demande. Logs whole-public-qa / states |
| Public `/preview` | Simulation distincte, tokens et responsive conservés | Revue desktop/mobile et régressions fondation/handoff passées |
| Patient Pass | Navigation desktop/mobile, cinq rubriques, scénarios en modale, guide, FR/AR, compte et hors-ligne | Build, 26 contrôles navigateur, 11 tests unitaires passés. Nouveau lot pearl-pass-draft : 16 tests navigateur passent; brouillons FR/AR conservés entre rubriques en mémoire, effacés sur changement de scénario/session/rechargement |
| Paramètres d’aperçu, futurs modules, laboratoire de design | Shell commun; états indisponibles honnêtes. Galerie reste référence, pas fonction métier | Seize routes vérifiées à 1280/768/390/320 sur pearl-whole-polish; galerie commune check-pearl-catalogue passée |

## Artefacts

Les captures et logs sont locaux et ignorés par Git dans `.local/qa/` : `whole-clinic-*`, `pearl-entry-*`, `pearl-clinical-*`, `pearl-finance-*`, `whole-public-*`, `whole-pass-*`. Les scripts réutilisables sont dans `scripts/`; les régressions versionnées dans `tests/e2e/`. Les sorties Playwright de chaque équipe utilisent un dossier distinct pour éviter une suppression mutuelle des traces.

Les comptes/préférences cliniques réels, messageries externes, paiement réel et publication patient ne sont pas activés. Les données de test supplémentaires identifiables créées par la QA sont synthétiques. Aucun reset de base ni suppression de dossiers propriétaire n’est requis par la refonte.

## Dernier lot vérifié et suite ouverte

Le lot financier de référence est `.local/pearl-financial-verified`; Clinic OS sert désormais le build `.local/pearl-mobile-intake` sur 4204; Patient Pass sert `.local/pearl-pass-mobile-final` sur 4205; la réservation publique sert `.local/pearl-public-mobile` sur 4202. Le dernier lot ajoute uniquement de la présentation et des interactions; aucun schéma, contrat de commande ou droit métier n’a changé. La recherche de rendez-vous utilise le jour Casablanca affiché, y compris après un changement de jour depuis UTC. Le mode compact réduit effectivement la hauteur des lignes patients en conservant les cibles tactiles. Ces deux comportements ont été vérifiés dans le navigateur (`patient-record-lists-final.log`, `pearl-workspace-density-final.log`).

Preuves : `patient-record-lists-final.log`, `pearl-connected-patient-flows.log`, `whole-clinic-preview-verified.log`, `pearl-invoices-ux-final.log`, `pearl-invoice-native-final.log`, `pearl-payment-flows-native.log`, `pearl-payment-history-inspect.log`, `pass-draft-tests.log`. Les captures correspondantes ont été relues sur ordinateur et téléphone. Le passage des listes de 23 éléments utilise uniquement des réponses fictives dans le navigateur; aucune nouvelle écriture n’est effectuée par ce contrôle. Les tests natifs financiers utilisent leurs propres cabinets/comptes temporaires, nettoyés après le contrôle, sans modifier les dossiers propriétaire.

Les avoirs et remboursements disposent maintenant de modales, d’un historique recherché/paginé, d’une confirmation d’abandon et des gardes de navigation/reprise. Le document d’avoir utilise le thème Pearl. Les commandes, autorisations et clés d’idempotence sont conservées. `pearl-credit-native-final.log` : 2/2; `pearl-refund-native-final.log` : 3/3, avec vérifications Auth/API/PostgreSQL et nettoyage des fixtures dédiées. Les captures des éditeurs et documents ont été revues. Un correctif CSS complémentaire aligne les cartes de solde crédit en une colonne sous 480 px pour éviter de couper la devise; build final réussi et contrôle navigateur à 320/390/430/1280 passé (`pearl-credit-summary-final.log`), capture 390 px relue. Aucune écriture API dans cette dernière vérification visuelle.

L’intégration locale du design et de l’extension mobile est livrée sur les trois applications, selon l’audit de couverture ci-dessous. Les modules métier encore absents ne sont pas comptés comme construits par cette refonte.

## Extension mobile demandée

Le propriétaire demande une expérience mobile de type application : navigation basse persistante, en-tête contextuel compact, parcours liste → dossier → retour conservant son contexte, actions accessibles au pouce et formulaires en panneaux adaptés au clavier. Une simple réduction des colonnes desktop ne satisfait pas cette demande. Le socle Next/PWA reste inchangé.

Le chat auteur « Patients — prototype UI violet & turquoise » a livré le pilote isolé dans `apps/clinic-os/app/design-lab/patients/mobile/`, avec vérification à 320, 390 et 430 px. Il est consultable sur `http://127.0.0.1:4216/design-lab/patients/mobile`. Recherche, filtres, rubriques, retour avec conservation du défilement, validation/abandon de formulaire, focus et reduced-motion sont contrôlés. Captures revues; handoff dans le `HANDOFF.md` du pilote. Le runtime est hors des routes, à la racine `.local/pearl-mobile-runtime`.

Le pilote reste isolé. Le build connecté `pearl-mobile-balanced` intègre désormais la capsule mobile, les espaces autorisés, les panneaux de formulaire et le parcours patient à quatre rubriques. La navigation utilise de vraies entrées navigateur avec lien patient et conserve le contexte de liste au retour. `mobile-workspace-final.log` et `mobile-patient-final.log` passent à 320/390/430 px : retour/avance navigateur, protection des formulaires modifiés, focus, navigation, absence d’écriture métier et d’erreur JavaScript. Le contrôle des liens Assistant est un contrôle de présentation avec réponses simulées, pas une nouvelle preuve de sécurité backend. Les captures patient ont été relues. L’extension mobile Agenda, Réservations, Catalogue et Équipe, la capsule de l’accueil et la présentation devis/factures sont intégrées et vérifiées dans le lot détaillé ci-dessous. La revue navigateur des trois applications est terminée sur les builds locaux listés ci-dessus. Le clavier logiciel réel, les safe areas physiques et le retour système sur appareil restent à vérifier au pilote intégré.

## Lot mobile et documents Dental Spa — vérification du 31 octobre

Le lot `pearl-mobile-documents` a passé les contrôles du shell connecté (`mobile-workspace-documents.log`), de la capsule de navigation des aperçus sur seize routes à 1280/768/390/320 px (`mobile-preview-capsule.log`), de l’agenda chronologique et de ses paramètres (`mobile-agenda-balanced.log`), puis Réservations/Catalogue/Équipe à 320/390/1440 px (`mobile-module-refinement.log`). Captures relues : accueil mobile, agenda 320 et catalogue 390. Les données d’agenda utilisées par ce contrôle sont simulées dans le navigateur; aucune écriture métier. Le catalogue et les listes conservent leurs contrôles existants.

La demande suivante ajoute une présentation commune des devis et factures : identité cabinet, patient/payeur, prestations et totaux conservés, aperçu avec impression, état brouillon/non fiscal explicite. Le logo fourni par le propriétaire est conservé intact dans `public/assets/dental-spa-logo-reference.png`; les variantes or et noire sont cadrées par CSS. Le modèle noir/ivoire/or est appliqué uniquement au cabinet de démonstration explicite `10000000-0000-4000-8000-000000000001`, jamais comme branding global. Les autres cabinets et contextes absents gardent leur identité neutre. Aucun nom enregistré dans les snapshots de factures n’est remplacé. Ce modèle local ne constitue pas encore une interface de configuration du logo par tenant.

Contrôle du formulaire devis après refonte : `pearl-quote-modal-document-redesign.log`, focus, abandon, pagination catalogue, reprise avec même clé de commande; transport de sauvegarde simulé, aucune écriture financière. Compilation `pearl-mobile-dental-spa-final` réussie et servie sur 4204. Les trois scripts de documents passent sans injection CSS/DOM : `financial-documents-final.log`, `financial-documents-alternate-final.log`, `financial-documents-credit-final.log`. Devis/facture locaux relus à 320/390/1440 px, montants issus des snapshots conservés, impression isolée et focus restauré. PDF A4 rendus avec Poppler et inspectés : devis/facture une page; fixture de 45 lignes cinq pages, en-têtes répétés et totaux/pied de page regroupés. Autre cabinet et avoirs contrôlés avec fixtures navigateur seulement, pas preuve backend d’isolation. Aucune écriture API ni erreur JavaScript. Preuves dans `.local/qa/financial-documents/`, dont `evidence.json` indique `sourceCssInjection:false`. Régression navigation connectée finale : `mobile-workspace-dental-spa-final.log` passée. Les avoirs conservent une feuille de style indépendante pour éviter une régression liée au nouveau composant documentaire.

## Audit de couverture final du design — 31 octobre 2026

Le périmètre évalué est le transfert du design et des interactions aux surfaces existantes de Clinic OS, Public Booking et Patient Pass, y compris les aperçus et documents imbriqués. Les fonctionnalités métier non implémentées et la mise en production ne sont pas requalifiées en livrées. La dernière demande sur l’ordonnance était une question de conception : aucun contenu médical ou moteur de prescription n’a été activé.

| Exigence | Preuve inspectée | Résultat |
|---|---|---|
| Direction commune, typographies, couleurs, cartes photographiques, thèmes et portails | `packages/ui-clinic/PEARL.md`, styles partagés, `whole-pearl-catalogue.log`, `mobile-preview-capsule.log`; captures accueil et dialogues | Intégré; contrôles clavier, focus, reduced-motion et couples de contraste documentés |
| Navigation bureau et mobile, modules autorisés, historique et retour contextualisé | `mobile-workspace-dental-spa-final.log`, `mobile-all-modules-final.log`; shell actuel conservé dans build intake | Pass; contrôle des liens selon rôle simulé, pas nouvelle preuve backend |
| Patients : recherche, listes bornées, dossier, quatre rubriques mobile, états et formulaires financiers | `mobile-patient-final.log`, `mobile-inbox-reading.log`, preuves financières finales; captures répertoire/dossier/onglet Documents | Pass; retour liste conserve contexte, libellé Documents tient à 320 px |
| Demandes : source, actions existantes, trois sous-vues, fiche/retour, recherche et échéances | `.local/qa/mobile-remaining-audit/after/evidence.json`; captures 320/390/1440 relues | Pass sans injection de style; recherche simulée, lectures réelles, aucune écriture métier |
| Agenda/paramètres : timeline mobile, jours, détails, options et éditeurs | `mobile-agenda-balanced.log`; captures timeline/settings | Pass; choix de vue conservé au redimensionnement/retour |
| Réservations, Catalogue, Équipe, Messagerie | `mobile-module-refinement.log`, `mobile-all-modules-final.log`, `mobile-inbox-reading.log` | Pass; conversation récente à l’ouverture, position de lecture conservée après retour/actualisation |
| Devis/factures et identité Dental Spa limitée au cabinet démo, avoirs préservés | Trois logs `financial-documents-*-final.log`, `financial-documents/evidence.json`, PDFs rendus et relus | Pass; autre cabinet sans logo/palette; aucun calcul/contrat modifié |
| Aperçus, fiches fictives, consultation, finance, suivi, modèles et Build Center | Seize routes dans `mobile-preview-capsule.log`, `whole-clinic-preview-e2e-isolated.log`, captures workflow/handoff; source métier inchangée | Pass pour les interactions existantes; écrans futurs restent explicitement indisponibles |
| Réservation publique : prestation, créneau, coordonnées, revue, reçu, erreur/conflit/reprise | `apps/public-booking/scripts/check-mobile-booking.mjs`, `public-booking-mobile/live-report.json`, captures live 320/390/1440; `public-preview-mobile-final.log` 3/3 | Pass; parcours réel jusqu’à revue via GET; soumissions des tests interceptées, pas de réservation créée |
| Patient Pass : cinq rubriques, navigation, scénarios, FR/AR, brouillons et hors-ligne | `apps/patient-pass/check-mobile-pass.mjs`, `mobile-qa.config.mjs` et deux tests lifecycle passés; captures FR/AR et desktop relues | Pass sur build final; brouillons en mémoire, reset scénario/session vérifié avec session simulée |

Les trois builds package ont réussi, les processus correspondants servent 4204/4202/4205 et aucun fichier de source/asset des applications n’était plus récent que son build lors de la vérification finale. Les captures téléphone proviennent de Chromium aux largeurs 320, 390 et 430 px selon le parcours, pas d’un appareil physique. Clavier logiciel, encoche/safe areas physiques et installation iOS/Android demeurent des vérifications d’appareil/release; ce livrable ne prétend pas les avoir réalisés ni être une application native compilée. Aucun déploiement distant, changement de schéma, envoi externe, paiement réel ou activation clinique.
