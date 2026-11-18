import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

import { loadRowsFromSqliteOrSql, migrateToFirestore } from './migrate-from-d1.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

function makeId() {
  return 'GY-' + crypto.randomUUID();
}

function makePayload(overrides = {}) {
  return {
    id: makeId(),
    series: 'big',
    language: 'vi',
    volume: 1,
    anchor: 'v1-pI',
    printed: 'I',
    pdfPage: 12,
    excerpt: 'Đoạn trích mẫu để kiểm tra.',
    category: 'translation',
    message: 'Đề nghị đối chiếu lại đoạn này với nguyên tác Miến.',
    suggestion: 'Đề nghị sửa câu chữ cho rõ hơn.',
    reference: 'PDF Miến tr. 12',
    name: 'Độc giả thử nghiệm',
    email: 'reader@example.org',
    website: '',
    consent: true,
    ...overrides,
  };
}

function createMemoryStorage() {
  const map = new Map();
  return {
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: k => map.delete(k),
    clear: () => map.clear(),
  };
}

function loadFeedbackModule({ projectId = 'nibbana-test', apiKey = 'test-api-key', firestoreEmulatorOrigin = '', authEmulatorOrigin = '' } = {}) {
  const sessionStorage = createMemoryStorage();
  const localStorage = createMemoryStorage();
  const window = {
    NIBBANA_FEEDBACK_CONFIG: {
      projectId,
      apiKey,
      firestoreEmulatorOrigin,
      authEmulatorOrigin,
    },
    location: { hostname: 'nibbanagamini.org' },
  };
  const context = {
    window,
    sessionStorage,
    localStorage,
    fetch,
    URLSearchParams,
    Date,
    Number,
    String,
    Boolean,
    Array,
    Object,
    Error,
    Math,
    JSON,
    console,
  };
  const code = fs.readFileSync(path.join(REPO_ROOT, 'docs/firebase-feedback.js'), 'utf8');
  vm.runInNewContext(code, context, { filename: 'docs/firebase-feedback.js' });
  return { fb: window.nibbanaFeedback, sessionStorage, localStorage };
}

/**
 * Lightweight mock of Firebase Auth + Cloud Firestore REST API v1 enforcing
 * the project's collection split and security boundaries.
 */
