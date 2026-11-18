(() => {
  const root = document.documentElement;
  const surface = root.dataset.surface;
  if (surface !== 'big' && surface !== 'mini') return;
  const header = document.querySelector('header');
  if (!header) return;

  const SCROLL_THRESHOLD = 12;
  let hidden = false;
  let delta = 0;
  let suppressHideUntil = 0;

  function maxScrollY() {
    return Math.max(0, root.scrollHeight - window.innerHeight);
  }

  function clampedY() {
    return Math.max(0, Math.min(window.scrollY || 0, maxScrollY()));
  }

  let lastY = clampedY();
  let lastScrollHeight = root.scrollHeight;

  function isDrawerOpen() {
    if (surface === 'big') {
      return document.body.classList.contains('nav-open') && window.innerWidth <= 800;
    }
    return document.body.classList.contains('menu') && window.innerWidth <= 900;
  }

  function hasKeyboardFocus() {
    try {
      return Boolean(header.querySelector(':focus-visible'));
    } catch {
      return false;
    }
  }

  function setHidden(next) {
    if (next === hidden) return;
    hidden = next;
    root.classList.toggle('reader-header-hidden', hidden);
    if (hidden && header.contains(document.activeElement) && !hasKeyboardFocus()) {
      document.activeElement.blur?.();
    }
  }

  function reset(show = true) {
    if (show) setHidden(false);
    delta = 0;
    lastScrollHeight = root.scrollHeight;
    lastY = clampedY();
  }

  function syncAfterProgrammaticScroll(beforeY) {
    const afterY = clampedY();
    if (afterY !== beforeY) {
      reset(true);
    }
  }

  for (const [proto, method] of [
    [Element.prototype, 'scrollIntoView'],
    [window, 'scrollTo'],
    [window, 'scroll'],
  ]) {
    const original = proto[method];
    if (typeof original !== 'function') continue;
    proto[method] = function (...args) {
      const beforeY = clampedY();
      const result = original.apply(this, args);
      syncAfterProgrammaticScroll(beforeY);
      return result;
    };
  }

  function onScroll() {
    const sh = root.scrollHeight;
    const y = clampedY();

    if (isDrawerOpen() || hasKeyboardFocus() || document.querySelector('dialog[open]')) {
      reset(true);
      return;
    }

    const headerHeight = header.offsetHeight || 80;
    if (y <= headerHeight) {
      reset(true);
      return;
    }

    if (sh !== lastScrollHeight) {
      lastScrollHeight = sh;
      lastY = y;
      delta = 0;
      return;
    }

    const dy = y - lastY;
    lastY = y;

    if (dy === 0) return;

    if ((dy > 0 && delta < 0) || (dy < 0 && delta > 0)) {
      delta = 0;
    }
    delta += dy;

    if (dy > 0) {
      if (performance.now() < suppressHideUntil) {
        delta = 0;
        return;
      }
      if (delta >= SCROLL_THRESHOLD) {
        setHidden(true);
        delta = 0;
      }
    } else if (delta <= -SCROLL_THRESHOLD) {
      setHidden(false);
      delta = 0;
    }
  }

  const onUserScrollInput = () => {
    suppressHideUntil = 0;
    lastScrollHeight = root.scrollHeight;
  };
  window.addEventListener('wheel', onUserScrollInput, { passive: true });
  window.addEventListener('touchmove', onUserScrollInput, { passive: true });
  window.addEventListener('keydown', e => {
    if (
      e.key === 'ArrowDown' ||
      e.key === 'ArrowUp' ||
      e.key === 'PageDown' ||
      e.key === 'PageUp' ||
      e.key === 'Home' ||
      e.key === 'End' ||
      e.key === ' '
    ) {
      onUserScrollInput();
    }
  });

  header.addEventListener('pointerdown', () => {
    suppressHideUntil = performance.now() + 400;
  });
  header.addEventListener('click', () => {
    suppressHideUntil = performance.now() + 400;
    lastY = clampedY();
    delta = 0;
  });
  header.addEventListener('focusin', () => {
    setHidden(false);
    delta = 0;
  });

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', () => {
    if (isDrawerOpen() || clampedY() <= (header.offsetHeight || 80)) {
      reset(true);
    } else {
      reset(false);
    }
  }, { passive: true });

  window.addEventListener('hashchange', () => {
    suppressHideUntil = performance.now() + 400;
    reset(true);
  });

  window.addEventListener('pageshow', () => {
    reset(true);
  });

  if (document.body) {
    new MutationObserver(() => {
      if (isDrawerOpen()) reset(true);
    }).observe(document.body, { attributes: true, attributeFilter: ['class'] });

    if (typeof ResizeObserver === 'function') {
      new ResizeObserver(() => {
        if (root.scrollHeight !== lastScrollHeight) {
          lastScrollHeight = root.scrollHeight;
          lastY = clampedY();
          delta = 0;
        }
      }).observe(document.body);
    }
  }
})();
