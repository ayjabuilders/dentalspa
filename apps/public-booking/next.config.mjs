import { frontendSecurityHeaders } from '../../scripts/frontend-security-headers.mjs';
import { validateHostedFrontendEnv } from '../../scripts/validate-hosted-frontend-env.mjs';
validateHostedFrontendEnv();
const distDir = process.env.NEXT_DIST_DIR?.trim() || '.next';

export default { distDir, headers: frontendSecurityHeaders, allowedDevOrigins: ["192.168.11.102"], transpilePackages: ["@dental/ui-clinic", "@dental/ui-patient", "@dental/contracts"], poweredByHeader: false };
