(() => {
  const button = document.querySelector('[data-book-search]');
  const input = document.getElementById(button.dataset.bookSearch);
  const mini = input.id === 'search';

  function openSearch() {
    if (mini && window.matchMedia('(max-width: 900px)').matches) {
      document.body.classList.add('menu');
    }
    input.focus({ preventScroll: true });
    input.scrollIntoView({ block: 'nearest' });
  }

  button.setAttribute('aria-controls', input.id);
  button.addEventListener('click', openSearch);
  if (new URLSearchParams(location.search).get('search') === '1') {
    if (mini) document.getElementById('scope').value = 'all';
    openSearch();
  }
  if (mini) {
    document.getElementById('results').addEventListener('click', event => {
      const result = event.target.closest('a');
      if (!result) return;
      document.body.classList.remove('menu');
      if (result.hash === location.hash) {
        event.preventDefault();
        document.getElementById(result.hash.split('/')[1])?.scrollIntoView({ block: 'start' });
      }
    });
  }
})();
