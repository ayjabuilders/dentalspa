'use client';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useRef, type ReactNode } from 'react';
export function PatientCard({ title, children, className = '' }: { title: string; children: ReactNode; className?: string }) { return <section className={`pass-card ${className}`}><h2>{title}</h2>{children}</section>; }
export function PatientSheet({ open, onOpenChange, title, description, children }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; description: string; children: ReactNode }) {
  const opener = useRef<HTMLElement | null>(null);
  return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Portal><Dialog.Overlay className="pass-overlay"/><Dialog.Content className="pass-sheet" onOpenAutoFocus={() => { opener.current = document.activeElement as HTMLElement; }} onCloseAutoFocus={event => { if (opener.current?.isConnected) { event.preventDefault(); opener.current.focus(); } }}><div className="sheet-handle"/><Dialog.Title>{title}</Dialog.Title><Dialog.Description>{description}</Dialog.Description><Dialog.Close className="pass-close" aria-label="Fermer"><X size={20}/></Dialog.Close>{children}</Dialog.Content></Dialog.Portal></Dialog.Root>;
}
