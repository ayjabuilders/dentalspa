const PRIVATE_IPV4 = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;

export function localDemoUrl(href: string, hostname: string): string | null {
  if (href.startsWith('/')) return href;
  const url = new URL(href, 'http://localhost');
  const isLocalDestination = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  if (!isLocalDestination) return href;

  const isLocalViewer = ['localhost', '127.0.0.1', '::1'].includes(hostname)
    || hostname.endsWith('.local')
    || PRIVATE_IPV4.test(hostname);
  if (!isLocalViewer) return null;

  url.hostname = hostname;
  return url.toString();
}
