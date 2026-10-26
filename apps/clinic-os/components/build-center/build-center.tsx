'use client';
import { useMemo, useState } from 'react';
import { ArrowRight, Check, Flag, GitPullRequest, LockKeyhole, ShieldCheck } from 'lucide-react';
import type { BuildStatusData, BuildTaskState } from './types';
import { ProductScope } from './product-scope';
import { TestLinks } from './test-links';
import './build-center.css';

const stateCopy: Record<BuildTaskState, string> = { done: 'Slice livrée', active: 'En cours / vérification', blocked: 'Bloqué', queued: 'En file' };
type View = 'product' | 'infrastructure' | 'phases' | 'gates' | 'deliveries';

export function BuildCenter({ status }: { status: BuildStatusData }) {
  const [view, setView] = useState<View>('product');
  const partial = status.productModules.filter(module => module.state === 'partial').length;
  const previews = status.productModules.filter(module => module.state === 'preview').length;
  const planned = status.productModules.filter(module => module.state === 'planned').length;
  const views: { id: View; label: string; count: number }[] = [
    { id: 'product', label: 'Produit complet', count: status.productModules.length },
    { id: 'infrastructure', label: 'Infrastructure', count: status.infrastructure.length },
    { id: 'phases', label: 'Phases de livraison', count: status.milestones.length },
    { id: 'gates', label: 'Gates & validations', count: status.releaseGates.length },
    { id: 'deliveries', label: 'Journal des slices', count: status.tasks.length },
  ];
  return <section className="build-center" aria-labelledby="build-title">
    <header className="build-hero"><div className="build-hero-copy"><p className="eyebrow">DENTAL SPA · LA VISION COMPLÈTE</p><h1 id="build-title">Le produit à construire.<br/>Le chemin déjà parcouru.</h1><p>Nous sommes au début : le socle technique et quelques fonctions de demandes et de planification sont construits. La majorité du produit décrit dans le PRD reste à livrer.</p><div className="build-truth"><ShieldCheck size={18}/><span>Développement synthétique · aucun module accepté pour un usage réel</span></div></div><aside className="build-position"><span>CYCLE ACTUEL</span><strong>Fondation<br/>→ demandes & agenda</strong><p>Pas de pourcentage global : les modules n’ont ni le même poids ni un effort total estimé.</p></aside></header>
    <div className="build-summary" aria-label="Couverture du produit complet">
      <article><div><strong>{status.productModules.length}</strong><span>modules dans le PRD</span></div></article>
      <article><div><strong>{partial}</strong><span>avec fonctions partielles</span></div></article>
      <article><div><strong>{previews}</strong><span>avec aperçu UI seulement</span></div></article>
      <article><div><strong>{planned}</strong><span>à construire</span></div></article>
    </div>
    <p className="scope-explanation">Les {status.counts.done} tâches terminées appartiennent à une petite file de travail technique. Elles ne mesurent pas l’achèvement des {status.productModules.length} modules. Une page dessinée ne signifie pas que son fonctionnement métier est livré.</p>
    <div className="build-views" role="group" aria-label="Explorer la construction">{views.map(item => <button key={item.id} aria-pressed={view === item.id} onClick={() => setView(item.id)}>{item.label}<span>{item.count}</span></button>)}</div>
    <div className="build-view" id="build-view">
      {view === 'product' && <ProductScope status={status}/>}
      {view === 'infrastructure' && <section aria-labelledby="infrastructure-title"><div className="build-section-heading"><div><p className="eyebrow muted">LE SOCLE TRANSVERSAL</p><h2 id="infrastructure-title">Infrastructure & exploitation</h2></div></div><p className="scope-explanation">Travail partagé par les modules. Chaque chantier conserve ses éléments construits et ses validations restantes.</p><div className="scope-grid">{status.infrastructure.map(item => <article className="scope-card" key={item.title}><h3>{item.title}</h3><div className="scope-built"><strong>Construit / documenté</strong><p>{item.built}</p></div><div className="scope-remaining"><strong>Reste à faire</strong><p>{item.remaining}</p></div><small className="scope-source">Source : {item.source}</small></article>)}</div></section>}
      {view === 'phases' && <section className="program-roadmap" aria-labelledby="program-title"><div className="build-section-heading"><div><p className="eyebrow muted">ORDRE DE CONSTRUCTION</p><h2 id="program-title">Les sept jalons de livraison</h2></div></div><p className="scope-explanation">Jalons du plan d’exécution (docs/12). Le PRD décrit séparément 21 modules. Les documents regroupent différemment certains parcours clinique/cas; le contrat de chaque slice fixera sa frontière avant développement.</p><div className="milestone-track">{status.milestones.map((milestone, index) => <article className={`milestone-card ${milestone.state}`} key={milestone.id}><div className="milestone-rail"><span>J{String(index + 1).padStart(2, '0')}</span>{index < status.milestones.length - 1 && <i/>}</div><div className="milestone-copy"><div className="milestone-title"><h3>{milestone.title}</h3><span>{milestone.state === 'foundation' ? 'Socle partiel · gates ouverts' : milestone.state === 'current' ? 'Partiellement construit' : 'À construire'}</span></div><p>{milestone.summary}</p><div className="milestone-unlock"><Flag size={16}/><span><strong>Condition de progression</strong>{milestone.unlock}</span></div>{milestone.modules && <div className="milestone-modules">{milestone.modules.map(module => <span key={module}>{module}</span>)}</div>}</div></article>)}</div><p className="program-source">J01–J07 correspondent aux jalons nommés M01–M07 dans docs/12_CODEX_EXECUTION.md. Ce préfixe évite de les confondre avec les modules M01–M21 du guide maître.</p></section>}
      {view === 'gates' && <section aria-labelledby="gates-title"><div className="build-section-heading"><div><p className="eyebrow muted">CE QUI AUTORISE L’ÉTAPE SUIVANTE</p><h2 id="gates-title">Développement & activation</h2></div></div><p className="scope-explanation">Une dépendance technique vérifiée permet de poursuivre les slices indépendantes. L’usage réel exige en plus les validations opérationnelles, cliniques et de confidentialité prévues par le projet.</p><div className="scope-grid">{status.releaseGates.map(gate => <article className="scope-card" key={gate.title}><header><LockKeyhole size={19}/><span className="scope-status planned">{gate.state}</span></header><h3>{gate.title}</h3><p>{gate.remaining}</p></article>)}</div><p className="program-source">Sources : qa/RELEASE_GATES.md · docs/11_TEST_PILOT_PLAN.md · ADR-003. Les tests d’une slice ne ferment pas automatiquement la gate de son module.</p><Decision/></section>}
      {view === 'deliveries' && <DeliveryQueue status={status}/>}
    </div>
    <footer className="build-snapshot"><span>État du périmètre revu le 26 octobre 2026.</span><span>File v{status.sourceVersion} · instantané généré le {status.snapshotAt.slice(0, 10)} à {status.snapshotAt.slice(11, 16)} UTC. Actualisé au prochain build.</span></footer>
  </section>;
}

