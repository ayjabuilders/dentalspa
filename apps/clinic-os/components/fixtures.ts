// UI-only synthetic fixtures; never imported by domain services or seeds.
export const patients = [
  { id: 'DEMO-001', name: 'Salma Alaoui', initials: 'SA', time: '09:00', tag: 'À accueillir', image: 0, note: 'Profil fictif · aucune donnée réelle' },
  { id: 'DEMO-002', name: 'Youssef Benali', initials: 'YB', time: '09:45', tag: 'Prévu', image: 1, note: 'Profil fictif · aucune donnée réelle' },
  { id: 'DEMO-003', name: 'Imane El Idrissi', initials: 'IE', time: '10:30', tag: 'Prévu', image: 2, note: 'Profil fictif · aucune donnée réelle' },
  { id: 'DEMO-004', name: 'Mehdi Amrani', initials: 'MA', time: '11:15', tag: 'Prévu', image: 3, note: 'Profil fictif · aucune donnée réelle' }
];
// Fictional, local-only directory profiles. Contact values are unmistakable placeholders.
export const patientDirectory = [
  { ...patients[0]!, email: 'salma.alaoui@example.test', phone: '+212 6XX XX XX 01', visit: '28 oct. · 09:00', visitNote: 'Scénario d’accueil · non réservé' },
  { ...patients[1]!, email: 'youssef.benali@example.test', phone: '+212 6XX XX XX 02', visit: '29 oct. · 09:45', visitNote: 'Exemple de visite · non confirmé' },
  { ...patients[2]!, email: 'imane.elidrissi@example.test', phone: '+212 6XX XX XX 03', visit: 'Aucun créneau fictif', visitNote: 'Aucune réservation' },
  { ...patients[3]!, email: 'mehdi.amrani@example.test', phone: '+212 6XX XX XX 04', visit: '30 oct. · 11:15', visitNote: 'Option illustrée · non réservée' },
  { id: 'DEMO-005', name: 'Yasmine Benjelloun', initials: 'YB', time: '13:30', tag: 'Prévu', image: 0, note: 'Profil fictif · aucune donnée réelle', email: 'yasmine.benjelloun@example.test', phone: '+212 6XX XX XX 05', visit: '28 oct. · 13:30', visitNote: 'Scénario d’après-midi · non confirmé' },
  { id: 'DEMO-006', name: 'Adam Berrada', initials: 'AB', time: '—', tag: 'Sans visite', image: 1, note: 'Profil fictif · aucune donnée réelle', email: 'adam.berrada@example.test', phone: '+212 6XX XX XX 06', visit: 'Aucun créneau fictif', visitNote: 'Aucune réservation' },
  { id: 'DEMO-007', name: 'Nour Idrissi', initials: 'NI', time: '14:15', tag: 'Prévu', image: 2, note: 'Profil fictif · aucune donnée réelle', email: 'nour.idrissi@example.test', phone: '+212 6XX XX XX 07', visit: '28 oct. · 14:15', visitNote: 'Scénario de visite · non confirmé' },
  { id: 'DEMO-008', name: 'Omar Bennani', initials: 'OB', time: '—', tag: 'Sans visite', image: 1, note: 'Profil fictif · aucune donnée réelle', email: 'omar.bennani@example.test', phone: '+212 6XX XX XX 08', visit: 'Aucun créneau fictif', visitNote: 'Aucune réservation' },
  { id: 'DEMO-009', name: 'Samira Amrani', initials: 'SA', time: '15:00', tag: 'Prévu', image: 0, note: 'Profil fictif · aucune donnée réelle', email: 'samira.amrani@example.test', phone: '+212 6XX XX XX 09', visit: '28 oct. · 15:00', visitNote: 'Scénario de visite · non confirmé' },
  { id: 'DEMO-010', name: 'Hamza Chraibi', initials: 'HC', time: '—', tag: 'Sans visite', image: 3, note: 'Profil fictif · aucune donnée réelle', email: 'hamza.chraibi@example.test', phone: '+212 6XX XX XX 10', visit: 'Aucun créneau fictif', visitNote: 'Aucune réservation' }
];
export const workspaces = [
  { id: 'patients', title: 'Patients & expérience', description: 'Chaque relation compte.', image: 'patients', accent: '#167d8c', caption: 'Répertoire de démonstration', available: true },
  { id: 'clinical', title: 'Espace clinique', description: 'Le soin, au centre.', image: 'clinical', accent: '#3176c0', caption: 'Aperçu local · M04', available: true },
  { id: 'smile', title: 'New Smile Studio', description: 'Donner forme aux sourires.', image: 'smile', accent: '#8657be', caption: 'Exploration future', available: false },
  { id: 'lab', title: 'Laboratoire digital', description: 'La précision en équipe.', image: 'lab', accent: '#6761ba', caption: 'À construire · M05', available: false },
  { id: 'operations', title: 'Vie du cabinet', description: 'Un quotidien harmonieux.', image: 'operations', accent: '#238568', caption: 'À construire · M03', available: false },
  { id: 'business', title: 'Business Pulse', description: 'Une vision plus claire.', image: 'business', accent: '#9a7439', caption: 'Parcours financier fictif', available: true }
];
