export type ThemePreference = 'system' | 'light' | 'dark';
const themeKey = 'icanteven.theme';

export function readTheme(): ThemePreference {
  try {
    const value = localStorage.getItem(themeKey);
    if (value === 'light' || value === 'dark') return value;
  } catch { /* Theme still works without persistent storage. */ }
  return 'system';
}

export function applyTheme(preference: ThemePreference): void {
  const dark = preference === 'dark' || (preference === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#202522' : '#ECEEE9');
}

export function saveTheme(preference: ThemePreference): void {
  try {
    if (preference === 'system') localStorage.removeItem(themeKey);
    else localStorage.setItem(themeKey, preference);
  } catch { /* Saving a preference must never block writing. */ }
}
