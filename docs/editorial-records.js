const editorialRecords = (() => {
  const readerNotes = new Set(['M01-body-P026', 'M01-body-P161', 'M02-body-P039']);
  const blankPage = 'M01-body-P140';
  const isEditorialNote = page => /^(?:M01|M02)-/.test(page.id) && !readerNotes.has(page.id);

  function miniRecords(pages, englishPage, mode, escape, link) {
    const entries = new Map();
    function add(page, note, lang) {
      const key = lang + ':' + note;
      if (!entries.has(key)) entries.set(key, { note, lang, pages: [] });
      entries.get(key).pages.push(page);
    }
    for (const page of pages) {
      if (isEditorialNote(page)) for (const note of page.notes || []) add(page, note, 'vi');
      if (page.id !== blankPage) continue;
      for (const p of page.paragraphs) add(page, p.text, 'vi');
      if (mode !== 'vi' && englishPage) for (const note of Object.values(englishPage.paragraphs)) add(page, note, 'en');
    }
    if (!entries.size) return '';
    const english = mode === 'en';
    return '<section><h2>' + (english ? 'Editorial working notes' : 'Ghi chú kỹ thuật') + '</h2>' +
      (english ? '<p>Most working notes are in Vietnamese.</p>' : '') +
      '<ul>' + Array.from(entries.values(), ({ note, lang, pages }) =>
        '<li lang="' + lang + '"><p>' + escape(note) + '</p><p>' +
        pages.map(page => '<a href="' + escape(link(page.id)) + '">' + escape(page.id) + '</a>').join(' · ') +
        '</p></li>').join('') + '</ul></section>';
  }

  const bigNoteIds = {
    1: ['fn-1177', 'fn-1343'],
    3: ['hub-note-3', 'hub-note-5', 'hub-note-6'],
    5: ['note-ND-001'],
  };
  const bigStandalone = [
    '#V3-P563-02', '#V3-P564-02', '#V3-P565-02', '#V5-P058-13', '#V5-P100-03',
  ];
  const bigSuffixes = [
    '#V5-P019-06', '#V5-P053-08', '#V5-P072-07', '#V5-P075-04', '#V5-P089-05', '#V5-P113-11',
  ];

  function moveBig(root, volume) {
    const notes = root.querySelector('.book-notes');
    const archive = document.createElement('details');
    archive.id = 'hub-editorial-' + volume;
    const summary = document.createElement('summary');
    summary.textContent = 'Hồ sơ biên tập · Ghi chú kỹ thuật';
    archive.append(summary);
    function add(page, note) {
      const item = document.createElement('section');
      item.className = 'note-entry';
      item.append(note);
      const back = document.createElement('a');
      back.href = '#' + page.dataset.pageId;
      back.textContent = '↩ Trở về trang ' + page.dataset.printed;
      item.append(back);
      archive.append(item);
    }
    const charts = volume === 2 ? Array.from(root.querySelectorAll(
      '[data-page-id="front-pdf-214"] p, [data-page-id="front-pdf-215"] p'
    )).filter(p => /^Sơ đồ (?:nguyên tác )?chuyển thành bảng;/.test(p.textContent)) : [];
    for (const paragraph of [...root.querySelectorAll(bigStandalone.join(',')), ...charts]) {
      add(paragraph.closest('.book-page'), paragraph);
    }
    for (const paragraph of root.querySelectorAll(bigSuffixes.join(','))) {
      const first = Array.from(paragraph.childNodes).find(node => node.nodeType === 3 && node.data.includes(' [Chú thích người dịch:'));
      if (!first || !paragraph.textContent.trimEnd().endsWith(']')) continue;
      const note = document.createElement('p');
      const index = first.data.indexOf(' [Chú thích người dịch:');
      note.append(first.data.slice(index + 1));
      first.data = first.data.slice(0, index);
      while (first.nextSibling) note.append(first.nextSibling);
      add(paragraph.closest('.book-page'), note);
    }
    for (const id of bigNoteIds[volume] || []) {
      const item = notes.querySelector('#' + id);
      if (!item) continue;
      if (item.tagName === 'LI') {
        const list = document.createElement('ol');
        list.append(item);
        archive.append(list);
      } else archive.append(item);
    }
    if (archive.children.length > 1) notes.append(archive);
  }
  return { blankPage, isEditorialNote, miniRecords, moveBig };
})();
