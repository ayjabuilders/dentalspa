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
    <details className="progress-method"><summary>Comment les pourcentages sont-ils calculés ?</summary><p>Six capacités du PRD, de poids égal, par module : livré = 1 point, partiel = ½ point, prévu = 0. Le total est divisé par 6, puis arrondi. Les preuves doivent référencer des tâches terminées. Un aperçu UI seul ne crédite aucune capacité métier. Cette couverture fonctionnelle estimée ne mesure ni l’effort restant ni l’autorisation d’usage réel.</p><p>Un build réussi actualise les preuves enregistrées; il n’ajoute pas de points à lui seul.</p></details>
    <div className="build-filters" role="group" aria-label="Filtrer les modules produit">{[['all', 'Tous les modules'], ['partial', 'Fonctionnel partiel'], ['preview', 'Aperçus UI'], ['planned', 'À construire']].map(([value, label]) => <button key={value} onClick={() => setFilter(value!)} aria-pressed={filter === value}>{label}</button>)}</div>
    {tiers.map(([tier, title]) => {
      const modules = status.productModules.filter(module => module.tier === tier && (filter === 'all' || filter === module.state));
      return modules.length > 0 && <section className="scope-tier" key={tier}><h3><span>{tier}</span>{title}<small>{modules.length} modules</small></h3><div className="scope-grid">{modules.map(module => <article className="scope-card" key={module.id} data-module-id={module.id}>
        <header><span className="scope-id">{module.id}</span><span className={`scope-status ${module.state}`}>{stateLabels[module.state]}</span></header>
        <h4>{module.title}</h4>
        <div className="module-progress"><div><span>Couverture fonctionnelle estimée</span><strong>{module.progress.percent}%</strong></div><div className="module-progress-track" role="progressbar" aria-label={`Progression ${module.id} ${module.title}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={module.progress.percent}><span style={{ width: `${module.progress.percent}%` }}/></div><p>{module.progress.points} / {module.progress.total} points · {module.progress.criteria.filter(item => item.state === 'done').length} livrés · {module.progress.criteria.filter(item => item.state === 'partial').length} partiels</p></div>
        <details className="progress-checklist"><summary>Voir les 6 critères et leurs preuves</summary><ul>{module.progress.criteria.map(item => <li key={item.id}><div><span>{item.label}</span><strong data-state={item.state}>{item.state === 'done' ? 'Livré · 1' : item.state === 'partial' ? 'Partiel · ½' : item.state === 'awaiting' ? 'Preuve en attente · 0' : 'Prévu · 0'}</strong></div>{item.evidence && <p>{item.evidence}</p>}</li>)}</ul><small>{module.progress.source}</small></details>
        <div className="scope-built"><strong>Disponible aujourd’hui</strong><p>{module.built}</p></div>
        <div className="scope-remaining"><strong>Reste à livrer</strong><ul>{module.remaining.map(item => <li key={item}>{item}</li>)}</ul></div>
        <details><summary>Condition d’acceptation & source</summary><p>{module.gate}</p><small>Guide maître, p. {module.sourcePage} · docs/04_MODULE_PRD.md. Le périmètre détaillé est prévu; sa livraison n’est pas acquise.</small></details>
        {module.links.length > 0 ? <TestLinks links={module.links}/> : <p className="no-module-test">Aucune fonctionnalité de ce module à tester pour le moment.</p>}
      </article>)}</div></section>;
    })}
    <p className="program-source">Priorités du guide : M03 couvre P0–P1, M20 P2–P3; ils sont regroupés ici à leur premier niveau. Le noyau Playbook est nécessaire plus tôt pour le pilote. Leurs numéros ne correspondent pas aux jalons de livraison.</p>
  </section>;
}
