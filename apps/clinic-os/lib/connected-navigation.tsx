'use client';
import {createContext,useCallback,useContext,useEffect,useId,useMemo,useState,type ReactNode} from 'react';
const NavigationContext=createContext({locked:false,setLock:(id:string,locked:boolean)=>{void id;void locked;}});
export function ConnectedNavigationProvider({children}:{children:ReactNode}){
  const [locks,setLocks]=useState<Set<string>>(()=>new Set());
  const setLock=useCallback((id:string,locked:boolean)=>setLocks(previous=>{
    if(previous.has(id)===locked)return previous;
    const next=new Set(previous);if(locked)next.add(id);else next.delete(id);return next;
  }),[]);
  const value=useMemo(()=>({locked:locks.size>0,setLock}),[locks,setLock]);
  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}
export function useConnectedNavigation(){return useContext(NavigationContext);}
export function useConnectedNavigationLock(locked:boolean){
  const id=useId(),{setLock}=useContext(NavigationContext);
  useEffect(()=>{setLock(id,locked);return()=>setLock(id,false);},[id,locked,setLock]);
}
