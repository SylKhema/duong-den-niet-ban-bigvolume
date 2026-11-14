const readerFormat = (() => {
  const titles = /(?<![\p{L}\p{M}])(?:Nibbānagāminipaṭipadā(?:[ \t]+\((?:Pháp hành đưa đến Niết[-–]bàn|The Practice Leading to Nibbāna)\))?|Đường [Đđ]ến Niết[-–]bàn|The Way to Nibbāna|The Practice (?:that Leads|Leading) to Nibbāna|Visuddhimagga|Thanh Tịnh Đạo|The Path of Purification|Vimuttimagga|Giải Thoát Đạo|Abhidhammatthasaṅgaha|Atthasālinī|Sammohavinodanī|Paṭisambhidāmagga|Milindapañha|Kathāvatthu|Yamakappakaraṇa)(?![\p{L}\p{M}])/giu;
  const paliMark = /[āīūṅñṭḍṇḷṃṁ]/iu;
  const paliWords = /^(?:bhikkhave|bhikkhu|iti|kho|pana|hi|eva|ca|vā|ahaṃ|idaṃ|ayaṃ|etaṃ|kathaṃ|katamaṃ|kiñca|yathā|nāma|hoti|honti|atthi|natthi|ñatvā|passati|pajānāti|yathābhūtaṃ|tena|tassa|tathā|so|yo|yaṃ|na|ce|ti|vata|pe|sikkhati|jināti|ciraṃ|tiṭṭhatu|saddhammo|sabbepi|siyā|sabbe|labhitvāna|yathārahaṃ|pavattati|veditabbaṃ|veditabbā|vuccati|nesaṃ|tasmā|atha|tattha|sādhu)$/iu;
  const englishWords = /\b(?:the|this|these|those|that|with|from|which|when|where|and|or|are|was|were|have|has|being|means|should|shall|not|into|their|they|who|than|because|thus|translation|vol\.?|page)\b/iu;
  const quoted = /“([^“”\n]+)”|‘([^‘’\n]+)’|"([^"\n]+)"/gu;

  function isPali(text) {
    const value = text.normalize('NFC').replace(/\[(?:NT|N)\d+\]/gi, '');
    if (/^\s*P[ĀA]LI\s*:/iu.test(value) && !/[^\x00-\x7fāīūṅñṭḍṇḷṃṁ‘’“”–—…·]/iu.test(value)) {
      return !englishWords.test(value);
    }
    // Vietnamese-specific letters and English prose can contain quoted Pāli terms.
    if (/[^\x00-\x7fāīūṅñṭḍṇḷṃṁ‘’“”–—…·]/iu.test(value) || englishWords.test(value)) return false;
    const words = value.match(/\p{L}+/gu) || [];
    const cues = words.filter(word => paliWords.test(word)).length;
    return words.length >= 4 && paliMark.test(value) && (cues >= 2 || (cues === 1 && words.filter(word => paliMark.test(word)).length >= 3));
  }

  function ranges(text, allowQuotes) {
    const spans = [...text.matchAll(titles)].map(match => ({ start: match.index, end: match.index + match[0].length, tag: 'strong' }));
    if (allowQuotes) {
      for (const match of text.matchAll(quoted)) {
        const inner = match[1] ?? match[2] ?? match[3];
        if (!isPali(inner)) continue;
        const start = match.index + 1;
        const end = start + inner.length;
        if (!spans.some(span => span.start < end && span.end > start)) spans.push({ start, end, tag: 'i' });
      }
    }
    return spans.sort((a, b) => a.start - b.start);
  }

  function paragraph(text, escape) {
    const block = isPali(text);
    let last = 0;
    let result = '';
    for (const { start, end, tag } of ranges(text, !block)) {
      const attr = tag === 'i' ? ' class="pali-quote" lang="pi-Latn"' : '';
      result += escape(text.slice(last, start)) + '<' + tag + attr + '>' + escape(text.slice(start, end)) + '</' + tag + '>';
      last = end;
    }
    return { content: result + escape(text.slice(last)), block };
  }

  function decorate(root) {
    for (const element of root.querySelectorAll('.book-page p, .book-page blockquote, .book-notes p, .book-notes blockquote')) {
      if (element.matches('blockquote') && element.querySelector('p')) continue;
      const explicit = element.closest('.pali, [lang="pi"], [lang="pi-Latn"]');
      const block = Boolean(explicit || isPali(element.textContent));
      if (block) {
        element.classList.add('pali-quote');
        element.lang = 'pi-Latn';
      }
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      const nodes = [];
      for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node);
      for (const node of nodes) {
        if (node.parentElement.closest('strong, b, a, code, .pali-quote:not(p, blockquote)')) continue;
        const spans = ranges(node.data, !block);
        if (!spans.length) continue;
        const fragment = document.createDocumentFragment();
        let last = 0;
        for (const { start, end, tag } of spans) {
          fragment.append(node.data.slice(last, start));
          const marked = document.createElement(tag);
          marked.textContent = node.data.slice(start, end);
          if (tag === 'i') {
            marked.className = 'pali-quote';
            marked.lang = 'pi-Latn';
          }
          fragment.append(marked);
          last = end;
        }
        fragment.append(node.data.slice(last));
        node.replaceWith(fragment);
      }
    }
  }
  return { paragraph, decorate };
})();
