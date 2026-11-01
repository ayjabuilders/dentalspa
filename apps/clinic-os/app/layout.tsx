import type { Metadata, Viewport } from 'next';
import '@dental/design-tokens/theme.css';
import './globals.css';
export const metadata: Metadata = { title: 'Dental Spa · Clinic OS', description: 'Espace de travail Dental Spa — fondation synthétique', manifest: '/manifest.webmanifest', icons: { icon: '/assets/favicon.svg' } };
export const viewport: Viewport = { width:'device-width', initialScale:1, viewportFit:'cover' };
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="fr"><body>{children}</body></html>; }
