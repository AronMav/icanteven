import type { BurnHandle } from './burn';

export function transitionScale(width: number, height: number, dpr: number, level = 0): number {
  const budget = width <= 700 ? 320_000 : 640_000;
  return Math.min(dpr || 1, 1.25, Math.sqrt(budget / Math.max(1, width * height))) * Math.pow(.75, level);
}

/** No graphics support is required to clear the note. */
export function fadePaper(host: HTMLDivElement, snapshot: HTMLCanvasElement, ready: () => void): BurnHandle {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'display:block;width:100%;height:100%';
  canvas.width = snapshot.width; canvas.height = snapshot.height;
  canvas.getContext('2d')?.drawImage(snapshot, 0, 0);
  host.append(canvas);
  let resolve!: () => void, stopped = false;
  const finished = new Promise<void>(done => { resolve = done; });
  const finish = () => {
    if (stopped) return;
    stopped = true; clearTimeout(timeout); animation?.cancel();
    canvas.remove(); canvas.width = canvas.height = snapshot.width = snapshot.height = 0; resolve();
  };
  const animation = canvas.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 350, fill: 'forwards' });
  const timeout = setTimeout(finish, 600);
  void animation.finished.then(finish, () => {});
  ready();
  return { finished, cancel: finish };
}
