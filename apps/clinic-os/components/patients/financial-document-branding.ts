import type { FinancialDocumentBranding } from './financial-document';

// Explicit owner-selected demo cabinet, verified in supabase/seed.sql.
// This is a presentation template, not a tenant branding configuration or a renamed snapshot.
const dentalSpaDemoClinicId = '10000000-0000-4000-8000-000000000001';
const dentalSpaDemoBranding: FinancialDocumentBranding = {
  logoSrc: '/assets/dental-spa-logo-reference.png',
  printLogoSrc: '/assets/dental-spa-logo-reference.png',
  logoAlt: 'Dental Spa — By New Smile',
};
export function financialBrandingForLocalDemo(clinicId?: string): FinancialDocumentBranding | undefined {
  return clinicId === dentalSpaDemoClinicId ? dentalSpaDemoBranding : undefined;
}
