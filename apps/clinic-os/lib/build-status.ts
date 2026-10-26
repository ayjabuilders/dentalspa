import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { productModules, infrastructure, releaseGates, intakeTest, schedulingTest, connectionTest, type TestLink } from './product-roadmap';
import type { BuildMilestone, BuildStatusData, BuildTask, BuildTaskState } from '../components/build-center/types';
import { calculateProgress, type ProgressLedger } from './module-progress';

type QueueTask = {
  id: string;
  state: string;
  depends_on?: string[];
  acceptance?: string;
  evidence?: string;
  blocker?: string;
  unblocks_on?: string;
  next_action?: string;
};

type Queue = { version: number; tasks: QueueTask[] };

const labels: Record<string, string> = {
  'FOUNDATION-REVIEW': 'Fondation de la plateforme',
  'HOSTED-FOUNDATION': 'Fondation hébergée et restauration',
  'INTAKE-CONTRACT': 'Contrat des demandes entrantes',
  'INTAKE-API': 'API des demandes entrantes',
  'INTAKE-UI': 'Interface des demandes',
  'INTAKE-INTEGRATE': 'Intégration des demandes',
  'INQUIRY-FOLLOW-UP-CONTRACT': 'Contrat de suivi des demandes',
  'INQUIRY-FOLLOW-UP-API': 'Historique de suivi sécurisé',
  'INQUIRY-FOLLOW-UP-UI': 'Interface de suivi des demandes',
  'INQUIRY-FOLLOW-UP-INTEGRATE': 'Intégration du suivi des demandes',
  'INQUIRY-OWNER-WORKLIST-CONTRACT': 'Contrat des échéances du responsable',
  'INQUIRY-OWNER-WORKLIST-API': 'Échéances sécurisées du responsable',
  'INQUIRY-OWNER-WORKLIST-UI': 'Interface des échéances',
  'INQUIRY-OWNER-WORKLIST-INTEGRATE': 'Intégration des échéances',
  'INQUIRY-SCHEDULE-CONTRACT': 'Contrat de replanification du suivi',
  'INQUIRY-SCHEDULE-API': 'Replanification sécurisée du suivi',
  'INQUIRY-SCHEDULE-UI': 'Interface de replanification',
  'INQUIRY-SCHEDULE-INTEGRATE': 'Intégration de la replanification',
  'INQUIRY-SCHEDULE-HISTORY-CONTRACT': 'Contrat de l’historique des échéances',
  'INQUIRY-SCHEDULE-HISTORY-API': 'Historique personnel sécurisé',
  'INQUIRY-SCHEDULE-HISTORY-UI': 'Interface de l’historique des échéances',
  'INQUIRY-SCHEDULE-HISTORY-INTEGRATE': 'Intégration de l’historique des échéances',
  'TEAM-ROSTER-CONTRACT': 'Contrat de l’annuaire Équipe',
  'TEAM-ROSTER-API': 'Annuaire sécurisé du cabinet',
  'TEAM-ROSTER-UI': 'Interface Équipe',
  'TEAM-ROSTER-INTEGRATE': 'Intégration de l’annuaire Équipe',
  'TEAM-ACTIVITY-CONTRACT': 'Contrat de l’activité récente',
  'TEAM-ACTIVITY-API': 'Activité récente sécurisée',
  'TEAM-ACTIVITY-UI': 'Journal d’activité Équipe',
  'TEAM-ACTIVITY-INTEGRATE': 'Intégration de l’activité Équipe',
  'PATIENT-LOOKUP-CONTRACT': 'Contrat de recherche patient',
  'PATIENT-LOOKUP-API': 'Recherche patient sécurisée',
  'PATIENT-LOOKUP-UI': 'Interface de recherche patient',
  'PATIENT-LOOKUP-INTEGRATE': 'Intégration de la recherche patient',
  'PATIENT-SELECTION-DECISION-PACKET': 'Décisions pour la sélection patient',
  'PATIENT-SELECTION-POLICY': 'Politique de sélection patient',
  'SCHEDULING-HOLD-CONTRACT': 'Contrat des options de ressources',
  'SCHEDULING-HOLD-API': 'API des options de ressources',
  'SCHEDULING-HOLD-UI': 'Agenda et options temporaires',
  'SCHEDULING-HOLD-INTEGRATE': 'Intégration de la planification',
  'SCHEDULING-CONCURRENCY-EVIDENCE': 'Preuve de concurrence PostgreSQL',
  'PWA-LOCAL-RUNTIME': 'PWA locale et cache sécurisé',
  'RESOURCE-RULES-DECISION-PACKET': 'Décisions sur les ressources du cabinet',
  'RESOURCE-RULES-POLICY': 'Politique des ressources du cabinet',
  'APPOINTMENT-CONFIRMATION-CONTRACT': 'Confirmation, annulation et déplacement',
};

