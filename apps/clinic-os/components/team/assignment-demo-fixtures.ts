import type { TeamRoster } from '@dental/contracts';

export type DemoStaffMember = TeamRoster['members'][number];
export type DemoStaffTask = {
  id: string;
  label: string;
  ownerUserId: string;
  ownerLabel: string;
  teamId: 'reception-demo' | 'office-support-demo';
  teamLabel: string;
  capabilityId: string;
  capabilityLabel: string;
  slots: string[];
  delegable: boolean;
};

export const demoStaffTasks: DemoStaffTask[] = [
  {
    id: 'welcome-demo',
    label: 'Préparer l’accueil de démo',
    ownerUserId: '10000000-0000-4000-8000-000000000012',
    ownerLabel: 'Salma Alaoui',
    teamId: 'reception-demo',
    teamLabel: 'Accueil de démonstration',
    capabilityId: 'welcome-demo',
    capabilityLabel: 'Accueil de démonstration',
    slots: ['10:00', '11:00'],
    delegable: false,
  },
  {
    id: 'office-supplies-demo',
    label: 'Vérifier les fournitures de bureau',
    ownerUserId: '10000000-0000-4000-8000-000000000011',
    ownerLabel: 'Youssef Benali',
    teamId: 'office-support-demo',
    teamLabel: 'Support administratif de démonstration',
    capabilityId: 'office-supplies-demo',
    capabilityLabel: 'Fournitures de bureau de démonstration',
    slots: ['14:00', '15:00'],
    delegable: true,
  },
];

const demoStaffing = {
  '10000000-0000-4000-8000-000000000011': {
    teamId: 'office-support-demo',
    capabilities: ['coordination-demo', 'office-supplies-demo'],
    shift: ['09:00', '17:00'],
    busySlots: ['15:00'],
  },
  '10000000-0000-4000-8000-000000000012': {
    teamId: 'reception-demo',
    capabilities: ['welcome-demo'],
    shift: ['09:00', '13:00'],
    busySlots: ['11:00'],
  },
  '10000000-0000-4000-8000-000000000013': {
    teamId: 'office-support-demo',
    capabilities: ['office-supplies-demo'],
    shift: ['13:00', '17:00'],
    busySlots: ['14:00'],
  },
  '10000000-0000-4000-8000-000000000014': {
    teamId: 'reception-demo',
    capabilities: ['welcome-demo'],
    shift: ['13:00', '17:00'],
    busySlots: [],
  },
} as const;

export type DemoCandidateCheck = {
  member: DemoStaffMember;
  reasons: string[];
  matches: boolean;
  shiftLabel: string;
};

export function checkDemoCandidate(member: DemoStaffMember, task: DemoStaffTask, slot: string): DemoCandidateCheck {
  const sample = demoStaffing[member.user_id as keyof typeof demoStaffing];
  const reasons: string[] = [];
  if (!sample) {
    reasons.push('Profil absent du scénario fictif');
    return { member, reasons, matches: false, shiftLabel: 'Horaire fictif non renseigné' };
  }

  const shiftLabel = `${sample.shift[0]}–${sample.shift[1]}`;
  if (sample.teamId !== task.teamId) reasons.push('Équipe de démonstration différente');
  if (!sample.capabilities.includes(task.capabilityId as never)) reasons.push('Capacité de démonstration différente');
  if (slot < sample.shift[0] || slot >= sample.shift[1]) reasons.push('Hors de l’horaire fictif');
  if (sample.busySlots.includes(slot as never)) reasons.push('Déjà occupé dans le scénario');

  return { member, reasons, matches: reasons.length === 0, shiftLabel };
}

export function demoAccessRoleLabel(role: string) {
  return role === 'manager' ? 'Gestionnaire' : role === 'dentist' ? 'Dentiste' : role === 'assistant' ? 'Assistant' : 'Accueil';
}
