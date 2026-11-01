import type { Metadata } from 'next';
import '@dental/design-tokens/theme.css';
import '@dental/design-tokens/pearl.css';
import './globals.css';
export const metadata: Metadata = { title: 'Dental Spa · Réserver une visite', description: 'Choisissez votre visite et votre créneau dans le cabinet de démonstration Dental Spa.', icons: { icon: '/assets/favicon.svg' } };
export default function Layout({ children }: { children: React.ReactNode }) { return <html lang="fr"><body data-ds="pearl">{children}</body></html>; }
