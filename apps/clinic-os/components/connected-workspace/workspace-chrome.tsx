'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ChevronDown, Command, LogOut, PanelLeftClose, PanelLeftOpen, Search, Settings2, Building2, LayoutGrid, type LucideIcon } from 'lucide-react';
import { Modal } from '@dental/ui-clinic';
import { Button, Switch } from '@dental/ui-clinic/pearl';
import './workspace-chrome.css';

export type WorkspaceModule = { id:string; label:string; description:string; icon:LucideIcon; group:'Activité'|'Cabinet' };
type NavigationProps = { modules:WorkspaceModule[]; current:string; locked:boolean; onNavigate:(id:string)=>void };

export function WorkspaceNavigation({modules,current,locked,onNavigate,expanded,onExpanded}:NavigationProps&{expanded:boolean;onExpanded:()=>void}) {
  const [moreOpen,setMoreOpen]=useState(false);
  const moreTrigger=useRef<HTMLButtonElement>(null);
  const primary=['patients','planning','intake'].flatMap(id=>modules.filter(item=>item.id===id));
  const isSecondary=!primary.some(item=>item.id===current);
  return <><nav className="workspace-rail" aria-label="Modules du cabinet">
    <a className="workspace-rail-brand" href={locked?undefined:'/'} aria-disabled={locked} tabIndex={locked?-1:0} aria-label="Dental Spa — accueil" title="Accueil et démonstrations"><img src="/assets/favicon.svg" width="30" height="34" alt=""/><span>Dental Spa<span>ESPACE CABINET</span></span></a>
    <button type="button" className="workspace-rail-toggle" aria-label={expanded?'Réduire le menu':'Développer le menu'} aria-expanded={expanded} onClick={onExpanded}>{expanded?<PanelLeftClose size={19}/>:<PanelLeftOpen size={19}/>}<span>{expanded?'Réduire':'Menu'}</span></button>
    {(['Activité','Cabinet'] as const).map(group=><div className="workspace-rail-group" key={group}><p>{group}</p>{modules.filter(item=>item.group===group).map(item=><button type="button" key={item.id} aria-label={item.label} title={item.label} aria-current={current===item.id?'page':undefined} disabled={locked} onClick={()=>onNavigate(item.id)}><item.icon size={20}/><span>{item.label}</span><span className="workspace-rail-tip" aria-hidden="true">{item.label}</span></button>)}</div>)}
    <div className="workspace-rail-foot"><span>DS</span><small>Données fictives<br/>Espace local</small></div>
  </nav>
  <nav className="workspace-mobile-nav" aria-label="Modules du cabinet">
    {primary.map(item=><button key={item.id} type="button" aria-current={current===item.id?'page':undefined} disabled={locked} onClick={()=>onNavigate(item.id)}><item.icon size={21}/><span>{item.label}</span></button>)}
    <button ref={moreTrigger} type="button" disabled={locked} aria-label="Tous les espaces du cabinet" aria-haspopup="dialog" aria-expanded={moreOpen} aria-current={isSecondary?'page':undefined} onClick={()=>setMoreOpen(true)}><LayoutGrid size={21}/><span>Plus</span></button>
  </nav>
  <Modal open={moreOpen} onOpenChange={setMoreOpen} title="Espaces du cabinet" description="Vos outils, selon votre rôle." returnFocus={moreTrigger.current} mobilePresentation="sheet" className="workspace-dialog workspace-mobile-spaces">
    <div className="workspace-module-results">{modules.map(item=><button key={item.id} type="button" disabled={locked} aria-current={current===item.id?'page':undefined} onClick={()=>{setMoreOpen(false);onNavigate(item.id);}}><span><item.icon size={21}/></span><div><strong>{item.label}</strong><small>{item.description}</small></div><ArrowRight size={17}/></button>)}</div>
  </Modal></>;
}

