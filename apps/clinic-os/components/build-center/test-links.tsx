import { useEffect, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import type { TestLink } from '../../lib/product-roadmap';
import { localDemoUrl } from '../../lib/local-demo-url';

export function TestLinks({ links }: { links: TestLink[] }) {
  const [hostname, setHostname] = useState<string | null>(null);
  useEffect(() => setHostname(window.location.hostname), []);
  return <div className="build-test-links">{links.map(link => {
    const href = hostname ? localDemoUrl(link.href, hostname) : link.href;
    return <div key={`${link.href}-${link.label}`}>
      {href ? <a href={href} target="_blank" rel="noreferrer">{link.label}<ArrowUpRight size={16}/></a> : <span>{link.label} · disponible sur le réseau local</span>}
      <span>{link.kind === 'demo' ? 'Démo synthétique' : link.kind === 'preview' ? 'Aperçu UI uniquement' : 'Session vérifiée requise'} · nouvel onglet</span>
      <p>{link.instruction}</p>
    </div>;
  })}</div>;
}
