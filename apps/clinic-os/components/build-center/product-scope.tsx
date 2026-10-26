'use client';
import { useState } from 'react';
import type { BuildStatusData } from './types';
import { TestLinks } from './test-links';
const tiers = [ ['P0', 'Le cœur opérationnel'], ['P1', 'L’expérience connectée'], ['P2', 'Intelligence & pilotage'], ['P3', 'Réseau & transmission'] ] as const;
const stateLabels = { partial: 'Fonctionnel partiel', preview: 'Aperçu UI seulement', planned: 'À construire' };

export function ProductScope({ status }: { status: BuildStatusData }) {
  const [filter, setFilter] = useState('all');
  return <section aria-labelledby="scope-title">
    <div className="build-section-heading"><div><p className="eyebrow muted">PÉRIMÈTRE DU PRODUIT FINAL</p><h2 id="scope-title">Les 21 modules du PRD</h2></div><span>Guide maître · pages 20–41</span></div>
    <p className="scope-explanation">Ces identifiants sont ceux des modules produit. Les sept jalons de livraison décrivent l’ordre de construction et regroupent plusieurs modules.</p>
    <div className="build-filters" role="group" aria-label="Filtrer les modules produit">{[['all', 'Tous les modules'], ['partial', 'Fonctionnel partiel'], ['preview', 'Aperçus UI'], ['planned', 'À construire']].map(([value, label]) => <button key={value} onClick={() => setFilter(value!)} aria-pressed={filter === value}>{label}</button>)}</div>
    {tiers.map(([tier, title]) => {
      const modules = status.productModules.filter(module => module.tier === tier && (filter === 'all' || filter === module.state));
      return modules.length > 0 && <section className="scope-tier" key={tier}><h3><span>{tier}</span>{title}<small>{modules.length} modules</small></h3><div className="scope-grid">{modules.map(module => <article className="scope-card" key={module.id} data-module-id={module.id}>
        <header><span className="scope-id">{module.id}</span><span className={`scope-status ${module.state}`}>{stateLabels[module.state]}</span></header>
        <h4>{module.title}</h4><div className="scope-built"><strong>Disponible aujourd’hui</strong><p>{module.built}</p></div>
        <div className="scope-remaining"><strong>Reste à livrer</strong><ul>{module.remaining.map(item => <li key={item}>{item}</li>)}</ul></div>
        <details><summary>Condition d’acceptation & source</summary><p>{module.gate}</p><small>Guide maître, p. {module.sourcePage} · docs/04_MODULE_PRD.md. Le périmètre détaillé est prévu; sa livraison n’est pas acquise.</small></details>
        {module.links.length > 0 ? <TestLinks links={module.links}/> : <p className="no-module-test">Aucune fonctionnalité de ce module à tester pour le moment.</p>}
      </article>)}</div></section>;
    })}
    <p className="program-source">Priorités du guide : M03 couvre P0–P1, M20 P2–P3; ils sont regroupés ici à leur premier niveau. Le noyau Playbook est nécessaire plus tôt pour le pilote. Leurs numéros ne correspondent pas aux jalons de livraison.</p>
  </section>;
}