async function startMockFirebaseServer({ projectId = 'nibbana-test', apiKey = 'test-api-key' } = {}) {
  const users = new Map([
    ['admin@nibbanagamini.org', { localId: 'uid-admin-1', password: 'correct-horse-battery-staple', isAdmin: true }],
    ['stranger@example.org', { localId: 'uid-stranger-1', password: 'stranger-password', isAdmin: false }],
  ]);
  const tokens = new Map();
  const refreshTokens = new Map();
  const admins = new Set(['uid-admin-1']);
  const collections = {
    feedback: new Map(),
    feedback_public: new Map(),
  };
  let seqTime = 1700000000000;
  let refreshCount = 0;

  function nextTimestamp() {
    seqTime += 1000;
    return new Date(seqTime).toISOString();
  }

  function decodeVal(v) {
    if (!v || typeof v !== 'object') return null;
    if ('stringValue' in v) return v.stringValue;
    if ('integerValue' in v) return Number(v.integerValue);
    if ('doubleValue' in v) return Number(v.doubleValue);
    if ('booleanValue' in v) return Boolean(v.booleanValue);
    if ('timestampValue' in v) return v.timestampValue;
    if ('nullValue' in v) return null;
    return null;
  }

  function getAuthUid(req) {
    const auth = String(req.headers.authorization || '');
    const m = auth.match(/^Bearer\s+(.+)$/i);
    if (!m) return null;
    return tokens.get(m[1]) || null;
  }

  async function readJson(req) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks).toString('utf8');
    return raw ? JSON.parse(raw) : {};
  }

  function send(res, status, data) {
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    res.end(JSON.stringify(data));
  }

  const server = http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      });
      res.end();
      return;
    }
    const url = new URL(req.url, 'http://127.0.0.1');
    const p = url.pathname;

    // Firebase Auth signInWithPassword
    if (req.method === 'POST' && p === '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword') {
      if (url.searchParams.get('key') !== apiKey) {
        return send(res, 400, { error: { message: 'API_KEY_INVALID' } });
      }
      const body = await readJson(req);
      const user = users.get(body.email);
      if (!user || user.password !== body.password) {
        return send(res, 400, { error: { message: 'INVALID_LOGIN_CREDENTIALS' } });
      }
      const idToken = 'tok-' + crypto.randomUUID();
      const refreshToken = 'ref-' + crypto.randomUUID();
      tokens.set(idToken, user.localId);
      refreshTokens.set(refreshToken, user.localId);
      return send(res, 200, {
        idToken,
        refreshToken,
        expiresIn: '3600',
        email: body.email,
        localId: user.localId,
      });
    }

    // SecureToken refresh
    if (req.method === 'POST' && p === '/securetoken.googleapis.com/v1/token') {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const params = new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
      const ref = params.get('refresh_token');
      const uid = refreshTokens.get(ref);
      if (!uid) return send(res, 400, { error: { message: 'INVALID_REFRESH_TOKEN' } });
      refreshCount++;
      const newToken = 'tok-' + crypto.randomUUID();
      tokens.set(newToken, uid);
      return send(res, 200, {
        id_token: newToken,
        refresh_token: ref,
        expires_in: '3600',
      });
    }

    const docPrefix = `/v1/projects/${projectId}/databases/(default)/documents`;
    const uid = getAuthUid(req);
    const isAdmin = Boolean(uid && admins.has(uid));

    // GET admins/{uid}
    if (req.method === 'GET' && p.startsWith(`${docPrefix}/admins/`)) {
      const targetUid = decodeURIComponent(p.slice(`${docPrefix}/admins/`.length));
      if (!uid || uid !== targetUid) return send(res, 403, { error: { status: 'PERMISSION_DENIED', message: 'Forbidden' } });
      if (!admins.has(targetUid)) return send(res, 404, { error: { status: 'NOT_FOUND', message: 'Not found' } });
      return send(res, 200, { name: `projects/${projectId}/databases/(default)/documents/admins/${targetUid}`, fields: { role: { stringValue: 'editor' } } });
    }

    // GET feedback_public/{id}
    if (req.method === 'GET' && p.startsWith(`${docPrefix}/feedback_public/`)) {
      const id = decodeURIComponent(p.slice(`${docPrefix}/feedback_public/`.length));
      if (!isAdmin && !/^GY-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)) {
        return send(res, 403, { error: { status: 'PERMISSION_DENIED', message: 'Invalid receipt id' } });
      }
      const doc = collections.feedback_public.get(id);
      if (!doc) return send(res, 404, { error: { status: 'NOT_FOUND', message: 'Not found' } });
      return send(res, 200, doc);
    }

    // GET feedback/{id} (admin only)
    if (req.method === 'GET' && p.startsWith(`${docPrefix}/feedback/`)) {
      if (!isAdmin) return send(res, 403, { error: { status: 'PERMISSION_DENIED', message: 'Admin required' } });
      const id = decodeURIComponent(p.slice(`${docPrefix}/feedback/`.length));
      const doc = collections.feedback.get(id);
      if (!doc) return send(res, 404, { error: { status: 'NOT_FOUND', message: 'Not found' } });
      return send(res, 200, doc);
    }

    // POST :commit
    if (req.method === 'POST' && p === `/v1/projects/${projectId}/databases/(default)/documents:commit`) {
      const body = await readJson(req);
      const writes = body.writes || [];
      const commitTs = nextTimestamp();

      // Pre-validate preconditions before mutating
      for (const w of writes) {
        const parts = w.update.name.split('/');
        const col = parts[parts.length - 2];
        const id = parts[parts.length - 1];
        const existing = collections[col]?.get(id);

        if (w.currentDocument?.exists === false && existing) {
          return send(res, 409, { error: { status: 'ALREADY_EXISTS', message: 'Document already exists' } });
        }
        if (w.currentDocument?.exists === true && !existing) {
          return send(res, 404, { error: { status: 'NOT_FOUND', message: 'Missing document' } });
        }
        if (w.currentDocument?.updateTime && (!existing || existing.updateTime !== w.currentDocument.updateTime)) {
          return send(res, 400, { error: { status: 'FAILED_PRECONDITION', message: 'the stored version does not match updateTime' } });
        }
        if (!isAdmin) {
          if (w.currentDocument?.exists !== false || w.updateMask) {
            return send(res, 403, { error: { status: 'PERMISSION_DENIED', message: 'Public can only create' } });
          }
        }
      }

      // Enforce pairing for non-admin batch create
      if (!isAdmin) {
        const names = new Set(writes.map(w => w.update.name));
        for (const w of writes) {
          const parts = w.update.name.split('/');
          const id = parts[parts.length - 1];
          const privName = `projects/${projectId}/databases/(default)/documents/feedback/${id}`;
          const pubName = `projects/${projectId}/databases/(default)/documents/feedback_public/${id}`;
          if (!names.has(privName) || !names.has(pubName)) {
            return send(res, 403, { error: { status: 'PERMISSION_DENIED', message: 'Must pair feedback and feedback_public' } });
          }
        }
      }

      const writeResults = [];
      for (const w of writes) {
        const parts = w.update.name.split('/');
        const col = parts[parts.length - 2];
        const id = parts[parts.length - 1];
        const prev = collections[col].get(id);
        let nextFields;
        if (w.updateMask?.fieldPaths) {
          nextFields = { ...(prev?.fields || {}) };
          for (const fp of w.updateMask.fieldPaths) {
            if (fp in (w.update.fields || {})) nextFields[fp] = w.update.fields[fp];
            else delete nextFields[fp];
          }
        } else {
          nextFields = { ...(w.update.fields || {}) };
        }
        for (const t of w.updateTransforms || []) {
          if (t.setToServerValue === 'REQUEST_TIME') {
            nextFields[t.fieldPath] = { timestampValue: commitTs };
          }
        }
        const stored = {
          name: w.update.name,
          fields: nextFields,
          createTime: prev?.createTime || commitTs,
          updateTime: commitTs,
        };
        collections[col].set(id, stored);
        writeResults.push({ updateTime: commitTs });
      }
      return send(res, 200, { writeResults, commitTime: commitTs });
    }

    // POST :runQuery
    if (req.method === 'POST' && p === `/v1/projects/${projectId}/databases/(default)/documents:runQuery`) {
      const body = await readJson(req);
      const q = body.structuredQuery || {};
      const col = q.from?.[0]?.collectionId;
      if (!collections[col]) return send(res, 400, [{ error: { status: 'INVALID_ARGUMENT', message: 'Unknown collection' } }]);

      if (col === 'feedback' && !isAdmin) {
        return send(res, 403, [{ error: { status: 'PERMISSION_DENIED', message: 'Admin required' } }]);
      }
      if (col === 'feedback_public' && !isAdmin) {
        const filters = q.where?.compositeFilter?.filters || [];
        const hasPub = filters.some(f => f.fieldFilter?.field?.fieldPath === 'published' && f.fieldFilter?.op === 'EQUAL' && f.fieldFilter?.value?.booleanValue === true);
        const hasStatus = filters.some(f => f.fieldFilter?.field?.fieldPath === 'status' && f.fieldFilter?.op === 'IN');
        if (!hasPub || !hasStatus) {
          return send(res, 403, [{ error: { status: 'PERMISSION_DENIED', message: 'Public list query must filter published==true and status IN' } }]);
        }
      }

      let docs = Array.from(collections[col].values());
      if (q.where?.compositeFilter?.filters) {
        for (const f of q.where.compositeFilter.filters) {
          const ff = f.fieldFilter;
          if (!ff) continue;
          const field = ff.field.fieldPath;
          if (ff.op === 'EQUAL') {
            const target = decodeVal(ff.value);
            docs = docs.filter(d => decodeVal(d.fields[field]) === target);
          } else if (ff.op === 'IN') {
            const allowed = (ff.value.arrayValue?.values || []).map(decodeVal);
            docs = docs.filter(d => allowed.includes(decodeVal(d.fields[field])));
          }
        }
      }

      if (q.orderBy?.length) {
        const ord = q.orderBy[0];
        const field = ord.field.fieldPath;
        const desc = ord.direction === 'DESCENDING';
        docs.sort((a, b) => {
          const va = String(decodeVal(a.fields[field]) || '');
          const vb = String(decodeVal(b.fields[field]) || '');
          return desc ? vb.localeCompare(va) : va.localeCompare(vb);
        });
      }

      const off = Number(q.offset || 0);
      const lim = Number(q.limit || 100);
      docs = docs.slice(off, off + lim);

      if (!docs.length) {
        return send(res, 200, [{ readTime: new Date().toISOString() }]);
      }
      return send(res, 200, docs.map(d => ({ document: d, readTime: new Date().toISOString() })));
    }

    return send(res, 404, { error: { message: 'Not found' } });
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const origin = `http://127.0.0.1:${port}`;
  return {
    origin,
    projectId,
    apiKey,
    collections,
    getRefreshCount: () => refreshCount,
    close: () => new Promise(resolve => server.close(resolve)),
  };
}

