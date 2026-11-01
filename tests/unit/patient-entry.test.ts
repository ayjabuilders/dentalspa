import { describe, expect, it } from 'vitest';
import { connectedPatientHref } from '../../apps/clinic-os/lib/patient-entry';

describe('patient record deep link', () => {
  it('preserves the record ID through the authenticated cabinet entry point', () => {
    const id = '20000000-0000-4000-8000-000000000001';
    const href = connectedPatientHref(id)!;
    const url = new URL(href, 'https://clinic.example.com');
    expect(url.pathname).toBe('/connection');
    expect(url.searchParams.get('view')).toBe('patients');
    expect(url.searchParams.get('patient')).toBe(id);
    expect([...url.searchParams.keys()]).toEqual(['view', 'patient']);
  });
  it.each(['DEMO-001', '', '../../admin', 'https://evil.example', '20000000-0000-4000-8000-000000000001&view=team'])('rejects non-record input %s', id => {
    expect(connectedPatientHref(id)).toBeNull();
  });
});
