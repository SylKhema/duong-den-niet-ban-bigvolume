---
name: read-and-search-books
description: Discover, fetch, search, and cite passages from Đường Đến Niết-bàn (Nibbānagāminipaṭipadā) by Pa-Auk Tawya Sayadaw across both the 5-volume Complete Edition (Bộ Đại, Vietnamese) and 9-volume Abridged Edition (Bộ Tóm Lược / Mini, Vietnamese and English) on nibbanagamini.org.
---

# Read and Search *Đường Đến Niết-bàn* (*Nibbānagāminipaṭipadā*)

Use this skill when a user asks to locate, read, quote, summarize, or search teachings from Pa-Auk Tawya Sayadaw's *Nibbānagāminipaṭipadā* hosted at `https://nibbanagamini.org`.

## Prerequisites & Access

- All book catalogs, structured JSON files, plain Unicode Markdown files, HTML editions, and PDFs are **public and require no authentication**.
- Open CORS (`Access-Control-Allow-Origin: *`) is enabled on GitHub Pages.
- **License:** Project translations and editorial notes are under **CC BY-NC 4.0** (`https://nibbanagamini.org/LICENSE`). Content signals declare `search=yes, ai-input=yes, ai-train=no` (`https://nibbanagamini.org/robots.txt`).

## 1. Choose the Right Edition

| Edition | Volumes | Languages | Catalog URL | Web Reader |
| --- | --- | --- | --- | --- |
| Complete Edition (*Bộ Đại*) | 5 (`1`–`5`) | Vietnamese (`vi`) | `https://nibbanagamini.org/big/catalog.json` | `https://nibbanagamini.org/big/` |
| Abridged Edition (*Bộ Tóm Lược* / Mini) | 9 (`M01`–`M09`) | Vietnamese (`vi`), English (`en`), Parallel (`bi`) | `https://nibbanagamini.org/mini/data/catalog.json` | `https://nibbanagamini.org/mini/` |

- Prefer the **Abridged Edition (`mini`)** when the user wants **English** or **parallel Vietnamese–English** text.
- Prefer the **Complete Edition (`big`)** when the user wants full canonical citations, commentaries, and subcommentaries in Vietnamese.

## 2. Fetch Machine-Readable Text (Preferred Over HTML Scraping)

### Complete Edition (*Bộ Đại*, Volumes 1–5)
- **Catalog:** `GET /big/catalog.json`
- **Paragraph Search Index:** `GET /big/books/{1..5}-search.json` — array of `{ text, target, printed, pdf }`
- **Structured Volume JSON:** `GET /big/books/{1..5}.json` — `{ vol, roman, title, pages: [{ id, pdf, printed, title, html }], toc, notesHtml }`
- **Full Unicode Markdown:** `GET /big/downloads/unicode/tap-{1..5}.md`
- **Deep Link Format:** `https://nibbanagamini.org/big/#tap/{vol}/{target}` (example: `https://nibbanagamini.org/big/#tap/1/v1-pI`)

### Abridged Edition (*Bộ Tóm Lược*, Volumes 1–9)
- **Catalog:** `GET /mini/data/catalog.json`
- **Downloads Manifest:** `GET /mini/downloads/manifest.json`
- **Vietnamese Volume JSON:** `GET /mini/data/M0{1..9}.json` — `{ pages: [{ id, kind, pdf, printed, title, paragraphs: [{ id, text?, table? }], notes }] }`
- **English Volume JSON:** `GET /mini/data/english-M0{1..9}.json` — `{ title, bodyLast, pages: { [pageId]: { title, paragraphs: { [paraId]: string } } }, toc }`
- **Vietnamese TOC JSON:** `GET /mini/data/toc.json` (Volume 1) and `GET /mini/data/toc-M0{2..9}.json` (Volumes 2–9)
- **Full Unicode Markdown:** `GET /mini/downloads/files/Mini-Cuon-0{1..9}-{VI|EN|BI}.md`
- **Deep Link Format:** `https://nibbanagamini.org/mini/?lang={vi|en|bi}#cuon-{1..9}/{pageOrParagraphId}` (example: `https://nibbanagamini.org/mini/?lang=en#cuon-1/M01-body-P001`)

## 3. Search & Normalization Guidance

When searching Vietnamese or Pāli terms across JSON indices, normalize strings using Unicode NFD decomposition, stripping combining diacritical marks (`\p{M}`), mapping `đ`/`Đ` to `d`, and lowercasing. This matches the web reader's search behavior so queries without Pāli or Vietnamese diacritics still match accurately.

## 4. Citation & Editorial Disclaimer Rules

Whenever quoting or summarizing passages from `nibbanagamini.org`:

1. Cite the edition (*Bộ Đại* / Complete Edition or *Bộ Tóm Lược* / Abridged Edition), volume number, Burmese source page (`printed`), and direct deep link.
2. Preserve Pāli diacritics and any `[CHƯA XÁC MINH]` editorial uncertainty markers present in the source JSON.
3. Remind readers when relevant to meditation practice or doctrinal study that these Vietnamese and English translations were prepared with AI assistance from the Burmese original and are awaiting formal revision by senior elders or qualified members of the Saṅgha; readers should cross-check the Burmese original PDFs (`/big/sources/tap-{1..5}-mien.pdf` or `/mini/source/M0{1..9}/`) and the Pāli Tipiṭaka (*Pāḷidaw*) and commentaries (*Aṭṭhakathā*).
