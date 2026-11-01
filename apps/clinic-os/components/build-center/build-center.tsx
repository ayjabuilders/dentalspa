'use client';
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CalendarDays, Check, ExternalLink, Flag, GitPullRequest, LockKeyhole, ShieldCheck, Stethoscope, Users, WalletCards } from 'lucide-react';
import type { BuildStatusData, BuildTaskState } from './types';
import { ProductScope } from './product-scope';
import { TestLinks } from './test-links';
import { useBuildStatus } from './use-build-status';
import './build-center.css';

const stateCopy: Record<BuildTaskState, string> = { done: 'Slice livrée', active: 'En cours / vérification', blocked: 'Bloqué', queued: 'En file' };
type View = 'product' | 'infrastructure' | 'phases' | 'gates' | 'deliveries';

export function BuildCenter({ status: initialStatus }: { status: BuildStatusData }) {
  const { status, unavailable } = useBuildStatus(initialStatus);
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
    <details className="build-tour-disclosure"><summary>Visiter la démo locale <ArrowRight size={16}/></summary><LocalDemoTour/></details>
    <div className="build-views" role="group" aria-label="Explorer la construction">{views.map(item => <button key={item.id} aria-pressed={view === item.id} onClick={() => setView(item.id)}>{item.label}<span>{item.count}</span></button>)}</div>
    <p className={`build-sync ${unavailable ? 'unavailable' : ''}`} role="status">{unavailable ? 'Actualisation indisponible · dernier état conservé. ' : 'Actualisation automatique · '}{status.successfulAt ? <>Dernier build réussi : <time dateTime={status.successfulAt}>{new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'medium', timeZone: 'Africa/Casablanca' }).format(new Date(status.successfulAt))}</time> (Casablanca).</> : 'En attente de la confirmation du build réussi.'}</p>
    <div className="build-view" id="build-view">
      {view === 'gates' && <Decision/>}
      {view === 'product' && <ProductScope status={status}/>}
      {view === 'infrastructure' && <section aria-labelledby="infrastructure-title"><div className="build-section-heading"><div><p className="eyebrow muted">LE SOCLE TRANSVERSAL</p><h2 id="infrastructure-title">Infrastructure & exploitation</h2></div></div><p className="scope-explanation">Travail partagé par les modules. Chaque chantier conserve ses éléments construits et ses validations restantes.</p><div className="scope-grid">{status.infrastructure.map(item => <article className="scope-card" key={item.title}><h3>{item.title}</h3><div className="scope-built"><strong>Construit / documenté</strong><p>{item.built}</p></div><div className="scope-remaining"><strong>Reste à faire</strong><p>{item.remaining}</p></div><small className="scope-source">Source : {item.source}</small></article>)}</div></section>}
      {view === 'phases' && <section className="program-roadmap" aria-labelledby="program-title"><div className="build-section-heading"><div><p className="eyebrow muted">ORDRE DE CONSTRUCTION</p><h2 id="program-title">Les sept jalons de livraison</h2></div></div><p className="scope-explanation">Jalons du plan d’exécution (docs/12). Le PRD décrit séparément 21 modules. Les documents regroupent différemment certains parcours clinique/cas; le contrat de chaque slice fixera sa frontière avant développement.</p><div className="milestone-track">{status.milestones.map((milestone, index) => <article className={`milestone-card ${milestone.state}`} key={milestone.id}><div className="milestone-rail"><span>J{String(index + 1).padStart(2, '0')}</span>{index < status.milestones.length - 1 && <i/>}</div><div className="milestone-copy"><div className="milestone-title"><h3>{milestone.title}</h3><span>{milestone.state === 'foundation' ? 'Socle partiel · gates ouverts' : milestone.state === 'current' ? 'Partiellement construit' : 'À construire'}</span></div><p>{milestone.summary}</p><div className="milestone-unlock"><Flag size={16}/><span><strong>Condition de progression</strong>{milestone.unlock}</span></div>{milestone.modules && <div className="milestone-modules">{milestone.modules.map(module => <span key={module}>{module}</span>)}</div>}</div></article>)}</div><p className="program-source">J01–J07 correspondent aux jalons nommés M01–M07 dans docs/12_CODEX_EXECUTION.md. Ce préfixe évite de les confondre avec les modules M01–M21 du guide maître.</p></section>}
      {view === 'gates' && <section aria-labelledby="gates-title"><div className="build-section-heading"><div><p className="eyebrow muted">CE QUI AUTORISE L’ÉTAPE SUIVANTE</p><h2 id="gates-title">Développement & activation</h2></div></div><p className="scope-explanation">Une dépendance technique vérifiée permet de poursuivre les slices indépendantes. L’usage réel exige en plus les validations opérationnelles, cliniques et de confidentialité prévues par le projet.</p><div className="scope-grid">{status.releaseGates.map(gate => <article className="scope-card" key={gate.title}><header><LockKeyhole size={19}/><span className="scope-status planned">{gate.state}</span></header><h3>{gate.title}</h3><p>{gate.remaining}</p></article>)}</div><p className="program-source">Sources : qa/RELEASE_GATES.md · docs/11_TEST_PILOT_PLAN.md · ADR-003. Les tests d’une slice ne ferment pas automatiquement la gate de son module.</p></section>}
      {view === 'deliveries' && <DeliveryQueue status={status}/>}
    </div>
    <footer className="build-snapshot"><span>Critères revus le {status.progressReviewedAt} · file v{status.sourceVersion}.</span><span>Build réussi → instantané publié → actualisation toutes les 20 s lorsque cette page est visible. Les preuves déterminent les pourcentages.</span></footer>
  </section>;
}

