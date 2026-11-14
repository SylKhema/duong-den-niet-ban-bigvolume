(() => {
  const toolbar = document.querySelector('.reading-size');
  const [smaller, larger] = toolbar.querySelectorAll('button');
  const output = toolbar.querySelector('output');
  const sizes = [90, 100, 110, 120, 135, 150, 175, 200];
  const key = 'nibbana-reading-size';
  let index = sizes.indexOf(100);
  try {
    const saved = sizes.indexOf(Number(localStorage.getItem(key)));
    if (saved >= 0) index = saved;
  } catch {}
  const english = document.documentElement.lang === 'en';
  const labels = english ? ['Decrease text size', 'Increase text size'] : ['Giảm cỡ chữ', 'Tăng cỡ chữ'];
  toolbar.setAttribute('aria-label', english ? 'Reading text size' : 'Cỡ chữ khi đọc');
  smaller.setAttribute('aria-label', labels[0]);
  larger.setAttribute('aria-label', labels[1]);
  function apply() {
    const size = sizes[index];
    document.documentElement.style.setProperty('--reading-scale', String(size / 100));
    output.textContent = size + '%';
    smaller.disabled = index === 0;
    larger.disabled = index === sizes.length - 1;
  }
  function change(step) {
    index = Math.max(0, Math.min(sizes.length - 1, index + step));
    apply();
    try { localStorage.setItem(key, sizes[index]); } catch {}
  }
  smaller.addEventListener('click', () => change(-1));
  larger.addEventListener('click', () => change(1));
  apply();
  toolbar.hidden = false;
})();
