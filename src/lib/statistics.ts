export type Statistics = { dispersed: number };

/** Aggregate events only: no editor access, identifiers, storage or retries. */
export function createStatistics(
  endpoint = import.meta.env.VITE_STATS_ENDPOINT || '',
  enabled = import.meta.env.PROD || import.meta.env.VITE_STATS_IN_DEV === '1',
  send: typeof fetch = (...args) => fetch(...args),
  onUpdate: (totals: Statistics) => void = () => {},
) {
  const active = !!endpoint && enabled;

  function request(increment: boolean) {
    if (!active) return;
    try {
      void send(increment ? endpoint : new URL('/stats', endpoint).href, {
        ...(increment ? { method: 'POST', body: 'disperse', headers: { 'Content-Type': 'text/plain' } } : { method: 'GET' }),
        credentials: 'omit', referrerPolicy: 'no-referrer',
        cache: 'no-store', redirect: 'error', keepalive: true,
      }).then(async response => {
        if (!response.ok) return;
        const totals = await response.json();
        if (totals && Number.isSafeInteger(totals.dispersed) && totals.dispersed >= 0) {
          onUpdate({ dispersed: totals.dispersed });
        }
      }).catch(() => { /* Statistics must never interrupt writing. */ });
    } catch { /* A blocked network must never interrupt writing. */ }
  }

  return {
    active,
    load() { request(false); },
    disperse() { request(true); },
  };
}
