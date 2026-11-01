'use client';
import { ArrowUpRight, BookOpen, CalendarClock, FolderOpen, WalletCards } from 'lucide-react';
import './finance-home.css';

export function FinanceHome({ onOpen }: { onOpen: (module: string) => void }) {
  const entries = [
    { module: 'patients', title: 'Devis, factures et paiements', description: 'Choisissez un patient pour ouvrir son dossier financier.', icon: FolderOpen },
    { module: 'finance-reminders', title: 'Échéances', description: 'Retrouvez les échéanciers et les soldes à suivre.', icon: CalendarClock },
    { module: 'finance-catalog', title: 'Catalogue tarifaire', description: 'Gérez les prestations, leurs catégories et leurs tarifs.', icon: BookOpen },
  ];
  return <section className="finance-home" aria-labelledby="finance-home-title">
    <header><span className="finance-home-icon"><WalletCards size={24}/></span><div><h1 id="finance-home-title" tabIndex={-1}>Finance</h1><p>Les documents et règlements de votre cabinet.</p></div></header>
    <div className="finance-home-grid">{entries.map(entry => <button type="button" key={entry.module} onClick={() => onOpen(entry.module)}>
      <span className="finance-home-icon"><entry.icon size={23}/></span><h2>{entry.title}</h2><p>{entry.description}</p><span className="finance-home-action">Ouvrir<ArrowUpRight size={18}/></span>
    </button>)}</div>
  </section>;
}
