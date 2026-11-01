'use client';
import Link from 'next/link';
import { Activity, ArrowRight, CalendarDays, Inbox, Sparkles, Users, WalletCards } from 'lucide-react';
import { Button, PulseOrb } from '@dental/ui-clinic';
import { patients, workspaces } from '../fixtures';
import type { CSSProperties } from 'react';
import { developmentToolsVisible } from '../../lib/development-tools';

const shortcuts = [
  {href:'/connection?view=intake', title:'Voir les demandes', detail:'Prendre en charge un premier contact', icon:Inbox},
  {href:'/connection?view=planning', title:'Ouvrir l’agenda', detail:'Consulter les rendez-vous enregistrés', icon:CalendarDays},
  {href:'/connection?view=patients', title:'Ouvrir les patients', detail:'Retrouver un dossier du cabinet', icon:Users},
  {href:'/connection?view=finance-catalog', title:'Catalogue tarifaire', detail:'Gérer les prestations du cabinet', icon:WalletCards},
];

export function PreviewHome({onPulse}:{onPulse:()=>void}) {
  return <div className="preview-home">
    <section className="preview-welcome" aria-labelledby="home-title">
      <div><span className="preview-kicker">DENTAL SPA · VOTRE ESPACE DE TRAVAIL</span><h1 id="home-title">Une belle journée<br/>commence ici.</h1><p>Retrouvez le cabinet et poursuivez le parcours de vos patients.</p><Button asChild variant="primary"><Link href="/connection?view=planning">Entrer dans le cabinet<ArrowRight size={17}/></Link></Button><small>Session sécurisée · accès selon votre rôle</small></div>
      <div className="preview-welcome-art" role="img" aria-label="Scène illustrative de soins dentaires"><span>Le soin commence<br/>par l’attention.</span></div>
    </section>
    <section className="preview-shortcuts" aria-labelledby="home-actions-title"><div className="preview-section-title"><h2 id="home-actions-title">Accès au cabinet</h2><span>Vos outils connectés</span></div><div className="preview-shortcut-grid">{shortcuts.map(item=><Link href={item.href} key={item.href}><span className="preview-shortcut-icon"><item.icon size={21}/></span><span><strong>{item.title}</strong><small>{item.detail}</small></span><ArrowRight size={17}/></Link>)}</div></section>
    <section className="workspace-section" aria-labelledby="home-workspaces-title">
      <div className="preview-section-title"><div><span className="preview-kicker">UNE EXPÉRIENCE À EXPLORER</span><h2 id="home-workspaces-title">Vos espaces de travail</h2></div>{developmentToolsVisible && <Link href="/build">Voir la progression<ArrowRight size={15}/></Link>}</div>
      <div className="workspace-grid">{workspaces.map((item,index) => {
        const content = <><div className="photo-frame"><img src={`/assets/${item.image}.webp`} width="512" height="512" alt="" style={{objectPosition:item.id==='patients'?'60% 32%':'center'}}/><span className="card-number">0{index+1}</span>{!item.available&&<span className="workspace-status-badge">À venir</span>}</div><div className="photo-info"><span className="workspace-icon">{index===0?<Users size={21}/>:index===1?<Activity size={21}/>:<Sparkles size={21}/>}</span><h3>{item.title}</h3><p>{item.description}</p><div className="photo-footer"><small>{item.id==='patients'?'Dossiers du cabinet':item.available?'Démonstration locale':'À venir'}</small>{(item.available || developmentToolsVisible) && <ArrowRight size={16}/>}</div></div></>;
        const style = {'--accent':item.accent} as CSSProperties;
        return item.available || developmentToolsVisible
          ? <Link key={item.id} href={item.available?`/${item.id}`:'/build'} className="photo-card" style={style}>{content}</Link>
          : <article key={item.id} className="photo-card" style={style}>{content}</article>;
      })}</div>
    </section>
    {developmentToolsVisible && <div className="preview-explore-grid"><section className="work-panel preview-scenarios"><div className="preview-section-title"><div><span className="preview-kicker">DÉMONSTRATION · PROFILS FICTIFS</span><h2>Explorer un parcours patient</h2></div><Link href="/patients?preview=1">Tous les exemples<ArrowRight size={15}/></Link></div><div className="preview-scenario-list">{patients.map(patient=><Link key={patient.id} href={`/patients/${patient.id}`}><img src={`/assets/portrait-${patient.image}.webp`} width="40" height="40" alt=""/><span><strong>{patient.name}</strong><small>Fiche illustrative · {patient.id}</small></span><ArrowRight size={16}/></Link>)}</div><p className="panel-note">Ces exemples sont indépendants des dossiers enregistrés du cabinet.</p></section><section className="preview-pulse"><PulseOrb/><span className="preview-kicker">AI PULSE · PRÉSENTATION</span><h2>Un temps d’avance.<br/>L’esprit plus libre.</h2><p>Découvrez la place de votre futur assistant dans le cabinet.</p><Button onClick={onPulse}>Découvrir AI Pulse<ArrowRight size={17}/></Button><small>Aucune IA ni capture audio active.</small></section></div>}
  </div>;
}