function Decision() {
  return <section className="decision-callout" aria-labelledby="decision-title"><LockKeyhole/><div><p className="eyebrow">DÉCISION QUI DÉBLOQUE LA SUITE</p><h2 id="decision-title">Valider les règles de sélection patient</h2><p>La recherche est en lecture seule. Huit choix D1–D8 attendent l’approbation du cabinet avant l’association à une demande et la suite de la réservation.</p></div><a className="decision-link" href="https://github.com/ayjabuilders/dentalspa/blob/main/docs/PATIENT_SELECTION_DECISION_PACKET.md" target="_blank" rel="noreferrer">Lire les décisions<ArrowRight size={17}/></a></section>;
}

function DeliveryQueue({ status }: { status: BuildStatusData }) {
  const [filter, setFilter] = useState<'all' | BuildTaskState>('all');
  const visible = useMemo(() => status.tasks.filter(task => filter === 'all' || task.state === filter), [filter, status.tasks]);
  const phases = [...new Set(visible.map(task => task.phase))];
  return <section className="delivery-queue"><div className="build-section-heading"><div><p className="eyebrow muted">TRAVAIL DÉCOUPÉ ET VÉRIFIÉ</p><h2>Journal des slices livrées</h2></div><span>Source · file de livraison v{status.sourceVersion}</span></div><p className="scope-explanation">{status.counts.done} slices terminées sur {status.tasks.length} tâches actuellement découpées. Les futurs modules ne sont pas encore détaillés dans cette file.</p><div className="build-filters" role="group" aria-label="Filtrer les livraisons">{(['all', 'done', 'active', 'blocked', 'queued'] as const).map(value => <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{value === 'all' ? 'Tout voir' : stateCopy[value]}<span>{value === 'all' ? status.tasks.length : status.counts[value]}</span></button>)}</div><div className="phase-list">{phases.map(phase => <section className="phase-card" key={phase}><header><h3>{phase}</h3></header><ol>{visible.filter(task => task.phase === phase).map(task => <li key={task.id} className={`build-task ${task.state}`}><span className="task-marker">{task.state === 'done' ? <Check size={15}/> : <LockKeyhole size={14}/>}</span><div className="task-main"><div className="task-title"><h4>{task.label}</h4><span className={`task-status ${task.state}`}>{stateCopy[task.state]}</span></div><p>{task.acceptance}</p>{task.blocker && <div className="task-blocker"><LockKeyhole size={14}/><span><strong>Pourquoi c’est bloqué</strong>{task.blocker}</span></div>}{task.nextAction && task.state === 'blocked' && <p><strong>Pour continuer :</strong> {task.nextAction}</p>}<TestLinks links={task.links}/><details><summary>Preuves techniques & dépendances</summary><div className="task-evidence"><p>{task.evidence ?? 'Preuve détaillée à consulter dans le journal d’intégration de cette slice.'}</p>{task.dependencies.length > 0 && <p>Dépend de : {task.dependencies.join(' · ')}</p>}<div className="pr-links">{task.pullRequests.map(pr => <a key={pr.number} href={pr.url} target="_blank" rel="noreferrer"><GitPullRequest size={14}/>PR #{pr.number}</a>)}</div></div></details></div></li>)}</ol></section>)}</div>{visible.length === 0 && <p className="scope-explanation" role="status">Aucune slice dans cet état. Les travaux futurs restent visibles dans « Produit complet ».</p>}<Decision/></section>;
}
