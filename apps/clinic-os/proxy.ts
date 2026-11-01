/** Development tools are local-only, including on Vercel preview deployments. */
export function proxy() {
  if (process.env.VERCEL === '1') {
    return new Response('Not found', {
      status: 404,
      headers: { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' },
    });
  }
}

export const config = {
  matcher: ['/design-lab/:path*', '/build/:path*', '/api/build-status/:path*', '/playbook/:path*'],
};