test('unconfigured Firebase rejects cleanly without network calls', async () => {
  const { fb } = loadFeedbackModule({ projectId: '', apiKey: '' });
  assert.equal(fb.isConfigured(), false);
  await assert.rejects(() => fb.getCorrections(), err => err.status === 503 && err.code === 'NOT_CONFIGURED');

  const { fb: placeholderFb } = loadFeedbackModule({ projectId: 'YOUR_PROJECT_ID', apiKey: 'YOUR_API_KEY' });
  assert.equal(placeholderFb.isConfigured(), false);
});

test('validateSubmission checks big, mini, edge bounds, email, consent, and honeypot', () => {
  const { fb } = loadFeedbackModule();

  // Valid big
  const validBig = fb.validateSubmission(makePayload());
  assert.equal(validBig.series, 'big');
  assert.equal(validBig.volume, 1);

  // Valid mini with pdfPage 0
  const validMini = fb.validateSubmission(makePayload({
    series: 'mini',
    language: 'bi',
    volume: 9,
    anchor: 'M09-cover-P001',
    printed: 'Bìa',
    pdfPage: 0,
    email: '',
  }));
  assert.equal(validMini.series, 'mini');
  assert.equal(validMini.pdfPage, 0);

  // Invalid big pdfPage 0
  assert.throws(() => fb.validateSubmission(makePayload({ pdfPage: 0 })), err => err.status === 400);
  // Invalid mini anchor mismatch
  assert.throws(() => fb.validateSubmission(makePayload({ series: 'mini', volume: 2, anchor: 'M03-body-P001' })), err => err.status === 400);
  // Invalid UUID
  assert.throws(() => fb.validateSubmission(makePayload({ id: 'GY-not-a-uuid' })), err => err.status === 400);
  // Whitespace-only message
  assert.throws(() => fb.validateSubmission(makePayload({ message: '     ' })), err => err.status === 400);
  // Bad email
  assert.throws(() => fb.validateSubmission(makePayload({ email: 'not-an-email' })), err => err.status === 400);
  // Missing consent
  assert.throws(() => fb.validateSubmission(makePayload({ consent: false })), err => err.status === 400);
  // Honeypot filled
  assert.throws(() => fb.validateSubmission(makePayload({ website: 'https://spam.example' })), err => err.status === 400);
});