export function WorkspaceTopbar({modules,current,locked,onNavigate,clinicName,roles,onChangeClinic,onDisconnect,canChangeClinic,backLabel,forwardLabel,onBack,onForward,compact,onCompact,motion,onMotion}:NavigationProps&{
  clinicName:string;roles:string;onChangeClinic:()=>void;onDisconnect:()=>void;canChangeClinic:boolean;
  backLabel?:string;forwardLabel?:string;onBack:()=>void;onForward:()=>void;
  compact:boolean;onCompact:(value:boolean)=>void;motion:boolean;onMotion:(value:boolean)=>void;
}) {
  const [panel,setPanel]=useState<'modules'|'account'|'preferences'|null>(null);
  const [query,setQuery]=useState('');
  const opener=useRef<HTMLElement|null>(null);
  function open(value:NonNullable<typeof panel>){opener.current=document.activeElement as HTMLElement;setQuery('');setPanel(value);}
  useEffect(()=>{
    const key=(event:KeyboardEvent)=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'&&!locked){event.preventDefault();opener.current=document.activeElement as HTMLElement;setQuery('');setPanel('modules');}};
    window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);
  },[locked]);
  const filtered=modules.filter(item=>(item.label+' '+item.description).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(query.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()));
  return <>
    <header className="workspace-topbar" data-mobile-root={['patients','planning','intake'].includes(current)}>
      <span className="workspace-mobile-brand">Dental Spa<small>ESPACE CABINET</small></span>
      <nav className="workspace-breadcrumb" aria-label="Parcours entre modules"><button type="button" aria-label="Précédent" title={backLabel?'Retour à '+backLabel:undefined} disabled={locked||!backLabel} onClick={onBack}><ArrowLeft size={18}/></button><button type="button" aria-label="Suivant" title={forwardLabel?'Revenir à '+forwardLabel:undefined} disabled={locked||!forwardLabel} onClick={onForward}><ArrowRight size={18}/></button><span>Cabinet <span aria-hidden="true">/</span> <strong aria-current="page">{modules.find(item=>item.id===current)?.label}</strong></span></nav>
      <div className="workspace-topbar-tools"><button type="button" className="workspace-switcher" disabled={locked} onClick={()=>open('modules')} aria-label="Accès rapide aux modules"><Search size={17}/><span>Aller à…</span><kbd>Ctrl K</kbd></button><button type="button" className="workspace-tool" aria-label="Préférences de présentation" onClick={()=>open('preferences')}><Settings2 size={18}/></button><button type="button" className="workspace-account" disabled={locked} onClick={()=>open('account')} aria-label="Compte et cabinet"><span className="workspace-avatar">{roles.slice(0,1)}</span><span><strong>{clinicName.replace(' (FICTIF)','')}</strong><small>{roles} · Local</small></span><ChevronDown size={15}/></button></div>
    </header>
    {locked&&<p className="workspace-lock" role="status">Terminez ou fermez l’action en cours pour changer d’espace.</p>}
    <Modal open={panel!==null} onOpenChange={value=>{if(!value)setPanel(null);}} title={panel==='modules'?'Aller à un espace':panel==='account'?'Votre cabinet':'Votre espace de travail'} description={panel==='modules'?'Accès disponibles pour votre rôle.':panel==='account'?clinicName:'Ajustez la présentation de votre session.'} returnFocus={opener.current} mobilePresentation="sheet" className="workspace-dialog">
      {panel==='modules'&&<><label className="workspace-module-search"><Search size={18}/><input autoFocus aria-label="Rechercher un module" placeholder="Patients, agenda, demandes…" value={query} onChange={event=>setQuery(event.target.value)}/><Command size={16}/></label><div className="workspace-module-results">{filtered.map(item=><button type="button" key={item.id} disabled={locked} onClick={()=>{setPanel(null);onNavigate(item.id);}}><span><item.icon size={21}/></span><div><strong>{item.label}</strong><small>{item.description}</small></div><ArrowRight size={17}/></button>)}{!filtered.length&&<p>Aucun espace trouvé. Essayez un autre nom.</p>}</div></>}
      {panel==='account'&&<div className="workspace-account-panel"><div><Building2 size={25}/><p><strong>{roles}</strong><small>Données fictives · environnement local</small></p></div><Button variant="secondary" disabled={locked||!canChangeClinic} onClick={()=>{setPanel(null);onChangeClinic();}}>Changer de cabinet<ArrowRight size={17}/></Button><a className="workspace-home-link" href={locked?undefined:"/"} aria-disabled={locked} tabIndex={locked?-1:0}>Accueil et démonstrations<ArrowRight size={17}/></a><Button variant="ghost" disabled={locked} onClick={()=>{setPanel(null);onDisconnect();}}><LogOut size={17}/>Se déconnecter</Button></div>}
      {panel==='preferences'&&<div className="workspace-preferences"><section><div><strong>Densité compacte</strong><p>Des listes et des cartes plus rapprochées.</p></div><Switch label="Affichage compact" checked={compact} onCheckedChange={onCompact}/></section><section><div><strong>Transitions</strong><p>La préférence de mouvement réduit du système reste prioritaire.</p></div><Switch label="Animations" checked={motion} onCheckedChange={onMotion}/></section></div>}
    </Modal>
  </>;
}
