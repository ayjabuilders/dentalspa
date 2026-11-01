'use client';
import {useEffect,useRef,useState} from 'react';

export type WorkspaceAgreementTarget={planId:string;version:number};
export type WorkspaceRoute={module:string;patient:string|null;agreement?:WorkspaceAgreementTarget|null};
const patientId=(value:string|null)=>value&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)?value:null;
export function patientFromLocation(){return patientId(new URLSearchParams(window.location.search).get('patient'));}
export function agreementFromLocation():WorkspaceAgreementTarget|null{
 const query=new URLSearchParams(window.location.search),planId=patientId(query.get('plan')),raw=query.get('version');
 if(query.get('view')!=='patients'||!patientId(query.get('patient'))||!planId||!raw||!/^\d{1,8}$/.test(raw))return null;
 const version=Number(raw);return version>=1&&version<=99999999?{planId,version}:null;
}
const href=(route:WorkspaceRoute)=>'/connection?'+new URLSearchParams({view:route.module,...(route.patient?{patient:route.patient}:{}),...(route.module==='patients'&&route.patient&&route.agreement?{plan:route.agreement.planId,version:String(route.agreement.version)}:{})}).toString();

/** Navigation metadata only. Patient responses and credentials never enter browser history. */
export function useWorkspaceHistory({clinicId,route,allowed,locked,apply}:{clinicId?:string;route:WorkspaceRoute;allowed:string[];locked:boolean;apply:(route:WorkspaceRoute)=>void}){
 const live=useRef({route,allowed,locked,apply});live.current={route,allowed,locked,apply};
 const journal=useRef<{session:string;entries:WorkspaceRoute[];index:number}|null>(null);
 const [,refresh]=useState(0);
 useEffect(()=>{
  if(!clinicId){journal.current=null;return;}
  const previousRestoration=window.history.scrollRestoration;
  window.history.scrollRestoration='manual';
  const session=Date.now().toString(36)+Math.random().toString(36).slice(2);
  journal.current={session,entries:[live.current.route],index:0};
  window.history.replaceState({...window.history.state,dentalWorkspace:{session,index:0}},'',href(live.current.route));
  refresh(v=>v+1);
  const onPop=(event:PopStateEvent)=>{
   const book=journal.current;if(!book)return;
   const marker=event.state?.dentalWorkspace;
   const known=marker?.session===book.session&&Number.isInteger(marker.index)&&!!book.entries[marker.index];
   if(live.current.locked){
    if(known&&marker.index!==book.index)window.history.go(book.index-marker.index);
    else window.history.replaceState({...window.history.state,dentalWorkspace:{session:book.session,index:book.index}},'',href(live.current.route));
    return;
   }
   if(known){
    book.index=marker.index;
    const next=book.entries[book.index]!;
    if(live.current.allowed.includes(next.module)){live.current.apply(next);refresh(v=>v+1);}
   }else{
    const query=new URLSearchParams(window.location.search),view=query.get('view');
    const next={module:view&&live.current.allowed.includes(view)?view:live.current.route.module,patient:view==='patients'?patientFromLocation():null,agreement:view==='patients'?agreementFromLocation():null};
    book.entries=[next];book.index=0;
    window.history.replaceState({...window.history.state,dentalWorkspace:{session:book.session,index:0}},'',href(next));
    live.current.apply(next);refresh(v=>v+1);
   }
  };
  window.addEventListener('popstate',onPop);
  return()=>{window.removeEventListener('popstate',onPop);window.history.scrollRestoration=previousRestoration;journal.current=null;};
 },[clinicId]);
 function navigate(next:WorkspaceRoute){
  if(live.current.locked||!live.current.allowed.includes(next.module))return;
  const book=journal.current;if(!book)return;
  const current=book.entries[book.index];
  if(current&&href(current)===href(next))return;
  book.entries=book.entries.slice(0,book.index+1);book.entries.push(next);book.index++;
  window.history.pushState({...window.history.state,dentalWorkspace:{session:book.session,index:book.index}},'',href(next));
  live.current.apply(next);refresh(v=>v+1);
 }
 const book=journal.current;
 return {navigate,back:()=>{if(!live.current.locked&&journal.current&&journal.current.index>0)window.history.back();},forward:()=>{if(!live.current.locked&&journal.current&&journal.current.index<journal.current.entries.length-1)window.history.forward();},previous:book?.entries[book.index-1],next:book?.entries[book.index+1]};
}
