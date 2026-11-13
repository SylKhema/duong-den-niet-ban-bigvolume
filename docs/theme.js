(() => {
  const root = document.documentElement;
  const key = 'nibbanagamini-theme';
  const system = window.matchMedia('(prefers-color-scheme: dark)');
  const modes = ['system', 'light', 'dark'];
  let preference = 'system';
  let control;

  try {
    const saved = localStorage.getItem(key);
    if (modes.includes(saved)) preference = saved;
  } catch {}

  function apply() {
    root.dataset.theme = preference === 'system' ? (system.matches ? 'dark' : 'light') : preference;
    if (control) control.value = preference;
  }

  function labelControl() {
    const english = root.lang === 'en';
    control.setAttribute('aria-label', english ? 'Reading theme' : 'Giao diện đọc');
    const labels = english ? ['System', 'Light', 'Dark'] : ['Theo thiết bị', 'Sáng', 'Tối'];
    for (const [index, option] of [...control.options].entries()) option.textContent = labels[index];
  }

  apply();
  system.addEventListener('change', apply);
  window.addEventListener('storage', event => {
    if (event.key === key || event.key === null) {
      preference = modes.includes(event.newValue) ? event.newValue : 'system';
      apply();
    }
  });

  document.addEventListener('DOMContentLoaded', () => {
    control = document.querySelector('[data-theme-picker]');
    if (!control) return;
    labelControl();
    apply();
    control.addEventListener('change', () => {
      preference = control.value;
      try { localStorage.setItem(key, preference); } catch {}
      apply();
    });
    new MutationObserver(labelControl).observe(root, { attributes: true, attributeFilter: ['lang'] });
  });
})();
