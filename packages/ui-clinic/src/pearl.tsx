'use client';
import * as Dialog from '@radix-ui/react-dialog';
import { createContext, useContext, useId, useRef, type ReactNode, type ButtonHTMLAttributes, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { X, ChevronLeft, ChevronRight, LoaderCircle } from 'lucide-react';

export type PearlSettings = { density?: 'comfortable' | 'compact'; motion?: 'full' | 'reduced'; dir?: 'ltr' | 'rtl' };
const Settings = createContext<PearlSettings>({});
const cx = (...values: (string | undefined | false)[]) => values.filter(Boolean).join(' ');
export function PearlProvider({ children, density='comfortable', motion='full', dir='ltr', className }: PearlSettings & {children:ReactNode;className?:string}) {
  return <Settings.Provider value={{density,motion,dir}}><div data-ds="pearl" data-density={density} data-motion={motion} dir={dir} className={cx('ds-root',className)}>{children}</div></Settings.Provider>;
}
export function Button({variant='primary',busy=false,children,className,disabled,type='button',...props}:ButtonHTMLAttributes<HTMLButtonElement>&{variant?:'primary'|'secondary'|'ghost'|'danger';busy?:boolean}) {
  return <button {...props} type={type} className={cx('ds-button',className)} data-variant={variant} disabled={disabled||busy} aria-busy={busy||undefined}>{busy&&<LoaderCircle className="ds-spinner" size={16} aria-hidden="true"/>}{children}</button>;
}
export function Input({className,...props}:InputHTMLAttributes<HTMLInputElement>){return <input {...props} className={cx('ds-input',className)}/>;}
export function Select({className,...props}:SelectHTMLAttributes<HTMLSelectElement>){return <select {...props} className={cx('ds-input',className)}/>;}
export function Textarea({className,...props}:TextareaHTMLAttributes<HTMLTextAreaElement>){return <textarea {...props} className={cx('ds-input',className)}/>;}
/** Render props bind label, hint and error to any native input/select/textarea. */
export function Field({label,hint,error,children}:{label:string;hint?:string;error?:string;children:(props:{id:string;'aria-describedby'?:string;'aria-invalid'?:true})=>ReactNode}){
  const id=useId();return <div className="ds-field"><label htmlFor={id}>{label}</label>{children({id,'aria-describedby':hint||error?id+'-help':undefined,'aria-invalid':error?true:undefined})}{(hint||error)&&<p id={id+'-help'} className={error?'ds-error':'ds-hint'}>{error||hint}</p>}</div>;
}
export type Tone='neutral'|'accent'|'success'|'warning'|'danger';
export function Badge({children,tone='neutral',onRemove,removeLabel}:{children:ReactNode;tone?:Tone;onRemove?:()=>void;removeLabel?:string}){
  return <span className="ds-badge" data-tone={tone}>{children}{onRemove&&<button type="button" onClick={onRemove} aria-label={removeLabel??'Retirer'}><X size={14}/></button>}</span>;
}
export function Card({children,title,description,action,className}:{children:ReactNode;title?:string;description?:string;action?:ReactNode;className?:string}){
  return <section className={cx('ds-card',className)}>{(title||action)&&<header className="ds-card-header"><div>{title&&<h2>{title}</h2>}{description&&<p>{description}</p>}</div>{action}</header>}{children}</section>;
}
export function Switch({label,checked,onCheckedChange,disabled=false}:{label:string;checked:boolean;onCheckedChange:(value:boolean)=>void;disabled?:boolean}){
  return <button type="button" className="ds-switch" role="switch" aria-checked={checked} disabled={disabled} onClick={()=>onCheckedChange(!checked)}><span aria-hidden="true"/><span>{label}</span></button>;
}
export function Feedback({title,children,tone='neutral',onDismiss,dismissLabel='Fermer le message'}:{title:string;children?:ReactNode;tone?:Tone;onDismiss?:()=>void;dismissLabel?:string}){
  return <div className="ds-feedback" data-tone={tone} role="status"><div><strong>{title}</strong>{children&&<div>{children}</div>}</div>{onDismiss&&<Button variant="ghost" aria-label={dismissLabel} onClick={onDismiss}><X size={18}/></Button>}</div>;
}
export function EmptyState({title,description,action}:{title:string;description:string;action?:ReactNode}){return <div className="ds-empty"><h3>{title}</h3><p>{description}</p>{action}</div>;}
export function Skeleton({label='Chargement en cours',lines=3}:{label?:string;lines?:number}){return <div className="ds-skeleton" role="status" aria-label={label} aria-busy="true">{Array.from({length:Math.max(1,Math.min(10,lines))},(_,i)=><span key={i} aria-hidden="true"/>)}</div>;}
export function DataTable({label,children}:{label:string;children:ReactNode}){return <div className="ds-table-region" role="region" aria-label={label} tabIndex={0}><table className="ds-table">{children}</table></div>;}
export function Pagination({page,totalPages,onPageChange,label='Pagination'}:{page:number;totalPages:number;onPageChange:(page:number)=>void;label?:string}){
  const total=Math.max(1,totalPages);return <nav className="ds-pagination" aria-label={label}><Button variant="secondary" aria-label="Page précédente" disabled={page<=1} onClick={()=>onPageChange(page-1)}><ChevronLeft size={18}/></Button><span aria-live="polite">{page} / {total}</span><Button variant="secondary" aria-label="Page suivante" disabled={page>=total} onClick={()=>onPageChange(page+1)}><ChevronRight size={18}/></Button></nav>;
}
export function Tabs({items,value,onValueChange,label}:{items:{value:string;label:string;content:ReactNode}[];value:string;onValueChange:(value:string)=>void;label:string}){
  const id=useId(),refs=useRef<(HTMLButtonElement|null)[]>([]),{dir}=useContext(Settings);const selected=items.findIndex(x=>x.value===value);
  return <div><div className="ds-tabs" role="tablist" aria-label={label}>{items.map((item,i)=><button type="button" ref={node=>{refs.current[i]=node;}} key={item.value} id={`${id}-tab-${i}`} role="tab" aria-selected={value===item.value} aria-controls={`${id}-panel-${i}`} tabIndex={value===item.value?0:-1} onClick={()=>onValueChange(item.value)} onKeyDown={event=>{let next=i;const forward=dir==='rtl'?'ArrowLeft':'ArrowRight';const backward=dir==='rtl'?'ArrowRight':'ArrowLeft';if(event.key===forward)next=(i+1)%items.length;else if(event.key===backward)next=(i-1+items.length)%items.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=items.length-1;else return;event.preventDefault();const target=items[next];if(target){onValueChange(target.value);refs.current[next]?.focus();}}}>{item.label}</button>)}</div>{items.map((item,i)=><div key={item.value} id={`${id}-panel-${i}`} role="tabpanel" aria-labelledby={`${id}-tab-${i}`} hidden={i!==selected} tabIndex={0} className="ds-tab-panel">{item.content}</div>)}</div>;
}
/** Controlled Radix dialog. Portal receives the same opt-in settings as the trigger. */
export function Modal({open,onOpenChange,title,description,children,trigger,kind='dialog',closeLabel='Fermer'}:{open:boolean;onOpenChange:(open:boolean)=>void;title:string;description:string;children:ReactNode;trigger:ReactNode;kind?:'dialog'|'drawer';closeLabel?:string}){
  const settings=useContext(Settings);return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Trigger asChild>{trigger}</Dialog.Trigger><Dialog.Portal><PearlProvider {...settings}><Dialog.Overlay className="ds-overlay"/><Dialog.Content className="ds-dialog" data-kind={kind}><div className="ds-dialog-heading"><div><Dialog.Title>{title}</Dialog.Title><Dialog.Description>{description}</Dialog.Description></div><Dialog.Close asChild><Button variant="ghost" aria-label={closeLabel}><X size={20}/></Button></Dialog.Close></div>{children}</Dialog.Content></PearlProvider></Dialog.Portal></Dialog.Root>;
}
export function BarChart({label,items,selected,onSelect}:{label:string;items:{id:string;label:string;value:number}[];selected:string;onSelect:(id:string)=>void}){
  const maximum=Math.max(1,...items.map(x=>Math.max(0,x.value)));return <div className="ds-chart" role="group" aria-label={label}>{items.map(item=><button type="button" key={item.id} aria-pressed={item.id===selected} aria-label={`${item.label} : ${item.value}`} onClick={()=>onSelect(item.id)}><b>{item.value}</b><span aria-hidden="true" style={{height:Math.max(0,item.value)/maximum*130+'px'}}/><small>{item.label}</small></button>)}</div>;
}
