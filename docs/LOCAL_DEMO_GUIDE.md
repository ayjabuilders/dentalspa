# Guide de démonstration locale — Dental Spa OS

## Démarrer

Depuis la racine du dépôt, avec Node 24 et pnpm 11 :

```powershell
pnpm dev
```

Après un `pnpm build` lancé pendant que les previews `next start` tournent déjà, redémarrer Clinic OS, Patient Pass et Public Booking avant la démo : un serveur `next start` existant peut continuer à servir les fichiers du build qu’il a chargés. Vérifier ensuite les trois pages d’accueil et le Build Center (`/api/build-status`) avant de montrer le résultat.

Pour PostgreSQL local, le dépôt inclut déjà Supabase CLI 2.122.0 et Docker Desktop 29.9.2 est installé pour cet utilisateur. Ce poste place `docker.exe` dans `%LOCALAPPDATA%\Programs\DockerDesktop\resources\bin`, qui n’est pas ajouté au PATH des nouveaux shells. Dans PowerShell, rendre le CLI visible uniquement pour la session puis démarrer le stack :

```powershell
$env:PATH = "$env:LOCALAPPDATA\Programs\DockerDesktop\resources\bin;$env:PATH"
pnpm db:start
```

Le moteur Docker doit être démarré. `pnpm db:reset` réinitialise le stack de démo actif, rejoue les migrations et réinsère le seed synthétique. **Ne lancez pas cette commande si vous devez conserver les données de démo locales.** `pnpm db:test` lance à la place un projet Supabase éphémère avec un identifiant et des ports uniques, sans seed. Il rejoue les migrations du dépôt, exécute pgTAP avec `--local`, puis supprime uniquement les volumes de ce projet de test; le stack de démo actif n’est ni réinitialisé ni utilisé. Le script ajoute le chemin du Docker CLI installé par utilisateur uniquement à son processus enfant. Les scripts `pnpm db:concurrency`, `pnpm db:inquiry-schedule-concurrency`, `pnpm db:inquiry-contact-preference-concurrency`, `pnpm db:inquiry-communication-language-concurrency`, `pnpm db:inquiry-communication-time-zone-concurrency`, `pnpm db:inquiry-planned-action-concurrency` et `pnpm db:outbox-concurrency` se connectent uniquement à `127.0.0.1:54322` et vérifient les sessions PostgreSQL indépendantes. Ne remplacez pas ces commandes par un projet hébergé. Sources : [Docker Desktop sur Windows](https://docs.docker.com/desktop/setup/install/windows-install/), [runtime Supabase](https://supabase.com/docs/guides/local-development/docker-and-native-runtimes).

### Mode local uniquement

Les fichiers ignorés `apps/dental-api/.env.local`, `apps/clinic-os/.env.local` et `apps/patient-pass/.env.local` pointent vers Supabase sur `127.0.0.1:54321`; ils ne contiennent aucune clé service-role. Le stack local contient 32 migrations, 45 tables applicatives protégées par RLS et trois cabinets synthétiques. L’API NestJS écoute `127.0.0.1:4300`; les écrans sont disponibles sur les ports 4202, 4204 et 4205. Le parcours Clinic OS `/connection` vérifie maintenant le compte Supabase, charge ses espaces autorisés par l’API NestJS, puis permet de lire et créer une demande manuelle persistée dans Intake. Une vérification locale a refusé le cabinet étranger avec HTTP 403.

Après `pnpm db:reset`, préparer à nouveau les deux comptes fictifs, leurs profils et leurs memberships avec la commande suivante depuis la racine. Ghita a le rôle Réception dans Atlas; Youssef a le rôle Gestionnaire dans Atlas et Sourire, ce qui lui permet de changer explicitement d’espace SaaS. Le script refuse tout endpoint Supabase autre que `127.0.0.1`, génère un nouveau mot de passe aléatoire, l’affiche une seule fois dans le terminal et n’enregistre pas la clé service-role dans les fichiers d’application. Copier le mot de passe affiché avant de fermer le terminal : il s’applique aux deux comptes jusqu’au prochain lancement du script.

```powershell
$env:PATH = "$env:LOCALAPPDATA\Programs\DockerDesktop\resources\bin;$env:PATH"
node scripts/local-demo-auth.mjs
```

Pour voir le premier parcours métier relié de bout en bout à la vraie base PostgreSQL locale, ouvrir `http://localhost:4204/connection`, se connecter avec `ghita.bennani@dentalspa.test` (Réception) ou `youssef.elidrissi@dentalspa.test` (Gestionnaire) et le mot de passe donné par le helper, sélectionner Atlas, puis ouvrir les demandes. Créer une demande explicitement fictive, ajouter une intention de suivi et une échéance, puis actualiser la page ou se reconnecter : les valeurs sont relues depuis la base locale. Le compte Gestionnaire peut transférer le responsable à Ghita, membre actif d’Atlas; les données d’Atlas ne sont pas lisibles depuis le cabinet Sourire. Le test connecté vérifie aussi que l’historique des résultats de contact reste désactivé. Ne lancez pas le helper si vous voulez garder le mot de passe courant : il le réinitialise et en affiche un nouveau.

Cette tranche Intake est persistante, multi-cabinet et utilisable avec les données fictives locales. Planning conserve son parcours visuel en simulation et propose maintenant une seconde voie authentifiée pour poser des options temporaires enregistrées en base locale. Finance, Consultations, Patient Pass, suivi et plusieurs actions du planning restent des démonstrations, comme précisé ci-dessous. Aucun vrai patient ni règle clinique du cabinet n’est requis ou autorisé pour cette démo.

### Agenda connecté de démonstration

Depuis la racine du dépôt, activer les ressources et horaires synthétiques Atlas sur le Supabase local uniquement, puis redémarrer Dental API pour qu’il recharge son interrupteur local :

```powershell
pnpm local:demo-planning
```

Le script refuse tout endpoint autre que `http://127.0.0.1:54321`. Il prépare deux praticiens et deux fauteuils explicitement fictifs pour le cabinet Atlas ainsi que 45 jours de plages illustratives, du lundi au samedi, 09:00–12:00 et 14:00–18:00 (Africa/Casablanca). Dans Clinic OS, ouvrir `/planning`, choisir « Ouvrir l’agenda connecté », se connecter comme Réception ou Gestionnaire et sélectionner Atlas si demandé. Les heures saisies sont des heures locales de Casablanca; chaque option par défaut dure 45 minutes, est sauvegardée par l’API/PostgreSQL local et expire après quelques minutes. L’écran permet de relire l’état serveur et de libérer une option.

Une option temporaire ne confirme pas de rendez-vous et ne contient pas de patient, d’acte ni de motif. Ces ressources, durées et heures ne sont pas les règles réelles du cabinet; aucune notification n’est envoyée. Les confirmations, annulations et changements de vrais rendez-vous restent bloqués par les décisions de sélection patient et de règles ressources. Aucun service hébergé n’est modifié. Après `pnpm db:reset`, relancer `pnpm local:demo-planning`; le helper Auth ne doit être relancé que si les comptes fictifs doivent être recréés. Le test navigateur connecté peut se lancer en saisissant le mot de passe local déjà généré, sans l’inscrire dans le dépôt :

```powershell
$env:LOCAL_DEMO_PASSWORD = Read-Host "Mot de passe local déjà généré"
pnpm exec playwright test tests/e2e/clinic-connected-scheduling-local.spec.ts
Remove-Item Env:LOCAL_DEMO_PASSWORD
```

Le seed local contient aussi six fiches patient minimales fictives — trois par cabinet, avec noms marocains et références seulement. Après connexion, `/connection?view=patients` ouvre la liste du cabinet autorisé et une fiche limitée au nom et à la référence. Aucun contact, champ clinique, lien d’identité, document, rendez-vous ou action de modification n’est affiché. La recherche et l’association de patients restent séparées.

Pour vérifier les parcours connectés dans le navigateur, copier le mot de passe affiché puis le saisir à l’invite PowerShell avant de lancer les e2e. Les contrôles créent une demande fictive puis vérifient sa persistance après rechargement et nouvelle connexion, la lecture du registre patient minimal, ainsi que les opérations Intake locales : intention administrative et historique, échéance et historique, transfert du gestionnaire vers Ghita, accès confirmé par sa session et refus de lecture depuis l’autre cabinet. Le même test vérifie que l’API des résultats de contact répond 503 pendant la revue de rétention.

```powershell
$env:LOCAL_DEMO_PASSWORD = Read-Host "Mot de passe local affiché par le helper"
pnpm exec playwright test tests/e2e/clinic-connected-intake-local.spec.ts tests/e2e/clinic-connected-patient-directory-local.spec.ts
pnpm exec playwright test tests/e2e/clinic-connected-intake-operations-local.spec.ts
Remove-Item Env:LOCAL_DEMO_PASSWORD
```

| Compte de démonstration | Rôle | Cabinet fictif |
| --- | --- | --- |
| `ghita.bennani@dentalspa.test` | Réception | Atlas / Casablanca |
| `youssef.elidrissi@dentalspa.test` | Gestionnaire | Atlas / Casablanca et Sourire / Salé |

Le script active la commande locale d’Intake manuel. Les résultats et l’historique des contacts restent désactivés en attente d’une revue de rétention; les autres modules et portes restent indépendants. Aucune conversion patient, donnée clinique, communication externe ou confirmation de rendez-vous n’est activée. Les demandes d’exemple portent le suffixe `(FICTIF)` et n’ont pas de dossier patient lié. N’entrez aucun vrai renseignement patient. Ne remplacez pas cette configuration par un projet hébergé. Cette démo locale ne vaut ni activation clinique ni déploiement; la restauration PostgreSQL reste à vérifier.

### Boîte de réception synthétique connectée

Cette tranche locale enregistre uniquement des messages d’exemple pré-écrits. Elle ne reçoit pas WhatsApp, ne capture pas de vraie conversation, ne crée aucun contact/patient/dossier Intake et n’envoie pas de réponse. Les événements acceptés sont signés localement, idempotents, horodatés par PostgreSQL, append-only, et leur clinique provient d’une correspondance fixe détenue par le serveur. Une Réception ou un Gestionnaire authentifié ne lit que les événements du cabinet actif vérifié; le contenu n’est pas mis en cache.

Pour activer les deux garde-fous uniquement dans le Supabase local, préparer une nouvelle clé éphémère et le secret HMAC, puis redémarrer seulement l’API locale afin qu’elle charge les secrets :

```powershell
node scripts/local-demo-webhook.mjs
# Arrêter puis redémarrer le processus local Dental API sur 127.0.0.1:4300.
```

Le helper refuse toute URL Supabase autre que loopback et n’affiche ni n’enregistre les secrets dans le dépôt. Après le redémarrage de l’API, créer un événement fictif allowlisté :

```powershell
node scripts/send-local-fake-webhook.mjs
```

Puis ouvrir Clinic OS sur `http://localhost:4204/connection`, se connecter avec Ghita (Réception, Atlas) ou Youssef (Gestionnaire, Atlas/Sourire), choisir explicitement le cabinet, et ouvrir « Ouvrir la boîte synthétique de réception ». Les comptes ont le même mot de passe local généré par `scripts/local-demo-auth.mjs`; s’il n’est plus disponible, relancer ce helper puis redémarrer la session. Une validation Playwright locale couvre HMAC invalide (401), texte non autorisé (400), événement accepté (201), répétition idempotente, lecture anonyme (401), lecture Réception et isolement entre Atlas et Sourire. La lecture a aussi été vérifiée après redémarrage du processus API. Aucun crédit de couverture produit n’est attribué à cette démonstration.

Dans Clinic OS, ouvrir « Consultations » puis choisir Salma Alaoui, Youssef Benali ou Imane El Idrissi. Parcourir Contexte, Note, Images et Plan & consentement; ouvrir le brouillon fictif non signé, puis changer de profil pour vérifier qu’il est effacé. Cette page ne contient aucun contenu clinique, diagnostic, plan ou instruction, et n’enregistre aucune modification.

Les services locaux utilisent des ports distincts :

| Application | Adresse | Ce qui est démontrable |
| --- | --- | --- |
| Clinic OS | http://localhost:4204 | Preview reconstruit pour cette démo : navigation, demandes Intake connectées et persistées localement, répertoire patient connecté en lecture seule avec six fiches fictives, planning fictif avec option temporaire, équipe synthétique, suivi administratif fictif et Build Center |
| Patient Pass | http://localhost:4205 | Présentation mobile mise à jour, sélecteur de profils marocains fictifs, exemples de visite avec dates futures calculées selon Casablanca, notifications désactivées et aperçu hors connexion sans dossier mis en cache |
| Public Booking | http://localhost:4202 | Accueil public, demande de contact fictive et demande de rendez-vous locale avec options synthétiques |
| Dental API | http://localhost:4300 | API versionnée; une requête espace sans session doit répondre 401 |

Dans Build Center (`/build`), suivre « Visiter la démo locale » pour présenter Intake persistant et le répertoire en lecture seule, puis Planning, Public Booking, Consultations, Finance et Patient Pass. Intake et le répertoire utilisent la session staff et Supabase local; les autres espaces présentés ici restent des aperçus fictifs, même si Public Booking possède aussi son parcours optionnel de demande synthétique locale décrit plus bas. Les liens Public Booking et Patient Pass reprennent le nom d’hôte courant, y compris sur le Wi-Fi local. La visite ne modifie ni statut de module ni gate d’activation.

Pour montrer le parcours de réservation sans créer de demande, choisir Salma Alaoui ou Youssef El Mansouri dans le formulaire Public Booking, sélectionner un créneau affiché comme exemple, puis cliquer « Préparer cette demande » et « Ouvrir l’aperçu fictif côté réception ». Clinic OS ouvre `/booking-review` avec les seuls paramètres synthétiques autorisés. L’examen administratif est uniquement en mémoire et disparaît au rechargement. L’écran précise que le cabinet n’a rien reçu, qu’aucun patient n’est associé et qu’aucun rendez-vous n’est confirmé. Imane Berrada montre le scénario sans disponibilité; un nom saisi manuellement ne donne pas accès au transfert de démonstration. Vérification ciblée du 30/10/2026 : `pnpm exec vitest run tests/unit/local-preview-handoff.test.ts` (3 réussis), `pnpm exec playwright test tests/e2e/public-booking-handoff-demo.spec.ts` (1 réussi, dont le parcours mobile et les contrôles sans API/stockage), `pnpm build` (5 tâches réussies).

Si un ancien onglet sur Clinic OS `localhost:4200` affiche « hors connexion » ou refuse la connexion, ouvrir le preview actif sur `localhost:4204` à la place. Sur un téléphone connecté au même Wi-Fi, remplacer `localhost` par l’adresse IPv4 actuelle de l’ordinateur (par exemple `http://<IP-ordinateur>:4204/patients` ou `http://<IP-ordinateur>:4205/` pour Patient Pass). Ces pages de démonstration utilisent des profils fictifs; l’adresse réseau peut changer.

Smoke test isolé du 2026-10-30 : le port 4300 était occupé par un processus dont l’origine n’était pas vérifiable. L’API de ce checkout a donc été démarrée séparément sur `http://127.0.0.1:4310` sans charger `.env`, `.env.local` ni secret. `/api/v1/health` et `/api/docs` répondent 200; les routes `/api/v1/inquiries` et `/api/v1/patients/{id}/admin-document-checklist` refusent une requête sans session en 401. Ce processus démontre le démarrage HTTP local uniquement; il n’est relié ni à Supabase, ni à une base, ni aux formulaires des applications. Le port 4310 est temporaire et n’est pas une adresse de connexion CRM.

Clinic OS: utiliser les liens « Demande de démonstration »/« Intake », « Planning », « Équipe » et « Build Center ». Les scénarios fictifs utilisent des noms marocains et présentent des situations distinctes : demande téléphonique sans échéance, demande du site avec échéance future, visite spontanée avec échéance passée, puis patient à accueillir et patients prévus. Dans Intake, créer une demande fictive pour voir les sujets administratifs d’exemple et la préférence de rappel; ces deux champs restent en mémoire, ne sont pas envoyés, puis disparaissent au rechargement. Ils ne constituent pas un catalogue de services ni des règles de priorité approuvés pour le cabinet. Dans Patients, le répertoire propose dix profils fictifs, des coordonnées placeholders en domaine `.test` et des visites d’exemple non confirmées; sélectionner un nom ouvre son aperçu local. La fiche de chaque profil contient maintenant un parcours administratif illustratif distinct, avec plusieurs cas marocains (demande, possible match non vérifié, créneau non confirmé, checklist, devis fictif et prochaine étape); le bandeau précise qu’il ne s’agit pas de l’historique de la personne et que rien n’est relié ni enregistré. La fiche contient aussi « Checklist documentaire » : choisir l’un des cinq statuts sur une ligne, vérifier « Aperçu modifié · non enregistré », puis recharger pour revenir aux valeurs fictives initiales. Cette checklist n’importe, ne publie ni ne télécharge aucun fichier et ne crée aucune démarche CNSS/CNOPS; les statuts restent purement administratifs. Dans Planning, l’aperçu permet de choisir un patient fictif comme Imane El Idrissi puis de simuler confirmation, déplacement et annulation; cette fiction reste dans l’onglet et n’écrit rien en base. Pour tester la persistance, passer par « Ouvrir l’agenda connecté » et poser/libérer une option sans patient après connexion. Les deux parcours sont séparés et aucun ne confirme un rendez-vous réel. Dans Public Booking, ouvrir « Préparer ma première visite ». La demande permet de choisir un format/durée fictif, un praticien de démonstration, une date et un moment préféré. Sous le praticien, examiner le lot fictif de salle, fauteuil, équipe et équipement; les créneaux affichés sont écartés lorsqu’un élément du lot est occupé dans la simulation. L’horaire est synthétique lundi–samedi avec pause à midi et dimanche fermé; ressources et capacités ne représentent pas celles du cabinet. Dans « Scénario de demande fictive », comparer Salma Alaoui (créneau d’exemple), Youssef El Mansouri (format court, après-midi) et Imane Berrada (dimanche sans créneau d’exemple). Choisir un créneau pour Salma ou Youssef; Imane permet de parcourir le cas sans disponibilité. Tous les noms sont fictifs. Le résultat précise que le cabinet ne reçoit pas la demande et que les disponibilités ne reflètent pas son vrai calendrier. Si aucun créneau fictif ne convient, choisir un autre jour ouvré (différent de la date indisponible, dans les 30 jours illustratifs) et un moment préféré pour l’aperçu d’attente; le texte indique qu’il n’est pas transmis et ne crée ni inscription réelle, ni priorité, ni notification.

Dans le détail d’une demande Intake, l’aperçu M01 permet de simuler séparément les résultats de contact factuels approuvés et de réinitialiser l’exemple. Un rechargement l’efface. Ce n’est ni une tentative de contact ni un résultat enregistré; aucune séquence, urgence, qualification ou conversion n’est définie.

## Démonstration sur le réseau local

Par défaut, l’API écoute uniquement sur `127.0.0.1`. Pour qu’un autre appareil sur le même réseau Wi-Fi puisse la joindre, configurez explicitement l’API locale avec `ENABLE_LAN_DEMO_API=true`; cette option est ignorée en production et sur Vercel. Dans le fichier local `apps/dental-api/.env` (non versionné), définissez également une liste `ALLOWED_ORIGINS` qui contient uniquement les origines exactes réellement utilisées, par exemple `http://192.168.11.116:4202,http://192.168.11.116:4204,http://192.168.11.116:4205`. Remplacez cette adresse par l’IPv4 actuelle de l’ordinateur hôte. N’ajoutez pas de joker (`*`). Configurez dans les fichiers `.env.local` des applications `NEXT_PUBLIC_API_URL=http://192.168.11.116:4300`, avec la même adresse actuelle, puis redémarrez l’API et reconstruisez/redémarrez les applications Next.js pour appliquer cette variable publique. L’adresse IP du réseau peut changer; gardez ces valeurs dans les fichiers locaux ignorés par Git, pas dans les valeurs partagées du dépôt. La configuration par défaut reste limitée à `localhost`.

Dans « Équipe », lire d’abord l’aperçu « Questions d’accès et d’équipe » : sept décisions restent « À définir » et cet écran ne permet pas de les enregistrer ni de les activer. Utiliser ensuite « Aperçu d’affectation » pour comparer une tâche administrative d’exemple avec les critères fictifs de capacité, d’équipe, d’horaire et de disponibilité. Certains membres sont exclus du créneau choisi pour illustrer une raison de non-correspondance; la tâche indique aussi si la délégation serait permise dans ce scénario imaginaire. Choisir manuellement un membre correspondant, puis l’ajouter à la liste de propositions de cette session. Les règles et capacités ne décrivent pas le cabinet. Les propositions restent en mémoire et peuvent être effacées; un rechargement les supprime. Rien n’est réellement défini, affecté, enregistré ou transmis. Les rôles d’accès affichés ne prouvent ni compétence, ni disponibilité, ni qualification, ni autorité clinique.

Dans la boîte d’approbations fictive, consulter les deux exemples administratifs avec leur responsable, leur version et leur échéance de démonstration. « Simuler l’acceptation » ou « Simuler le refus » ne change qu’un libellé temporaire; réinitialiser ou recharger efface le résultat. Cela ne représente ni les permissions du personnel, ni une approbation du cabinet ou une tâche terminée.

Dans « Aperçu de délégation », vérifier que « Préparer l’accueil de démo » reste non délégable dans le scénario. Pour « Vérifier les fournitures de bureau », choisir 15:00 et Imane El Idrissi, puis simuler la réponse de la remplaçante. Le scénario de 14:00 est occupé et ne permet pas de proposition. Ces règles n’existent que dans la démo; aucun transfert, avis ou travail réel n’est enregistré, et le rechargement efface le résultat.

Dans Patient Pass, choisir un profil puis ouvrir « RDV » pour voir la préparation logistique fictive : date/heure synthétiques, absence de document ou consigne de santé partagés, et prochaine action limitée à la démonstration. Le scénario d’annulation indique qu’aucun rendez-vous réel ni suivi n’existent. Ce panneau ne crée aucune tâche et n’enregistre aucun état. Dans « Compte », choisir le canal, la langue et le fuseau de communication puis enregistrer l’aperçu; ces préférences déclarées restent sur l’écran et disparaissent après rechargement. Elles ne valent ni consentement ni autorisation de contact. Dans « Messages », comparer l’exemple administratif en français et en arabe, marquer l’exemple comme lu puis rédiger et prévisualiser un brouillon. L’aperçu est local uniquement; aucun message n’est transmis ni enregistré. Le choix de langue est seulement un contrôle de démonstration et ne représente pas une préférence du patient.

Dans « RDV », un profil avec visite fictive peut aussi ouvrir un aperçu de texte de rappel administratif, limité à la date/heure déjà affichée. Le délai et les règles ne sont pas configurés; rien n’est programmé, transmis ou enregistré. Le bouton n’apparaît pas pour un scénario d’annulation.

Dans Clinic OS, ouvrir « Business Pulse » depuis l’accueil ou « Tester le parcours financier fictif » depuis le Build Center. Choisir Salma Alaoui ou Youssef Benali, consulter les lignes et totaux inventés, puis simuler un versement et prévisualiser un reçu non comptable. Ouvrir « Scénario de calcul complet », puis « Parcourir les étapes » pour avancer ou revenir dans la fixture numérique du MVP : devis MAD 900, acompte MAD 300, deux échéances de MAD 300, versement partiel MAD 200, reprise idempotente, remboursement et avoir distincts, puis écart de caisse de MAD -10. Cette fixture est un exemple mathématique, pas un dossier associé aux profils. Les montants sont fictifs et non contractuels; aucun paiement, facture ou solde réel n’existe. Le parcours se réinitialise au rechargement et au changement de profil; aucune requête API ni écriture de stockage navigateur n’a lieu.

## Données et limites de la démonstration

- Utiliser uniquement les exemples marqués `FICTIF`. Ne pas entrer de vraies coordonnées, informations de santé, paiements ou documents patient.
- Les formulaires de démonstration ne contactent personne et n’écrivent pas dans Supabase. Les états interactifs en mémoire sont perdus au redémarrage ou au rechargement.
- Les options de planning sont des holds temporaires, pas des rendez-vous confirmés. Clinic OS peut simuler un cycle de rendez-vous avec un patient fictif, mais cette simulation ne modifie pas les fonctions connectées, ne réserve rien réellement et ne compte pas comme critère MVP terminé.
- Patient Pass montre une présentation non connectée. Il n’existe pas de compte patient de démonstration connecté. Les exemples de visite utilisent des dates relatives aux prochains jours, calculées dans le fuseau `Africa/Casablanca`; ils restent fictifs et non confirmés.
- Aucun diagnostic, plan de traitement, devis, facture, paiement, protocole clinique, notification ou message patient n’est exécuté. La conversation administrative est une fixture fictive; aucun brouillon n’est conservé.

## Ce qui n’est pas encore le MVP opérationnel complet

Le PRD définit 42 critères P0 sur M01–M05, M14 et M16. Après la revalidation du guide Patient Pass du 30/10/2026, le registre en marque 1 livré, 19 partiels et 22 planifiés. Le critère livré est limité au guide local d’accueil accessible en trois étapes; cela ne livre ni invitation ni rattachement de compte. Restent notamment les réservations confirmées/annulées/déplacées, règles validées d’identité et de ressources, onboarding connecté et rattachement Patient Pass, consultations signées, plans de traitement versionnés, finance et approbations/affectations complètes. Ces étapes demandent des choix ou validations métier/clinique encore ouverts. Le Build Center distingue les écrans d’aperçu des fonctions livrées; ne pas présenter cet environnement comme prêt pour un vrai cabinet.

Les choix D1–D8 dans [le dossier de sélection patient](PATIENT_SELECTION_DECISION_PACKET.md) concernent uniquement l'association d'une demande entrante à un dossier patient existant. Ils ne sont pas requis pour montrer les scénarios fictifs de cette démo. Les choix R1–R8 dans [le dossier des règles de ressources](RESOURCE_RULES_DECISION_PACKET.md) concernent les ressources et règles nécessaires avant une réservation confirmée. Les notes signées, plans de traitement et finance exigent en plus leurs règles métier et validations professionnelles; le mode local ne remplace pas ces décisions.

## Vérifications locales actuelles

- `pnpm build` : cinq tâches de build réussies sur les quatre applications et le contrat partagé. Les previews reconstruites de cette démo utilisent Clinic OS 4204, Patient Pass 4205 et Public Booking 4202; les scripts `pnpm dev`, `pnpm e2e` et les tests navigateur ciblent ces mêmes ports. Les doublons précédents 4200/4201 ont été arrêtés.
- `pnpm lint` : aucune erreur.
- `pnpm e2e` en mode production (rejoué le 30/10/2026) : 121 réussies, 126 ignorées, zéro échec sur les previews 4204/4205/4202 (247 cas). Les scénarios d’authentification connectée sont ignorés sans configuration dédiée de test local; cette exécution valide les parcours de démonstration et les contrats simulés, pas l’acceptation d’une session connectée.
- `pnpm test` (30/10/2026) : 330 tests unitaires et 353 tests d’intégration réussis. Les tests d’intégration de base utilisent PGlite embarqué; ils ne prouvent pas le déploiement de migrations sur Supabase/PostgreSQL local, RLS réel, pgTAP ou la contention entre connexions indépendantes.
- Vérification UI connectée M01 (30/10/2026) : 134 tests réussis sur neuf spécifications, avec un build isolé utilisant `https://schedule-auth.example.invalid`, une clé publique synthétique et des réponses Auth/API interceptées par Playwright. Couvre les échéances, leur historique, préférences/langue/fuseau déclarés, intentions administratives, historique/file d’intentions et recherche de demandes. Cela vérifie l’interface et ses contrats simulés; aucun accès Supabase ou test de base de données n’a eu lieu. Le build normal sans Auth a été restauré.
- Vérification UI connectée M02 (30/10/2026) : 17 tests réussis sur la recherche patient et le parcours de hold de rendez-vous, avec le domaine réservé `https://lookup-auth.example.invalid` et réponses Auth/API interceptées. La recherche reste en lecture seule et un hold n’est pas un rendez-vous confirmé. Aucun accès Supabase ou test PostgreSQL n’a eu lieu; le build normal sans Auth a été restauré.
- Vérification UI Patient Pass (30/10/2026) : 5 tests réussis avec `https://patient-auth.example.invalid`, le drapeau public de préférences activé uniquement dans le build de test et les réponses Auth/API interceptées. La suite vérifie l’accès au seul profil retourné, les indisponibilités, les préférences déclarées et le refus des liens ambigus/droits insuffisants. Le backend et ses gates DB restent désactivés; ce test n’est pas une acceptation de persistance.
- La suite ciblée Clinic OS/Patient Pass/Build Center passe 20/20. Les tests navigateur ciblent désormais le serveur Clinic OS à 4204 plutôt que l'ancien port 4200.
- Le répertoire Patients expose dix profils marocains synthétiques, des coordonnées placeholders et plusieurs scénarios de visite non confirmés. Les parcours Patients, Intake, échéances, intentions et Équipe ont réussi.
- Le parcours public fictif a un test dédié : aucune requête API, aucun stockage navigateur, aucun rendez-vous annoncé; le rechargement efface la simulation.

Vérification e2e ciblée (30/10/2026) : pnpm exec playwright test tests/e2e/patient-document-checklist-demo.spec.ts tests/e2e/patient-crm-journey-demo.spec.ts — 2 tests passés; viewport mobile 320 px, réinitialisation au rechargement, aucune écriture réseau/stockage navigateur et aucun débordement horizontal.

Dans Clinic OS, ouvrir « Suivi & retours » pour voir quatre exemples fictifs d’après-contact, changer un état administratif, puis recharger pour rétablir les valeurs d’exemple. « Voir l’aperçu neutre » montre le même texte volontaire, même si les retours privés fictifs diffèrent. Rien n’est appelé, envoyé ou conservé; aucun conseil clinique n’est fourni. Vérification ciblée du 30/10/2026 : `pnpm exec playwright test tests/e2e/aftercare-demo.spec.ts` (1 test à 320 px).

Dans Business / Finance, la démo fictive permet de simuler plusieurs versements séparés en espèces ou terminal et un virement en attente. Le virement en attente est listé mais exclu du total simulé et du solde; l’aperçu de reçu ne reprend que les versements simulés. Le montant, les événements et le reçu sont effacés au rechargement ou au changement de profil. Rien n’est encaissé, envoyé à une API ou enregistré. Vérification ciblée du 30/10/2026 : `pnpm exec vitest run tests/unit/finance-demo-ledger.test.ts` (9 tests), `pnpm exec playwright test tests/e2e/finance-demo.spec.ts` (1 test à 320 px).

Dans « Messagerie » (`/inbox`), explorer cinq conversations administratives marocaines fictives, filtrer les exemples non lues, ouvrir un fil et saisir un brouillon. Le bouton de lecture change uniquement l’état illustratif; le brouillon et le filtre restent en mémoire et reviennent à l’exemple initial au rechargement. Aucun compte WhatsApp, message, contact réel ou dossier patient n’est lié; aucun endpoint, stockage navigateur, statut opérateur ou envoi n’est utilisé. Le champ compose un texte d’exemple uniquement et ne possède pas de bouton d’envoi. Le bouton « Ouvrir la boîte connectée » mène à l’inbox synthétique persistée dans Supabase local : connexion staff, choix explicite du cabinet, recherche dans les conversations et détail chronologique. Les deux parcours sont clairement séparés; la boîte connectée n’envoie aucune réponse et n’affiche aucun nom/contact.

Vérification ciblée du 30/10/2026 : `pnpm exec playwright test tests/e2e/clinic-inbox-demo.spec.ts tests/e2e/patient-crm-journey-demo.spec.ts tests/e2e/finance-demo.spec.ts tests/e2e/aftercare-demo.spec.ts tests/e2e/public-booking-demo.spec.ts` (5 réussis). Clinic OS typecheck, ESLint ciblé et build monorepo 5/5 réussis; rendu vérifié à 1280×900 en thème clair et 390×844 en thème sombre.

Vérification ciblée du guide d’accueil Patient Pass (30/10/2026) : `pnpm exec playwright test tests/e2e/patient-onboarding.spec.ts` (2 réussis). Progression, annonces/focus du titre, navigation clavier, agrandissement temporaire du texte, fermeture, largeur 320 px, cible principale 48 px et absence d’appels API/écritures de stockage vérifiés. M03-1 est livré pour ce guide local précis; le compte connecté et son invitation restent à construire.

Vérification ciblée finance (30/10/2026) : `pnpm exec playwright test tests/e2e/finance-demo.spec.ts` (2 réussis à 320 px). Le parcours guidé vérifie les huit étapes numériques, le retour/avancement, la réinitialisation, le débordement mobile, zéro appel API et zéro stockage navigateur. M14 reste en aperçu local; ce parcours ne crée ni finance réelle ni preuve d’acceptation connectée.

### Option locale : demande de rendez-vous fictive persistée

Cette tranche ajoute un parcours distinct du transfert sans écriture : Public Booking peut enregistrer une demande **uniquement synthétique**, puis Ghita (Réception) ou Youssef (Gestionnaire) la relit après connexion au cabinet Atlas. La base conserve uniquement `scenario_id`, date/heure souhaitées, un état fixe `request_received` et des métadonnées serveur; le nom marocain est dérivé du scénario à l’écran et n’est pas stocké. L’accusé public ne confirme jamais un rendez-vous. Aucun contact, dossier patient, disponibilité réelle, verrou de ressource, annulation, déplacement ou message n’est créé.

Cette option reste séparée du mode aperçu sans écriture et nécessite trois opt-ins locaux : `ENABLE_DEMO_BOOKING_REQUESTS=true` dans `apps/dental-api/.env.local`, `NEXT_PUBLIC_DEMO_BOOKING_REQUESTS=true` dans `apps/public-booking/.env.local`, et la ligne `private.demo_booking_request_settings.enabled` activée uniquement par `node scripts/local-demo-auth.mjs`. Ces flags ne sont pas des paramètres de déploiement; le serveur vérifie aussi que Supabase pointe vers `127.0.0.1`/`localhost`, et le bouton n’apparaît que dans le build local explicitement activé. Après toute modification d’env, reconstruire les applications concernées et redémarrer leurs processus. Le helper d’authentification réinitialise le mot de passe partagé des comptes de démonstration lorsqu’il est relancé.

La migration maintient la table dans le schéma `private`, avec RLS, exposition directe interdite, clé d’idempotence, journal d’audit et outbox atomiques. L’inbox est accessible seulement aux rôles actifs Réception/Gestionnaire du cabinet vérifié; l’autre cabinet ne reçoit aucune ligne. Le visiteur public n’envoie aucun nom et reçoit seulement `request_received`. Pour le test de bout en bout, lancer `pnpm exec playwright test tests/e2e/clinic-connected-booking-request-local.spec.ts` avec `LOCAL_DEMO_PASSWORD` défini dans le terminal courant. Cette option ne valide pas les règles du cabinet et ne donne aucun crédit de couverture M02.

### Confirmation locale d’une demande fictive

Pour la démonstration locale seulement, une Réception ou un Gestionnaire actif d’Atlas peut confirmer une demande fictive dans Clinic OS. La confirmation crée un rendez-vous synthétique PostgreSQL, lié seulement à la demande/scénario fictif; aucune fiche patient, aucun contact et aucun contenu clinique n’est lié. L’accusé Public Booking reste `request_received` jusqu’à la confirmation explicite par le personnel. L’option est protégée par deux gates locales indépendantes; la commande suivante active le gate API et le gate DB uniquement après vérification de l’URL Supabase loopback :

```powershell
pnpm local:demo-booking-confirm
# Redémarrer Dental API pour charger le gate local.
```

Les règles sont des exemples étiquetés : 45 minutes, du lundi au samedi, 09:00–12:00 et 14:00–18:00, avec quatre ressources fictives. Elles ne représentent pas les heures, praticiens, fauteuils ou politiques du cabinet. Ouvrir `/booking-review`, choisir les ressources de démonstration, puis confirmer la demande. Le serveur bloque les collisions de praticien/fauteuil et n’accepte que les scénarios, créneaux et rôles allowlistés.

Pour désactiver les nouvelles confirmations tout en conservant les lignes de démonstration existantes : `pnpm local:demo-booking-confirm:disable`, puis redémarrer l’API. Pour rejouer l’E2E connecté, utiliser `pnpm e2e:demo-booking-confirm`; il teste Public Booking → accusé de demande uniquement → revue Réception → confirmation de la même demande, puis le conflit de ressource, sans réinitialiser le stack et en nettoyant uniquement ses propres fixtures. La concurrence PostgreSQL se vérifie séparément par `pnpm db:demo-booking-confirm-concurrency`. Ces vérifications n’autorisent ni déploiement ni confirmation d’un vrai rendez-vous. M02 reste partiel tant que l’identité patient, les règles réelles de ressources/heures, l’annulation, le déplacement, l’attente et les notifications ne sont pas implémentés et approuvés.

Dans Public Booking, les deux étapes montrent la différence entre la préparation fictive et la revue de l’aperçu. « Prévisualiser la demande fictive » ne transmet rien; seul le bouton distinct « Enregistrer la demande fictive locale » envoie le scénario synthétique au stack local, où l’accusé reste une demande à revoir.

### Devis brouillon connecté — gestionnaire local

Dans `http://localhost:4204/connection?view=patients`, connectez-vous avec le gestionnaire local, ouvrez Salma puis **Devis → Nouveau devis brouillon**. Choisissez une prestation fictive et sa quantité, puis **Enregistrer le brouillon**. Le devis est conservé en base et reste visible après reconnexion. En cas de réponse réseau perdue, utilisez **Réessayer la même création**. Le montant est recalculé côté serveur; une modification du tarif impose de recharger le catalogue. Ce parcours ne crée ni facture, ni paiement, ni document publié au patient. Les rôles Réception/Dentiste ne disposent pas de cette commande de création locale.

Pour réviser un brouillon enregistré, dépliez sa carte puis **Modifier ce brouillon**. Les quantités sont reprises et les tarifs actuels du catalogue sont affichés. **Enregistrer la nouvelle version** conserve l’ancienne; **Historique des versions** permet de la relire. Si un autre gestionnaire modifie le devis entre-temps, fermez le formulaire et actualisez le dossier après le conflit. Aucune acceptation du patient ni émission de facture n’est créée.

### Catalogue tarifaire connecté

Depuis **Finance → Gérer le catalogue tarifaire**, connectez-vous comme gestionnaire local. Ajoutez une prestation fictive (code unique, libellé, catégorie et prix MAD), ou utilisez **Modifier** pour changer le tarif ou archiver/restaurer une prestation. Les anciens devis conservent leurs prix. **Afficher les prestations archivées** retrouve les services retirés. **Dossiers & devis** rejoint les dossiers dans la même session. En cas de réponse perdue, utilisez **Réessayer la même commande**; après un conflit de version, fermez puis actualisez. Aucun paramètre fiscal, paiement ni validation clinique n’est activé par cet écran.


### Factures locales (gestionnaire)

Depuis `/connection?view=patients`, ouvrir Salma puis **Factures**. Choisir un devis et préparer le brouillon, puis **Émettre la facture** et confirmer le montant. Les lignes et le numéro DEMO restent figés; aucune somme encaissée ni publication patient. Une réponse perdue propose la même commande; ne pas créer une nouvelle émission. Impression disponible sur les factures émises; paiements restant à livrer. Activation locale Atlas : `node scripts/enable-local-invoices.mjs`, puis redémarrer uniquement API4300. Le script préserve les documents, compteurs et comptes existants.

Sur une facture émise, **Afficher le document** ouvre le contenu figé. **Imprimer / PDF** ouvre l’impression du navigateur; choisir une imprimante ou Enregistrer au format PDF. Le document reste une démonstration non fiscale. Escape ferme l’aperçu et remet le focus sur le bouton.

### Paiements persistés et configuration locale
Dans `/connection?view=patients`, se connecter comme gestionnaire, ouvrir Salma puis **Paiements**. Choisir Espèces fictives ou Virement fictif, saisir le montant MAD, une date effective facultative (heure de cet appareil; vide=maintenant) et une référence DEMO-… si requise. Enregistrer conserve un paiement **à vérifier**. Vérifier et confirmer explicitement; le virement demande ensuite une vérification distincte du règlement. Les fonds réglés peuvent être alloués partiellement à une facture émise; le reliquat reste disponible. Émettre un reçu fige son état historique; le bouton numéroté le relit sans modifier les soldes actuels. Une réponse perdue propose la même commande.
**Configurer les moyens de paiement** gère les comptes fictifs (sans coordonnées bancaires), les moyens, la référence et la règle de règlement; modifier/archiver ne réécrit pas les anciens paiements. Annuler une modification avant de revenir. Activation locale Atlas idempotente : `node scripts/enable-local-payments.mjs`, puis redémarrer uniquement API4300. Deux moyens sont créés uniquement si aucun moyen n’existe; aucun paiement patient n’est précréé. Ce script préserve les comptes utilisateur et documents existants. Refunds, échéanciers et rapprochement ne sont pas encore livrés.

### Remboursements / contrepassations fictifs
Dans le dossier gestionnaire → Paiements, ouvrir **Remboursements** sur un paiement. Le gestionnaire Atlas fictif dispose désormais d’une permission dédiée locale. Choisir la nature, le montant, le motif et la référence DEMO-…; renseigner les montants à retirer des allocations si les fonds non alloués ne suffisent pas. Cocher la vérification du scénario puis lire le récapitulatif et confirmer. Le solde est relu en base; le reçu original reste figé. Une réponse perdue conserve la même commande à reprendre. Aucun avoir ni transfert réel n’est créé. Historique disponible en lecture seule sans permission de remboursement. Activation idempotente uniquement locale : `node scripts/enable-local-refunds.mjs`; aucun paiement/refund n’est précréé.

### Avoirs locaux séparés des remboursements
Dans le dossier gestionnaire → **Factures**, une facture émise propose **Avoirs & solde**. Consulter le reste dû, le cumul des avoirs et le trop-perçu éventuel; saisir un montant et un motif, vérifier le récapitulatif puis confirmer l’émission. La limite est le total initial moins les avoirs déjà émis. Un avoir peut créer un trop-perçu mais ne rembourse rien automatiquement. **Afficher l’avoir** ouvre le document figé avec facture d’origine, motif et montant; **Imprimer / PDF** utilise l’impression du navigateur. Reprise après réponse perdue et historique après reconnexion sont vérifiés. Activation locale dédiée au gestionnaire Atlas : `node scripts/enable-local-credits.mjs`; aucune écriture de document ni modification du droit de remboursement. Aucun document fiscal réel ni publication patient.

### Entrées de travail unifiées — 31 octobre 2026

Les routes `/patients`, `/planning`, `/intake`, `/inbox` et `/team` ouvrent désormais leur espace connecté. Utiliser le menu du cabinet pour changer de module dans la même session. Les anciens aperçus nécessitent `?preview=1`; les liens de démonstration du Build Center le précisent. Le rechargement complet conserve encore la limite de session en mémoire : continuité après rechargement non livrée.

Navigation connectée : la barre Précédent/Suivant suit les modules visités pendant la session. Un nouveau choix après Précédent remplace la branche suivante. Les raccourcis Agenda/Paramètres/Réservations/Catalogue utilisent ce même parcours. Les formulaires en cours conservent leur protection. Historique réinitialisé au changement de cabinet ou à la déconnexion ; les sélections de dossiers ne sont pas un historique complet.

Dossiers patients : ouvrir une fiche, utiliser Patient suivant/précédent ou Retour à la liste. Chaque fiche est relue via l’API autorisée. Ouvrir un devis désactive les changements de dossier, onglets et rechargements jusqu’à fermeture ; aucune écriture n’est nécessaire pour vérifier ce parcours. Navigation limitée aux dossiers chargés, pas encore une recherche globale paginée.

Finitions du31octobre : les flèches compactes de navigation conservent leurs noms accessibles et infobulles. Agenda utilise un seul sélecteur Jour/7/14/31jours et des badges filtrants. Paramètres regroupe titre/version/actions et replie les explications dans À savoir. Le dossier distingue identité/onglets, contenu actif, En bref et Coordonnées. Vérification native en lecture seule : `node scripts/check-compact-workspace.mjs`. La persistance de session après rechargement reste à corriger.

Session locale restaurable : après connexion, recharger Agenda ou Patients ne demande plus le mot de passe ; les droits du cabinet sont revérifiés. Le cookie de renouvellement est HttpOnly, SameSite Strict, limité à /api/clinic-session, expire après8heures, Secure sous HTTPS. Aucun jeton ni dossier n’est ajouté à localStorage/sessionStorage. Déconnexion explicite efface le cookie et ferme la session. Portée : stack Supabase loopback uniquement, pas de mise en production. Le renouvellement silencieux conserve les formulaires et les commandes en attente ; un devis après réponse perdue a été repris sans doublon en base locale. Une déconnexion arrête le renouvellement et ferme aussi les autres onglets du même navigateur. Une session révoquée nécessite toujours une reconnexion. Vérification native : `node scripts/check-session-continuity.mjs`.
