import type { patientDirectory } from '../fixtures';

type PatientDemoRecord = (typeof patientDirectory)[number];
export type PatientJourneyExample = { category: 'Contact' | 'Identification' | 'Rendez-vous' | 'Documents' | 'Devis' | 'Paiement' | 'Suivi administratif'; title: string; detail: string; state: string };
export type PatientDemoJourney = { title: string; description: string; steps: PatientJourneyExample[] };

const journeys: Record<string, PatientDemoJourney> = {
  'DEMO-001': { title: 'Salma Alaoui · premier contact', description: 'Exemple de parcours administratif, du premier échange à une prochaine action.', steps: [
    { category: 'Contact', title: 'Demande d’information par téléphone', detail: 'Question générale · exemple de réception manuelle.', state: 'Exemple local' },
    { category: 'Suivi administratif', title: 'Rappel souhaité', detail: 'Créneau de rappel à convenir avec la personne.', state: 'À organiser' },
    { category: 'Rendez-vous', title: 'Option de première visite', detail: 'Une proposition d’horaire reste une demande, pas une réservation.', state: 'Non confirmé' },
    { category: 'Documents', title: 'Liste administrative', detail: 'Aucun document n’est reçu ou stocké dans cet aperçu.', state: 'À vérifier' },
    { category: 'Devis', title: 'Aperçu générique · 1 450 MAD fictifs', detail: 'Exemple de calcul seulement; aucun tarif du cabinet ni devis n’existe.', state: 'Non émis' },
  ] },
  'DEMO-002': { title: 'Youssef Benali · demande en ligne', description: 'Exemple de demande à examiner avant de confirmer un créneau.', steps: [
    { category: 'Contact', title: 'Demande envoyée depuis le site', detail: 'Première visite · coordonnées fictives.', state: 'Exemple local' },
    { category: 'Identification', title: 'Recherche d’un dossier similaire', detail: 'Une ressemblance éventuelle ne vérifie pas l’identité et ne crée aucun lien.', state: 'À vérifier' },
    { category: 'Rendez-vous', title: 'Horaire souhaité transmis à la réception', detail: 'La disponibilité et la confirmation doivent être vérifiées séparément.', state: 'Demande uniquement' },
    { category: 'Documents', title: 'Aucun fichier partagé', detail: 'Le dépôt et la revue des documents ne sont pas actifs dans cette fiche.', state: 'Indisponible' },
    { category: 'Suivi administratif', title: 'Prochaine étape : réponse de la réception', detail: 'Aucun message n’est envoyé depuis cet aperçu.', state: 'Non transmis' },
  ] },
  'DEMO-003': { title: 'Imane El Idrissi · accueil sans rendez-vous', description: 'Exemple illustrant une possible correspondance qui reste non vérifiée.', steps: [
    { category: 'Contact', title: 'Demande administrative à l’accueil', detail: 'Exemple de contact saisi manuellement.', state: 'Exemple local' },
    { category: 'Identification', title: 'Résultat éventuellement similaire', detail: 'Possible match seulement · identité non vérifiée · aucun dossier lié.', state: 'Non vérifié' },
    { category: 'Rendez-vous', title: 'Aucune réservation dans ce scénario', detail: 'Une demande ou une correspondance ne confirme pas un créneau.', state: 'Aucun rendez-vous' },
    { category: 'Documents', title: 'Aucune pièce administrative associée', detail: 'Aucun upload, classement ou contrôle n’a eu lieu.', state: 'Aucun document' },
    { category: 'Suivi administratif', title: 'Vérification à effectuer par le cabinet', detail: 'Aucune conversion patient ou autorisation de compte n’est simulée.', state: 'En attente' },
  ] },
  'DEMO-004': { title: 'Mehdi Amrani · contact recommandé', description: 'Exemple d’un parcours avec documents et estimation encore à préparer.', steps: [
    { category: 'Contact', title: 'Contact recommandé', detail: 'La provenance est un exemple, aucune personne référente réelle n’est enregistrée.', state: 'Exemple local' },
    { category: 'Suivi administratif', title: 'Responsable à attribuer', detail: 'Cet aperçu ne modifie pas la file de travail de l’équipe.', state: 'Non attribué' },
    { category: 'Rendez-vous', title: 'Proposition à examiner', detail: 'Aucune salle, disponibilité réelle ou réservation n’est vérifiée.', state: 'Non confirmé' },
    { category: 'Documents', title: 'Checklist à compléter', detail: 'Les états sont illustratifs; aucun fichier patient n’est présent.', state: 'Exemple seulement' },
    { category: 'Devis', title: 'Estimation à préparer', detail: 'Aucun prix du cabinet, accord financier ou facture n’est utilisé.', state: 'Non émis' },
  ] },
  'DEMO-005': { title: 'Yasmine Benjelloun · préférence de date', description: 'Exemple de demande publique lorsque le premier horaire ne convient pas.', steps: [
    { category: 'Contact', title: 'Demande de première visite', detail: 'Profil et demande entièrement fictifs.', state: 'Exemple local' },
    { category: 'Rendez-vous', title: 'Autre date souhaitée', detail: 'Préférence indicative; aucune place n’est réservée ni mise en liste.', state: 'Demande uniquement' },
    { category: 'Documents', title: 'Documents non partagés', detail: 'Aucun accès ou téléchargement patient n’est ouvert.', state: 'Indisponible' },
    { category: 'Devis', title: 'Aucun devis dans cet exemple', detail: 'Une demande de visite ne crée ni devis ni plan de soins.', state: 'Aucun devis' },
    { category: 'Paiement', title: 'Aucun paiement', detail: 'Aucun encaissement, acompte, dette ou reçu n’est enregistré.', state: 'Aucune transaction' },
  ] },
  'DEMO-006': { title: 'Adam Berrada · dossier administratif à compléter', description: 'Exemple sans rendez-vous où la prochaine action reste administrative.', steps: [
    { category: 'Contact', title: 'Question générale reçue', detail: 'Exemple d’une demande sans horaire associé.', state: 'Exemple local' },
    { category: 'Identification', title: 'Aucun dossier rapproché', detail: 'La recherche ne crée ni association ni compte patient.', state: 'Non lié' },
    { category: 'Rendez-vous', title: 'Aucun horaire proposé', detail: 'Le cabinet doit vérifier ses règles et disponibilités.', state: 'Aucune réservation' },
    { category: 'Suivi administratif', title: 'Rappel à convenir', detail: 'Aucun contact réel n’est déclenché.', state: 'À définir' },
  ] },
  'DEMO-007': { title: 'Nour Idrissi · parcours avec règlement illustratif', description: 'Exemple financier non comptable; aucun montant n’est attaché à un patient réel.', steps: [
    { category: 'Contact', title: 'Demande d’information', detail: 'Scénario synthétique de réception.', state: 'Exemple local' },
    { category: 'Rendez-vous', title: 'Visite proposée', detail: 'L’horaire affiché dans la fiche est un exemple non confirmé.', state: 'Non confirmé' },
    { category: 'Devis', title: 'Aperçu générique · 2 400 MAD fictifs', detail: 'Montant de démonstration, sans tarif cabinet ni document émis.', state: 'Non émis' },
    { category: 'Paiement', title: 'Aperçu d’acompte · 300 MAD fictifs', detail: 'Simulation de calcul uniquement; aucun argent ni reçu n’existe.', state: 'Non encaissé' },
    { category: 'Suivi administratif', title: 'Rapprochement non disponible', detail: 'Aucune caisse ou transaction n’est reliée à cette fiche.', state: 'Pas de données réelles' },
  ] },
  'DEMO-008': { title: 'Omar Bennani · prise de contact en attente', description: 'Exemple d’une demande sans rendez-vous et sans document patient.', steps: [
    { category: 'Contact', title: 'Demande reçue par formulaire', detail: 'Les coordonnées sont des placeholders fictifs.', state: 'Exemple local' },
    { category: 'Suivi administratif', title: 'Relecture par la réception', detail: 'Aucun membre réel n’est assigné dans ce scénario.', state: 'À examiner' },
    { category: 'Rendez-vous', title: 'Aucun rendez-vous demandé', detail: 'Aucun calendrier réel n’est consulté.', state: 'Aucun rendez-vous' },
    { category: 'Documents', title: 'Aucun document joint', detail: 'Le stockage privé patient n’est pas actif dans cette démo.', state: 'Aucun fichier' },
  ] },
  'DEMO-009': { title: 'Samira Amrani · suivi de demande', description: 'Exemple de coordination administrative avant toute confirmation.', steps: [
    { category: 'Contact', title: 'Demande de renseignements', detail: 'Provenance illustrative, sans message réel.', state: 'Exemple local' },
    { category: 'Identification', title: 'Recherche à effectuer si nécessaire', detail: 'Tout résultat restera une possible correspondance jusqu’à vérification.', state: 'Non vérifié' },
    { category: 'Rendez-vous', title: 'Créneau d’exemple à valider', detail: 'Aucun fauteuil ni praticien réel n’est réservé.', state: 'Non confirmé' },
    { category: 'Suivi administratif', title: 'Prochaine action à définir', detail: 'Aucun rappel n’est programmé ni envoyé.', state: 'À définir' },
  ] },
  'DEMO-010': { title: 'Hamza Chraibi · demande de disponibilité', description: 'Exemple de demande de disponibilité, sans patient lié ni réservation.', steps: [
    { category: 'Contact', title: 'Question sur les horaires', detail: 'Exemple d’une demande générale fictive.', state: 'Exemple local' },
    { category: 'Identification', title: 'Aucune identité vérifiée', detail: 'Aucune recherche ni association de dossier n’est effectuée.', state: 'Non vérifié' },
    { category: 'Rendez-vous', title: 'Disponibilité à confirmer par le cabinet', detail: 'L’affichage ne vaut pas réservation.', state: 'Non confirmé' },
    { category: 'Suivi administratif', title: 'Réponse de la réception à prévoir', detail: 'Aucune communication n’est envoyée par cet aperçu.', state: 'Non transmis' },
  ] },
};

export function getPatientDemoJourney(patient: PatientDemoRecord): PatientDemoJourney {
  return journeys[patient.id] ?? { title: `${patient.name} · parcours d’exemple`, description: 'Exemple administratif synthétique; aucun événement n’est enregistré.', steps: [
    { category: 'Contact', title: 'Demande administrative', detail: 'Scénario local fictif.', state: 'Exemple local' },
    { category: 'Rendez-vous', title: patient.visit, detail: patient.visitNote, state: 'Non confirmé' },
    { category: 'Suivi administratif', title: 'Prochaine étape à définir', detail: 'Aucun message, document ou rendez-vous réel n’est associé.', state: 'À définir' },
  ] };
}
