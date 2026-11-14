const readerFormat = (() => {
  const titles = /(?<![\p{L}\p{M}])(?:Nibbānagāminipaṭipadā(?:[ \t]+\((?:Pháp hành đưa đến Niết[-–]bàn|The Practice Leading to Nibbāna)\))?|Đường [Đđ]ến Niết[-–]bàn|The Way to Nibbāna|The Practice (?:that Leads|Leading) to Nibbāna|Visuddhimagga|Thanh Tịnh Đạo|The Path of Purification|Vimuttimagga|Giải Thoát Đạo|Abhidhammatthasaṅgaha|Atthasālinī|Sammohavinodanī|Paṭisambhidāmagga|Milindapañha|Kathāvatthu|Yamakappakaraṇa)(?![\p{L}\p{M}])/giu;
  const paliMark = /[āīūṅñṭḍṇḷṃṁ]/iu;
  const paliWords = /^(?:bhikkhave|bhikkhu|iti|kho|pana|hi|eva|ca|vā|ahaṃ|idaṃ|ayaṃ|etaṃ|kathaṃ|katamaṃ|kiñca|yathā|nāma|hoti|honti|atthi|natthi|ñatvā|passati|pajānāti|yathābhūtaṃ|tena|tassa|tathā|so|yo|yaṃ|na|ce|ti|vata|pe|sikkhati|jināti|ciraṃ|tiṭṭhatu|saddhammo|sabbepi|siyā|sabbe|labhitvāna|yathārahaṃ|pavattati|veditabbaṃ|veditabbā|vuccati|nesaṃ|tasmā|atha|tattha|sādhu)$/iu;
  const englishWords = /\b(?:the|this|these|those|that|with|from|which|when|where|and|or|are|was|were|have|has|being|means|should|shall|not|into|their|they|who|than|because|thus|translation|vol\.?|page)\b/iu;
  const languageChars = /[^\x00-\x7fāīūṅñṭḍṇḷṃṁ‘’“”–—…·]/iu;
  const sourceTail = /\s+\((?:Chú giải|Phụ chú giải|Commentary|Subcommentary|Source|Abhidhamma|Visuddhimagga|Visuddhi|Mūlaṭīkā|Mahāṭīkā|Khuddaka|Majjhima|Dīgha|Saṃyutta|Aṅguttara|Vinaya)(?=[\s,.:)])[^()\n]*\)\s*[.]?\s*$/iu;
  const quoted = /“([^“”\n]+)”|‘([^‘’\n]+)’|"([^"\n]+)"/gu;

  // Short quotations checked against the legacy bold markup in Volume I.
  const verifiedQuotes = new Set([
    "Āyatiṃ paṭisandhiyā paccayo hotī",
    "jātaṃ rūpaṃ paccuppanna",
    "sayaṃ paññācakkhunā diṭṭha",
    "Jarāmaraṇanirodhagāminiyā paṭipadāya ñāṇaṃ",
    "Saṅkhāranirodhagāminiyā paṭipadāya ñāṇaṃ",
    "Ahosiṃ nu kho atītamaddhānaṃ.",
    "Ekomhi sammāsambuddho, sītibhūtosmi nibbuto.",
    "Advejjhavacanā buddhā, amoghavacanā jinā.",
    "Tatheva buddhaseṭṭhānaṃ, vacanaṃ dhuvasassataṃ.",
    "Yathāpi sabbasattānaṃ, maraṇaṃ dhuvasassataṃ.",
    "Suttānulomaṃ nāma anulomakappiyaṃ.",
    "Ācariyavādo nāma aṭṭhakathā.",
    "Ācariyavādopi suttena samentoyeva gahetabbo, na itaro.",
    "Diṭṭhīti kammassakatādiṭṭhi.",
    "Sīle patiṭṭhāya naro sapañño",
    "Aniccādivasena vividhehi ākārehi dhamme passatīti vipassanā.",
    "Sabbopi panesa pabhedo manodvārikajavaneyeva labbhati.",
    "Anattalakkhaṇapaññāpanañhi aññassa kassaci avisayo, sabbaññubuddhānameva visayo.",
    "Ekaccharakkhaṇe koṭisatasahassasaṅkhā uppajjitvā nirujjhati.",
    "Ghanavinibbhoganti santatisamūhakiccaghanānaṃ vinibbhujanaṃ vivecanaṃ.",
    "Katame dhammā anārammaṇā?",
    "Ñātañca ñāṇañca ubhopi vipassati.",
    "Mānabhañjanatthaṃ sabbadhammamūlapariyāyanti desanaṃ ārabhi.",
    "Evaṃ rūpamukhena saṅkhāravatthukaṃ maññanaṃ vatvā.",
    "Athassa tiparivaṭṭadesanāvasāne arahattaṃ pattassa ...",
    "Bandheyevaṃ sakaṃ cittaṃ, satiyārammaṇe daḷhaṃ.",
    "7. Yasmiṃ samaye cittaṃ ajjhupekkhitabbaṃ, tasmiṃ samaye cittaṃ ajjhupekkhati",
    "vātarāsiyeva vaḍḍhatī’ti",
    "Samādhi kāmacchandassa paṭipakkho",
    "Pabhassaramidaṃ, bhikkhave, cittaṃ.",
    "Sabhāvovāyaṃ cittassa paṇḍaratā.",
    "Manodhātumanoviññāṇadhātūnaṃ nissayalakkhaṇaṃ hadayavatthu.",
    "Ettha pana manoti bhavaṅgacittaṃ.",
    "Opapātikānampi sattasantativasena sattatirūpāni evameva pavattanti.",
    "Upādiṇṇaṃ kammajarūpaṃ paccayaṃ labhitvā",
    "Iriyāpathampi upatthambhentīti yathāpavattaṃ iriyāpathaṃ upatthambhenti.",
    "Abbokiṇṇeti antarantarā uppajjamānehi asaṃsaṭṭhe.",
    "Kiriyamayacittehi avimissabhavaṅgappavattikāle khandhādisarīrāvayavānaṃ niccalabhāvenāvaṭṭhānaṃ.",
    "Assāsapassāsā cittasamuṭṭhānāva.",
    "Pacchājātā cittacetasikā dhammā purejātassa imassa kāyassa pacchājātapaccayena paccayo.",
    "Evaṃ cittajarūpassa nibbatti passitabbā.",
    "Āhāroti ajjhattiko rūpuppādako āhāro.",
    "upādiṇṇaṃ kammajarūpaṃ paccayaṃ labhitvā",
    "Ekadivasaṃ paribhuttāhāro sattāhampi upatthambheti.",
    "ajjhoharaṇakāle samuṭṭhāpeti",
    "Ṭhānappattova samuṭṭhāpeti",
    "Dravatā sahavuttīni, tīṇi bhūtāni samphusaṃ.",
    "upādiṇṇakaṃ paccayaṃ labhitvā",
    "Upādiṇṇakaṃ paccayaṃ labhitvā",
    "Rūpābhighātārahabhūtappasādalakkhaṇaṃ cakkhu.",
    "Phoṭṭhabbābhighātārahabhūtappasādalakkhaṇo kāyo.",
    "Saddābhighātārahabhūtappasādalakkhaṇaṃ sotaṃ.",
    "Gandhābhighātārahabhūtappasādalakkhaṇaṃ ghānaṃ.",
    "Rasābhighātārahabhūtappasādalakkhaṇā jivhā.",
    "Antaguṇanti antabhogaṭṭhānesu bandhanaṃ.",
    "Assāsapassāsā cittasamuṭṭhānā.",
    "Ruppanaṭṭho sītādivirodhipaccayasannipāte visadisuppatti.",
    "Sītādīti sītuṇhajighacchāpipāsādi.",
  ]);

  function isPali(text) {
    const value = text.normalize('NFC').replace(/\[(?:NT|N)\d+\]/gi, '');
    if (verifiedQuotes.has(value.trim().replace(/^[“‘"' ]+|[”’"' ]+$/gu, ''))) return true;
    if (/^\s*P[ĀA]LI\s*:/iu.test(value) && !languageChars.test(value)) {
      return !englishWords.test(value);
    }
    // Vietnamese-specific letters and English prose can contain quoted Pāli terms.
    if (languageChars.test(value) || englishWords.test(value)) return false;
    const words = value.match(/\p{L}+/gu) || [];
    const cues = words.filter(word => paliWords.test(word)).length;
    const marked = words.filter(word => paliMark.test(word)).length;
    return words.length >= 4 && marked > 0 &&
      (cues >= 2 || (cues === 1 && marked >= 3) ||
       (words.length >= 6 && marked >= Math.ceil(words.length * .65) && /[ṭḍṇḷṅṃṁ]/iu.test(value)));
  }

  function ranges(text, allowQuotes) {
    const spans = [];
    if (allowQuotes) {
      const source = text.match(sourceTail);
      if (source && isPali(text.slice(0, source.index))) {
        spans.push({ start: 0, end: source.index, tag: 'i' });
      }
      for (const match of text.matchAll(quoted)) {
        const inner = match[1] ?? match[2] ?? match[3];
        const start = match.index + 1;
        if (isPali(inner) && !spans.some(span => start < span.end)) {
          spans.push({ start, end: start + inner.length, tag: 'i' });
        }
      }
    }
    for (const match of text.matchAll(titles)) {
      const start = match.index;
      const end = start + match[0].length;
      if (!spans.some(span => start < span.end && end > span.start)) spans.push({ start, end, tag: 'strong' });
    }
    return spans.sort((a, b) => a.start - b.start);
  }

  function paragraph(text, escape) {
    const block = isPali(text);
    let last = 0;
    let result = '';
    for (const { start, end, tag } of block ? [] : ranges(text, true)) {
      const attr = tag === 'i' ? ' class="pali-quote" lang="pi-Latn"' : '';
      result += escape(text.slice(last, start)) + '<' + tag + attr + '>' + escape(text.slice(start, end)) + '</' + tag + '>';
      last = end;
    }
    return { content: result + escape(text.slice(last)), block };
  }

  function markQuote(element) {
    element.classList.add('pali-quote');
    element.lang = 'pi-Latn';
  }

  function decorate(root) {
    for (const element of root.querySelectorAll('.book-page p, .book-page blockquote, .book-notes p, .book-notes blockquote')) {
      if (element.matches('blockquote') && element.querySelector('p')) continue;
      const explicit = element.closest('.pali, [lang="pi"], [lang="pi-Latn"]');
      const block = Boolean(explicit || isPali(element.textContent));
      if (block) {
        markQuote(element);
        continue;
      }
      for (const emphasis of element.querySelectorAll('strong, b, em, i')) {
        if (!emphasis.closest('.pali-quote') && isPali(emphasis.textContent)) markQuote(emphasis);
      }
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      const nodes = [];
      for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node);
      for (const node of nodes) {
        if (node.parentElement.closest('a, code, .pali-quote')) continue;
        const spans = ranges(node.data, true).filter(span => span.tag !== 'strong' || !node.parentElement.closest('strong, b'));
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
