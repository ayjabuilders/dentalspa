import { describe, expect, it } from 'vitest';
import { patientDirectory } from '../fixtures';
import { getPatientDocumentChecklistDemo, patientDocumentChecklistStatuses } from './patient-document-checklist-data';

describe('patient document checklist demo', () => {
  it('provides distinct synthetic checklist states for every demo profile', () => {
    const checklists = patientDirectory.map(getPatientDocumentChecklistDemo);
    expect(checklists).toHaveLength(patientDirectory.length);
    for (const checklist of checklists) {
      expect(checklist.map(item => item.id)).toEqual(['identity', 'administrative_consent', 'manual_checklist']);
      expect(checklist.every(item => Object.hasOwn(patientDocumentChecklistStatuses, item.status))).toBe(true);
      expect(checklist.every(item => item.note.length > 0)).toBe(true);
    }
    expect(new Set(checklists.map(list => list.map(item => item.status).join(','))).size).toBeGreaterThan(1);
  });

  it('uses only the PRD manual statuses without introducing claim or reimbursement states', () => {
    expect(Object.keys(patientDocumentChecklistStatuses)).toEqual(['not_applicable', 'missing', 'received', 'needs_correction', 'completed_manually']);
    const joined = patientDirectory.map(getPatientDocumentChecklistDemo).flat().map(item => item.label).join(' ');
    expect(joined).not.toMatch(/rembours|réclamation|éligible|claim/i);
  });
});
