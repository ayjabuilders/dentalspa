import type { Metadata } from 'next';
import '@dental/design-tokens/theme.css';
import './globals.css';
export const metadata: Metadata = { title: 'Dental Spa · Un sourire commence par une rencontre', description: 'Présentation du futur accueil Dental Spa', icons: { icon: '/assets/favicon.svg' } };
export default function Layout({ children }: { children: React.ReactNode }) { return <html lang="fr"><body>{children}</body></html>; }
