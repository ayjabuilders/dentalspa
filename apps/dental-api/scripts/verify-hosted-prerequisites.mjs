import { URLSearchParams } from 'node:url';

export async function verifyHostedPrerequisites({ adminRequest, clinicA, clinicB, bucketId = 'patient-documents' }) {
  const query = new URLSearchParams({ select: 'id,name', id: `in.(${clinicA},${clinicB})` });
  const clinicsResponse = await adminRequest(`/rest/v1/clinics?${query}`);
  if (!clinicsResponse.ok) throw new Error(`Could not verify synthetic clinic fixtures (HTTP ${clinicsResponse.status}).`);

  const rows = await clinicsResponse.json();
  const found = new Set(rows.map(row => row.id));
  if (found.size !== 2 || !found.has(clinicA) || !found.has(clinicB)) {
    throw new Error('Expected Casablanca and Salé synthetic clinic fixtures are missing; no hosted records were created.');
  }
  const expectedNames = new Map([
    [clinicA, 'Cabinet Dentaire Atlas - Casablanca (FICTIF)'],
    [clinicB, 'Cabinet Sourire de Sale (FICTIF)'],
  ]);
  if (rows.some(row => row.name !== expectedNames.get(row.id))) {
    throw new Error('Clinic IDs no longer identify the expected synthetic fixtures; no hosted records were created.');
  }

  const bucketResponse = await adminRequest(`/storage/v1/bucket/${encodeURIComponent(bucketId)}`);
  if (!bucketResponse.ok) throw new Error(`Could not verify private document bucket (HTTP ${bucketResponse.status}).`);

  const bucket = await bucketResponse.json();
  if (bucket.public !== false) {
    throw new Error('The patient-documents bucket is not private; no hosted records were created.');
  }
}
