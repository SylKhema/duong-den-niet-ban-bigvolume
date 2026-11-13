// Preserve early bookmarks and feedback links that point to the original homepage.
if (/^#(?:tap\/[1-5](?:\/|$)|(?:downloads|home)$)/.test(location.hash)) {
  const reader = new URL('/big/', location.href);
  reader.search = location.search;
  reader.hash = location.hash;
  location.replace(reader);
} else {
  const language = new URLSearchParams(location.search).get('lang');
  if (language === 'vi' || language === 'en') {
    document.documentElement.dataset.language = language;
    document.documentElement.lang = language;
    document.addEventListener('DOMContentLoaded', () => {
      document.querySelector('.language [aria-current]').removeAttribute('aria-current');
      document.querySelector('.language a[lang="' + language + '"]').setAttribute('aria-current', 'page');
      document.title = language === 'en' ? 'The Way to Nibbāna · Pa-Auk Tawya Sayadaw' : 'Đường Đến Niết-bàn · Pa-Auk Tawya Sayadaw';
    });
  }
}
