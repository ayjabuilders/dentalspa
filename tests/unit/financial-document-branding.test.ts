import { describe, expect, it } from 'vitest';
import { financialBrandingForLocalDemo } from '../../apps/clinic-os/components/patients/financial-document-branding';

describe('owner-selected demo document identity', () => {
  it('uses the supplied lettering only for the seeded default demo cabinet', () => {
    expect(financialBrandingForLocalDemo('10000000-0000-4000-8000-000000000001')).toEqual({
      logoSrc: '/assets/dental-spa-logo-reference.png',
      printLogoSrc: '/assets/dental-spa-logo-reference.png',
      logoAlt: 'Dental Spa — By New Smile',
    });
  });
  it('does not give another cabinet the default demo identity or palette', () => {
    expect(financialBrandingForLocalDemo('10000000-0000-4000-8000-000000000002')).toBeUndefined();
  });
  it('does not infer cabinet identity when context is absent', () => {
    expect(financialBrandingForLocalDemo()).toBeUndefined();
    expect(financialBrandingForLocalDemo('')).toBeUndefined();
  });
});
