import { describe, expect, it, vi } from 'vitest';
import { createStatistics } from './statistics';

describe('aggregate statistics', () => {
  it('does nothing until an endpoint is configured and collection enabled', () => {
    const send = vi.fn();
    for (const stats of [createStatistics('', true, send), createStatistics('https://stats.example/events', false, send)]) {
      stats.load(); stats.disperse();
      expect(stats.active).toBe(false);
    }
    expect(send).not.toHaveBeenCalled();
  });

  it('reads totals without recording visits and sends only dispersal events', () => {
    const send = vi.fn().mockResolvedValue({ ok: true });
    const stats = createStatistics('https://stats.example/events', true, send);
    stats.load(); stats.disperse(); stats.disperse();
    expect(send.mock.calls.map(([, options]) => options.body)).toEqual([undefined, 'disperse', 'disperse']);
    expect(send).toHaveBeenNthCalledWith(1, 'https://stats.example/stats', {
      method: 'GET', credentials: 'omit', referrerPolicy: 'no-referrer',
      cache: 'no-store', redirect: 'error', keepalive: true,
    });
    expect(send).toHaveBeenCalledWith('https://stats.example/events', {
      method: 'POST', body: 'disperse', headers: { 'Content-Type': 'text/plain' },
      credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store',
      redirect: 'error', keepalive: true,
    });
  });

  it('ignores errors without retries or unhandled rejections', async () => {
    const send = vi.fn().mockRejectedValue(new Error('offline'));
    const stats = createStatistics('https://stats.example/events', true, send);
    expect(() => stats.disperse()).not.toThrow();
    await Promise.resolve();
    expect(send).toHaveBeenCalledTimes(1);
    const blocked = createStatistics('https://stats.example/events', true, () => { throw new Error('blocked'); });
    expect(() => blocked.load()).not.toThrow();
  });

  it('shows only validated aggregate totals from successful responses', async () => {
    const update = vi.fn();
    const send = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ dispersed: 8, extra: 'ignored' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ dispersed: '9' }) })
      .mockResolvedValueOnce({ ok: false });
    const stats = createStatistics('https://stats.example/events', true, send, update);
    stats.load(); stats.disperse(); stats.disperse();
    await vi.waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update).toHaveBeenCalledWith({ dispersed: 8 });
  });
});
