import { notFound } from 'next/navigation';
import { ClinicWorkspace } from '../../components/workspace';
import { getBuildStatus } from '../../lib/build-status';
const modules = ['intake','patients','planning','clinical','smile','lab','operations','business','team','settings','build'];
export function generateStaticParams() { return modules.map(module => ({ module })); }
export default async function ModulePage({ params }: { params: Promise<{ module: string }> }) { const { module } = await params; if (!modules.includes(module)) notFound(); return <ClinicWorkspace page={module} buildStatus={module === 'build' ? getBuildStatus() : undefined}/>; }
