/** The illustrative booking preview must not be mistaken for a live reservation. */
export function proxy() {
  if (process.env.VERCEL === '1') {
    return new Response('Not found', {
      status: 404,
      headers: { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' },
    });
  }
}

export const config = { matcher: ['/preview/:path*'] };
