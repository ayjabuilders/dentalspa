/** A navigation target, never proof of patient access: the connected API authorizes the ID. */
export function connectedPatientHref(patientId: string): string | null {
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(patientId)) return null;
  return '/connection?' + new URLSearchParams({ view: 'patients', patient: patientId }).toString();
}