test('public submitFeedback, idempotent retry, lookupFeedback PII isolation, and empty corrections', async () => {
  const mock = await startMockFirebaseServer();
  try {
    const { fb } = loadFeedbackModule({
      projectId: mock.projectId,
      apiKey: mock.apiKey,
      firestoreEmulatorOrigin: mock.origin,
      authEmulatorOrigin: mock.origin,
    });

    // Empty corrections returns []
    const emptyCorr = await fb.getCorrections();
    assert.deepEqual(JSON.parse(JSON.stringify(emptyCorr)), { entries: [] });

    const payload = makePayload();
    const res = await fb.submitFeedback(payload);
    assert.deepEqual(JSON.parse(JSON.stringify(res)), { id: payload.id, status: 'new', received: true });

    // Both collections populated
    assert.equal(mock.collections.feedback.size, 1);
    assert.equal(mock.collections.feedback_public.size, 1);

    // Public mirror contains NO PII or private text
    const publicFields = mock.collections.feedback_public.get(payload.id).fields;
    assert.equal('name' in publicFields, false);
    assert.equal('email' in publicFields, false);
    assert.equal('message' in publicFields, false);
    assert.equal('editorial_note' in publicFields, false);

    // Idempotent retry with same ID succeeds
    const retry = await fb.submitFeedback(payload);
    assert.deepEqual(JSON.parse(JSON.stringify(retry)), { id: payload.id, status: 'new', received: true });

    // Receipt lookup returns only 4 status fields
    const lookup = await fb.lookupFeedback(payload.id);
    assert.deepEqual(Object.keys(lookup).sort(), ['created_at', 'id', 'status', 'updated_at']);
    assert.equal(lookup.id, payload.id);
    assert.equal(lookup.status, 'new');

    // Invalid and missing receipt lookup (non-v4 UUID rejected locally with 400, never 403)
    await assert.rejects(() => fb.lookupFeedback('bad-id'), err => err.status === 400);
    await assert.rejects(() => fb.lookupFeedback('GY-11111111-1111-1111-1111-111111111111'), err => err.status === 400);
    await assert.rejects(() => fb.lookupFeedback('GY------------------------------------'), err => err.status === 400);
    await assert.rejects(() => fb.lookupFeedback(makeId()), err => err.status === 404);
  } finally {
    await mock.close();
  }
});