function LocalDemoTour() {
  const [apps, setApps] = useState({ patientPass: 'http://localhost:4205/', publicBooking: 'http://localhost:4202/' });
  useEffect(() => {
    const origin = `${window.location.protocol}//${window.location.hostname}`;
    setApps({ patientPass: `${origin}:4205/`, publicBooking: `${origin}:4202/` });
  }, []);
  return <section className="local-demo-tour" aria-labelledby="local-demo-tour-title">
    <div className="build-section-heading"><div><p className="eyebrow muted">PARCOURS CLIENT · DONNÉES FICTIVES</p><h2 id="local-demo-tour-title">Visiter la démo locale</h2></div><span>7 étapes · 5 minutes</span></div>
    <p className="local-demo-tour-intro">Commencez par les fonctions reliées à Supabase local, puis explorez les aperçus. Les noms sont fictifs; aucune action clinique, demande externe ou réservation n’est exécutée.</p>
    <ol className="local-demo-tour-grid">
      <li className="local-demo-tour-step connected"><span className="demo-tour-step-number">01</span><span className="demo-tour-kind">Écriture locale persistée</span><h3>Demandes & échéances</h3><p>Connectez-vous avec un compte `.test`, choisissez Atlas ou Sourire, puis créez une demande fictive, planifiez une intention et transférez son responsable.</p><a href="/connection">Ouvrir Clinic OS connecté<ArrowRight size={16}/></a></li>
      <li className="local-demo-tour-step connected"><span className="demo-tour-step-number">02</span><span className="demo-tour-kind">Dossiers du cabinet · base locale</span><h3>Répertoire patient</h3><p>Recherchez un profil fictif puis consultez ses rendez-vous, documents et rubriques financières selon vos droits.</p><a href="/connection?view=patients">Ouvrir le répertoire<ArrowRight size={16}/></a></li>
      <li className="local-demo-tour-step connected"><span className="demo-tour-step-number">03</span><span className="demo-tour-kind">Rendez-vous enregistrés localement</span><h3>Planning</h3><p>Ouvrez le calendrier du cabinet, consultez une visite et testez son déplacement ou son annulation sur des données fictives.</p><a href="/connection?view=planning"><CalendarDays size={16}/>Explorer le planning<ArrowRight size={16}/></a></li>
      <li className="local-demo-tour-step connected"><span className="demo-tour-step-number">04</span><span className="demo-tour-kind">Demande locale · résultat du serveur</span><h3>Public Booking</h3><p>Choisissez une prestation et un créneau, vérifiez vos coordonnées de test puis envoyez la demande. Le résultat indique si elle attend le cabinet ou si elle est confirmée.</p><a href={apps.publicBooking} target="_blank" rel="noreferrer">Ouvrir Public Booking<ExternalLink size={15}/></a></li>
      <li className="local-demo-tour-step preview"><span className="demo-tour-step-number">05</span><span className="demo-tour-kind">Aperçu sans dossier clinique</span><h3>Consultations</h3><p>Parcourez l’espace de démonstration; aucune note, image, signature, instruction ou publication clinique n’est enregistrée.</p><a href="/clinical"><Stethoscope size={16}/>Voir Consultations<ArrowRight size={16}/></a></li>
      <li className="local-demo-tour-step preview"><span className="demo-tour-step-number">06</span><span className="demo-tour-kind">Calcul fictif · aucun paiement</span><h3>Finance</h3><p>Suivez les huit étapes de calcul en MAD, les reprises et écarts. Aucun tarif approuvé, facture, reçu comptable ou paiement réel.</p><a href="/business"><WalletCards size={16}/>Voir le parcours financier<ArrowRight size={16}/></a></li>
      <li className="local-demo-tour-step preview"><span className="demo-tour-step-number">07</span><span className="demo-tour-kind">Aperçu mobile · profils fictifs</span><h3>Patient Pass</h3><p>Découvrez la présentation patient sur son application locale. Elle n’est pas reliée au compte staff ni à un dossier réel.</p><a href={apps.patientPass} target="_blank" rel="noreferrer"><Users size={16}/>Ouvrir Patient Pass<ExternalLink size={15}/></a></li>
    </ol>
    <p className="local-demo-tour-note"><ShieldCheck size={16}/>Les étapes 01–04 utilisent la base locale. Les consultations et le parcours financier présentés ici restent des simulations. Utilisez exclusivement les comptes et profils fictifs de la démo.</p>
  </section>;
}

