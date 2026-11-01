/** Browser privacy defaults for the standalone application surfaces. */
export function frontendSecurityHeaders() {
  return [{
    source: '/:path*',
    headers: [
      { key: 'Referrer-Policy', value: 'no-referrer' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
    ],
  }];
}
