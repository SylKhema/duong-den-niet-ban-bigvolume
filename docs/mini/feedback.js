document.addEventListener('click', event => {
  const button = event.target.closest('[data-open-feedback], [data-feedback-paragraph]');
  if (!button) return;

  const paragraph = button.closest('.feedback-paragraph');
  const page = button.closest('[data-page]');
  const language = paragraph?.lang === 'en' || englishOnly ? 'en' : 'vi';
  const params = new URLSearchParams({
    series: 'mini',
    volume: String(current),
    language: paragraph ? language : readingLanguage,
  });
  if (page) {
    params.set('anchor', paragraph?.id || page.id);
    params.set('printed', page.dataset.printed || 'Bìa');
    params.set('pdf', page.dataset.pdf || '0');
    params.set('excerpt', (paragraph?.querySelector('.feedback-text')?.textContent || '').trim().slice(0, 2400));
  }
  window.open('/gop-y.html#' + params, '_blank', 'noopener');
});
