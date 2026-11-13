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
  input.addEventListener('input', searchHighlight.clear);
  const results = document.getElementById(mini ? 'results' : 'hub-results');
  results.addEventListener('click', event => {
    const result = event.target.closest('a');
    if (!result || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    searchHighlight.select(result.hash, results.dataset.searchQuery);
    if (!mini) return;
    document.body.classList.remove('menu');
    if (result.hash === location.hash) {
      event.preventDefault();
      const target = document.getElementById(result.hash.split('/')[1]);
      searchHighlight.locate(target)?.scrollIntoView({ block: 'start' });
    }
  });
})();

