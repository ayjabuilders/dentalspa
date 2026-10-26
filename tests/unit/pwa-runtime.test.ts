import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

type WorkerEvent = { request?: Request; data?: unknown; waitUntil?: (promise: Promise<unknown>) => void; respondWith?: (promise: Promise<unknown>) => void };
function worker(app = 'clinic-os') {
  const source = readFileSync(`apps/${app}/public/sw.js`, 'utf8');
  const listeners = new Map<string, (event: WorkerEvent) => void>();
  const cache = { addAll: vi.fn<(files: string[]) => Promise<void>>(async () => {}), match: vi.fn(async () => new Response('safe cached asset')) };
  const caches = { open: vi.fn(async () => cache), keys: vi.fn(async () => ['unrelated-cache', `dental-${app}-old`]), delete: vi.fn(async () => true) };
  const fetch = vi.fn(async () => new Response('network'));
  const self = { location: { origin: 'https://clinic.example' }, addEventListener: (name: string, fn: (event: WorkerEvent) => void) => listeners.set(name, fn), skipWaiting: vi.fn(), clients: { claim: vi.fn() } };
  runInNewContext(source, { self, caches, fetch, URL });
  return { source, listeners, cache, caches, fetch, self };
}
function requestEvent(request: Request) { return { request, respondWith: vi.fn<(promise: Promise<unknown>) => void>() }; }
describe('generated service worker runtime privacy and update behavior', () => {
  for (const app of ['clinic-os', 'patient-pass']) {
    it(`${app} installs only the public allowlist and waits for explicit activation`, async () => {
      const w = worker(app);
      let done = Promise.resolve<unknown>(undefined);
      w.listeners.get('install')!({ waitUntil: promise => { done = promise; } });
      await done;
      const assets = w.cache.addAll.mock.calls[0]![0];
      expect(assets).toContain('/offline.html');
      expect(assets.every(path => path === '/offline.html' || path.startsWith('/assets/'))).toBe(true);
      expect(w.self.skipWaiting).not.toHaveBeenCalled();
      w.listeners.get('message')!({ data: { type: 'UNRELATED' } });
      expect(w.self.skipWaiting).not.toHaveBeenCalled();
      w.listeners.get('message')!({ data: { type: 'ACTIVATE_UPDATE' } });
      expect(w.self.skipWaiting).toHaveBeenCalledTimes(1);
    });
    it(`${app} never intercepts API, authenticated, external, query or write requests`, () => {
      const w = worker(app);
      for (const request of [
        new Request('https://clinic.example/api/v1/patients'),
        new Request('https://clinic.example/assets/icon-192.png', { headers: { authorization: 'Bearer synthetic' } }),
        new Request('https://outside.example/assets/icon-192.png'),
        new Request('https://clinic.example/assets/icon-192.png?patient=synthetic'),
        new Request('https://clinic.example/assets/icon-192.png', { method: 'POST' }),
      ]) {
        const event = requestEvent(request); w.listeners.get('fetch')!(event);
        expect(event.respondWith).not.toHaveBeenCalled();
      }
      expect(w.caches.open).not.toHaveBeenCalled();
    });
    it(`${app} reads only its current cache and removes only its old namespaces`, async () => {
      const w = worker(app);
      const event = requestEvent(new Request('https://clinic.example/assets/icon-192.png'));
      w.listeners.get('fetch')!(event); await event.respondWith.mock.calls[0]![0];
      expect(w.caches.open).toHaveBeenCalledWith(expect.stringMatching(new RegExp(`^dental-${app}-[a-f0-9]+$`)));
      expect(w.cache.match).toHaveBeenCalledWith(event.request);
      expect(w.fetch).not.toHaveBeenCalled();
      let done = Promise.resolve<unknown>(undefined);
      w.listeners.get('activate')!({ waitUntil: promise => { done = promise; } }); await done;
      expect(w.caches.delete).toHaveBeenCalledExactlyOnceWith(`dental-${app}-old`);
      expect(w.self.clients.claim).toHaveBeenCalledOnce();
    });
    it(`${app} uses a static offline screen without storing navigation responses`, async () => {
      const w = worker(app);
      w.fetch.mockRejectedValueOnce(new Error('offline'));
      const request = new Request('https://clinic.example/patients');
      Object.defineProperty(request, 'mode', { value: 'navigate' });
      const event = requestEvent(request); w.listeners.get('fetch')!(event);
      await event.respondWith.mock.calls[0]![0];
      expect(w.cache.match).toHaveBeenCalledExactlyOnceWith('/offline.html');
      expect(w.source).not.toContain('cache.put');
      expect(w.cache.addAll).not.toHaveBeenCalled();
    });
  }
});
