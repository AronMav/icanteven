// Stationary dotted paper shared by the editor, snapshots and social preview.
// Repaint only when the size or theme changes; no note content is involved.
export function paintPaper(canvas: HTMLCanvasElement, width: number, height: number, dark: boolean): boolean {
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;
  const scale = Math.min(devicePixelRatio || 1, 1.5,
    Math.sqrt(2_000_000 / Math.max(1, width * height)));
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  ctx.scale(scale, scale);

  const edge = 1;
  ctx.fillStyle = dark ? '#363a34' : '#f7f6ef';
  ctx.fillRect(edge, edge, width - edge * 2, height - edge * 2);

  // Restrained cellulose grain keeps the sheet tactile without staining it.
  let seed = 71429;
  const random = () => {
    seed = Math.imul(seed, 1664525) + 1013904223 | 0;
    return (seed >>> 0) / 4294967296;
  };
  for (let i = 0; i < Math.min(60_000, width * height * .1); i++) {
    ctx.fillStyle = i % 2 ? (dark ? '#ffffff07' : '#ffffff40') : (dark ? '#141a1109' : '#625d3e08');
    ctx.fillRect(edge + random() * Math.max(0, width - 3), edge + random() * Math.max(0, height - 3), .6, .5);
  }

  const spacing = 22;
  ctx.fillStyle = dark ? '#c9cdb670' : '#72796b70';
  ctx.beginPath();
  for (let y = spacing; y < height - 12; y += spacing) {
    for (let x = spacing; x < width - 12; x += spacing) {
      ctx.moveTo(x + 1, y);
      ctx.arc(x, y, 1, 0, Math.PI * 2);
    }
  }
  ctx.fill();

  // A clean, thin cut edge; the existing surface shadow separates paper and desk.
  ctx.lineWidth = .7;
  ctx.strokeStyle = dark ? '#a9b19630' : '#aaa99750';
  ctx.strokeRect(edge, edge, width - edge * 2, height - edge * 2);
  return true;
}