function Decision() {
  return <section className="decision-callout" aria-labelledby="decision-title"><LockKeyhole/><div><p className="eyebrow">D1 APPROUVÉ · D2–D8 ET REVUE EN ATTENTE</p><h2 id="decision-title">Un résultat enregistré reste un « possible match ».</h2><p>Vous avez choisi d’autoriser uniquement l’étiquette <strong>« possible match — identité non vérifiée »</strong>. Elle décrit une piste, pas une identité confirmée.</p><p>Cette décision seule n’autorise pas à relier un vrai dossier patient. Les décisions D2–D8 et la revue d’identité et de confidentialité restent requises avant toute liaison réelle. <strong>La démonstration locale avec des profils fictifs continue.</strong></p></div><a className="decision-link" href="https://github.com/ayjabuilders/dentalspa/blob/main/docs/PATIENT_SELECTION_DECISION_PACKET.md" target="_blank" rel="noreferrer">Relire le dossier D1–D8<ArrowRight size={17}/></a></section>;
}

function DeliveryQueue({ status }: { status: BuildStatusData }) {
  const [filter, setFilter] = useState<'all' | BuildTaskState>('all');
  const visible = useMemo(() => status.tasks.filter(task => filter === 'all' || task.state === filter), [filter, status.tasks]);
  const phases = [...new Set(visible.map(task => task.phase))];
  return <section className="delivery-queue"><div className="build-section-heading"><div><p className="eyebrow muted">TRAVAIL DÉCOUPÉ ET VÉRIFIÉ</p><h2>Journal des slices livrées</h2></div><span>Source · file de livraison v{status.sourceVersion}</span></div><p className="scope-explanation">{status.counts.done} slices terminées sur {status.tasks.length} tâches actuellement découpées. Les futurs modules ne sont pas encore détaillés dans cette file.</p><div className="build-filters" role="group" aria-label="Filtrer les livraisons">{(['all', 'done', 'active', 'blocked', 'queued'] as const).map(value => <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{value === 'all' ? 'Tout voir' : stateCopy[value]}<span>{value === 'all' ? status.tasks.length : status.counts[value]}</span></button>)}</div><div className="phase-list">{phases.map(phase => <section className="phase-card" key={phase}><header><h3>{phase}</h3></header><ol>{visible.filter(task => task.phase === phase).map(task => <li key={task.id} className={`build-task ${task.state}`}><span className="task-marker">{task.state === 'done' ? <Check size={15}/> : <LockKeyhole size={14}/>}</span><div className="task-main"><div className="task-title"><h4>{task.label}</h4><span className={`task-status ${task.state}`}>{stateCopy[task.state]}</span></div><p>{task.acceptance}</p>{task.blocker && <div className="task-blocker"><LockKeyhole size={14}/><span><strong>Pourquoi c’est bloqué</strong>{task.blocker}</span></div>}{task.nextAction && task.state === 'blocked' && <p><strong>Pour continuer :</strong> {task.nextAction}</p>}<TestLinks links={task.links}/><details><summary>Preuves techniques & dépendances</summary><div className="task-evidence"><p>{task.evidence ?? 'Preuve détaillée à consulter dans le journal d’intégration de cette slice.'}</p>{task.dependencies.length > 0 && <p>Dépend de : {task.dependencies.join(' · ')}</p>}<div className="pr-links">{task.pullRequests.map(pr => <a key={pr.number} href={pr.url} target="_blank" rel="noreferrer"><GitPullRequest size={14}/>PR #{pr.number}</a>)}</div></div></details></div></li>)}</ol></section>)}</div>{visible.length === 0 && <p className="scope-explanation" role="status">Aucune slice dans cet état. Les travaux futurs restent visibles dans « Produit complet ».</p>}</section>;
}
