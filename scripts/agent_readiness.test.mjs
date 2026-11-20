import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const DOCS_DIR = path.join(REPO_ROOT, 'docs');
const ORIGIN = 'https://nibbanagamini.org';

function resolveOriginUrlToDocFile(rawUrl) {
  const u = new URL(rawUrl, ORIGIN);
  assert.equal(u.origin, ORIGIN, `Unexpected origin: ${rawUrl}`);
  let relPath = decodeURIComponent(u.pathname).replace(/^\/+/, '');
  if (!relPath) relPath = 'index.html';
  else if (relPath.endsWith('/')) relPath += 'index.html';
  return path.join(DOCS_DIR, relPath);
}

function createDocFetch(fetchLog = null) {
  return async (urlPath, opts = {}) => {
    if (opts?.signal?.aborted) {
      const err = new Error('Aborted');
      err.name = 'AbortError';
      throw err;
    }
    const clean = String(urlPath).split('?')[0].split('#')[0];
    if (fetchLog) fetchLog.push(clean);
    const filePath = resolveOriginUrlToDocFile(clean);
    if (!fs.existsSync(filePath)) {
      return new Response('Not Found', { status: 404 });
    }
    const content = fs.readFileSync(filePath, 'utf8');
    return new Response(content, {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  };
}

function loadWebMcp({ surface = 'home', useNavigatorFallback = false, omitModelContext = false, rejectRegister = false, nibbanaFeedback = undefined } = {}) {
  const registered = [];
  const listeners = new Map();
  const fetchLog = [];

  const registerTool = (tool, options) => {
    registered.push({ tool, options });
    if (rejectRegister) return Promise.reject(new Error('denied'));
    return Promise.resolve();
  };

  const docObj = {
    documentElement: { dataset: { surface } },
    modelContext: !omitModelContext && !useNavigatorFallback ? { registerTool } : undefined,
  };
  const navObj = {
    modelContext: !omitModelContext && useNavigatorFallback ? { registerTool } : undefined,
  };
  const winObj = {
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    dispatch(type, event = {}) {
      for (const fn of listeners.get(type) || []) fn(event);
    },
    nibbanaFeedback,
  };

  const ctx = {
    window: winObj,
    document: docObj,
    navigator: navObj,
    fetch: createDocFetch(fetchLog),
    AbortController,
    Promise,
    Map,
    Set,
    RegExp,
    Error,
    Number,
    String,
    Boolean,
    Array,
    Object,
    Math,
    JSON,
    encodeURIComponent,
    decodeURIComponent,
    parseInt,
    console,
  };

  const src = fs.readFileSync(path.join(DOCS_DIR, 'webmcp.js'), 'utf8');
  vm.runInNewContext(src, ctx, { filename: 'docs/webmcp.js' });
  return { registered, winObj, fetchLog };
}

function createSubmitFeedbackHarness({ search = '', hash = '', nibbanaFeedback } = {}) {
  const makeEl = (tag, attrs = {}) => {
    const attrMap = new Map(Object.entries(attrs));
    const el = {
      tagName: tag.toUpperCase(),
      id: attrs.id || '',
      hidden: false,
      disabled: false,
      checked: false,
      textContent: '',
      href: '',
      lang: '',
      value: attrs.value ?? '',
      dataset: { ...(attrs.dataset || {}) },
      children: [],
      validationMessage: '',
      setCustomValidity(msg) {
        this.validationMessage = String(msg || '');
      },
      reportValidity() {
        return !this.validationMessage;
      },
      setAttribute(k, v) {
        attrMap.set(k, String(v));
      },
      getAttribute(k) {
        return attrMap.has(k) ? attrMap.get(k) : null;
      },
      removeAttribute(k) {
        attrMap.delete(k);
      },
      replaceChildren(...nodes) {
        this.children = [...nodes];
      },
      append(...nodes) {
        this.children.push(...nodes);
      },
    };
    return el;
  };

  const makeSelect = (id, optionValues) => {
    const el = makeEl('select', { id });
    let currentValue = optionValues[0] ?? '';
    const options = optionValues.map(v => {
      const opt = makeEl('option', { value: v });
      opt.textContent = v;
      return opt;
    });
    Object.defineProperty(el, 'options', {
      get() {
        return options;
      },
    });
    Object.defineProperty(el, 'value', {
      get() {
        return currentValue;
      },
      set(next) {
        const s = String(next);
        // Match real HTMLSelectElement: value only changes when a matching enabled option exists
        if (options.some(o => o.value === s && !o.disabled)) {
          currentValue = s;
        }
      },
    });
    el.replaceChildren = (...nodes) => {
      options.length = 0;
      options.push(...nodes);
      currentValue = options[0]?.value ?? '';
    };
    el.append = (...nodes) => {
      options.push(...nodes);
      if (!currentValue && options.length) currentValue = options[0].value;
    };
    return el;
  };

  const submitBtn = makeEl('button', { type: 'submit' });
  const submitForm = makeEl('form', { id: 'submit-feedback' });
  submitForm.querySelector = sel => (sel === 'button[type=submit]' ? submitBtn : null);
  const lookupForm = makeEl('form', { id: 'lookup' });

  const elements = new Map([
    ['series', makeSelect('series', ['big', 'mini'])],
    ['volume', makeSelect('volume', ['1', '2', '3', '4', '5', '6', '7', '8', '9'])],
    ['language', makeSelect('language', ['vi', 'en', 'bi'])],
    ['category', makeSelect('category', ['translation', 'typo', 'terminology', 'question', 'other'])],
    ['submit-feedback', submitForm],
    ['lookup', lookupForm],
    ['location', makeEl('p', { id: 'location' })],
    ['feedback-excerpt', makeEl('blockquote', { id: 'feedback-excerpt' })],
    ['feedback-selection', makeEl('details', { id: 'feedback-selection' })],
    ['send-result', makeEl('p', { id: 'send-result' })],
    ['answer', makeEl('p', { id: 'answer' })],
    ['local', makeEl('div', { id: 'local' })],
    ['feedback-back', makeEl('a', { id: 'feedback-back' })],
    ['message', makeEl('textarea', { id: 'message' })],
    ['suggestion', makeEl('textarea', { id: 'suggestion' })],
    ['reference', makeEl('input', { id: 'reference' })],
    ['name', makeEl('input', { id: 'name' })],
    ['email', makeEl('input', { id: 'email' })],
    ['website', makeEl('input', { id: 'website' })],
    ['consent', makeEl('input', { id: 'consent' })],
    ['receipt', makeEl('input', { id: 'receipt' })],
  ]);

  const langButtons = [
    makeEl('button', { dataset: { displayLanguage: 'vi' } }),
    makeEl('button', { dataset: { displayLanguage: 'en' } }),
  ];

  const storage = new Map();
  const localStorage = {
    getItem: k => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: k => storage.delete(k),
  };

  const documentObj = {
    title: '',
    documentElement: { lang: 'vi' },
    getElementById: id => elements.get(id) || null,
    querySelectorAll: sel => (sel === '[data-display-language]' ? langButtons : []),
    createElement: tag => makeEl(tag),
  };

  const windowObj = { nibbanaFeedback };
  const ctx = {
    window: windowObj,
    document: documentObj,
    location: { search, hash },
    localStorage,
    URLSearchParams,
    crypto,
    Date,
    Number,
    String,
    Boolean,
    Array,
    Object,
    JSON,
    console,
  };

  const src = fs.readFileSync(path.join(DOCS_DIR, 'submit-feedback.js'), 'utf8');
  vm.runInNewContext(src, ctx, { filename: 'docs/submit-feedback.js' });

  function dispatchSubmit(formEl, { agentInvoked = true } = {}) {
    let inDispatch = true;
    let prevented = false;
    let responsePromise = null;
    const event = {
      agentInvoked,
      preventDefault() {
        prevented = true;
      },
      respondWith(promise) {
        if (!inDispatch) {
          throw new Error('InvalidStateError: respondWith() must be called synchronously during submit dispatch');
        }
        responsePromise = promise;
      },
    };
    formEl.onsubmit(event);
    inDispatch = false;
    return { prevented, responsePromise };
  }

  return { elements, dispatchSubmit, documentObj };
}

test('sitemap.xml is valid, GitHub Pages compatible, complete, and consistent with canonical tags', () => {
  const xml = fs.readFileSync(path.join(DOCS_DIR, 'sitemap.xml'), 'utf8');
  assert.match(xml, /xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9"/);

  const urlBlocks = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map(m => m[1]);
  assert.equal(urlBlocks.length, 70, 'Expected 4 hubs + 5 big HTML + 5 big PDF + 27 mini HTML + 27 mini PDF + 2 feedback/errata pages');

  const locs = new Set();
  for (const block of urlBlocks) {
    const loc = block.match(/<loc>([^<]+)<\/loc>/)?.[1];
    const lastmod = block.match(/<lastmod>([^<]+)<\/lastmod>/)?.[1];
    const changefreq = block.match(/<changefreq>([^<]+)<\/changefreq>/)?.[1];
    const priority = block.match(/<priority>([^<]+)<\/priority>/)?.[1];

    assert.ok(loc, 'Every <url> must have <loc>');
    assert.ok(lastmod && /^\d{4}-\d{2}-\d{2}$/.test(lastmod), `Invalid <lastmod> for ${loc}: ${lastmod}`);
    assert.ok(['daily', 'weekly', 'monthly', 'yearly'].includes(changefreq), `Invalid <changefreq> for ${loc}`);
    assert.ok(priority && Number(priority) >= 0 && Number(priority) <= 1, `Invalid <priority> for ${loc}`);
    assert.equal(locs.has(loc), false, `Duplicate <loc>: ${loc}`);
    locs.add(loc);

    // Must not expose private/error/legacy paths
    assert.equal(/\/(review|404|bo-dai|api)(\/|\.html|$)/.test(new URL(loc).pathname), false, `Excluded URL in sitemap: ${loc}`);

    // Every <loc> must map to a real static file in docs/
    const targetFile = resolveOriginUrlToDocFile(loc);
    assert.equal(fs.existsSync(targetFile), true, `Missing docs/ file for sitemap <loc>: ${loc} -> ${targetFile}`);
  }

  // Verify GitHub Pages .html extensions preserved
  assert.ok(locs.has(`${ORIGIN}/`));
  assert.ok(locs.has(`${ORIGIN}/big/`));
  assert.ok(locs.has(`${ORIGIN}/mini/`));
  assert.ok(locs.has(`${ORIGIN}/mini/downloads/`));
  assert.ok(locs.has(`${ORIGIN}/big/downloads/html/tap-1.html`));
  assert.ok(locs.has(`${ORIGIN}/mini/downloads/files/Mini-Cuon-01-EN.html`));
  assert.ok(locs.has(`${ORIGIN}/mini/downloads/files/Mini-Cuon-09-BI.pdf`));
  assert.ok(locs.has(`${ORIGIN}/gop-y.html`));
  assert.ok(locs.has(`${ORIGIN}/hieu-dinh.html`));

  // Verify canonical URLs, sitemap links, and WebMCP script on all 6 public HTML hubs
  const canonicalPages = [
    ['index.html', `${ORIGIN}/`],
    ['big/index.html', `${ORIGIN}/big/`],
    ['mini/index.html', `${ORIGIN}/mini/`],
    ['mini/downloads/index.html', `${ORIGIN}/mini/downloads/`],
    ['gop-y.html', `${ORIGIN}/gop-y.html`],
    ['hieu-dinh.html', `${ORIGIN}/hieu-dinh.html`],
  ];
  for (const [rel, expectedCanonical] of canonicalPages) {
    const html = fs.readFileSync(path.join(DOCS_DIR, rel), 'utf8');
    const canonical = html.match(/<link[^>]*rel="canonical"[^>]*href="([^"]+)"/)?.[1];
    assert.equal(canonical, expectedCanonical, `Canonical mismatch in docs/${rel}`);
    assert.ok(locs.has(canonical), `Canonical ${canonical} must be listed in sitemap.xml`);
    assert.match(html, /<link[^>]*rel="sitemap"[^>]*href="\/sitemap\.xml"/, `Missing <link rel="sitemap"> in docs/${rel}`);
    assert.match(html, /<script[^>]*src="\/webmcp\.js\?v=\d+"/, `Missing /webmcp.js script in docs/${rel}`);
  }

  // Verify generator CLI supports both default (keep .html) and opt-in --clean-urls
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sitemap-test-'));
  try {
    const cleanOut = path.join(tmpDir, 'clean.xml');
    execFileSync('python3', [path.join(REPO_ROOT, 'scripts/generate_sitemap.py'), '--clean-urls', '--output', cleanOut]);
    const cleanXml = fs.readFileSync(cleanOut, 'utf8');
    assert.match(cleanXml, /<loc>https:\/\/nibbanagamini\.org\/gop-y<\/loc>/);
    assert.doesNotMatch(cleanXml, /gop-y\.html/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('robots.txt declares valid Content-Signal directives and preserves exclusions', () => {
  const robots = fs.readFileSync(path.join(DOCS_DIR, 'robots.txt'), 'utf8');
  assert.match(robots, /^User-agent:\s*\*\s*$/m);
  const signalMatch = robots.match(/^Content-Signal:\s*(.+)$/m);
  assert.ok(signalMatch, 'robots.txt must contain Content-Signal directive');
  const directives = Object.fromEntries(
    signalMatch[1].split(',').map(part => part.trim().split('=').map(s => s.trim()))
  );
  assert.ok(['yes', 'no'].includes(directives['ai-train']));
  assert.ok(['yes', 'no'].includes(directives['search']));
  assert.ok(['yes', 'no'].includes(directives['ai-input']));
  assert.equal(directives['ai-train'], 'no');
  assert.equal(directives['search'], 'yes');
  assert.equal(directives['ai-input'], 'yes');
  assert.match(robots, /^Disallow:\s*\/review\.html\s*$/m);
  assert.match(robots, /^Sitemap:\s*https:\/\/nibbanagamini\.org\/sitemap\.xml\s*$/m);
});

test('agent-skills index.json complies with Agent Skills Discovery RFC v0.2.0 and SHA-256 digests match', () => {
  assert.equal(fs.existsSync(path.join(DOCS_DIR, '.nojekyll')), true, '.nojekyll is required for GitHub Pages to serve .well-known');

  const indexPath = path.join(DOCS_DIR, '.well-known/agent-skills/index.json');
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  assert.equal(index.$schema, 'https://schemas.agentskills.io/discovery/0.2.0/schema.json');
  assert.ok(Array.isArray(index.skills) && index.skills.length >= 2);

  const seenNames = new Set();
  for (const skill of index.skills) {
    assert.match(skill.name, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.ok(skill.name.length >= 1 && skill.name.length <= 64);
    assert.equal(seenNames.has(skill.name), false, `Duplicate skill name: ${skill.name}`);
    seenNames.add(skill.name);

    assert.equal(skill.type, 'skill-md');
    assert.ok(typeof skill.description === 'string' && skill.description.length >= 1 && skill.description.length <= 1024);
    assert.match(skill.digest, /^sha256:[0-9a-f]{64}$/);

    const filePath = resolveOriginUrlToDocFile(skill.url);
    assert.equal(fs.existsSync(filePath), true, `Skill file missing: ${filePath}`);

    const rawBytes = fs.readFileSync(filePath);
    const actualDigest = 'sha256:' + crypto.createHash('sha256').update(rawBytes).digest('hex');
    assert.equal(skill.digest, actualDigest, `Digest mismatch for ${skill.name}`);

    const text = rawBytes.toString('utf8');
    const fm = text.match(/^---\n([\s\S]*?)\n---/);
    assert.ok(fm, `Missing YAML frontmatter in ${filePath}`);
    assert.match(fm[1], new RegExp(`^name:\\s*${skill.name}\\s*$`, 'm'));
    assert.ok(fm[1].includes(`description: ${skill.description}`), `Frontmatter description mismatch in ${skill.name}`);
  }
});

test('ARD manifest (/.well-known/ai-catalog.json) matches schema constraints and valid target URLs', () => {
  const catalogPath = path.join(DOCS_DIR, '.well-known/ai-catalog.json');
  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));

  assert.deepEqual(Object.keys(catalog).sort(), ['entries', 'host', 'specVersion']);
  assert.equal(catalog.specVersion, '1.0');

  const allowedHostKeys = new Set(['displayName', 'identifier', 'documentationUrl', 'logoUrl']);
  for (const k of Object.keys(catalog.host)) {
    assert.ok(allowedHostKeys.has(k), `Disallowed host key: ${k}`);
  }
  assert.ok(catalog.host.displayName);
  assert.equal(catalog.host.identifier, 'did:web:nibbanagamini.org');
  assert.equal(fs.existsSync(resolveOriginUrlToDocFile(catalog.host.documentationUrl)), true);
  assert.equal(fs.existsSync(resolveOriginUrlToDocFile(catalog.host.logoUrl)), true);

  assert.ok(Array.isArray(catalog.entries) && catalog.entries.length >= 1);
  const seenIds = new Set();
  const allowedEntryKeys = new Set(['identifier', 'displayName', 'type', 'url', 'data', 'description', 'representativeQueries']);

  for (const entry of catalog.entries) {
    for (const k of Object.keys(entry)) {
      assert.ok(allowedEntryKeys.has(k), `Disallowed entry key: ${k}`);
    }
    assert.match(entry.identifier, /^urn:air:nibbanagamini\.org:[a-z0-9-]+:[a-z0-9-]+$/);
    assert.equal(seenIds.has(entry.identifier), false, `Duplicate URN: ${entry.identifier}`);
    seenIds.add(entry.identifier);

    assert.ok(typeof entry.displayName === 'string' && entry.displayName.length > 0);
    assert.match(entry.type, /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i, `Invalid media type: ${entry.type}`);

    // Strictly one of url or data
    const hasUrl = typeof entry.url === 'string' && entry.url.length > 0;
    const hasData = entry.data !== undefined;
    assert.equal(hasUrl !== hasData, true, `Entry ${entry.identifier} must have exactly one of url or data`);
    if (hasUrl) {
      assert.equal(fs.existsSync(resolveOriginUrlToDocFile(entry.url)), true, `Missing target URL: ${entry.url}`);
    }

    assert.ok(Array.isArray(entry.representativeQueries), `Missing representativeQueries on ${entry.identifier}`);
    assert.ok(
      entry.representativeQueries.length >= 2 && entry.representativeQueries.length <= 5,
      `representativeQueries must have 2-5 items on ${entry.identifier}`
    );
  }
});

test('RFC 9727 api-catalog, OpenAPI 3.1 spec, llms.txt, index.md, and homepage discovery links all resolve cleanly', () => {
  // 1. /.well-known/api-catalog
  const apiCatalog = JSON.parse(fs.readFileSync(path.join(DOCS_DIR, '.well-known/api-catalog'), 'utf8'));
  assert.ok(Array.isArray(apiCatalog.linkset) && apiCatalog.linkset.length >= 1);
  for (const item of apiCatalog.linkset) {
    assert.ok(typeof item.anchor === 'string' && item.anchor.startsWith(ORIGIN));
    for (const rel of ['service-desc', 'service-doc']) {
      assert.ok(Array.isArray(item[rel]) && item[rel].length >= 1, `${rel} must be a non-empty array per RFC 9264`);
      for (const link of item[rel]) {
        assert.ok(typeof link.href === 'string');
        assert.equal(fs.existsSync(resolveOriginUrlToDocFile(link.href)), true, `Missing target for ${rel}: ${link.href}`);
      }
    }
  }

  // 2. /openapi.json — verify every static and enumerated path exists in docs/
  const openapi = JSON.parse(fs.readFileSync(path.join(DOCS_DIR, 'openapi.json'), 'utf8'));
  assert.equal(openapi.openapi, '3.1.0');
  for (const [route, spec] of Object.entries(openapi.paths)) {
    assert.ok(spec.get, `Expected GET on ${route}`);
    const params = spec.get.parameters || [];
    if (!params.length) {
      const target = resolveOriginUrlToDocFile(`${ORIGIN}${route}`);
      assert.equal(fs.existsSync(target), true, `OpenAPI path missing in docs/: ${route}`);
      JSON.parse(fs.readFileSync(target, 'utf8'));
    } else {
      assert.equal(params.length, 1);
      const p = params[0];
      assert.ok(Array.isArray(p.schema?.enum) && p.schema.enum.length > 0);
      for (const val of p.schema.enum) {
        const concrete = route.replace(`{${p.name}}`, String(val));
        const target = resolveOriginUrlToDocFile(`${ORIGIN}${concrete}`);
        assert.equal(fs.existsSync(target), true, `OpenAPI concrete path missing in docs/: ${concrete}`);
      }
    }
  }

  // 3. llms.txt, index.md, and SKILL.md files — verify every concrete nibbanagamini.org URL resolves to an existing file in docs/
  for (const mdFile of [
    'llms.txt',
    'index.md',
    '.well-known/agent-skills/read-and-search-books/SKILL.md',
    '.well-known/agent-skills/translation-feedback/SKILL.md',
  ]) {
    const content = fs.readFileSync(path.join(DOCS_DIR, mdFile), 'utf8');
    const urls = [...content.matchAll(/https:\/\/nibbanagamini\.org[^\s)>"`]*/g)]
      .map(m => m[0].replace(/[.,;:]$/, ''))
      .filter(u => !/[{<]/.test(u) && !u.endsWith('/mini/source/'));
    assert.ok(urls.length >= 3, `${mdFile} should contain concrete site links`);
    for (const url of urls) {
      const target = resolveOriginUrlToDocFile(url);
      assert.equal(fs.existsSync(target), true, `Broken link in ${mdFile}: ${url} -> ${target}`);
    }
  }

  // 4. Homepage <link> discovery tags and webmcp.js script tag
  const homeHtml = fs.readFileSync(path.join(DOCS_DIR, 'index.html'), 'utf8');
  for (const [rel, href] of [
    ['sitemap', '/sitemap.xml'],
    ['alternate', '/index.md'],
    ['describedby', '/llms.txt'],
    ['api-catalog', '/.well-known/api-catalog'],
    ['ai-catalog', '/.well-known/ai-catalog.json'],
    ['service-desc', '/openapi.json'],
    ['service-doc', '/llms.txt'],
  ]) {
    assert.match(homeHtml, new RegExp(`<link[^>]*rel="${rel}"[^>]*href="${href.replace(/\./g, '\\.')}"`), `Missing <link rel="${rel}" href="${href}"> in docs/index.html`);
    assert.equal(fs.existsSync(resolveOriginUrlToDocFile(href)), true, `Missing target for homepage link ${href}`);
  }
  assert.match(homeHtml, /<script[^>]*src="\/webmcp\.js\?v=\d+"/);
});

test('gop-y.html exposes declarative WebMCP form attributes, static volume 1-9 options, and hides honeypot', () => {
  const html = fs.readFileSync(path.join(DOCS_DIR, 'gop-y.html'), 'utf8');
  assert.match(html, /<form id="submit-feedback"[^>]*aria-labelledby="send-feedback-heading"[^>]*toolname="submit_translation_feedback"[^>]*tooldescription="[^"]+"/);
  assert.doesNotMatch(html, /<form id="submit-feedback"[^>]*toolautosubmit/, 'Mutating feedback form must NOT set toolautosubmit');
  assert.match(html, /<form id="lookup"[^>]*aria-labelledby="lookup-status-heading"[^>]*toolname="lookup_feedback_status"[^>]*tooldescription="[^"]+"[^>]*toolautosubmit/);
  assert.match(html, /<form id="lookup"[\s\S]*?<button type="submit">/, 'Lookup button must specify type="submit"');

  const exposedIds = ['series', 'volume', 'language', 'category', 'message', 'suggestion', 'reference', 'name', 'email', 'consent', 'receipt'];
  for (const id of exposedIds) {
    const tag = html.match(new RegExp(`<(?:input|select|textarea)[^>]*id="${id}"[^>]*>`))?.[0];
    assert.ok(tag, `Missing form control #${id}`);
    assert.match(tag, new RegExp(`name="${id}"`), `#${id} must declare name="${id}" for declarative WebMCP`);
    assert.match(tag, /toolparamdescription="[^"]+"/, `#${id} must declare toolparamdescription`);
  }

  // Static HTML must include all volume options 1..9 so declarative WebMCP schemas expose Mini volumes
  const volumeSelect = html.match(/<select[^>]*id="volume"[^>]*>([\s\S]*?)<\/select>/)?.[1] || '';
  for (let n = 1; n <= 9; n++) {
    assert.match(volumeSelect, new RegExp(`<option value="${n}">`), `Static #volume must include option ${n}`);
  }

  const honeypot = html.match(/<input[^>]*id="website"[^>]*>/)?.[0];
  assert.ok(honeypot, 'Honeypot input #website must remain present');
  assert.doesNotMatch(honeypot, /\bname=/, 'Honeypot #website must NOT have a name attribute');
  assert.doesNotMatch(honeypot, /toolparamdescription=/, 'Honeypot #website must NOT be exposed to WebMCP');
  assert.match(honeypot, /aria-hidden="true"/, 'Honeypot #website must set aria-hidden="true"');
});

test('submit-feedback.js supports declarative WebMCP respondWith(), Mini volumes 6-9 in any fill order, and big volume validation', async () => {
  const submissions = [];
  const sampleReceipt = 'GY-11111111-2222-4333-8444-555555555555';
  const mockFb = {
    async submitFeedback(payload) {
      submissions.push(payload);
      return { id: payload.id, status: 'new', received: true };
    },
    async lookupFeedback(id) {
      if (id === sampleReceipt) {
        return {
          id,
          status: 'resolved',
          created_at: '2026-11-10T00:00:00.000Z',
          updated_at: '2026-11-12T00:00:00.000Z',
        };
      }
      if (!/^GY-[0-9a-f-]{36}$/.test(id)) {
        const err = new Error('Invalid');
        err.status = 400;
        throw err;
      }
      const err = new Error('Not found');
      err.status = 404;
      throw err;
    },
  };

  const { elements, dispatchSubmit } = createSubmitFeedbackHarness({ search: '?ui=en', nibbanaFeedback: mockFb });
  const series = elements.get('series');
  const volume = elements.get('volume');
  const submitForm = elements.get('submit-feedback');
  const lookupForm = elements.get('lookup');

  // 1. Even on initial load (series='big'), all 9 options exist in #volume
  assert.equal(volume.options.length, 9);
  assert.equal(volume.value, '1');

  // 2. Agent fills volume='7' BEFORE switching series='mini' (reverse order) — must NOT clobber volume to '1'
  volume.value = '7';
  assert.equal(volume.value, '7');
  series.value = 'mini';
  series.onchange();
  assert.equal(volume.value, '7', 'series.onchange must preserve selected volume 7 for mini');
  assert.equal(volume.validationMessage, '');
  elements.get('language').value = 'en';
  elements.get('category').value = 'translation';
  elements.get('message').value = 'Please verify this Pali rendering in Volume 7.';
  elements.get('consent').checked = true;

  const submit1 = dispatchSubmit(submitForm, { agentInvoked: true });
  assert.equal(submit1.prevented, true);
  assert.ok(submit1.responsePromise, 'submit must call event.respondWith() synchronously for agentInvoked');
  const res1 = await submit1.responsePromise;
  assert.equal(res1.received, true);
  assert.match(res1.id, /^GY-/);
  assert.equal(submissions.length, 1);
  assert.equal(submissions[0].series, 'mini');
  assert.equal(submissions[0].volume, 7);

  // 3. Agent selects series='big' and volume='7' — rejected with clear validation error, zero backend calls
  series.value = 'big';
  series.onchange();
  volume.value = '7';
  volume.onchange();
  assert.ok(volume.validationMessage.includes('1–5'));
  assert.equal(volume.getAttribute('aria-invalid'), 'true');
  elements.get('message').value = 'Attempt invalid big volume 7.';
  elements.get('consent').checked = true;

  const submitInvalid = dispatchSubmit(submitForm, { agentInvoked: true });
  const resInvalid = await submitInvalid.responsePromise;
  assert.equal(resInvalid.received, false);
  assert.equal(resInvalid.status, 400);
  assert.match(resInvalid.error, /1–5/);
  assert.equal(submissions.length, 1, 'Invalid big volume > 5 must not call submitFeedback');

  // 4. Lookup form responds synchronously via event.respondWith() for hit, 404, and 400
  elements.get('receipt').value = sampleReceipt;
  const lookupHit = dispatchSubmit(lookupForm, { agentInvoked: true });
  assert.ok(lookupHit.responsePromise);
  const hitData = await lookupHit.responsePromise;
  assert.equal(hitData.ok, true);
  assert.equal(hitData.id, sampleReceipt);
  assert.equal(hitData.status, 'resolved');
  assert.equal(hitData.statusLabel, 'Corrected');

  elements.get('receipt').value = 'GY-99999999-9999-4999-8999-999999999999';
  const lookupMiss = await dispatchSubmit(lookupForm, { agentInvoked: true }).responsePromise;
  assert.equal(lookupMiss.ok, false);
  assert.equal(lookupMiss.status, 404);

  elements.get('receipt').value = 'not-a-code';
  const lookupBad = await dispatchSubmit(lookupForm, { agentInvoked: true }).responsePromise;
  assert.equal(lookupBad.ok, false);
  assert.equal(lookupBad.status, 400);
});

test('webmcp.js safely no-ops without modelContext, supports fallback, registers readOnlyHint + AbortSignal, and handles pagehide/bfcache pageshow', async () => {
  // No modelContext -> silent no-op
  const noop = loadWebMcp({ omitModelContext: true });
  assert.equal(noop.registered.length, 0);
  assert.equal(noop.winObj.nibbanaWebMcp, undefined);

  // Fallback to navigator.modelContext when document.modelContext is absent
  const navFallback = loadWebMcp({ useNavigatorFallback: true });
  assert.deepEqual(
    navFallback.registered.map(r => r.tool.name),
    ['list_book_editions', 'search_books', 'get_book_passage']
  );

  // Rejected registerTool promise is caught gracefully (no unhandled rejection)
  const rejected = loadWebMcp({ rejectRegister: true });
  assert.equal(rejected.registered.length, 3);
  await new Promise(r => setImmediate(r));

  // Primary document.modelContext + readOnlyHint + AbortSignal + bfcache lifecycle
  const primary = loadWebMcp({ surface: 'home' });
  assert.equal(primary.registered.length, 3);
  for (const { tool, options } of primary.registered) {
    assert.ok(tool.name && tool.description && tool.inputSchema && typeof tool.execute === 'function');
    assert.equal(tool.annotations?.readOnlyHint, true, `${tool.name} must declare readOnlyHint: true`);
    assert.ok(options?.signal instanceof AbortSignal);
    assert.equal(options.signal.aborted, false);
  }
  primary.winObj.dispatch('pagehide');
  for (const { options } of primary.registered) {
    assert.equal(options.signal.aborted, true, 'AbortSignal must abort on pagehide to unregister tools');
  }

  // bfcache restore (pageshow with persisted: true) re-registers all tools with a fresh signal
  primary.winObj.dispatch('pageshow', { persisted: true });
  assert.equal(primary.registered.length, 6, 'pageshow (persisted) must re-register all 3 tools');
  for (const { options } of primary.registered.slice(3)) {
    assert.equal(options.signal.aborted, false, 'Re-registered tools must have a fresh active AbortSignal');
  }
});

test('webmcp.js tools execute accurately against real docs/ book data and handle edge cases', async () => {
  const { registered } = loadWebMcp({ surface: 'home' });
  const byName = Object.fromEntries(registered.map(r => [r.tool.name, r.tool]));

  // 1. list_book_editions
  const allEditions = await byName.list_book_editions.execute({});
  assert.equal(allEditions.editions.big.volumes.length, 5);
  assert.equal(allEditions.editions.mini.volumes.length, 9);
  for (const v of allEditions.editions.big.volumes) {
    assert.equal(fs.existsSync(resolveOriginUrlToDocFile(v.jsonUrl)), true);
    assert.equal(fs.existsSync(resolveOriginUrlToDocFile(v.searchIndexUrl)), true);
    assert.equal(fs.existsSync(resolveOriginUrlToDocFile(v.markdownUrl)), true);
    assert.equal(fs.existsSync(resolveOriginUrlToDocFile(v.htmlUrl)), true);
    assert.equal(fs.existsSync(resolveOriginUrlToDocFile(v.pdfUrl)), true);
  }
  for (const v of allEditions.editions.mini.volumes) {
    assert.equal(fs.existsSync(resolveOriginUrlToDocFile(v.jsonUrlVi)), true);
    assert.equal(fs.existsSync(resolveOriginUrlToDocFile(v.jsonUrlEn)), true);
    assert.equal(fs.existsSync(resolveOriginUrlToDocFile(v.markdownUrlVi)), true);
    assert.equal(fs.existsSync(resolveOriginUrlToDocFile(v.markdownUrlEn)), true);
    assert.equal(fs.existsSync(resolveOriginUrlToDocFile(v.markdownUrlBi)), true);
  }

  const bigOnly = await byName.list_book_editions.execute({ edition: 'big' });
  assert.ok(bigOnly.editions.big && !bigOnly.editions.mini);
  assert.ok((await byName.list_book_editions.execute({ edition: 'invalid' })).error);

  // 2. search_books — diacritic-insensitive Vietnamese/Pāli in big
  const bigSearch = await byName.search_books.execute({ query: 'anapana', edition: 'big', volume: 1, limit: 5 });
  assert.equal(bigSearch.returned, 5, 'Expected 5 matches for "anapana" in Big Vol 1');
  assert.equal(bigSearch.hasMore, true);
  assert.equal(bigSearch.results[0].edition, 'big');
  assert.equal(bigSearch.results[0].volume, 1);
  assert.match(bigSearch.results[0].url, /^https:\/\/nibbanagamini\.org\/big\/#tap\/1\//);

  // 3. search_books — English in mini
  const miniEnSearch = await byName.search_books.execute({
    query: 'mindfulness of breathing',
    edition: 'mini',
    volume: 1,
    language: 'en',
    limit: 5,
  });
  assert.equal(miniEnSearch.returned, 5, 'Expected English matches in Mini Vol 1');
  assert.equal(miniEnSearch.results[0].language, 'en');
  assert.match(miniEnSearch.results[0].url, /^https:\/\/nibbanagamini\.org\/mini\/\?lang=en#cuon-1\//);

  // 4. search_books & get_book_passage — Mini Vol 4 Vietnamese table headers (present in p.table, missing from p.text!)
  const miniTableHeaderSearch = await byName.search_books.execute({
    query: 'toc hanh thien nhieu lan',
    edition: 'mini',
    volume: 4,
    language: 'vi',
    limit: 5,
  });
  assert.ok(miniTableHeaderSearch.returned > 0, 'Must search table headers from p.table (not skip tableToText)');
  const m04TablePage = await byName.get_book_passage.execute({
    edition: 'mini',
    volume: 4,
    language: 'vi',
    page_id: 'M04-body-P074',
  });
  assert.match(m04TablePage.text, /Tầng thiền \| M \| P \| U \| A \| G \| J · tốc hành thiền nhiều lần/);

  // 5. search_books — edge cases & strict parameter validation
  const emptyQuery = await byName.search_books.execute({ query: '   ' });
  assert.ok(emptyQuery.error && emptyQuery.returned === 0);

  const badBigVol = await byName.search_books.execute({ query: 'sati', edition: 'big', volume: 6 });
  assert.ok(badBigVol.error && badBigVol.returned === 0);

  const bigEnError = await byName.search_books.execute({ query: 'sati', edition: 'big', language: 'en' });
  assert.ok(bigEnError.error && bigEnError.returned === 0, 'edition=big + language=en must return a clear error');

  const badEdition = await byName.search_books.execute({ query: 'sati', edition: 'invalid' });
  assert.ok(badEdition.error && badEdition.returned === 0);

  const badLang = await byName.search_books.execute({ query: 'sati', language: 'fr' });
  assert.ok(badLang.error && badLang.returned === 0);

  const badVolBool = await byName.search_books.execute({ query: 'sati', volume: true });
  assert.ok(badVolBool.error && badVolBool.returned === 0, 'Boolean volume must be rejected');

  const badVol = await byName.search_books.execute({ query: 'sati', volume: 0 });
  assert.ok(badVol.error && badVol.returned === 0);

  // limit: null or limit: '' must fall back to default 15 (NOT clamp Number(null)=0 to 1!)
  const nullLimitSearch = await byName.search_books.execute({ query: 'anapana', edition: 'big', volume: 1, limit: null, volume_unused: '' });
  assert.equal(nullLimitSearch.returned, 15, 'limit: null must fall back to default 15, not 1');

  const emptyVolSearch = await byName.search_books.execute({ query: 'anapana', edition: 'big', volume: '', limit: '' });
  assert.equal(emptyVolSearch.returned, 15, 'Empty string volume/limit must use defaults');

  const noMatches = await byName.search_books.execute({ query: 'xyzzy-nonexistent-term-98765', edition: 'big', volume: 1 });
  assert.equal(noMatches.returned, 0);
  assert.equal(noMatches.hasMore, false);
  assert.deepEqual(JSON.parse(JSON.stringify(noMatches.results)), []);

  // Combined search across all editions & languages returns balanced buckets and stops early
  const fresh = loadWebMcp({ surface: 'home' });
  const freshSearch = fresh.registered.find(r => r.tool.name === 'search_books').tool;
  const combinedSearch = await freshSearch.execute({ query: 'anapana', edition: 'all', language: 'both', limit: 9 });
  assert.equal(combinedSearch.returned, 9);
  assert.equal(combinedSearch.hasMore, true);
  const buckets = new Set(combinedSearch.results.map(r => `${r.edition}:${r.language}`));
  assert.deepEqual([...buckets].sort(), ['big:vi', 'mini:en', 'mini:vi'], 'Combined search must balance big:vi, mini:vi, mini:en');
  assert.equal(fresh.fetchLog.length, 3, 'Early stopping should only fetch Vol 1 of each bucket (3 files, not all 23)');

  // Pre-aborted execution signal rejects with AbortError
  const ac = new AbortController();
  ac.abort();
  await assert.rejects(
    () => byName.search_books.execute({ query: 'anapana', edition: 'big', volume: 1 }, { signal: ac.signal }),
    err => err.name === 'AbortError'
  );

  // 6. get_book_passage — TOC pagination & passage lookup for big
  const bigTocPage1 = await byName.get_book_passage.execute({ edition: 'big', volume: 1 });
  assert.equal(bigTocPage1.totalTocEntries, 700);
  assert.equal(bigTocPage1.toc.length, 120);
  assert.equal(bigTocPage1.tocOffset, 0);
  assert.equal(bigTocPage1.hasMoreToc, true);

  const bigTocPage2 = await byName.get_book_passage.execute({ edition: 'big', volume: 1, toc_offset: 650, toc_limit: 100 });
  assert.equal(bigTocPage2.toc.length, 50);
  assert.equal(bigTocPage2.tocOffset, 650);
  assert.equal(bigTocPage2.hasMoreToc, false);

  const bigIntro = await byName.get_book_passage.execute({ edition: 'big', volume: 1, page_id: 'v1-pI' });
  assert.equal(bigIntro.pageId, 'v1-pI');
  assert.ok(bigIntro.text.length > 50);
  assert.doesNotMatch(bigIntro.text, /<\/?(?:p|div|span|h[1-6])\b/i, 'Plain text must strip HTML tags');

  // Verify htmlToPlainText separates </summary> and </caption> and table cells cleanly (no glued words or leading '|')
  const bigSummaryPage = await byName.get_book_passage.execute({ edition: 'big', volume: 2, page_id: 'toc-pdf-6' });
  assert.doesNotMatch(bigSummaryPage.text, /đối chiếuĐọc/, '</summary> must insert a line break');
  const bigCaptionPage = await byName.get_book_passage.execute({ edition: 'big', volume: 2, page_id: 'front-pdf-227' });
  assert.match(bigCaptionPage.text, /Bảng quán chuỗi tâm lộ chánh ngữ\nHướng ý môn \| Đổng lực/);
  assert.doesNotMatch(bigCaptionPage.text, /^\s*\|/m, 'Table rows must not begin with a stray pipe');

  const bigByParagraphId = await byName.get_book_passage.execute({
    edition: 'big',
    volume: 1,
    page_id: bigSearch.results[0].targetId,
  });
  assert.ok(bigByParagraphId.pageId && bigByParagraphId.text.length > 20, 'Should resolve paragraph anchor from search_books');

  // 7. get_book_passage — mini VI & mini EN (including Burmese citation metadata + case-insensitive paragraph IDs)
  const mini1Toc = await byName.get_book_passage.execute({ edition: 'mini', volume: 1, language: 'vi' });
  assert.ok(mini1Toc.totalTocEntries > 0);
  const mini2Toc = await byName.get_book_passage.execute({ edition: 'mini', volume: 2, language: 'vi' });
  assert.ok(mini2Toc.totalTocEntries > 0);
  const mini1EnToc = await byName.get_book_passage.execute({ edition: 'mini', volume: 1, language: 'en' });
  assert.ok(mini1EnToc.totalTocEntries > 0);

  const miniEnPassage = await byName.get_book_passage.execute({
    edition: 'mini',
    volume: 1,
    language: 'en',
    page_id: miniEnSearch.results[0].targetId,
  });
  assert.ok(miniEnPassage.pageId && miniEnPassage.text.length > 20, 'Should resolve Mini EN paragraph ID');
  assert.ok(miniEnPassage.printedPage, 'Mini EN passage must include Burmese printedPage for citations');
  assert.ok(miniEnPassage.sourcePdfUrl && miniEnPassage.sourcePdfUrl.includes('/mini/source/M01/'), 'Mini EN passage must include sourcePdfUrl');

  // Case-insensitive paragraph IDs (-s01) must resolve for BOTH mini EN and mini VI
  const miniEnLower = await byName.get_book_passage.execute({
    edition: 'mini',
    volume: 1,
    language: 'en',
    page_id: 'm01-body-p001-s01',
  });
  assert.equal(miniEnLower.pageId, 'M01-body-P001', 'Case-insensitive Mini EN paragraph ID must resolve');

  const miniViLower = await byName.get_book_passage.execute({
    edition: 'mini',
    volume: 1,
    language: 'vi',
    page_id: 'm01-body-p001-s01',
  });
  assert.equal(miniViLower.pageId, 'M01-body-P001', 'Case-insensitive Mini VI paragraph ID must resolve');

  const miniViPassage = await byName.get_book_passage.execute({
    edition: 'mini',
    volume: 1,
    language: 'vi',
    page_id: 'M01-cover-P001',
  });
  assert.equal(miniViPassage.pageId, 'M01-cover-P001');
  assert.match(miniViPassage.text, /Nibbānagāminipaṭipadā/);

  // 8. get_book_passage — error edge cases
  assert.ok((await byName.get_book_passage.execute({ edition: 'big', volume: 1, language: 'en' })).error);
  assert.ok((await byName.get_book_passage.execute({ edition: 'big', volume: 9 })).error);
  assert.ok((await byName.get_book_passage.execute({ edition: 'big', volume: true })).error);
  assert.ok((await byName.get_book_passage.execute({ edition: 'mini', volume: 1, language: 'fr' })).error);
  assert.ok((await byName.get_book_passage.execute({ edition: 'mini', volume: 1, language: 'en', page_id: 'NO-SUCH-PAGE' })).error);
  assert.ok((await byName.get_book_passage.execute({ edition: 'invalid', volume: 1 })).error);

  // 9. Corrections surface registers get_public_corrections with readOnlyHint
  const mockCorrections = { entries: [{ id: 'GY-1', status: 'resolved', public_note: 'Fixed typo.' }] };
  const corrCtx = loadWebMcp({
    surface: 'corrections',
    nibbanaFeedback: { getCorrections: async () => mockCorrections },
  });
  const corrTool = corrCtx.registered.find(r => r.tool.name === 'get_public_corrections')?.tool;
  assert.ok(corrTool, 'Corrections page must register get_public_corrections');
  assert.equal(corrTool.annotations?.readOnlyHint, true);
  assert.deepEqual(await corrTool.execute({}), mockCorrections);
});

test('local HTTP server serves all public pages and .well-known agent discovery assets with 200 OK', async () => {
  const server = http.createServer((req, res) => {
    const clean = (req.url || '/').split('?')[0];
    let rel = decodeURIComponent(clean).replace(/^\/+/, '');
    if (!rel) rel = 'index.html';
    else if (rel.endsWith('/')) rel += 'index.html';
    const filePath = path.join(DOCS_DIR, rel);
    if (!filePath.startsWith(DOCS_DIR) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const types = {
      '.html': 'text/html; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.xml': 'application/xml; charset=utf-8',
      '.txt': 'text/plain; charset=utf-8',
      '.md': 'text/markdown; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
    };
    res.writeHead(200, {
      'Content-Type': types[ext] || 'application/octet-stream',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(fs.readFileSync(filePath));
  });

  await new Promise(r => server.listen(0, '127.0.0.1', r));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const endpoints = [
      '/',
      '/big/',
      '/mini/',
      '/mini/downloads/',
      '/gop-y.html',
      '/hieu-dinh.html',
      '/robots.txt',
      '/sitemap.xml',
      '/llms.txt',
      '/index.md',
      '/openapi.json',
      '/webmcp.js',
      '/.well-known/api-catalog',
      '/.well-known/ai-catalog.json',
      '/.well-known/agent-skills/index.json',
      '/.well-known/agent-skills/read-and-search-books/SKILL.md',
      '/.well-known/agent-skills/translation-feedback/SKILL.md',
    ];
    for (const ep of endpoints) {
      const resp = await fetch(base + ep);
      assert.equal(resp.status, 200, `Expected 200 for ${ep}`);
      const body = await resp.text();
      assert.ok(body.length > 0, `Expected non-empty response for ${ep}`);
      if (ep.endsWith('.json') || ep === '/.well-known/api-catalog') {
        JSON.parse(body);
      }
    }
  } finally {
    await new Promise(r => server.close(r));
  }
});
