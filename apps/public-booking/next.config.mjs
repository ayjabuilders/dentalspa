import { frontendSecurityHeaders } from '../../scripts/frontend-security-headers.mjs';
import { validateHostedFrontendEnv } from '../../scripts/validate-hosted-frontend-env.mjs';
validateHostedFrontendEnv();
const distDir = process.env.NEXT_DIST_DIR?.trim() || '.next';

export default { distDir, headers: frontendSecurityHeaders,
  async rewrites() {
    return process.env.NODE_ENV === 'development' && process.env.BOOKING_HOSTED_PREVIEW === 'true'
      ? [{ source: '/booking-api/api/v1/booking-requests/:path*', destination: 'https://dentalspa-api.vercel.app/api/v1/booking-requests/:path*' }]
      : [];
  },
  allowedDevOrigins: ["192.168.11.102"], transpilePackages: ["@dental/ui-clinic", "@dental/ui-patient", "@dental/contracts"], poweredByHeader: false };
