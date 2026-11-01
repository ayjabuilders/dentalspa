'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, FileText, Image, LockKeyhole, Search, ShieldCheck, UserRound } from 'lucide-react';
import { patientDirectory } from '../fixtures';
import './clinical-demo.css';

const scenarios = [
  { patientId: 'DEMO-001', summary: 'Souhaite discuter des options disponibles au cabinet.', visit: 'Visite illustrative A' },
  { patientId: 'DEMO-002', summary: 'Demande des informations sur le déroulement du rendez-vous.', visit: 'Visite illustrative B' },
  { patientId: 'DEMO-003', summary: 'Souhaite échanger avec le cabinet avant toute prochaine étape.', visit: 'Visite illustrative C' },
] as const;

type ClinicalTab = 'context' | 'note' | 'media' | 'plan';

const tabs: { id: ClinicalTab; label: string }[] = [
  { id: 'context', label: 'Contexte' },
  { id: 'note', label: 'Note' },
  { id: 'media', label: 'Images' },
  { id: 'plan', label: 'Plan & consentement' },
];

export function ClinicalDemoWorkspace() {
  const [patientId, setPatientId] = useState<(typeof scenarios)[number]['patientId']>(scenarios[0].patientId);
  const [activeTab, setActiveTab] = useState<ClinicalTab>('context');
  const [draftOpen, setDraftOpen] = useState(false);
  const [query, setQuery] = useState('');
  const patient = patientDirectory.find(item => item.id === patientId)!;
  const scenario = scenarios.find(item => item.patientId === patientId)!;
  const patientIndex = scenarios.findIndex(item => item.patientId === patientId);
  const visibleScenarios = scenarios.filter(item => {
    const profile = patientDirectory.find(person => person.id === item.patientId)!;
    return `${profile.name} ${profile.id}`.toLocaleLowerCase('fr').includes(query.trim().toLocaleLowerCase('fr'));
  });

  function choosePatient(id: string) {
    if (!scenarios.some(item => item.patientId === id)) return;
    setPatientId(id as (typeof scenarios)[number]['patientId']);
    setActiveTab('context');
    setDraftOpen(false);
  }

  return <div className="clinical-demo">
    <header className="clinical-demo-heading">
      <div>
        <p className="eyebrow muted">ESPACE CLINIQUE · APERÇU</p>
        <h1>Consultations</h1>
        <p>Parcours d’interface fictif pour préparer la future note du clinicien.</p>
      </div>
      <span className="clinical-demo-pill"><LockKeyhole size={14} aria-hidden="true"/>Aucun dossier clinique</span>
    </header>

    <div className="clinical-demo-notice" role="note">
      <ShieldCheck size={18} aria-hidden="true" />
      <p><strong>Démo locale avec profils fictifs</strong><span>Aucun contenu clinique n’est créé, signé, publié ou enregistré. N’entrez pas de données réelles.</span></p>
    </div>

    <section className="clinical-demo-layout" aria-label="Aperçu du parcours de consultation">
      <aside className="clinical-demo-queue" aria-label="Scénarios de consultation fictifs">
        <div className="clinical-demo-mobile-picker">
          <label htmlFor="clinical-demo-scenario">Choisir une visite fictive</label>
          <select id="clinical-demo-scenario" value={patientId} onChange={event => choosePatient(event.target.value)}>
            {scenarios.map(item => {
              const listedPatient = patientDirectory.find(profile => profile.id === item.patientId)!;
              return <option key={item.patientId} value={item.patientId}>{listedPatient.name} · {item.visit}</option>;
            })}
          </select>
        </div>
        <div className="clinical-demo-queue-heading"><div><h2>Visites fictives</h2><p className="clinical-demo-list-caption">Choisissez un profil à explorer</p></div><span>{scenarios.length}</span></div>
        <label className="clinical-demo-search"><Search size={16} aria-hidden="true"/><input aria-label="Rechercher une visite fictive" placeholder="Rechercher un profil…" value={query} onChange={event => setQuery(event.target.value)}/></label>
        <div className="clinical-demo-queue-results">{visibleScenarios.map(item => {
          const listedPatient = patientDirectory.find(profile => profile.id === item.patientId)!;
          return <button key={item.patientId} type="button" className="clinical-demo-queue-item" aria-pressed={patientId === item.patientId} onClick={() => choosePatient(item.patientId)}>
            <span className="clinical-demo-avatar" aria-hidden="true">{listedPatient.initials}</span>
            <span><strong>{listedPatient.name}</strong><small>{item.visit} · FICTIF</small></span>
          </button>;
        })}{visibleScenarios.length === 0 && <p className="clinical-demo-no-results" role="status">Aucun profil trouvé. Essayez un autre nom.</p>}</div>
        <p className="clinical-demo-queue-footnote">Aucune visite réelle, attribution ou présence n’est représentée.</p>
      </aside>

      <article className="clinical-demo-encounter">
        <div className="clinical-demo-detail-toolbar"><span>Profil {patientIndex + 1} / {scenarios.length}</span><div><button type="button" aria-label="Profil précédent" disabled={patientIndex === 0} onClick={() => choosePatient(scenarios[patientIndex - 1]!.patientId)}><ArrowLeft size={17}/></button><button type="button" aria-label="Profil suivant" disabled={patientIndex === scenarios.length - 1} onClick={() => choosePatient(scenarios[patientIndex + 1]!.patientId)}><ArrowRight size={17}/></button><Link href={`/patients/${patient.id}`}><UserRound size={15}/>Fiche fictive</Link></div></div>
        <div className="clinical-demo-patient">
          <span className="clinical-demo-avatar clinical-demo-profile-avatar" aria-hidden="true">{patient.initials}</span><div><p className="eyebrow muted">PATIENT DE DÉMONSTRATION</p><h2>{patient.name}</h2><p>{patient.id} · {scenario.visit} · non confirmé</p></div>
          <span className="clinical-demo-state">Aperçu non démarré</span>
        </div>

        <nav className="clinical-demo-tabs" aria-label="Sections de consultation">
          {tabs.map(tab => <button key={tab.id} type="button" aria-current={activeTab === tab.id ? 'page' : undefined} onClick={() => setActiveTab(tab.id)}>{tab.label}</button>)}
        </nav>

        {activeTab === 'context' && <section className="clinical-demo-tab-panel" aria-label="Contexte de démonstration">
          <div className="clinical-demo-context-card"><span>Demande administrative fictive</span><p>{scenario.summary}</p></div>
          <div className="clinical-demo-boundary-grid">
            <div><span>Contexte patient</span><strong>Déclaré · exemple seulement</strong></div>
            <div><span>Référence de visite</span><strong>{scenario.visit} · non confirmée</strong></div>
          </div>
          {!draftOpen ? <button type="button" className="clinical-demo-primary" onClick={() => { setDraftOpen(true); setActiveTab('note'); }}>Ouvrir le brouillon fictif</button> : <p className="clinical-demo-draft-status" role="status">Brouillon de démonstration ouvert en mémoire · non signé</p>}
          <div className="clinical-demo-context-actions"><button type="button" aria-label="Explorer les pièces jointes" onClick={() => setActiveTab('media')}><Image size={20}/><span><strong>Images</strong><small>Explorer l’espace documentaire</small></span><ArrowRight size={16}/></button><button type="button" aria-label="Consulter l’état du consentement" onClick={() => setActiveTab('plan')}><ShieldCheck size={20}/><span><strong>Plan & consentement</strong><small>Consulter l’état de l’aperçu</small></span><ArrowRight size={16}/></button></div>
        </section>}

        {activeTab === 'note' && <section className="clinical-demo-tab-panel clinical-demo-empty" aria-label="Note clinique de démonstration">
          <FileText size={22} aria-hidden="true" />
          <h3>{draftOpen ? 'Brouillon fictif · non signé' : 'Aucune note clinique'}</h3>
          <p>Les constatations, décisions et instructions restent absentes de cette démo. Seul un clinicien autorisé peut créer et signer une note dans un parcours approuvé.</p>
          {draftOpen && <button type="button" className="clinical-demo-secondary" onClick={() => setDraftOpen(false)}>Fermer le brouillon fictif</button>}
        </section>}

        {activeTab === 'media' && <section className="clinical-demo-tab-panel clinical-demo-empty" aria-label="Images de démonstration">
          <Image size={22} aria-hidden="true" /><h3>Aucune image liée</h3><p>Aucune photo, radiographie, pièce jointe ou référence externe n’est présente dans ce scénario.</p>
        </section>}

        {activeTab === 'plan' && <section className="clinical-demo-tab-panel clinical-demo-empty" aria-label="Plan et consentement de démonstration">
          <ShieldCheck size={22} aria-hidden="true" /><h3>Aucun plan ou consentement</h3><p>Aucune décision de traitement, approbation clinique ou instruction patient n’est proposée ni simulée.</p>
        </section>}
      </article>
    </section>
    <p className="clinical-demo-footer">Aucun état clinique réel n’est modifié. Le brouillon disparaît au changement de profil ou au rechargement; aucune requête API ni écriture navigateur n’est effectuée.</p>
  </div>;
}
