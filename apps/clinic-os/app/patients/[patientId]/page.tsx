import { notFound, redirect } from 'next/navigation';
import { ClinicWorkspace } from '../../../components/workspace';
import { patientDirectory } from '../../../components/fixtures';
import { connectedPatientHref } from '../../../lib/patient-entry';

export function generateStaticParams() {
  if (process.env.VERCEL === '1') return [];
  return patientDirectory.map(patient => ({ patientId: patient.id }));
}

export default async function PatientDemoPage({ params }: { params: Promise<{ patientId: string }> }) {
  const { patientId } = await params;
  const connectedHref = connectedPatientHref(patientId);
  if (connectedHref) redirect(connectedHref);
  if (process.env.VERCEL === '1') notFound();
  if (!patientDirectory.some(patient => patient.id === patientId)) notFound();
  return <ClinicWorkspace page="patients" patientId={patientId}/>;
}
