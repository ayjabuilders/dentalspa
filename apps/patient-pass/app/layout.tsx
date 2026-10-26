import type { Metadata, Viewport } from 'next';
import '@dental/design-tokens/theme.css';
import './globals.css';
export const metadata: Metadata = { title: 'Dental Spa · Patient Pass', description: 'Votre espace personnel — démonstration', manifest: '/manifest.webmanifest', appleWebApp: { capable: true, title: 'Patient Pass', statusBarStyle: 'default' }, icons: { icon: '/assets/favicon.svg', apple: '/assets/icon-192.png' } };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#f4f6f4' };
export default function Layout({ children }: { children: React.ReactNode }) { return <html lang="fr"><body>{children}</body></html>; }
