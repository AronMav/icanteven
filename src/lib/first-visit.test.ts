import { afterEach, describe, expect, it, vi } from 'vitest';
import { openAboutOnFirstVisit } from './first-visit';

afterEach(() => vi.unstubAllGlobals());

describe('first-visit introduction', () => {
  it('opens once and persists the flag for subsequent visits', () => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });
    const open = vi.fn();
    expect(openAboutOnFirstVisit(open)).toBe(true);
    expect(openAboutOnFirstVisit(open)).toBe(false);
    expect(open).toHaveBeenCalledTimes(1);
    expect([...values]).toEqual([['icanteven.aboutSeen', '1']]);
  });

  it('leaves returning visitors in the editor', () => {
    const setItem = vi.fn(), open = vi.fn();
    vi.stubGlobal('localStorage', { getItem: () => '1', setItem });
    expect(openAboutOnFirstVisit(open)).toBe(false);
    expect(open).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
  });

  it('still opens when browser storage is unavailable', () => {
    const blocked = () => { throw new Error('storage disabled'); };
    vi.stubGlobal('localStorage', { getItem: blocked, setItem: blocked });
    const open = vi.fn();
    expect(openAboutOnFirstVisit(open)).toBe(true);
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('does not record a successful visit if opening the dialog fails', () => {
    const setItem = vi.fn();
    vi.stubGlobal('localStorage', { getItem: () => null, setItem });
    expect(openAboutOnFirstVisit(() => { throw new Error('dialog unavailable'); })).toBe(false);
    expect(setItem).not.toHaveBeenCalled();
  });
});
