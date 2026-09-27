// A temporary bitmap of only the visible paper; never serialized or uploaded.
// The editable note is removed immediately after this function returns.
export function capturePaper(paper: HTMLElement, editor: HTMLTextAreaElement): HTMLCanvasElement | null {
  const bounds = paper.getBoundingClientRect();
  const input = editor.getBoundingClientRect();
  const style = getComputedStyle(editor);
  const paperStyle = getComputedStyle(paper);
  const canvas = document.createElement('canvas');
  const scale = Math.min(window.devicePixelRatio || 1, 1.5,
    Math.sqrt(2_000_000 / Math.max(1, bounds.width * bounds.height)));
  canvas.width = Math.round(bounds.width * scale);
  canvas.height = Math.round(bounds.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.scale(scale, scale);
  const surface = paper.querySelector<HTMLCanvasElement>('[data-paper-surface].ready');
  if (surface?.width && surface.height) {
    ctx.drawImage(surface, 0, 0, bounds.width, bounds.height);
  } else {
    ctx.fillStyle = paperStyle.getPropertyValue('--sheet').trim();
    ctx.fillRect(0, 0, bounds.width, bounds.height);
  }

  for (const caption of paper.querySelectorAll<HTMLElement>('[data-snapshot]')) {
    const position = caption.getBoundingClientRect();
    const captionStyle = getComputedStyle(caption);
    ctx.font = `${captionStyle.fontWeight} ${captionStyle.fontSize} ${captionStyle.fontFamily}`;
    ctx.fillStyle = captionStyle.color;
    ctx.textBaseline = 'top';
    ctx.fillText(caption.textContent ?? '', position.left - bounds.left, position.top - bounds.top);
  }

  const paddingLeft = parseFloat(style.paddingLeft);
  const paddingTop = parseFloat(style.paddingTop);
  const x = input.left - bounds.left + paddingLeft;
  const top = input.top - bounds.top + paddingTop;
  const width = editor.clientWidth - paddingLeft - parseFloat(style.paddingRight);
  const bottom = input.bottom - bounds.top - parseFloat(style.paddingBottom);
  const lineHeight = parseFloat(style.lineHeight);
  const fontSize = parseFloat(style.fontSize);
  let y = top - editor.scrollTop;
  ctx.save();
  ctx.beginPath();
  ctx.rect(input.left - bounds.left, input.top - bounds.top, editor.clientWidth, editor.clientHeight);
  ctx.clip();
  ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  ctx.fillStyle = style.color;
  ctx.textBaseline = 'alphabetic';

  const drawLine = (line: string) => {
    if (y + lineHeight >= top && y < bottom) {
      const baseline = y + (lineHeight - fontSize) / 2 + fontSize * 0.8;
      ctx.fillText(line, x, baseline);
    }
    y += lineHeight;
  };

  // Browser-like word wrapping, with character wrapping for long unbroken words.
  for (const paragraph of editor.value.replace(/\t/g, '    ').split('\n')) {
    if (y > bottom) break;
    let line = '';
    for (const token of paragraph.match(/\S+| +/gu) ?? []) {
      if (line && ctx.measureText(line + token).width > width) {
        drawLine(line);
        line = '';
        if (/^ +$/.test(token)) continue;
      }
      if (ctx.measureText(token).width > width) {
        for (const character of token) {
          if (line && ctx.measureText(line + character).width > width) {
            drawLine(line);
            line = '';
          }
          line += character;
        }
      } else line += token;
      if (y > bottom) break;
    }
    drawLine(line);
  }
  ctx.restore();
  return canvas;
}
