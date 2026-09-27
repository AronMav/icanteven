import { describe, expect, it } from 'vitest';
import { countWords, countWordsFallback } from './words';
import { wordLabel } from './copy';

describe('local word count', () => {
  it.each([
    ['', 0], [' \n\t ', 0], ['… — !!! 🔥', 0],
    ['Мне сегодня непросто.', 3], ['Привет, world!\n42 причины', 4],
    ['один\u00a0два\tтри\nчетыре', 4], ["don't stop", 2],
  ])('counts %j as %i', (value, expected) => {
    expect(countWords(value)).toBe(expected);
    expect(countWordsFallback(value)).toBe(expected);
  });

  it('handles a long note', () => {
    expect(countWords('можно выговориться\n'.repeat(5000))).toBe(10000);
  });

  it.each([[0, '0 слов'], [1, '1 слово'], [2, '2 слова'], [11, '11 слов'], [14, '14 слов'], [21, '21 слово'], [22, '22 слова'], [111, '111 слов']])('inflects %i', (value, expected) => {
    expect(wordLabel(value)).toBe(expected);
  });
});