test('admin auth, allowlist enforcement, token refresh, workflow transitions, concurrency, and public log', async () => {
  const mock = await startMockFirebaseServer();
  try {
    const { fb, sessionStorage } = loadFeedbackModule({
      projectId: mock.projectId,
      apiKey: mock.apiKey,
      firestoreEmulatorOrigin: mock.origin,
      authEmulatorOrigin: mock.origin,
    });

    // Unauthenticated review calls fail with 401
    await assert.rejects(() => fb.listReviewFeedback(), err => err.status === 401);

    // Wrong credentials fail with 401
    await assert.rejects(() => fb.signInAdmin('admin@nibbanagamini.org', 'wrong-pw'), err => err.status === 401);

    // Valid Firebase Auth user NOT in admins/{uid} fails with 403 and stores no session
    await assert.rejects(() => fb.signInAdmin('stranger@example.org', 'stranger-password'), err => err.status === 403);
    assert.equal(fb.getAdminSession(), null);

    // Valid admin signs in
    const session = await fb.signInAdmin('admin@nibbanagamini.org', 'correct-horse-battery-staple');
    assert.equal(session.email, 'admin@nibbanagamini.org');
    assert.equal(fb.getAdminSession().localId, 'uid-admin-1');

    // Submit 2 feedback items
    const p1 = makePayload({ series: 'big', volume: 2, printed: '45', pdfPage: 55 });
    const p2 = makePayload({ series: 'mini', language: 'en', volume: 3, anchor: 'M03-body-P010', printed: '10', pdfPage: 10 });
    await fb.submitFeedback(p1);
    await fb.submitFeedback(p2);

    // List review items (newest first: p2, p1)
    const list1 = await fb.listReviewFeedback({ offset: 0 });
    assert.equal(list1.entries.length, 2);
    assert.equal(list1.entries[0].id, p2.id);
    assert.equal(list1.entries[1].id, p1.id);
    assert.equal(list1.nextOffset, null);

    // Cannot publish premature note or status
    await assert.rejects(
      () => fb.saveReviewFeedback({
        id: p1.id,
        status: 'reviewing',
        editorial_note: '',
        public_note: 'Đủ mười ký tự giải thích.',
        published: true,
        original: '',
        revision: '',
        release_commit: '',
      }),
      err => err.status === 400
    );

    // Cannot approve without prior reviewing save with differing original/revision
    await assert.rejects(
      () => fb.saveReviewFeedback({
        id: p1.id,
        status: 'approved',
        editorial_note: '',
        public_note: '',
        published: false,
        original: 'Câu cũ',
        revision: 'Câu mới',
        release_commit: '',
      }),
      err => err.status === 409
    );

    // Step 1: Save as reviewing with original, revision, and an UNPUBLISHED draft public_note
    const s1 = await fb.saveReviewFeedback({
      id: p1.id,
      status: 'reviewing',
      editorial_note: 'Đang đối chiếu Miến trang 45',
      public_note: 'Bản nháp giải thích chưa duyệt công khai.',
      published: false,
      original: 'Câu cũ',
      revision: 'Câu mới',
      release_commit: '',
      expectedUpdateTime: list1.entries[1]._update_time,
    });
    assert.equal(s1.saved, true);
    // Draft public_note must NOT leak to feedback_public while published is false
    assert.equal(mock.collections.feedback_public.get(p1.id).fields.public_note.stringValue, '');
    assert.equal(mock.collections.feedback.get(p1.id).fields.public_note.stringValue, 'Bản nháp giải thích chưa duyệt công khai.');

    // Stale expectedUpdateTime detects concurrent edit (409)
    await assert.rejects(
      () => fb.saveReviewFeedback({
        id: p1.id,
        status: 'approved',
        editorial_note: '',
        public_note: '',
        published: false,
        original: 'Câu cũ',
        revision: 'Câu mới',
        release_commit: '',
        expectedUpdateTime: list1.entries[1]._update_time, // stale!
      }),
      err => err.status === 409
    );

    // Step 2: Approve with latest updateTime
    const s2 = await fb.saveReviewFeedback({
      id: p1.id,
      status: 'approved',
      editorial_note: 'Đã duyệt bản sửa',
      public_note: '',
      published: false,
      original: 'Câu cũ',
      revision: 'Câu mới',
      release_commit: '',
      expectedUpdateTime: s1.updateTime,
    });
    assert.equal(s2.saved, true);

    // Step 3: Resolve and publish with 40-char commit hash
    const commitSha = 'a'.repeat(40);
    const s3 = await fb.saveReviewFeedback({
      id: p1.id,
      status: 'resolved',
      editorial_note: 'Đã cập nhật bản chuẩn',
      public_note: 'Đã sửa "Câu cũ" thành "Câu mới" theo nguyên tác Miến tr. 45.',
      published: true,
      original: 'Câu cũ',
      revision: 'Câu mới',
      release_commit: commitSha,
      expectedUpdateTime: s2.updateTime,
    });
    assert.equal(s3.saved, true);

    // Mark p2 as unchanged and publish
    const s4 = await fb.saveReviewFeedback({
      id: p2.id,
      status: 'unchanged',
      editorial_note: 'Giữ nguyên',
      public_note: 'Thuật ngữ hiện tại đã đúng với nguyên tác.',
      published: true,
      original: '',
      revision: '',
      release_commit: '',
      expectedUpdateTime: list1.entries[0]._update_time,
    });
    assert.equal(s4.saved, true);

    // Public corrections log contains both p2 and p1 in descending updated_at order, without PII
    const corr = await fb.getCorrections();
    assert.equal(corr.entries.length, 2);
    assert.equal(corr.entries[0].id, p2.id);
    assert.equal(corr.entries[0].status, 'unchanged');
    assert.equal(corr.entries[1].id, p1.id);
    assert.equal(corr.entries[1].status, 'resolved');
    assert.equal(corr.entries[1].release_commit, commitSha);
    assert.equal('email' in corr.entries[1], false);
    assert.equal('message' in corr.entries[1], false);

    // Simulate near-expiry token to verify automatic refresh
    const stored = JSON.parse(sessionStorage.getItem('nibbana_firebase_session'));
    stored.expiresAt = Date.now() - 1000;
    sessionStorage.setItem('nibbana_firebase_session', JSON.stringify(stored));
    const listAfterRefresh = await fb.listReviewFeedback();
    assert.equal(listAfterRefresh.entries.length, 2);
    assert.equal(mock.getRefreshCount(), 1);

    // Sign out clears session
    fb.signOutAdmin();
    assert.equal(fb.getAdminSession(), null);
    await assert.rejects(() => fb.listReviewFeedback(), err => err.status === 401);
  } finally {
    await mock.close();
  }
});

