import { frontendSecurityHeaders } from '../../scripts/frontend-security-headers.mjs';
import { validateHostedFrontendEnv, validateHostedAuthEnv } from '../../scripts/validate-hosted-frontend-env.mjs';
validateHostedFrontendEnv();
validateHostedAuthEnv(process.env, { allowPublishableAlias: true });
const distDir = process.env.NEXT_DIST_DIR?.trim() || '.next';

export default { distDir, headers: frontendSecurityHeaders, env: { NEXT_PUBLIC_PATIENT_DEMOS: process.env.VERCEL === '1' ? 'false' : 'true' }, allowedDevOrigins: ["192.168.11.102"], transpilePackages: ["@dental/ui-clinic", "@dental/ui-patient", "@dental/contracts"], poweredByHeader: false };
