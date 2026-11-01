export const demoApprovalRequests = [
  {
    id: 'welcome-copy-demo',
    title: 'Relecture d’un texte interne de bienvenue',
    owner: 'Salma Alaoui',
    due: 'Échéance fictive : 16:00',
    version: 'Brouillon de démonstration v1',
  },
  {
    id: 'office-supplies-demo',
    title: 'Organisation de la papeterie de démonstration',
    owner: 'Youssef Benali',
    due: 'Échéance fictive : 17:00',
    version: 'Proposition de démonstration v1',
  },
] as const;

export type DemoApprovalRequestId = (typeof demoApprovalRequests)[number]['id'];
export type DemoApprovalDecision = 'accepted' | 'declined';