test('D1 SQLite migration script imports legacy and v2 rows into Firestore', async () => {
  const mock = await startMockFirebaseServer();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nibbana-d1-'));
  try {
    const id1 = makeId();
    const id2 = makeId();
    const sqlPath = path.join(tmpDir, 'd1-export.sql');
    fs.writeFileSync(
      sqlPath,
      `CREATE TABLE feedback (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        volume INTEGER NOT NULL,
        anchor TEXT NOT NULL,
        printed TEXT NOT NULL,
        pdf_page INTEGER NOT NULL,
        excerpt TEXT NOT NULL DEFAULT '',
        category TEXT NOT NULL,
        message TEXT NOT NULL,
        suggestion TEXT NOT NULL DEFAULT '',
        reference TEXT NOT NULL DEFAULT '',
        name TEXT NOT NULL DEFAULT '',
        email TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'new',
        editorial_note TEXT NOT NULL DEFAULT '',
        public_note TEXT NOT NULL DEFAULT '',
        published INTEGER NOT NULL DEFAULT 0
      );
      INSERT INTO feedback VALUES (
        '${id1}', '2026-01-10T08:00:00.000Z', '2026-01-11T09:00:00.000Z',
        1, 'v1-pI', 'I', 10, 'Trích đoạn', 'typo', 'Lỗi chính tả nhỏ.', '', '', 'An', 'an@example.org',
        'resolved', 'Đã sửa', 'Đã sửa lỗi chính tả ở Tập I tr. I.', 1
      );
      INSERT INTO feedback VALUES (
        '${id2}', '2026-02-01 10:00:00', '2026-02-01 10:00:00',
        3, 'v3-p12', '12', 20, '', 'question', 'Xin giải thích thêm đoạn này.', '', '', '', '',
        'reviewing', 'Ghi chú nội bộ', 'Bản nháp chưa công bố.', '0'
      );`
    );

    const parsed = loadRowsFromSqliteOrSql(sqlPath);
    assert.equal(parsed.length, 2);
    assert.equal(parsed[0].series, 'big');
    assert.equal(parsed[0].language, 'vi');
    assert.equal(parsed[0].published, true);
    assert.equal(parsed[1].published, false);

    const result = await migrateToFirestore({
      inputPath: sqlPath,
      projectId: mock.projectId,
      apiKey: mock.apiKey,
      adminEmail: 'admin@nibbanagamini.org',
      adminPassword: 'correct-horse-battery-staple',
      firestoreEmulatorOrigin: mock.origin,
      authEmulatorOrigin: mock.origin,
    });
    assert.deepEqual(result, { totalRows: 2, committedBatches: 1 });
    assert.equal(mock.collections.feedback.size, 2);
    assert.equal(mock.collections.feedback_public.size, 2);
    // Unpublished row keeps draft public_note in feedback, not in feedback_public, and converts SQLite UTC datetime cleanly
    assert.equal(mock.collections.feedback.get(id2).fields.public_note.stringValue, 'Bản nháp chưa công bố.');
    assert.equal(mock.collections.feedback_public.get(id2).fields.public_note.stringValue, '');
    assert.equal(mock.collections.feedback_public.get(id2).fields.created_at.timestampValue, '2026-02-01T10:00:00.000Z');

    // Migrated published entry is immediately visible in getCorrections()
    const { fb } = loadFeedbackModule({
      projectId: mock.projectId,
      apiKey: mock.apiKey,
      firestoreEmulatorOrigin: mock.origin,
      authEmulatorOrigin: mock.origin,
    });
    const corr = await fb.getCorrections();
    assert.equal(corr.entries.length, 1);
    assert.equal(corr.entries[0].id, id1);
    assert.equal(corr.entries[0].series, 'big');
    assert.equal(corr.entries[0].language, 'vi');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    await mock.close();
  }
});

