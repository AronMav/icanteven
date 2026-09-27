// Run before styles or the app, so a dark preference never flashes white.
(() => {
  let preference = 'system';
  try {
    const saved = localStorage.getItem('icanteven.theme');
    if (saved === 'light' || saved === 'dark') preference = saved;
  } catch { /* Storage can be unavailable in private/locked-down browsers. */ }
  const dark = preference === 'dark' || (preference === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]').content = dark ? '#202522' : '#ECEEE9';
})();