const milestones: BuildMilestone[] = [
  { id: 'M01', title: 'Fondation', state: 'foundation', summary: 'Applications, identité, sécurité, API, audit, PWA et socle de tests.', unlock: 'Activation réelle après validation des identités hébergées, de la restauration et des appareils installés.' },
  { id: 'M02', title: 'Demandes & planification', state: 'current', summary: 'Demandes entrantes, recherche patient, options de ressources et agenda réception.', unlock: 'La politique de sélection patient débloque l’association; le contrat de confirmation débloque le rendez-vous confirmé.' },
  { id: 'M03', title: 'Visite & moteur de tâches', state: 'future', summary: 'Check-in, appel et accompagnement, modèles de service, affectations et prochaine action.', unlock: 'Commence après les dépendances de planification M02 et un contrat de workflow figé.' },
  { id: 'M04', title: 'Clinique & parcours de soin', state: 'gated', summary: 'Consultations, notes signées, plans versionnés, cas multi-visites et projection patient sûre.', unlock: 'Exige l’acceptation M03 et une validation clinique explicite avant toute utilisation réelle.' },
  { id: 'M05', title: 'Laboratoire, finance & Patient Pass', state: 'future', summary: 'Handoff laboratoire simulé, devis et paiements vérifiables, documents libérés et vues patient sécurisées.', unlock: 'Suit les contrats cliniques M04 et les règles de publication patient.' },
  { id: 'M06', title: 'Smart Notes', state: 'gated', summary: 'Transcriptions fictives, consentement, deux brouillons séparés et revue humaine obligatoire.', unlock: 'Aucune capture réelle avant approbations clinique, confidentialité, fournisseur et sécurité.' },
  { id: 'M07', title: 'Écosystème opérationnel', state: 'future', summary: 'Extensions spécialisées branchées sur les contrats et événements validés.', unlock: 'Chaque module reçoit son propre contrat, ses preuves et sa porte d’activation.', modules: ['LabFlow', 'ChairFlow', 'SmartStock', 'SteriTrack', 'Pulse'] },
];

function phase(id: string) {
  if (id.startsWith('FOUNDATION') || id === 'HOSTED-FOUNDATION') return 'M01 · Fondation';
  if (id.startsWith('INTAKE') || id.startsWith('INQUIRY-FOLLOW-UP') || id.startsWith('INQUIRY-OWNER-WORKLIST') || id.startsWith('INQUIRY-SCHEDULE')) return 'M02 · Demandes';
  if (id.startsWith('PATIENT-LOOKUP')) return 'M02 · Recherche patient';
  if (id.startsWith('PATIENT-SELECTION')) return 'M02 · Sélection patient';
  if (id.startsWith('TEAM-ROSTER') || id.startsWith('TEAM-ACTIVITY')) return 'M16 · Équipe et accès';
  if (id.startsWith('SCHEDULING') || id.startsWith('RESOURCE-RULES') || id.startsWith('APPOINTMENT')) return 'M02 · Planification';
  if (id.startsWith('PWA')) return 'Expérience installable';
  return 'À planifier';
}

function publicState(state: string): BuildTaskState {
  if (state === 'done') return 'done';
  if (state === 'blocked') return 'blocked';
  if (['running', 'in_progress', 'verification', 'ready'].includes(state)) return 'active';
  return 'queued';
}

