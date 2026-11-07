'use strict';

// The draft is visible only when an explicit preview URL is used.
const languageParams = new URLSearchParams(location.search);
const preview = languageParams.get('preview') === 'english';
const language = preview && ['en', 'vi-en'].includes(languageParams.get('lang'))
  ? languageParams.get('lang') : 'vi';
const englishOnly = language === 'en';
const englishEnabled = language !== 'vi';
let englishPilot;

function englishUrl(mode, hash = location.hash) {
  const url = new URL(location.href);
  url.searchParams.set('lang', mode);
  url.hash = hash;
  return url.href;
}

function configureEnglishPilot() {
  if (!preview) return;
  const selector = document.querySelector('#hub-language');
  selector.hidden = false;
  selector.value = language;
  selector.onchange = () => {
    const anchors = [...document.querySelectorAll(
      '#hub-reader .paragraph-anchor, #hub-reader .english-row[id]'
    )];
    const current = anchors.findLast(anchor => anchor.getBoundingClientRect().top < 115);
    const hash = location.hash || (activeVol && current ? href(activeVol, current.id) : '');
    location.assign(englishUrl(selector.value, hash));
  };
  if (!englishOnly) return;
  document.documentElement.lang = 'en';
  const labels = {
    '.skip': 'Skip to content',
    '.header-links a': 'Library',
    '#hub-resume': 'Resume reading',
    '.side-top .eyebrow': 'FIVE VOLUMES · ONE LIBRARY',
    '.side-top h2': 'Contents',
    '#hub-collapse': 'Collapse all',
    '#hub-expand': 'Expand all',
    '.side-bottom span': 'Translated directly from Burmese',
    '.searchbar label': 'Search the English pilot',
    '#hub-source-open': 'Open PDF separately',
    '#hub-source-close': 'Close',
  };
  for (const [selector, label] of Object.entries(labels)) $(selector).textContent = label;
  $('#hub-menu').ariaLabel = 'Toggle contents';
  $('#hub-q').placeholder = 'Search the English text or Pāli…';
  $('#hub-scope').hidden = true;
  $('#hub-toc').ariaLabel = 'Contents of all five volumes';
  $('#hub-source-frame').title = 'Burmese source PDF';
  $('.header-links a[href="#downloads"]').hidden = true;
  $('.review-notice').hidden = true;
  $('footer').hidden = true;
}

function englishHome() {
  return '<div class="hero" lang="en"><p class="eyebrow">PA-AUK TAWYA SAYADAW</p>' +
    '<h1>The Practice Leading to Nibbāna</h1><p>Nibbānagāminipaṭipadā · The five-volume edition</p>' +
    '<p>Review preview. English translated directly from the Burmese first edition. ' +
    'Volume I contains the first pilot selections and awaits editorial review.</p>' +
    '<a href="' + href(1) + '">Read the Volume I pilot</a></div>';
}

function englishContents(book) {
  const key = row => JSON.stringify([row.target, row.printed, row.depth]);
  const translated = new Map((book.vol === 1 ? englishPilot.toc : []).map(row => [key(row), row.title]));
  return book.toc.map(row => {
    const label = translated.get(key(row));
    if (!englishOnly) return label ? {...row, title: row.title + ' / ' + label} : row;
    return {...row, title: label || row.title, lang: label ? 'en' : 'vi'};
  });
}

function unavailable(volume, id) {
  return '<p class="english-gap" lang="en">English is pending here. ' +
    'See the volume heading for the current review coverage. ' +
    '<a href="' + esc(englishUrl('vi', href(volume, id))) + '">Read this location in Vietnamese</a>.</p>';
}

