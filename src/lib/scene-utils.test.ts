import { describe, expect, it } from 'vitest';
import { transitionScale } from './scene-utils';

describe('scene resolution budget', () => {
  it.each([[390, 844, 3, 320_000], [1920, 1080, 2, 640_000], [3840, 2160, 2, 640_000]])('bounds raster work at %ix%i', (width, height, dpr, budget) => {
    const scale = transitionScale(width, height, dpr);
    expect(Math.floor(width * scale) * Math.floor(height * scale)).toBeLessThanOrEqual(budget);
    expect(scale).toBeLessThanOrEqual(1.25);
  });
  it('reduces work on a slow device and preserves low-DPR displays', () => {
    expect(transitionScale(390, 844, 3, 2)).toBeLessThan(transitionScale(390, 844, 3));
    expect(transitionScale(320, 420, 1)).toBe(1);
  });
});