function titleFromId(id: string) {
  return id.toLowerCase().split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

function testLinks(id: string): TestLink[] {
  if (id.startsWith('INTAKE') || id.startsWith('INQUIRY-FOLLOW-UP') || id.startsWith('INQUIRY-OWNER-WORKLIST') || id.startsWith('INQUIRY-SCHEDULE')) return [intakeTest];
  if (id.startsWith('PATIENT-LOOKUP')) return [connectionTest];
  if (id.startsWith('TEAM-ROSTER')) return [{ href: '/team', label: 'Tester l’annuaire Équipe', kind: 'demo', instruction: 'Annuaire fictif en lecture seule; les rôles d’accès ne prouvent ni qualification ni présence.' }, connectionTest];
  if (id.startsWith('TEAM-ACTIVITY')) return [{ href: '/team', label: 'Tester l’activité Équipe', kind: 'demo', instruction: 'Journal synthétique borné à quatre actions déjà auditées; ni présence, ni performance, ni audit exhaustif.' }, connectionTest];
  if (id.startsWith('SCHEDULING')) return [schedulingTest];
  if (id === 'PWA-LOCAL-RUNTIME' || id === 'FOUNDATION-REVIEW') return [{ href: '/', label: 'Explorer Clinic OS', kind: 'demo', instruction: 'Tester la navigation, les thèmes, les notifications fictives et le guide d’installation.' }];
  return [];
}

function queuePath() {
  const candidates = [
    path.resolve(process.cwd(), 'docs/WORK_QUEUE.json'),
    path.resolve(process.cwd(), '../../docs/WORK_QUEUE.json'),
  ];
  const selected = candidates.find(candidate => existsSync(candidate));
  if (!selected) throw new Error('Dental Spa delivery queue is unavailable during build.');
  return selected;
}

export function getBuildStatus(): BuildStatusData {
  const sourcePath = queuePath();
  const queue = JSON.parse(readFileSync(sourcePath, 'utf8')) as Queue;
  const ledger = JSON.parse(readFileSync(path.join(path.dirname(sourcePath), 'MODULE_PROGRESS.json'), 'utf8')) as ProgressLedger;
  const progress = calculateProgress(ledger, queue.tasks, productModules.map(module => module.id));
  const tasks: BuildTask[] = queue.tasks.map(task => {
    const source = `${task.evidence ?? ''} ${task.acceptance ?? ''}`;
    const numbers = [...source.matchAll(/PR\s*#(\d+)/gi)].map(match => match[1]).filter((value): value is string => Boolean(value));
    return {
      id: task.id,
      label: labels[task.id] ?? titleFromId(task.id),
      phase: phase(task.id),
      state: publicState(task.state),
      acceptance: task.acceptance ?? 'Critères en cours de définition.',
      evidence: task.evidence,
      blocker: task.blocker,
      nextAction: task.unblocks_on ?? task.next_action,
      dependencies: task.depends_on ?? [],
      pullRequests: [...new Set(numbers)].map(number => ({ number, url: `https://github.com/ayjabuilders/dentalspa/pull/${number}` })),
      links: task.state === 'done' ? testLinks(task.id) : [],
    };
  });
  const counts = tasks.reduce<BuildStatusData['counts']>((result, task) => {
    result[task.state] += 1;
    return result;
  }, { done: 0, active: 0, blocked: 0, queued: 0 });
  const status: BuildStatusData = { sourceVersion: queue.version, tasks, counts, milestones, productModules: productModules.map(module => ({ ...module, progress: progress[module.id]! })), infrastructure, releaseGates, snapshotAt: new Date().toISOString(), snapshotId: process.env.DENTAL_BUILD_SNAPSHOT_ID ?? 'development', successfulAt: null, progressReviewedAt: ledger.reviewedAt };
  if (process.env.DENTAL_BUILD_CANDIDATE) writeFileSync(process.env.DENTAL_BUILD_CANDIDATE, JSON.stringify(status));
  return status;
}
