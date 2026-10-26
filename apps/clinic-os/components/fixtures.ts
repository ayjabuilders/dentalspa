// UI-only synthetic fixtures; never imported by domain services or seeds.
export const patients = [
  { id: 'DEMO-001', name: 'Lina Exemple', initials: 'LE', time: '09:00', tag: 'À accueillir', image: 0, note: 'Fiche de démonstration · aucune donnée réelle' },
  { id: 'DEMO-002', name: 'Adam Exemple', initials: 'AE', time: '09:45', tag: 'Prévu', image: 1, note: 'Fiche de démonstration · aucune donnée réelle' },
  { id: 'DEMO-003', name: 'Nora Exemple', initials: 'NE', time: '10:30', tag: 'Prévu', image: 2, note: 'Fiche de démonstration · aucune donnée réelle' },
  { id: 'DEMO-004', name: 'Yanis Exemple', initials: 'YE', time: '11:15', tag: 'Prévu', image: 3, note: 'Fiche de démonstration · aucune donnée réelle' }
];
export const workspaces = [
  { id: 'patients', title: 'Patients & expérience', description: 'Chaque relation compte.', image: 'patients', accent: '#167d8c', caption: 'Répertoire de démonstration', available: true },
  { id: 'clinical', title: 'Espace clinique', description: 'Le soin, au centre.', image: 'clinical', accent: '#3176c0', caption: 'À construire · M04', available: false },
  { id: 'smile', title: 'New Smile Studio', description: 'Donner forme aux sourires.', image: 'smile', accent: '#8657be', caption: 'Exploration future', available: false },
  { id: 'lab', title: 'Laboratoire digital', description: 'La précision en équipe.', image: 'lab', accent: '#6761ba', caption: 'À construire · M05', available: false },
  { id: 'operations', title: 'Vie du cabinet', description: 'Un quotidien harmonieux.', image: 'operations', accent: '#238568', caption: 'À construire · M03', available: false },
  { id: 'business', title: 'Business Pulse', description: 'Une vision plus claire.', image: 'business', accent: '#9a7439', caption: 'À construire · M05', available: false }
];
