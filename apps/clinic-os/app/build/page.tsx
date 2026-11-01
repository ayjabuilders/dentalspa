import { ClinicWorkspace } from '../../components/workspace';
import { getBuildStatus } from '../../lib/build-status';

// The successful-build publisher requires a snapshot produced during prerender.
export const dynamic = 'force-static';
export default function BuildPage() {
  return <ClinicWorkspace page="build" buildStatus={getBuildStatus()}/>;
}
