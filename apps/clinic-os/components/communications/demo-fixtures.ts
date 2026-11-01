export type DemoConversation = {
  id: string;
  name: string;
  reference: string;
  preview: string;
  time: string;
  unread: boolean;
  messages: { id: string; direction: 'incoming' | 'outgoing'; text: string; time: string }[];
};

export const demoConversations: DemoConversation[] = [
  {
    id: 'DEMO-CHAT-001', name: 'Meryem El Fassi', reference: 'Contact fictif · DEMO-CHAT-001',
    preview: 'Est-ce que le cabinet est ouvert le samedi ?', time: 'Exemple · 09:14', unread: true,
    messages: [{ id: 'm1', direction: 'incoming', text: 'Bonjour, est-ce que le cabinet est ouvert le samedi ?', time: '09:14' }],
  },
  {
    id: 'DEMO-CHAT-002', name: 'Hamza Berrada', reference: 'Contact fictif · DEMO-CHAT-002',
    preview: 'Je souhaiterais être rappelé demain matin.', time: 'Exemple · 08:42', unread: true,
    messages: [
      { id: 'h1', direction: 'incoming', text: 'Bonjour, je souhaiterais être rappelé demain matin au sujet de ma demande.', time: '08:42' },
      { id: 'h2', direction: 'outgoing', text: 'Bonjour Hamza, votre demande est bien prise en compte dans cette simulation. Aucun rappel réel n’est programmé.', time: '08:45' },
    ],
  },
  {
    id: 'DEMO-CHAT-003', name: 'Salma Alaoui', reference: 'Contact fictif · DEMO-CHAT-003',
    preview: 'Pouvez-vous me préciser comment venir ?', time: 'Exemple · 08:10', unread: false,
    messages: [{ id: 's1', direction: 'incoming', text: 'Bonjour, pouvez-vous me préciser comment venir au cabinet ?', time: '08:10' }],
  },
  {
    id: 'DEMO-CHAT-004', name: 'Youssef Amrani', reference: 'Contact fictif · DEMO-CHAT-004',
    preview: 'Ma demande de rendez-vous a-t-elle été reçue ?', time: 'Exemple · 07:56', unread: false,
    messages: [
      { id: 'y1', direction: 'incoming', text: 'Bonjour, ma demande de rendez-vous a-t-elle été reçue ?', time: '07:56' },
      { id: 'y2', direction: 'outgoing', text: 'Bonjour Youssef, ceci est un exemple local. Une demande ne confirme pas de rendez-vous.', time: '08:00' },
    ],
  },
  {
    id: 'DEMO-CHAT-005', name: 'Amal Bennani', reference: 'Contact fictif · DEMO-CHAT-005',
    preview: 'Comment demander une copie de facture ?', time: 'Exemple · Hier', unread: false,
    messages: [{ id: 'a1', direction: 'incoming', text: 'Bonjour, comment puis-je demander une copie de facture ?', time: 'Hier' }],
  },
];