function englishBook(book) {
  const volume = book.vol;
  const entries = volume === 1 ? englishPilot.pages : {};
  const parts = [];
  let gap;
  let previousHadEnglish = true;
  for (const page of book.pages) {
    const groups = entries[page.id];
    if (!groups && englishOnly) {
      if (!gap) {
        gap = document.createElement('section');
        gap.className = 'english-gap';
        gap.innerHTML = unavailable(volume, page.id);
        gap.querySelector('a').dataset.englishFallback = '';
        parts.push(gap);
      }
      const source = document.createElement('template');
      source.innerHTML = page.html;
      for (const node of source.content.querySelectorAll('[id]')) {
        const anchor = document.createElement('span');
        anchor.id = node.id;
        gap.append(anchor);
      }
      continue;
    }
    gap = null;
    const wrapper = document.createElement('div');
    wrapper.className = 'book-page';
    wrapper.dataset.pageId = page.id;
    wrapper.dataset.printed = page.printed;
    const sourceLine = englishOnly
      ? 'Volume ' + book.roman + ' · Source PDF ' + page.pdf
      : 'Tập ' + book.roman + ' · PDF nguồn ' + page.pdf;
    wrapper.innerHTML = '<div class="source-line"><span>' + sourceLine +
      '</span><button data-source-vol="' + volume + '" data-source-pdf="' + page.pdf + '">' +
      (englishOnly ? 'View Burmese source ↗' : 'Đối chiếu nguyên tác ↗') + '</button></div>' + page.html;
    if (!groups) {
      if (previousHadEnglish) wrapper.insertAdjacentHTML('beforeend', unavailable(volume, page.id));
      previousHadEnglish = false;
      parts.push(wrapper);
      continue;
    }
    previousHadEnglish = true;
    const section = wrapper.querySelector('.read-section');
    const aligned = [];
    const leading = [];
    let current;
    for (const node of [...section.children]) {
      const anchor = node.matches('.paragraph-anchor')
        ? node : node.querySelector('.paragraph-anchor');
      if (anchor) {
        current = {key: anchor.id, nodes: aligned.length ? [] : leading};
        aligned.push(current);
      }
      (current?.nodes || leading).push(node);
    }
    for (const {key, nodes} of aligned) {
      const row = document.createElement('div');
      row.className = englishOnly ? 'english-row' : 'parallel-row';
      const vi = document.createElement('div');
      vi.lang = 'vi';
      vi.append(...nodes);
      const en = document.createElement('div');
      en.lang = 'en';
      en.innerHTML = groups[key] || unavailable(volume, key);
      if (englishOnly) {
        row.id = key;
        for (const node of vi.querySelectorAll('[id]')) {
          if (node.id !== key && ![...en.querySelectorAll('[id]')].some(x => x.id === node.id)) {
            const anchor = document.createElement('span');
            anchor.id = node.id;
            row.append(anchor);
          }
        }
      } else {
        for (const heading of en.querySelectorAll('[id]')) {
          if ([...vi.querySelectorAll('[id]')].some(x => x.id === heading.id)) heading.removeAttribute('id');
        }
        row.append(vi);
      }
      row.append(en);
      section.append(row);
    }
    parts.push(wrapper);
  }
  const intro = document.createElement('section');
  intro.className = 'book-head';
  intro.lang = 'en';
  intro.innerHTML = '<p class="eyebrow">PA-AUK TAWYA SAYADAW · VOLUME ' + book.roman +
    '</p><h1>The Practice Leading to Nibbāna</h1><p>English review preview · ' +
    (volume === 1 ? esc(englishPilot.coverage) : 'English is pending for this volume.') + '</p>';
  const notes = document.createElement('section');
  notes.id = 'hub-notes-' + volume;
  notes.className = 'book-notes';
  if (!englishOnly) notes.innerHTML = '<div lang="vi"><h2>Chú thích và hồ sơ</h2>' + book.notesHtml + '</div>';
  if (volume === 1) notes.insertAdjacentHTML('afterbegin',
    '<div lang="en"><h2>English notes and source references</h2>' + englishPilot.notesHtml + '</div>');
  parts.unshift(intro);
  parts.push(notes);
  $('#hub-reader').replaceChildren(...parts);
}

function searchEnglish(query) {
  const hits = [];
  for (const groups of Object.values(englishPilot.pages)) {
    for (const [target, html] of Object.entries(groups)) {
      const template = document.createElement('template');
      template.innerHTML = html;
      const text = template.content.textContent;
      if (norm(text).includes(query)) hits.push({target, text});
    }
  }
  $('#hub-home').hidden = true;
  $('#hub-reader').hidden = true;
  $('#hub-results').hidden = false;
  $('#hub-results').innerHTML = '<h1>' + hits.length + ' results</h1>' + hits.map(
    hit => '<a class="result-row" href="' + href(1, hit.target) + '">' + esc(hit.text.slice(0, 290)) + '</a>'
  ).join('');
  $('#hub-status').textContent = '';
}
