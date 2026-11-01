import { describe, expect, it } from 'vitest';
import { localReceptionPreviewHref } from '../../apps/public-booking/app/local-preview-handoff';
import { parseBookingRequestPreview } from '../../apps/clinic-os/components/intake/booking-request-preview';

const valid = {
  scenario: 'salma',
  date: '2026-11-02',
  time: '10:15',
  visit: 'standard-demo',
  provider: 'provider-demo-b',
};

describe('local public-booking reception preview', () => {
  it('builds a same-device or private-LAN link with only allowlisted fictional fields', () => {
    const href = localReceptionPreviewHref('192.168.11.102', valid);
    expect(href).toBe('http://192.168.11.102:4204/booking-review?scenario=salma&date=2026-11-02&time=10%3A15&visit=standard-demo&provider=provider-demo-b');
    expect(href).not.toContain('name=');
    expect(href).not.toContain('email=');
    expect(href).not.toContain('phone=');
  });

  it('refuses non-local hosts and malformed scenario input', () => {
    expect(localReceptionPreviewHref('preview.example.com', valid)).toBeNull();
    expect(localReceptionPreviewHref('localhost', { ...valid, scenario: 'real-patient' })).toBeNull();
    expect(localReceptionPreviewHref('localhost', { ...valid, date: '2026-02-30' })).toBeNull();
    expect(localReceptionPreviewHref('localhost', { ...valid, time: '99:99' })).toBeNull();
    expect(localReceptionPreviewHref('localhost', { ...valid, provider: 'unexpected' })).toBeNull();
  });

  it('parses only known request fields and always derives the display name from the fixture', () => {
    expect(parseBookingRequestPreview(valid)).toMatchObject({
      displayName: 'Salma Alaoui (FICTIF)',
      date: valid.date,
      time: valid.time,
      visitLabel: 'Format démo standard · 45 min',
      providerLabel: 'Praticien·ne démo B',
    });
    expect(parseBookingRequestPreview({ ...valid, scenario: 'custom-name' })).toBeNull();
    expect(parseBookingRequestPreview({ ...valid, scenario: ['salma', 'youssef'] })).toBeNull();
    expect(parseBookingRequestPreview({ ...valid, date: '2026-02-30' })).toBeNull();
    expect(parseBookingRequestPreview({ ...valid, time: '9pm' })).toBeNull();
    expect(parseBookingRequestPreview({ ...valid, visit: 'clinical-treatment' })).toBeNull();
  });
});