test('error handling: commit 401/403 clears session, missing DB not misreported as NOT_ADMIN, 403 duplicate retry, timestamp precision', async () => {
  const { fb: utilFb } = loadFeedbackModule();
  assert.deepEqual(
    JSON.parse(JSON.stringify(utilFb._internals.encodeTimestamp('2026-11-18T10:00:00.123456Z'))),
    { timestampValue: '2026-11-18T10:00:00.123456Z' }
  );

  // Case A: signInAdmin surfaces missing Firestore database rather than NOT_ADMIN
  const missingDbServer = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (req.method === 'POST' && url.pathname === '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ idToken: 't1', refreshToken: 'r1', expiresIn: '3600', email: 'a@b.c', localId: 'u1' }));
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { status: 'NOT_FOUND', message: 'The database (default) does not exist for project x' } }));
  });
  await new Promise(r => missingDbServer.listen(0, '127.0.0.1', r));
  try {
    const origin = `http://127.0.0.1:${missingDbServer.address().port}`;
    const { fb } = loadFeedbackModule({ projectId: 'x', apiKey: 'k', firestoreEmulatorOrigin: origin, authEmulatorOrigin: origin });
    await assert.rejects(
      () => fb.signInAdmin('a@b.c', 'pw'),
      err => err.status === 404 && err.code === 'NOT_FOUND'
    );
    assert.equal(fb.getAdminSession(), null);
  } finally {
    await new Promise(r => missingDbServer.close(r));
  }

  // Case B: saveReviewFeedback clears session if :commit returns 401/403
  const mock = await startMockFirebaseServer();
  try {
    const { fb } = loadFeedbackModule({
      projectId: mock.projectId,
      apiKey: mock.apiKey,
      firestoreEmulatorOrigin: mock.origin,
      authEmulatorOrigin: mock.origin,
    });
    const p = makePayload();
    await fb.submitFeedback(p);
    await fb.signInAdmin('admin@nibbanagamini.org', 'correct-horse-battery-staple');
    assert.ok(fb.getAdminSession());

    // Intercept :commit inside a custom fetch wrapper to simulate token revocation between GET and POST :commit
    const revokingFetch = async (url, opts) => {
      if (String(url).includes(':commit') && opts?.headers?.Authorization) {
        return new Response(JSON.stringify({ error: { status: 'UNAUTHENTICATED', message: 'Token expired' } }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return fetch(url, opts);
    };
    const { fb: fb2, sessionStorage: ss2 } = (() => {
      const ss = createMemoryStorage();
      const win = {
        NIBBANA_FEEDBACK_CONFIG: { projectId: mock.projectId, apiKey: mock.apiKey, firestoreEmulatorOrigin: mock.origin, authEmulatorOrigin: mock.origin },
      };
      const ctx = { window: win, sessionStorage: ss, localStorage: createMemoryStorage(), fetch: revokingFetch, URLSearchParams, Date, Number, String, Boolean, Array, Object, Error, Math, JSON, console };
      vm.runInNewContext(fs.readFileSync(path.join(REPO_ROOT, 'docs/firebase-feedback.js'), 'utf8'), ctx);
      return { fb: win.nibbanaFeedback, sessionStorage: ss };
    })();
    await fb2.signInAdmin('admin@nibbanagamini.org', 'correct-horse-battery-staple');
    await assert.rejects(
      () => fb2.saveReviewFeedback({ id: p.id, status: 'reviewing', editorial_note: 'x', public_note: '', published: false, original: '', revision: '', release_commit: '' }),
      err => err.status === 401
    );
    assert.equal(fb2.getAdminSession(), null);
    assert.equal(ss2.getItem('nibbana_firebase_session'), null);

    // Case C: submitFeedback treats 403 PERMISSION_DENIED as idempotent retry ONLY when receipt already exists
    const permRetryFetch = async (url, opts) => {
      if (String(url).includes(':commit')) {
        return new Response(JSON.stringify({ error: { status: 'PERMISSION_DENIED', message: 'Existing doc' } }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return fetch(url, opts);
    };
    const fb3 = (() => {
      const win = {
        NIBBANA_FEEDBACK_CONFIG: { projectId: mock.projectId, apiKey: mock.apiKey, firestoreEmulatorOrigin: mock.origin, authEmulatorOrigin: mock.origin },
      };
      const ctx = { window: win, sessionStorage: createMemoryStorage(), localStorage: createMemoryStorage(), fetch: permRetryFetch, URLSearchParams, Date, Number, String, Boolean, Array, Object, Error, Math, JSON, console };
      vm.runInNewContext(fs.readFileSync(path.join(REPO_ROOT, 'docs/firebase-feedback.js'), 'utf8'), ctx);
      return win.nibbanaFeedback;
    })();
    const retryExisting = await fb3.submitFeedback(p);
    assert.deepEqual(JSON.parse(JSON.stringify(retryExisting)), { id: p.id, status: 'new', received: true });
    await assert.rejects(() => fb3.submitFeedback(makePayload()), err => err.status === 403);
  } finally {
    await mock.close();
  }
});

test('static GitHub Pages, frontend wiring, and Firebase rules/index configuration', () => {
  // CNAME and redirects
  assert.equal(fs.readFileSync(path.join(REPO_ROOT, 'docs/CNAME'), 'utf8').trim(), 'nibbanagamini.org');
  const boDai = fs.readFileSync(path.join(REPO_ROOT, 'docs/bo-dai/index.html'), 'utf8');
  assert.match(boDai, /\/big\//);
  const notFound = fs.readFileSync(path.join(REPO_ROOT, 'docs/404.html'), 'utf8');
  assert.match(notFound, /\/bo-dai\//);

  // HTML pages load feedback-config.js and firebase-feedback.js and no longer call /api/
  for (const rel of ['docs/gop-y.html', 'docs/big/index.html', 'docs/hieu-dinh.html', 'docs/review.html']) {
    const content = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
    assert.match(content, /\/feedback-config\.js/, `${rel} must load /feedback-config.js`);
    assert.match(content, /\/firebase-feedback\.js/, `${rel} must load /firebase-feedback.js`);
    assert.equal(/fetch\(\s*['"]\/api\//.test(content), false, `${rel} must not call /api/`);
    assert.equal(/nibbanaApiUrl/.test(content), false, `${rel} must not use legacy nibbanaApiUrl`);
  }

  // JS files use window.nibbanaFeedback and not /api/
  for (const rel of ['docs/submit-feedback.js', 'docs/big/feedback.js']) {
    const content = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
    assert.match(content, /window\.nibbanaFeedback/, `${rel} must use window.nibbanaFeedback`);
    assert.equal(/fetch\(/.test(content), false, `${rel} must delegate network calls to firebase-feedback.js`);
  }

  // Review page uses Email + Password inputs for Firebase Auth
  const reviewHtml = fs.readFileSync(path.join(REPO_ROOT, 'docs/review.html'), 'utf8');
  assert.match(reviewHtml, /id="auth-email"/);
  assert.match(reviewHtml, /id="auth-password"/);
  assert.match(reviewHtml, /signInAdmin/);
  assert.match(reviewHtml, /signOutAdmin/);

  // Firestore rules and composite index exist and enforce key constraints
  const rules = fs.readFileSync(path.join(REPO_ROOT, 'firebase/firestore.rules'), 'utf8');
  assert.match(rules, /match \/admins\/\{uid\}/);
  assert.match(rules, /match \/feedback\/\{id\}/);
  assert.match(rules, /match \/feedback_public\/\{id\}/);
  assert.match(rules, /!exists\(/);
  assert.match(rules, /existsAfter\(/);
  assert.match(rules, /getAfter\(/);
  assert.match(rules, /allow read, write: if false;/);

  const indexes = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'firebase/firestore.indexes.json'), 'utf8'));
  assert.equal(indexes.indexes[0].collectionGroup, 'feedback_public');
  assert.deepEqual(
    indexes.indexes[0].fields.map(f => [f.fieldPath, f.order]),
    [['published', 'ASCENDING'], ['status', 'ASCENDING'], ['updated_at', 'DESCENDING']]
  );

  // VPS server directory should be removed
  assert.equal(fs.existsSync(path.join(REPO_ROOT, 'server')), false);

  // Verify inline scripts in hieu-dinh.html and review.html parse cleanly as valid JS
  for (const rel of ['docs/hieu-dinh.html', 'docs/review.html']) {
    const html = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
    const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
      .map(m => m[1].trim())
      .filter(Boolean);
    assert.ok(scripts.length >= 1, `${rel} must have inline script`);
    for (const s of scripts) {
      new vm.Script(s, { filename: rel });
    }
  }
});
