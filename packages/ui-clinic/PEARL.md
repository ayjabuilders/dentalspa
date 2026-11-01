# Pearl — composants et parcours Clinic OS

Statut : adoption visuelle autorisée par le propriétaire le 31/10/2026. Intégration dans Clinic OS connecté : navigation commune et recomposition des parcours Patients, Demandes, Agenda, Réservations, Catalogue, Équipe, Messagerie et Paramètres agenda. Le catalogue conserve les scénarios fictifs; ils ne deviennent pas des fonctionnalités persistées. Le catalogue est `/design-lab/system` sur le serveur isolé 4206. Le prototype Patients reste `/design-lab/patients`. Aucune capacité métier supplémentaire n’est déclarée dans Build Center.

## Frontière d’intégration

- `@dental/design-tokens/pearl.css` définit exclusivement des variables `--ds-*` sous `[data-ds="pearl"]`. Ne modifie ni `:root`, ni les tokens existants, ni les thèmes métier.
- `@dental/ui-clinic/pearl` fournit les composants React. Les exports historiques `@dental/ui-clinic` conservent leur implémentation.
- `@dental/ui-clinic/pearl.css` ne s’applique que sous le scope Pearl. Importer les deux feuilles une fois dans le layout de la surface candidate.
- `PearlProvider` applique le scope, la densité, le mouvement et la direction. Le portail Radix de Modal recrée ce provider pour conserver ces réglages.
- Les fontes Manrope et DM Sans proviennent des assets locaux existants, avec leurs licences OFL déjà présentes. Le consommateur charge les fontes ; les fallbacks système restent disponibles.
- Aucun import Next, API, contrat patient, stockage navigateur, fixture ou règle métier dans les composants partagés. Les données et décisions restent chez l’appelant.

## Démarrage

```tsx
// Layout de la surface opt-in
import '@dental/design-tokens/pearl.css';
import '@dental/ui-clinic/pearl.css';
```

```tsx
'use client';
import { PearlProvider, Card, Button, Field, Input } from '@dental/ui-clinic/pearl';

export function Example() {
  return <PearlProvider density="comfortable" motion="full" dir="ltr">
    <Card title="Exemple">
      <Field label="Nom" hint="Libellé et aide associés automatiquement.">
        {props => <Input {...props} />}
      </Field>
      <Button onClick={() => { /* action du consommateur */ }}>Continuer</Button>
    </Card>
  </PearlProvider>;
}
```

## API et responsabilités

| Composant | Entrées principales | Responsabilité du consommateur |
| --- | --- | --- |
| PearlProvider | density comfortable/compact ; motion full/reduced ; dir ltr/rtl | Choisir et conserver les préférences. Aucun stockage implicite. |
| Button | variant primary/secondary/ghost/danger ; busy ; props bouton natif | Libellé accessible, événement, fin réelle du chargement. Type par défaut button. |
| Input / Select / Textarea | Props HTML natives | Valeur, validation métier et événements. |
| Field | label, hint, error, fonction children(props) | Transmettre les props générées au contrôle. L’erreur remplace l’aide. |
| Badge | tone, onRemove, removeLabel | Libellé précis de suppression ; aucune mutation intégrée. |
| Card | title, description, action, children | Composition et hiérarchie de page. |
| Switch | label, checked, onCheckedChange, disabled | État contrôlé. |
| Feedback | title, tone, children, onDismiss | Message exact, cycle de vie, sélection du ton. Annonce polie via status. |
| EmptyState | title, description, action | Explication et éventuelle action utile. |
| Skeleton | label, lines | Afficher seulement pendant un chargement réel ou clairement illustratif. |
| DataTable | label, children | En-têtes th avec scope, lignes, tri, autorisations et données. Scroll local. |
| Pagination | page, totalPages, onPageChange | Page valide, index commençant à 1 ; réinitialiser/clamp après filtrage. |
| Tabs | label, items[value,label,content], value, onValueChange | Valeur valide et identifiants de valeurs uniques. Panneaux montés mais cachés : état local préservé. |
| Modal | open, onOpenChange, title, description, trigger, kind dialog/drawer | Déclencheur unique acceptant ref/événements (Button), contenu, annulation/confirmation. Fermer pendant une opération doit être géré par l’appelant. |
| BarChart | label, items[id,label,value], selected, onSelect | Identifiants uniques, valeurs finies non négatives ; libellés/unités et calculs. Petit graphique catégoriel, pas un moteur analytique. |

