'use client';
import * as Dialog from '@radix-ui/react-dialog';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { X, Sparkles } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { createContext, useContext, useEffect, useRef, useState, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from 'react';
import './modal.css';

const ClinicDesignContext=createContext<'pearl'|{design:'pearl';theme:'light'|'dark'}|undefined>(undefined);
export const ClinicDesignProvider=ClinicDesignContext.Provider;

export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }
// shadcn-style owned primitive: Radix Slot + CVA variants, no framework-specific handlers.
const variants = cva('button', { variants: { variant: { primary: 'button-primary', secondary: 'button-secondary', ghost: 'button-ghost' } }, defaultVariants: { variant: 'secondary' } });
export function Button({ asChild, variant, className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof variants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'button';
  return <Comp className={cn(variants({ variant }), className)} {...props} />;
}
export function Modal({ open, onOpenChange, title, description, children, wide = false, closeDisabled = false, returnFocus, className, mobilePresentation = 'dialog' }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; description: string; children: ReactNode; wide?: boolean; closeDisabled?: boolean; returnFocus?: HTMLElement | null; className?: string; mobilePresentation?: 'dialog' | 'sheet' }) {
  const opener = useRef<HTMLElement | null>(null);
  const [viewportStyle, setViewportStyle] = useState<CSSProperties>();
  const context=useContext(ClinicDesignContext);
  const design=typeof context==='object'?context.design:context;
  const theme=typeof context==='object'?context.theme:undefined;
  useEffect(() => {
    if (!open || mobilePresentation !== 'sheet') return;
    const viewport = window.visualViewport;
    let frame = 0;
    const update = () => {
      setViewportStyle({
        '--dialog-viewport-height': `${viewport?.height ?? window.innerHeight}px`,
        '--dialog-viewport-bottom': `${Math.max(0, window.innerHeight - (viewport?.height ?? window.innerHeight) - (viewport?.offsetTop ?? 0))}px`,
      } as CSSProperties);
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    update();
    viewport?.addEventListener('resize', schedule);
    viewport?.addEventListener('scroll', schedule);
    window.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(frame);
      viewport?.removeEventListener('resize', schedule);
      viewport?.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [open, mobilePresentation]);
  return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Portal><Dialog.Overlay data-ds={design} data-theme={theme} className="dialog-overlay"/><Dialog.Content data-ds={design} data-theme={theme} data-mobile-presentation={mobilePresentation} style={mobilePresentation === 'sheet' ? viewportStyle : undefined} aria-label={title} onOpenAutoFocus={() => { opener.current = document.activeElement as HTMLElement; }} onEscapeKeyDown={event=>{if(closeDisabled)event.preventDefault();}} onPointerDownOutside={event=>{if(closeDisabled)event.preventDefault();}} onCloseAutoFocus={event => { const target=returnFocus??opener.current;if (target?.isConnected) { event.preventDefault(); target.focus(); } }} className={cn('dialog', wide && 'dialog-wide', mobilePresentation === 'sheet' && 'dialog-mobile-sheet', className)}><div className="dialog-heading"><div><Dialog.Title>{title}</Dialog.Title><Dialog.Description>{description}</Dialog.Description></div><Dialog.Close disabled={closeDisabled} className="icon-button" aria-label="Fermer"><X/></Dialog.Close></div>{children}</Dialog.Content></Dialog.Portal></Dialog.Root>;
}
export function Entrance({ children, className }: { children: ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  // Keep the server and first browser render identical; media preference only
  // changes the post-hydration transition, never the rendered initial styles.
  return <motion.div className={className} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduce ? 0 : .36, ease: [.16, 1, .3, 1] }}>{children}</motion.div>;
}
export function PulseOrb({ small = false }: { small?: boolean }) { return <span aria-hidden="true" className={cn('pulse-orb', small && 'pulse-small')}><span/><Sparkles/></span>; }
