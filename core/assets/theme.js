(() => {
  const btn = document.querySelector('.theme-toggle');
  if (!btn) return;
  const root = document.documentElement;
  const saved = localStorage.getItem('nostroid-theme');
  if (saved) root.dataset.theme = saved;
  btn.hidden = false;
  btn.addEventListener('click', () => {
    const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
    localStorage.setItem('nostroid-theme', root.dataset.theme);
  });
})();
