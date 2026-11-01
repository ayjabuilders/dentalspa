import { describe, expect, it } from 'vitest';
import { patientDirectory } from '../fixtures';
import { getPatientDemoJourney } from './patient-demo-journey';

describe('patient demo journey', () => {
  it('provides a distinct scenario for every synthetic Moroccan profile', () => {
    const journeys = patientDirectory.map(getPatientDemoJourney);
    expect(journeys).toHaveLength(patientDirectory.length);
    expect(new Set(journeys.map(journey => journey.title)).size).toBe(patientDirectory.length);
    for (const journey of journeys) {
      expect(journey.steps.length).toBeGreaterThanOrEqual(3);
      expect(journey.steps.every(step => step.title && step.detail && step.state)).toBe(true);
    }
  });

  it('keeps a possible match unverified with no patient link or booking implication', () => {
    const imane = getPatientDemoJourney(patientDirectory.find(patient => patient.id === 'DEMO-003')!);
    const identity = imane.steps.find(step => step.category === 'Identification')!;
    expect(identity.state).toBe('Non vérifié');
    expect(identity.detail).toContain('aucun dossier lié');
    expect(imane.steps.find(step => step.category === 'Rendez-vous')?.state).toBe('Aucun rendez-vous');
  });

  it('labels finance examples as fictitious and non-transactional', () => {
    const nour = getPatientDemoJourney(patientDirectory.find(patient => patient.id === 'DEMO-007')!);
    expect(nour.steps.find(step => step.category === 'Devis')?.title).toContain('fictifs');
    expect(nour.steps.find(step => step.category === 'Paiement')?.state).toBe('Non encaissé');
  });
});
