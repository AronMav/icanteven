const segmenter = typeof Intl.Segmenter === 'function'
  ? new Intl.Segmenter('ru', { granularity: 'word' })
  : null;

export function countWordsFallback(text: string): number {
  return (text.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) ?? []).length;
}

export function countWords(text: string): number {
  if (!segmenter) return countWordsFallback(text);
  let count = 0;
  for (const part of segmenter.segment(text)) if (part.isWordLike) count++;
  return count;
}
