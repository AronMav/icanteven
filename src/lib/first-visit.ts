const aboutSeenKey = 'icanteven.aboutSeen';

/** Persist only a UI flag, never a note or a visitor identifier. */
export function openAboutOnFirstVisit(open: () => void): boolean {
  try {
    if (localStorage.getItem(aboutSeenKey) === '1') return false;
  } catch { /* The introduction can still open when storage is blocked. */ }

  try { open(); } catch { return false; }

  try { localStorage.setItem(aboutSeenKey, '1'); }
  catch { /* Storage failure must not prevent writing or closing the dialog. */ }
  return true;
}