Les composants de notification, profil, filtre et formulaire se composent à partir de ces primitives. La bibliothèque ne connaît ni patient, ni compte utilisateur, ni rendez-vous. Les exemples se trouvent uniquement dans `apps/clinic-os/app/design-lab/system/fixtures.ts` et la page du catalogue.

## Règles de composition

- Une action principale par zone de décision. Secondary pour les alternatives, ghost pour les actions contextuelles, danger uniquement lorsqu’une conséquence destructive est clairement présentée.
- Tons sémantiques avec texte : success pour une action effectivement terminée, warning pour une attente/conflit, danger pour une erreur. Ne jamais déduire une réussite clinique à partir d’une couleur.
- Espacements 4/8/12/16/24/32 ; arrondis 10/16/24 ; texte de travail 14 px, libellé 12 px, titres Manrope 800, boutons DM Sans 750. Contrôles 44 px, y compris en densité compacte.
- Focus 3 px, erreurs reliées par aria-describedby/aria-invalid, onglets avec flèches et Home/End. Le RTL inverse les flèches et le bord du panneau.
- Mouvement 160/280 ms, priorité à prefers-reduced-motion. Ne pas animer des changements cliniques pour suggérer une réussite non confirmée.
- Ne pas faire dépendre les composants de CSS de page. Les classes externes servent à la composition, pas à écraser les tokens.

## Validation du candidat

- Typecheck des packages ui-clinic et des trois applications Next pour compatibilité des exports.
- ESLint ciblé sur les nouveaux fichiers et consommateurs.
- `node scripts/check-pearl-catalogue.mjs` : formulaire invalide/chargement/succès, association de l’erreur, piège et restauration du focus, tokens et réglages des portails, onglets clavier et RTL, filtre/vide/table/pagination, graphique, largeurs 1440/1280/768/390, reduced-motion, réutilisation de Badge dans Patients.
- `node scripts/check-patients-design-lab.mjs` et `node scripts/check-patients-design-system.mjs` : non-régression du prototype et de la galerie.
- Captures `qa/pearl-catalogue-*.png` ; revue visuelle desktop, panneau et mobile. Ces captures documentent le rendu ; aucune approbation visuelle du propriétaire n’est présumée.

## Périmètre et limites

### Direction mobile révisée par le propriétaire

Les références mobiles fournies le 31 octobre privilégient l’équilibre, pas une densification du bureau : capsule de navigation basse navy, marges de 18–20 px, cartes arrondies aérées, ombres douces, accents violet/menthe et hiérarchie typographique. Une page mobile est recomposée autour de sa tâche et de son retour contextuel. Éviter les tableaux rétrécis, les longues barres horizontales de modules, les titres répétés et les statistiques géantes empilées.

L’annuaire doit montrer rapidement recherche et patients, avec des cartes lisibles (avatar 48 px, nom 15–16 px, métadonnées 12–13 px). Le dossier regroupe les fonctions en quatre rubriques principales avec sous-navigation financière; les actions restent celles réellement autorisées. Une seule action principale à la fois, sans ajouter un faux bouton de création pour décorer une barre. Les icônes gardent leurs libellés et les cibles tactiles au moins 44 px.

`Modal mobilePresentation="sheet"` active une présentation en panneau bas à 700 px et moins, avec safe areas, adaptation au viewport du clavier, défilement interne et conservation des gardes/focus. Sa valeur par défaut reste `dialog`. Les fenêtres de document imprimable conservent leur présentation propre. La feuille ne promet pas de geste de glissement non implémenté. Vérifier séparément géométrie, parcours réel, clavier/focus et rendu; les simulations de viewport ne prouvent pas le comportement du clavier matériel iOS/Android.

