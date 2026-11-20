'use strict';

(() => {
  const ORIGIN = 'https://nibbanagamini.org';
  const BLANK_PARAGRAPH_ID = 'M01-body-P140-S01';
  const TRANSLATION_NOTICE =
    'AI-assisted translation from the Burmese original by Pa-Auk Tawya Sayadaw, awaiting formal Saṅgha review. Cross-check against the Burmese original PDF and Pāli Tipiṭaka (CC BY-NC 4.0).';

  const modelContext =
    (typeof document !== 'undefined' && document.modelContext && typeof document.modelContext.registerTool === 'function'
      ? document.modelContext
      : null) ||
    (typeof navigator !== 'undefined' && navigator.modelContext && typeof navigator.modelContext.registerTool === 'function'
      ? navigator.modelContext
      : null);

  if (!modelContext) return;

  const jsonCache = new Map();

  function normalizeText(value) {
    return String(value ?? '')
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .replace(/[đĐ]/g, 'd')
      .toLowerCase();
  }

  function decodeHtmlEntities(str) {
    return str
      .replace(/&#x([0-9a-fA-F]+);/g, (m, hex) => {
        const cp = parseInt(hex, 16);
        return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
      })
      .replace(/&#(\d+);/g, (m, dec) => {
        const cp = parseInt(dec, 10);
        return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
      })
      .replace(/&nbsp;/g, ' ')
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&apos;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');
  }

  function htmlToPlainText(html) {
    const withBreaks = String(html ?? '')
      .replace(/<\/(?:td|th)\b[^>]*>\s*<(?:td|th)\b[^>]*>/gi, ' | ')
      .replace(/<(?:br|\/p|\/div|\/li|\/tr|\/h[1-6]|\/blockquote|\/summary|\/caption)\b[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, '');
    return decodeHtmlEntities(withBreaks)
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n[ \t]+/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();
  }

  function tableToText(table) {
    if (!table || typeof table !== 'object') return '';
    const lines = [];
    if (table.caption) lines.push(String(table.caption));
    if (Array.isArray(table.headers) && table.headers.length) {
      lines.push(table.headers.map(String).join(' | '));
    }
    if (Array.isArray(table.rows)) {
      for (const row of table.rows) {
        if (Array.isArray(row)) lines.push(row.map(String).join(' | '));
      }
    }
    return lines.join('\n');
  }

  function miniParagraphText(paragraph) {
    if (!paragraph || typeof paragraph !== 'object') return '';
    if (paragraph.table) {
      const formatted = tableToText(paragraph.table);
      if (formatted) return formatted;
    }
    return typeof paragraph.text === 'string' ? paragraph.text : '';
  }

  function miniCode(vol) {
    return 'M' + String(vol).padStart(2, '0');
  }

  function miniSourcePdfUrl(vol, kind, pdfPage) {
    if (kind === 'cover') return `${ORIGIN}/mini/source/${miniCode(vol)}/cover.jpg`;
    if (vol === 4 && kind === 'body') {
      const [part, offset] = pdfPage <= 73 ? [1, 0] : pdfPage <= 165 ? [2, 73] : [3, 165];
      return `${ORIGIN}/mini/source/M04/body-part-${part}.pdf#page=${pdfPage - offset}`;
    }
    return `${ORIGIN}/mini/source/${miniCode(vol)}/${kind}.pdf#page=${pdfPage}`;
  }

  function checkAborted(signal) {
    if (signal && signal.aborted) {
      const err = new Error('Tool execution aborted');
      err.name = 'AbortError';
      throw err;
    }
  }

  async function fetchJson(path, signal) {
    checkAborted(signal);
    if (jsonCache.has(path)) {
      return jsonCache.get(path);
    }
    const resp = await fetch(path, signal ? { signal } : undefined);
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status} loading ${path}`);
    }
    const data = await resp.json();
    checkAborted(signal);
    jsonCache.set(path, data);
    return data;
  }

  function makeExcerpt(text, normalizedQuery, maxLen = 280) {
    const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
    if (clean.length <= maxLen) return clean;
    if (!normalizedQuery) return clean.slice(0, maxLen - 1) + '…';

    const normClean = normalizeText(clean);
    const idx = normClean.indexOf(normalizedQuery);
    if (idx < 0) return clean.slice(0, maxLen - 1) + '…';

    const ratio = clean.length / Math.max(1, normClean.length);
    const approxStart = Math.max(0, Math.floor(idx * ratio) - 60);
    const slice = clean.slice(approxStart, approxStart + maxLen);
    return (approxStart > 0 ? '…' : '') + slice.trim() + (approxStart + maxLen < clean.length ? '…' : '');
  }

  function parseStrictInt(val) {
    if (typeof val === 'number') return Number.isInteger(val) ? val : NaN;
    if (typeof val === 'string' && /^\s*[+-]?\d+\s*$/.test(val)) return Number(val.trim());
    return NaN;
  }

  function clampInt(val, min, max, fallback) {
    if (val === undefined || val === null || val === '' || typeof val === 'boolean') return fallback;
    const n = parseStrictInt(val);
    if (!Number.isInteger(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function getSignal(context) {
    return context && context.signal ? context.signal : undefined;
  }

  function paginateToc(entries, input) {
    const list = Array.isArray(entries) ? entries : [];
    const tocOffset = clampInt(input?.toc_offset, 0, Math.max(0, list.length), 0);
    const tocLimit = clampInt(input?.toc_limit, 1, 250, 120);
    const slice = list.slice(tocOffset, tocOffset + tocLimit);
    return {
      totalTocEntries: list.length,
      tocOffset,
      tocLimit,
      hasMoreToc: tocOffset + slice.length < list.length,
      toc: slice,
    };
  }

  const READ_ONLY_ANNOTATIONS = { readOnlyHint: true };

  const tools = [
    {
      name: 'list_book_editions',
      description:
        'List all available editions and volumes of Đường Đến Niết-bàn (Nibbānagāminipaṭipadā) by Pa-Auk Tawya Sayadaw — Complete Edition (Bộ Đại, 5 volumes, Vietnamese) and Abridged Edition (Bộ Tóm Lược / Mini, 9 volumes, Vietnamese, English, and Parallel) — including reader URLs, structured JSON endpoints, and Markdown/PDF download links.',
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: {
        type: 'object',
        properties: {
          edition: {
            type: 'string',
            enum: ['all', 'big', 'mini'],
            description: "Filter by edition: 'big' (Complete, 5 vols), 'mini' (Abridged, 9 vols), or 'all' (default).",
          },
        },
      },
      async execute(input = {}, context) {
        const signal = getSignal(context);
        const rawEdition = input?.edition;
        const edition = rawEdition === undefined || rawEdition === null || rawEdition === '' ? 'all' : rawEdition;
        if (!['all', 'big', 'mini'].includes(edition)) {
          return { error: 'Parameter "edition" must be "all", "big", or "mini".' };
        }
        const result = {
          site: ORIGIN,
          author: 'Pa-Auk Tawya Sayadaw',
          license: 'CC BY-NC 4.0',
          notice: TRANSLATION_NOTICE,
          editions: {},
        };

        if (edition === 'all' || edition === 'big') {
          const bigCatalog = await fetchJson('/big/catalog.json', signal);
          result.editions.big = {
            name: 'Bộ Đại (Complete Edition)',
            languages: ['vi'],
            readerUrl: `${ORIGIN}/big/`,
            catalogUrl: `${ORIGIN}/big/catalog.json`,
            volumes: bigCatalog.map(b => ({
              volume: b.vol,
              roman: b.roman,
              title: b.title,
              pageCount: b.pageCount,
              tocCount: b.tocCount,
              readerUrl: `${ORIGIN}/big/#tap/${b.vol}`,
              jsonUrl: `${ORIGIN}/big/books/${b.vol}.json`,
              searchIndexUrl: `${ORIGIN}/big/books/${b.vol}-search.json`,
              markdownUrl: `${ORIGIN}/big/downloads/unicode/tap-${b.vol}.md`,
              htmlUrl: `${ORIGIN}/big/downloads/html/tap-${b.vol}.html`,
              pdfUrl: `${ORIGIN}/big/${b.pdf}`,
              burmeseSourcePdfUrl: `${ORIGIN}/big/${b.source}`,
            })),
          };
        }

        if (edition === 'all' || edition === 'mini') {
          const miniCatalog = await fetchJson('/mini/data/catalog.json', signal);
          result.editions.mini = {
            name: 'Bộ Tóm Lược (Abridged / Mini Edition)',
            languages: ['vi', 'en', 'bi'],
            readerUrl: `${ORIGIN}/mini/`,
            downloadsUrl: `${ORIGIN}/mini/downloads/`,
            catalogUrl: `${ORIGIN}/mini/data/catalog.json`,
            manifestUrl: `${ORIGIN}/mini/downloads/manifest.json`,
            volumes: miniCatalog.map(b => {
              const num = String(b.number).padStart(2, '0');
              return {
                id: b.id,
                volume: b.number,
                title: b.title,
                readerUrlVi: `${ORIGIN}/mini/?lang=vi#cuon-${b.number}`,
                readerUrlEn: `${ORIGIN}/mini/?lang=en#cuon-${b.number}`,
                readerUrlBi: `${ORIGIN}/mini/?lang=bi#cuon-${b.number}`,
                jsonUrlVi: `${ORIGIN}/mini/data/${b.id}.json`,
                jsonUrlEn: `${ORIGIN}/mini/data/english-${b.id}.json`,
                markdownUrlVi: `${ORIGIN}/mini/downloads/files/Mini-Cuon-${num}-VI.md`,
                markdownUrlEn: `${ORIGIN}/mini/downloads/files/Mini-Cuon-${num}-EN.md`,
                markdownUrlBi: `${ORIGIN}/mini/downloads/files/Mini-Cuon-${num}-BI.md`,
              };
            }),
          };
        }

        return result;
      },
    },

    {
      name: 'search_books',
      description:
        'Full-text search (diacritic-insensitive for Vietnamese, English, and Pāli) across Đường Đến Niết-bàn (Nibbānagāminipaṭipadā): the 5-volume Complete Edition (big, Vietnamese) and/or the 9-volume Abridged Edition (mini, Vietnamese and English). Returns matching excerpts, Burmese source page numbers, and deep links.',
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            minLength: 1,
            description: 'Keyword or phrase in Vietnamese, English, or Pāli (diacritics optional).',
          },
          edition: {
            type: 'string',
            enum: ['all', 'big', 'mini'],
            description: "Which edition to search: 'all' (default), 'big', or 'mini'.",
          },
          volume: {
            type: 'integer',
            minimum: 1,
            maximum: 9,
            description: 'Optional volume number filter (1–5 for big, 1–9 for mini).',
          },
          language: {
            type: 'string',
            enum: ['both', 'vi', 'en'],
            description: "Language to search in the Abridged Edition: 'both' (default), 'vi', or 'en'. Complete Edition is Vietnamese only.",
          },
          limit: {
            type: 'integer',
            minimum: 1,
            maximum: 50,
            description: 'Maximum number of matches to return (1–50, default 15).',
          },
        },
        required: ['query'],
      },
      async execute(input = {}, context) {
        const signal = getSignal(context);
        const rawQuery = String(input?.query ?? '').trim();
        const normQuery = normalizeText(rawQuery);
        if (!normQuery) {
          return { error: 'Parameter "query" must be a non-empty string.', returned: 0, hasMore: false, results: [] };
        }

        const rawEdition = input?.edition;
        const edition = rawEdition === undefined || rawEdition === null || rawEdition === '' ? 'all' : rawEdition;
        if (!['all', 'big', 'mini'].includes(edition)) {
          return { error: 'Parameter "edition" must be "all", "big", or "mini".', returned: 0, hasMore: false, results: [] };
        }

        const rawLanguage = input?.language;
        const language = rawLanguage === undefined || rawLanguage === null || rawLanguage === '' ? 'both' : rawLanguage;
        if (!['both', 'vi', 'en'].includes(language)) {
          return { error: 'Parameter "language" must be "both", "vi", or "en".', returned: 0, hasMore: false, results: [] };
        }

        if (edition === 'big' && language === 'en') {
          return {
            error: 'Complete Edition (big) is currently available in Vietnamese ("vi") only.',
            returned: 0,
            hasMore: false,
            results: [],
          };
        }

        const limit = clampInt(input?.limit, 1, 50, 15);
        const hasVolume = input?.volume !== undefined && input?.volume !== null && input?.volume !== '';
        const volFilter = hasVolume ? parseStrictInt(input.volume) : null;

        if (volFilter !== null && (!Number.isInteger(volFilter) || volFilter < 1 || volFilter > 9)) {
          return { error: 'Parameter "volume" must be an integer between 1 and 9.', returned: 0, hasMore: false, results: [] };
        }
        if (edition === 'big' && volFilter !== null && volFilter > 5) {
          return { error: 'Complete Edition (big) only has volumes 1 to 5.', returned: 0, hasMore: false, results: [] };
        }

        const bigMatches = [];
        const miniViMatches = [];
        const miniEnMatches = [];
        let hasMore = false;

        // 1. Complete Edition (Bộ Đại, Vietnamese only) — stop loading further volumes once limit is reached
        if ((edition === 'all' || edition === 'big') && language !== 'en') {
          const bigVols = volFilter !== null ? (volFilter <= 5 ? [volFilter] : []) : [1, 2, 3, 4, 5];
          outerBig: for (const vol of bigVols) {
            checkAborted(signal);
            const rows = await fetchJson(`/big/books/${vol}-search.json`, signal);
            for (const row of rows) {
              const searchable = normalizeText(`${row.text} Mien ${row.printed} PDF ${row.pdf}`);
              if (searchable.includes(normQuery)) {
                if (bigMatches.length >= limit) {
                  hasMore = true;
                  break outerBig;
                }
                bigMatches.push({
                  edition: 'big',
                  volume: vol,
                  language: 'vi',
                  targetId: row.target,
                  printedPage: String(row.printed ?? ''),
                  sourcePdfPage: row.pdf ?? null,
                  excerpt: makeExcerpt(row.text, normQuery),
                  url: `${ORIGIN}/big/#tap/${vol}/${encodeURIComponent(row.target)}`,
                });
              }
            }
          }
        }

        // 2. Abridged Edition (Bộ Tóm Lược / Mini, Vietnamese)
        if ((edition === 'all' || edition === 'mini') && (language === 'both' || language === 'vi')) {
          const miniVols = volFilter !== null ? [volFilter] : [1, 2, 3, 4, 5, 6, 7, 8, 9];
          outerMiniVi: for (const vol of miniVols) {
            checkAborted(signal);
            const id = miniCode(vol);
            const data = await fetchJson(`/mini/data/${id}.json`, signal);
            for (const page of data.pages || []) {
              for (const p of page.paragraphs || []) {
                if (p.id === BLANK_PARAGRAPH_ID) continue;
                const text = miniParagraphText(p);
                if (text && normalizeText(`${page.title || ''} Mien ${page.printed || ''} ${text}`).includes(normQuery)) {
                  if (miniViMatches.length >= limit) {
                    hasMore = true;
                    break outerMiniVi;
                  }
                  miniViMatches.push({
                    edition: 'mini',
                    volume: vol,
                    language: 'vi',
                    pageId: page.id,
                    targetId: p.id,
                    title: page.title || '',
                    printedPage: String(page.printed ?? ''),
                    excerpt: makeExcerpt(text, normQuery),
                    url: `${ORIGIN}/mini/?lang=vi#cuon-${vol}/${encodeURIComponent(p.id)}`,
                  });
                }
              }
            }
          }
        }

        // 3. Abridged Edition (Bộ Tóm Lược / Mini, English)
        if ((edition === 'all' || edition === 'mini') && (language === 'both' || language === 'en')) {
          const miniVols = volFilter !== null ? [volFilter] : [1, 2, 3, 4, 5, 6, 7, 8, 9];
          outerMiniEn: for (const vol of miniVols) {
            checkAborted(signal);
            const id = miniCode(vol);
            const enData = await fetchJson(`/mini/data/english-${id}.json`, signal);
            for (const [pageId, page] of Object.entries(enData.pages || {})) {
              const paras = page && page.paragraphs ? Object.entries(page.paragraphs) : [];
              for (const [paraId, text] of paras) {
                if (paraId === BLANK_PARAGRAPH_ID) continue;
                if (typeof text === 'string' && normalizeText(`${page.title || ''} ${text}`).includes(normQuery)) {
                  if (miniEnMatches.length >= limit) {
                    hasMore = true;
                    break outerMiniEn;
                  }
                  miniEnMatches.push({
                    edition: 'mini',
                    volume: vol,
                    language: 'en',
                    pageId,
                    targetId: paraId,
                    title: page.title || '',
                    excerpt: makeExcerpt(text, normQuery),
                    url: `${ORIGIN}/mini/?lang=en#cuon-${vol}/${encodeURIComponent(paraId)}`,
                  });
                }
              }
            }
          }
        }

        // Round-robin merge across non-empty buckets so multi-edition / bilingual searches stay balanced
        const buckets = [bigMatches, miniViMatches, miniEnMatches].filter(b => b.length > 0);
        const matches = [];
        let cursor = 0;
        while (matches.length < limit) {
          let added = false;
          for (const bucket of buckets) {
            if (cursor < bucket.length) {
              matches.push(bucket[cursor]);
              added = true;
              if (matches.length >= limit) break;
            }
          }
          if (!added) break;
          cursor++;
        }
        const totalCollected = bigMatches.length + miniViMatches.length + miniEnMatches.length;
        if (totalCollected > matches.length) hasMore = true;

        return {
          query: rawQuery,
          edition,
          language,
          volume: volFilter,
          returned: matches.length,
          hasMore,
          notice: TRANSLATION_NOTICE,
          results: matches,
        };
      },
    },

    {
      name: 'get_book_passage',
      description:
        'Retrieve the full plain text and source metadata of a specific page/section in Đường Đến Niết-bàn (big volumes 1–5 or mini volumes 1–9), or retrieve the paginated volume table of contents when page_id is omitted.',
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: {
        type: 'object',
        properties: {
          edition: {
            type: 'string',
            enum: ['big', 'mini'],
            description: "'big' (Complete Edition, 5 vols, VI) or 'mini' (Abridged Edition, 9 vols, VI/EN).",
          },
          volume: {
            type: 'integer',
            minimum: 1,
            maximum: 9,
            description: 'Volume number (1–5 for big, 1–9 for mini).',
          },
          language: {
            type: 'string',
            enum: ['vi', 'en'],
            description: "Language: 'vi' (default, both editions) or 'en' (mini edition only).",
          },
          page_id: {
            type: 'string',
            description:
              "Optional page or paragraph anchor ID (e.g., 'v1-pI', 'V1-FRONT-01-01', or 'M01-body-P001'). Omit to return the table of contents.",
          },
          toc_offset: {
            type: 'integer',
            minimum: 0,
            description: 'Optional zero-based offset when paginating the volume table of contents (used only when page_id is omitted, default 0).',
          },
          toc_limit: {
            type: 'integer',
            minimum: 1,
            maximum: 250,
            description: 'Optional page size when paginating the volume table of contents (1–250, default 120).',
          },
        },
        required: ['edition', 'volume'],
      },
      async execute(input = {}, context) {
        const signal = getSignal(context);
        const edition = input?.edition;
        const volume = parseStrictInt(input?.volume);
        const rawLanguage = input?.language;
        const language = rawLanguage === undefined || rawLanguage === null || rawLanguage === '' ? 'vi' : rawLanguage;
        const rawPageId = typeof input?.page_id === 'string' ? input.page_id.trim() : '';

        if (edition !== 'big' && edition !== 'mini') {
          return { error: 'Parameter "edition" must be "big" or "mini".' };
        }
        if (language !== 'vi' && language !== 'en') {
          return { error: 'Parameter "language" must be "vi" or "en".' };
        }
        const maxVol = edition === 'big' ? 5 : 9;
        if (!Number.isInteger(volume) || volume < 1 || volume > maxVol) {
          return { error: `Parameter "volume" must be an integer between 1 and ${maxVol} for edition "${edition}".` };
        }
        if (edition === 'big' && language === 'en') {
          return { error: 'Complete Edition (big) is currently available in Vietnamese ("vi") only.' };
        }

        if (edition === 'big') {
          const book = await fetchJson(`/big/books/${volume}.json`, signal);
          if (!rawPageId) {
            return {
              edition: 'big',
              volume,
              roman: book.roman,
              title: book.title,
              language: 'vi',
              totalPages: (book.pages || []).length,
              ...paginateToc(book.toc, input),
              markdownUrl: `${ORIGIN}/big/downloads/unicode/tap-${volume}.md`,
              notice: TRANSLATION_NOTICE,
            };
          }

          const idPattern = new RegExp(`\\bid=["']${escapeRegex(rawPageId)}["']`, 'i');
          const page =
            (book.pages || []).find(p => p.id === rawPageId) ||
            (book.pages || []).find(p => p.id && p.id.toLowerCase() === rawPageId.toLowerCase()) ||
            (book.pages || []).find(p => typeof p.html === 'string' && idPattern.test(p.html));

          if (!page) {
            return {
              error: `Page or anchor "${rawPageId}" not found in Complete Edition Volume ${volume}.`,
              edition: 'big',
              volume,
            };
          }

          return {
            edition: 'big',
            volume,
            roman: book.roman,
            volumeTitle: book.title,
            language: 'vi',
            pageId: page.id,
            requestedId: rawPageId,
            title: page.title || '',
            printedPage: String(page.printed ?? ''),
            sourcePdfPage: page.pdf ?? null,
            sourcePdfUrl: page.pdf ? `${ORIGIN}/big/sources/tap-${volume}-mien.pdf#page=${page.pdf}` : null,
            readerUrl: `${ORIGIN}/big/#tap/${volume}/${encodeURIComponent(rawPageId)}`,
            text: htmlToPlainText(page.html),
            notice: TRANSLATION_NOTICE,
          };
        }

        // edition === 'mini'
        const id = miniCode(volume);
        const cleanedId = rawPageId.replace(/-en$/i, '');
        const parentId = cleanedId.replace(/-S\d+$/i, '');

        if (language === 'en') {
          const enData = await fetchJson(`/mini/data/english-${id}.json`, signal);
          if (!cleanedId) {
            return {
              edition: 'mini',
              volume,
              id,
              title: enData.title || '',
              language: 'en',
              bodyLast: enData.bodyLast ?? null,
              ...paginateToc(enData.toc, input),
              markdownUrl: `${ORIGIN}/mini/downloads/files/Mini-Cuon-${String(volume).padStart(2, '0')}-EN.md`,
              notice: TRANSLATION_NOTICE,
            };
          }

          const matchedKey = enData.pages?.[cleanedId]
            ? cleanedId
            : enData.pages?.[parentId]
              ? parentId
              : Object.keys(enData.pages || {}).find(k => k.toLowerCase() === parentId.toLowerCase());

          if (!matchedKey) {
            return {
              error: `Page or anchor "${rawPageId}" not found in Abridged Edition Volume ${volume} (English).`,
              edition: 'mini',
              volume,
              language: 'en',
            };
          }

          const page = enData.pages[matchedKey];
          const paragraphs = Object.entries(page.paragraphs || {})
            .filter(([pid]) => pid !== BLANK_PARAGRAPH_ID)
            .map(([pid, text]) => ({ id: pid, text }));

          // Cross-reference Vietnamese source JSON for Burmese printed page & source PDF metadata
          let sourcePage = null;
          try {
            const viData = await fetchJson(`/mini/data/${id}.json`, signal);
            sourcePage = (viData.pages || []).find(p => p.id === matchedKey) || null;
          } catch (err) {
            if (err && err.name === 'AbortError') throw err;
          }

          return {
            edition: 'mini',
            volume,
            id,
            volumeTitle: enData.title || '',
            language: 'en',
            pageId: matchedKey,
            requestedId: rawPageId,
            kind: sourcePage?.kind || '',
            title: page.title || '',
            printedPage: sourcePage ? String(sourcePage.printed ?? '') : '',
            sourcePdfPage: sourcePage?.pdf ?? null,
            sourcePdfUrl: sourcePage?.kind && sourcePage?.pdf ? miniSourcePdfUrl(volume, sourcePage.kind, sourcePage.pdf) : null,
            readerUrl: `${ORIGIN}/mini/?lang=en#cuon-${volume}/${encodeURIComponent(cleanedId)}`,
            text: paragraphs.map(p => p.text).join('\n\n'),
            paragraphs,
            notice: TRANSLATION_NOTICE,
          };
        }

        // mini + vi
        const viData = await fetchJson(`/mini/data/${id}.json`, signal);
        if (!cleanedId) {
          const tocPath = volume === 1 ? '/mini/data/toc.json' : `/mini/data/toc-${id}.json`;
          const toc = await fetchJson(tocPath, signal);
          return {
            edition: 'mini',
            volume,
            id,
            language: 'vi',
            totalPages: (viData.pages || []).length,
            ...paginateToc(toc, input),
            markdownUrl: `${ORIGIN}/mini/downloads/files/Mini-Cuon-${String(volume).padStart(2, '0')}-VI.md`,
            notice: TRANSLATION_NOTICE,
          };
        }

        const cleanedLower = cleanedId.toLowerCase();
        const parentLower = parentId.toLowerCase();
        const page =
          (viData.pages || []).find(p => p.id === cleanedId || p.id === parentId) ||
          (viData.pages || []).find(p => (p.paragraphs || []).some(s => s.id && s.id.toLowerCase() === cleanedLower)) ||
          (viData.pages || []).find(p => p.id && (p.id.toLowerCase() === cleanedLower || p.id.toLowerCase() === parentLower));

        if (!page) {
          return {
            error: `Page or anchor "${rawPageId}" not found in Abridged Edition Volume ${volume} (Vietnamese).`,
            edition: 'mini',
            volume,
            language: 'vi',
          };
        }

        const paragraphs = (page.paragraphs || [])
          .filter(s => s.id !== BLANK_PARAGRAPH_ID)
          .map(s => ({ id: s.id, text: miniParagraphText(s) }));

        return {
          edition: 'mini',
          volume,
          id,
          language: 'vi',
          pageId: page.id,
          requestedId: rawPageId,
          kind: page.kind || '',
          title: page.title || '',
          printedPage: String(page.printed ?? ''),
          sourcePdfPage: page.pdf ?? null,
          sourcePdfUrl: page.kind && page.pdf ? miniSourcePdfUrl(volume, page.kind, page.pdf) : null,
          readerUrl: `${ORIGIN}/mini/?lang=vi#cuon-${volume}/${encodeURIComponent(cleanedId)}`,
          text: paragraphs.map(p => p.text).join('\n\n'),
          paragraphs,
          notes: Array.isArray(page.notes) ? page.notes : [],
          notice: TRANSLATION_NOTICE,
        };
      },
    },
  ];

  // Register public corrections tool on the corrections log page (where firebase-feedback.js is loaded)
  const surface = typeof document !== 'undefined' && document.documentElement ? document.documentElement.dataset?.surface : '';
  if (surface === 'corrections') {
    tools.push({
      name: 'get_public_corrections',
      description:
        'Retrieve the list of publicly published editorial corrections and explanations from the Đường Đến Niết-bàn corrections log (/hieu-dinh.html).',
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: {
        type: 'object',
        properties: {},
      },
      async execute(_input, context) {
        checkAborted(getSignal(context));
        if (typeof window === 'undefined' || !window.nibbanaFeedback || typeof window.nibbanaFeedback.getCorrections !== 'function') {
          return { error: 'Feedback module is not loaded on this page.', entries: [] };
        }
        return window.nibbanaFeedback.getCorrections();
      },
    });
  }

  let controller = null;
  let registeredNames = [];

  function registerAll() {
    if (controller && !controller.signal.aborted) return;
    controller = new AbortController();
    registeredNames = [];
    for (const tool of tools) {
      try {
        Promise.resolve(modelContext.registerTool(tool, { signal: controller.signal })).catch(() => {});
        registeredNames.push(tool.name);
      } catch {
        // Ignore synchronous registration errors in partial/experimental implementations
      }
    }
  }

  function unregisterAll() {
    if (controller && !controller.signal.aborted) {
      controller.abort();
    }
    controller = null;
  }

  registerAll();

  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', () => unregisterAll());
    window.addEventListener('pageshow', event => {
      if (event && event.persisted) registerAll();
    });
    window.nibbanaWebMcp = {
      get tools() {
        return registeredNames.slice();
      },
      unregister: () => unregisterAll(),
      reregister: () => registerAll(),
    };
  }
})();
