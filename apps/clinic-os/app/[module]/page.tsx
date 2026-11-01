import { notFound, redirect } from 'next/navigation';
import { ClinicWorkspace } from '../../components/workspace';
const modules = ['intake','inbox','patients','planning','clinical','smile','lab','operations','business','team','settings','aftercare'];
const connectedModules = new Set(['intake','patients','planning','inbox','team']);
export function generateStaticParams() { return modules.map(module => ({ module })); }
export default async function ModulePage({ params, searchParams }: {
  params: Promise<{ module: string }>;
  searchParams: Promise<{ preview?: string }>;
}) {
  const { module } = await params;
  if (!modules.includes(module)) notFound();
  const query = await searchParams;
  if (module === 'business' && (process.env.VERCEL === '1' || query.preview !== '1')) redirect('/connection?view=finance');
  if (connectedModules.has(module) && query.preview !== '1') redirect('/connection?view=' + module);
  return <ClinicWorkspace page={module}/>;
}