Le catalogue `/design-lab/system` reste un outil de démonstration des primitives. Les écrans métier utilisent leurs contrats et autorisations existants. Le déploiement de la direction à toute l’application est suivi dans `docs/PEARL_APP_ROLLOUT.md`; une vérification du catalogue ne prouve pas celle des parcours métier. Les contrôles navigateur ne constituent pas un audit lecteur d’écran exhaustif, un test installé sur appareil natif ou une validation clinique.

L’adoption locale est autorisée. Les essais avec des données fictives continuent sans autorisation supplémentaire. Les gates d’usage réel et de publication restent distinctes de la livraison du design. Ne pas importer les fixtures du laboratoire dans les données métier, ni déduire un achèvement fonctionnel d’une refonte visuelle.

Contrastes de tokens vérifiés par `node scripts/check-pearl-tokens.mjs` : texte principal 15,50:1, texte secondaire 5,70:1, action sur blanc 6,48:1, accent 5,31:1, succès 5,96:1, avertissement 5,72:1, erreur 6,41:1 ; bordure de champ 3,80:1. Le test porte sur ces couples opaques, pas sur tout assemblage possible. Les bordures purement décoratives ne sont pas des limites de contrôle.

Les vérifications initiales du catalogue ont passé le 31 octobre 2026. Depuis, des builds de production locale et des parcours métier ont été vérifiés. Aucun déploiement distant n’est impliqué. Les preuves par surface sont consignées séparément.

## Intégration Clinic OS
Le shell connecté porte data-ds=pearl; pearl-connected.css adapte les primitives historiques sans modifier leurs événements ni contrôles de droits. ClinicDesignProvider propage le scope aux portails des modales historiques, en conservant closeDisabled et le retour du focus. Sa valeur accepte `"pearl"` ou `{design:"pearl",theme:"light"|"dark"}` pour les aperçus avec préférence de thème. Patient Pass et réservation publique partagent les tokens, avec leurs propres composants et parcours. Vérification : scripts/check-pearl-connected.mjs et parcours natifs Patients/Intake existants.


## Recomposition UX du 31 octobre 2026

La première passe de tokens/adaptateurs ne satisfaisait pas la direction demandée. La seconde passe remplace les structures de travail : rail compact dépliable, une seule barre contextuelle, recherche des modules autorisés (Ctrl K), compte/cabinet dans un dialogue, préférences de densité/mouvement en mémoire. Les styles de connexion sont limités à la carte de connexion pour ne plus imposer leur grille aux en-têtes et formulaires métier.

Patients utilise des lignes/cartes entièrement cliquables, filtres/tri/pagination et retour avec état/focus/position conservés. La synthèse du dossier ouvre les véritables rubriques depuis ses cartes et présente le prochain rendez-vous enregistré. Demandes sépare Contact/Suivi/Historique, place l’attribution près de l’identité et propose une navigation liste/fiche sur téléphone. Agenda regroupe ses outils au-dessus du calendrier. Réservations expose filtres et fiche modale; Catalogue regroupe recherche/catégorie/statut avec dix lignes par page; Équipe sépare annuaire et activité; Messagerie utilise un espace liste/conversation; Paramètres expose des cartes d’accès aux éditeurs modaux.

Ces parcours utilisent les données et commandes existantes. Les notifications fictives, soldes et actions simulées du laboratoire ne sont pas importés. La messagerie reste une observation synthétique en lecture seule. Aucun rôle, schéma ou gate métier n’est modifié. La couverture fonctionnelle Build Center ne gagne pas de points du fait de cette adoption UX.

Vérification de la composition : scripts/check-pearl-workspace-ux.mjs, scripts/check-pearl-connected.mjs, scripts/check-local-intake-pipeline.mjs et scripts/check-agenda-settings-modal.mjs. Les captures locales documentent le résultat; la qualité visuelle reste soumise au retour du propriétaire.
