import { ArrowUpRight } from 'lucide-react';
import type { TestLink } from '../../lib/product-roadmap';

export function TestLinks({ links }: { links: TestLink[] }) {
  return <div className="build-test-links">{links.map(link => <div key={`${link.href}-${link.label}`}>
    <a href={link.href} target="_blank" rel="noreferrer">{link.label}<ArrowUpRight size={16}/></a>
    <span>{link.kind === 'demo' ? 'Démo synthétique' : link.kind === 'preview' ? 'Aperçu UI uniquement' : 'Session vérifiée requise'} · nouvel onglet</span>
    <p>{link.instruction}</p>
  </div>)}</div>;
}
