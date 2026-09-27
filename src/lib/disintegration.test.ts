import { describe, expect, it } from 'vitest';
import { pixelGrid } from './disintegration';

describe('disintegration particle budget', () => {
  it.each([[390, 844, 5000], [1362, 715, 10000], [3840, 2160, 10000], [1, 20000, 5000], [1, 1, 5000]])(
    'covers a %ix%i sheet within %i particles', (width, height, limit) => {
      const { columns, rows } = pixelGrid(width, height);
      expect(columns).toBeGreaterThanOrEqual(1);
      expect(rows).toBeGreaterThanOrEqual(1);
      expect(Number.isInteger(columns) && Number.isInteger(rows)).toBe(true);
      expect(columns * rows).toBeLessThanOrEqual(limit);
      // Source-cell centres stay within the snapshot, including the last row.
      expect((columns - .5) / columns).toBeLessThan(1);
      expect((rows - .5) / rows).toBeLessThan(1);
    },
  );
});
