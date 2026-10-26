'use client';
import { useEffect, useState } from 'react';
import type { BuildStatusData } from './types';

export function useBuildStatus(initial: BuildStatusData) {
  const [status, setStatus] = useState(initial);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    let controller: AbortController | null = null;
    let disposed = false;
    async function refresh() {
      if (document.hidden || controller) return;
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 5000);
      try {
        const response = await fetch('/api/build-status', { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error('Snapshot unavailable');
        const next = await response.json() as BuildStatusData;
        if (!next.snapshotId || !next.successfulAt || !Number.isFinite(Date.parse(next.successfulAt)) || next.productModules?.length !== 21 || !Array.isArray(next.tasks) || !next.counts || next.productModules.some(module => !module.progress || !Number.isFinite(module.progress.percent) || module.progress.percent < 0 || module.progress.percent > 100)) throw new Error('Invalid snapshot');
        if (!disposed) {
          // A cached build or deliberate rollback may publish an older timestamp.
          // The artifact currently served by this app is authoritative.
          setStatus(current => current.snapshotId === next.snapshotId && current.successfulAt === next.successfulAt ? current : next);
          setUnavailable(false);
        }
      } catch { if (!disposed) setUnavailable(true); }
      finally { clearTimeout(timeout); controller = null; }
    }
    void refresh();
    const interval = setInterval(() => void refresh(), 20000);
    const onVisible = () => void refresh();
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => { disposed = true; clearInterval(interval); controller?.abort(); window.removeEventListener('focus', onVisible); document.removeEventListener('visibilitychange', onVisible); };
  }, []);
  return { status, unavailable };
}
