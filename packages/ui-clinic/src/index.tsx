'use client';
import * as Dialog from '@radix-ui/react-dialog';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { X, Sparkles } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }
// shadcn-style owned primitive: Radix Slot + CVA variants, no framework-specific handlers.
const variants = cva('button', { variants: { variant: { primary: 'button-primary', secondary: 'button-secondary', ghost: 'button-ghost' } }, defaultVariants: { variant: 'secondary' } });
export function Button({ asChild, variant, className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof variants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'button';
  return <Comp className={cn(variants({ variant }), className)} {...props} />;
}
export function Modal({ open, onOpenChange, title, description, children, wide = false }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; description: string; children: ReactNode; wide?: boolean }) {
  const opener = useRef<HTMLElement | null>(null);
  return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Portal><Dialog.Overlay className="dialog-overlay"/><Dialog.Content onOpenAutoFocus={() => { opener.current = document.activeElement as HTMLElement; }} onCloseAutoFocus={event => { if (opener.current?.isConnected) { event.preventDefault(); opener.current.focus(); } }} className={cn('dialog', wide && 'dialog-wide')}><div className="dialog-heading"><div><Dialog.Title>{title}</Dialog.Title><Dialog.Description>{description}</Dialog.Description></div><Dialog.Close className="icon-button" aria-label="Fermer"><X/></Dialog.Close></div>{children}</Dialog.Content></Dialog.Portal></Dialog.Root>;
}
export function Entrance({ children, className }: { children: ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  return <motion.div className={className} initial={reduce ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .36, ease: [.16, 1, .3, 1] }}>{children}</motion.div>;
}
export function PulseOrb({ small = false }: { small?: boolean }) { return <span aria-hidden="true" className={cn('pulse-orb', small && 'pulse-small')}><span/><Sparkles/></span>; }
