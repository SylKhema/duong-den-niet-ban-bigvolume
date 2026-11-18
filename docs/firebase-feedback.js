'use strict';

(() => {
  const CATEGORIES = ['typo', 'translation', 'terminology', 'question', 'other'];
  const STATUSES = ['new', 'reviewing', 'needs-info', 'approved', 'resolved', 'unchanged', 'duplicate'];
  const SESSION_KEY = 'nibbana_firebase_session';
  const RECEIPT_RE = /^GY-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  const LOOSE_RECEIPT_RE = /^GY-[0-9a-f-]{36}$/;

  class FirebaseFeedbackError extends Error {
    constructor(message, status = 500, code = '') {
      super(message);
      this.name = 'FirebaseFeedbackError';
      this.status = status;
      this.code = code;
    }
  }

  function getConfig() {
    const cfg = (typeof window !== 'undefined' && window.NIBBANA_FEEDBACK_CONFIG) || {};
    const projectId = String(cfg.projectId || '').trim();
    const apiKey = String(cfg.apiKey || '').trim();
    const firestoreEmulatorOrigin = String(cfg.firestoreEmulatorOrigin || '').trim().replace(/\/+$/, '');
    const authEmulatorOrigin = String(cfg.authEmulatorOrigin || '').trim().replace(/\/+$/, '');
    return { projectId, apiKey, firestoreEmulatorOrigin, authEmulatorOrigin };
  }

  function isConfigured() {
    const { projectId, apiKey, firestoreEmulatorOrigin } = getConfig();
    if (!projectId || /^YOUR_/i.test(projectId)) return false;
    if (!firestoreEmulatorOrigin && (!apiKey || /^YOUR_/i.test(apiKey))) return false;
    return true;
  }

  function requireConfig() {
    const cfg = getConfig();
    if (!isConfigured()) {
      throw new FirebaseFeedbackError(
        'Hệ thống góp ý Firebase chưa được cấu hình (thiếu projectId / apiKey trong /feedback-config.js).',
        503,
        'NOT_CONFIGURED'
      );
    }
    return cfg;
  }

  function firestoreBaseUrl(cfg) {
    const root = cfg.firestoreEmulatorOrigin || 'https://firestore.googleapis.com';
    return `${root}/v1/projects/${encodeURIComponent(cfg.projectId)}/databases/(default)`;
  }

  function authBaseUrl(cfg) {
    return cfg.authEmulatorOrigin
      ? `${cfg.authEmulatorOrigin}/identitytoolkit.googleapis.com/v1`
      : 'https://identitytoolkit.googleapis.com/v1';
  }

  function secureTokenBaseUrl(cfg) {
    return cfg.authEmulatorOrigin
      ? `${cfg.authEmulatorOrigin}/securetoken.googleapis.com/v1`
      : 'https://securetoken.googleapis.com/v1';
  }

  function docPath(cfg, collection, id) {
    return `projects/${cfg.projectId}/databases/(default)/documents/${collection}/${id}`;
  }

  function withKey(url, apiKey) {
    if (!apiKey) return url;
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}key=${encodeURIComponent(apiKey)}`;
  }

  function encodeValue(val) {
    if (val === null || val === undefined) return { nullValue: null };
    if (typeof val === 'boolean') return { booleanValue: val };
    if (typeof val === 'number') {
      return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
    }
    if (val instanceof Date) return { timestampValue: val.toISOString() };
    if (typeof val === 'string') return { stringValue: val };
    if (Array.isArray(val)) return { arrayValue: { values: val.map(encodeValue) } };
    if (typeof val === 'object') return { mapValue: { fields: encodeFields(val) } };
    return { stringValue: String(val) };
  }

  function encodeFields(obj) {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v !== undefined) out[k] = encodeValue(v);
    }
    return out;
  }

  function encodeTimestamp(value) {
    if (value instanceof Date) return { timestampValue: value.toISOString() };
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(trimmed)) {
        return { timestampValue: trimmed };
      }
      if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/.test(trimmed)) {
        const normalized = trimmed.replace(' ', 'T') + 'Z';
        const d = new Date(normalized);
        if (!Number.isNaN(d.getTime())) return { timestampValue: d.toISOString() };
      }
    }
    const date = new Date(value || Date.now());
    if (Number.isNaN(date.getTime())) {
      return { timestampValue: new Date().toISOString() };
    }
    return { timestampValue: date.toISOString() };
  }

  function decodeValue(v) {
    if (!v || typeof v !== 'object') return null;
    if ('stringValue' in v) return v.stringValue;
    if ('integerValue' in v) return Number(v.integerValue);
    if ('doubleValue' in v) return Number(v.doubleValue);
    if ('booleanValue' in v) return Boolean(v.booleanValue);
    if ('timestampValue' in v) return v.timestampValue;
    if ('nullValue' in v) return null;
    if ('arrayValue' in v) return (v.arrayValue.values || []).map(decodeValue);
    if ('mapValue' in v) return decodeFields(v.mapValue.fields || {});
    return null;
  }

  function decodeFields(fields) {
    const out = {};
    for (const [k, v] of Object.entries(fields || {})) {
      out[k] = decodeValue(v);
    }
    return out;
  }

  function decodeFeedbackDoc(doc) {
    const raw = decodeFields(doc?.fields || {});
    const nameParts = String(doc?.name || '').split('/');
    const docId = nameParts[nameParts.length - 1] || '';
    return {
      id: raw.id || docId,
      created_at: raw.created_at || '',
      updated_at: raw.updated_at || '',
      series: raw.series === 'mini' ? 'mini' : 'big',
      language: ['vi', 'en', 'bi'].includes(raw.language) ? raw.language : 'vi',
      volume: Number(raw.volume || 1),
      anchor: String(raw.anchor || 'general'),
      printed: String(raw.printed || ''),
      pdf_page: Number(raw.pdf_page ?? 0),
      excerpt: String(raw.excerpt || ''),
      category: String(raw.category || 'other'),
      message: String(raw.message || ''),
      suggestion: String(raw.suggestion || ''),
      reference: String(raw.reference || ''),
      name: String(raw.name || ''),
      email: String(raw.email || ''),
      status: String(raw.status || 'new'),
      editorial_note: String(raw.editorial_note || ''),
      public_note: String(raw.public_note || ''),
      published: Boolean(raw.published),
      original: String(raw.original || ''),
      revision: String(raw.revision || ''),
      release_commit: String(raw.release_commit || ''),
      _update_time: doc?.updateTime || '',
    };
  }

  function validateSubmission(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new FirebaseFeedbackError('Dữ liệu chưa hợp lệ.', 400);
    }

    const field = (key, max, required = false) => {
      const v = raw[key];
      if (typeof v !== 'string' || v.length > max || (required && !v.trim())) {
        throw new FirebaseFeedbackError('Vui lòng kiểm tra trường ' + key + '.', 400);
      }
      return v.trim();
    };

    const id = field('id', 40, true);
    if (!RECEIPT_RE.test(id)) {
      throw new FirebaseFeedbackError('Mã gửi không hợp lệ. Vui lòng mở lại biểu mẫu.', 400);
    }

    const series = raw.series ?? 'big';
    const language = raw.language ?? 'vi';
    if ((series !== 'big' && series !== 'mini') || (language !== 'vi' && language !== 'en' && language !== 'bi')) {
      throw new FirebaseFeedbackError('Bộ sách hoặc ngôn ngữ không hợp lệ.', 400);
    }

    const volume = Number(raw.volume);
    const pdfPage = Number(raw.pdfPage);
    if (
      !Number.isInteger(volume) ||
      volume < 1 ||
      volume > (series === 'mini' ? 9 : 5) ||
      !Number.isInteger(pdfPage) ||
      pdfPage < (series === 'mini' ? 0 : 1) ||
      pdfPage > 1000
    ) {
      throw new FirebaseFeedbackError('Vị trí trang không hợp lệ.', 400);
    }

    const category = field('category', 30, true);
    if (!CATEGORIES.includes(category)) {
      throw new FirebaseFeedbackError('Loại góp ý không hợp lệ.', 400);
    }

    const anchor = field('anchor', 140, true);
    if (
      !/^[A-Za-z0-9_.:-]+$/.test(anchor) ||
      (series === 'mini' && anchor !== 'general' && !anchor.startsWith('M0' + volume + '-'))
    ) {
      throw new FirebaseFeedbackError('Mã vị trí không hợp lệ.', 400);
    }

    const message = field('message', 4000, true);
    if (message.length < 5) {
      throw new FirebaseFeedbackError('Vui lòng mô tả ý kiến rõ hơn (ít nhất 5 ký tự).', 400);
    }

    const email = field('email', 254);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new FirebaseFeedbackError('Địa chỉ email chưa đúng.', 400);
    }

    if (raw.consent !== true) {
      throw new FirebaseFeedbackError('Vui lòng xác nhận cho phép lưu ý kiến.', 400);
    }

    if (typeof raw.website !== 'string' || raw.website !== '') {
      throw new FirebaseFeedbackError('Không thể nhận yêu cầu này.', 400);
    }

    return {
      id,
      series,
      language,
      volume,
      anchor,
      printed: field('printed', 80, true),
      pdfPage,
      excerpt: field('excerpt', 2400),
      category,
      message,
      suggestion: field('suggestion', 4000),
      reference: field('reference', 1500),
      name: field('name', 100),
      email,
    };
  }

  function parseFirestoreError(res, body) {
    const errObj = Array.isArray(body) ? body[0]?.error : body?.error;
    const rawMsg = errObj?.message || '';
    const rawStatus = errObj?.status || '';
    if (res.status === 429 || rawStatus === 'RESOURCE_EXHAUSTED') {
      return new FirebaseFeedbackError('Hệ thống đang nhận nhiều góp ý. Vui lòng thử lại sau một phút.', 429, rawStatus);
    }
    if (res.status === 404 || rawStatus === 'NOT_FOUND') {
      return new FirebaseFeedbackError('Không tìm thấy dữ liệu tương ứng.', 404, rawStatus);
    }
    if (res.status === 401 || rawStatus === 'UNAUTHENTICATED') {
      return new FirebaseFeedbackError('Phiên đăng nhập quản trị đã hết hạn. Vui lòng đăng nhập lại.', 401, rawStatus);
    }
    if (res.status === 403 || rawStatus === 'PERMISSION_DENIED') {
      return new FirebaseFeedbackError('Không có quyền thực hiện thao tác này.', 403, rawStatus);
    }
    if (rawStatus === 'FAILED_PRECONDITION' && rawMsg.toLowerCase().includes('index')) {
      return new FirebaseFeedbackError('Cần tạo chỉ mục Firestore cho nhật ký hiệu đính (xem firebase/README.md).', 503, rawStatus);
    }
    if (res.status === 409 || rawStatus === 'ALREADY_EXISTS' || rawStatus === 'ABORTED' || rawStatus === 'FAILED_PRECONDITION') {
      return new FirebaseFeedbackError('Dữ liệu vừa thay đổi hoặc đã tồn tại.', 409, rawStatus);
    }
    if (res.status === 400 || rawStatus === 'INVALID_ARGUMENT') {
      return new FirebaseFeedbackError(rawMsg || 'Dữ liệu chưa hợp lệ.', 400, rawStatus);
    }
    return new FirebaseFeedbackError(rawMsg || 'Chưa kết nối được với Firebase.', res.status || 503, rawStatus);
  }

  async function requestJson(url, options = {}) {
    const res = await fetch(url, options);
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      throw parseFirestoreError(res, body);
    }
    return body;
  }

  function readStorage() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function writeStorage(session) {
    try {
      if (!session) sessionStorage.removeItem(SESSION_KEY);
      else sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch {}
  }

  function getAdminSession() {
    const s = readStorage();
    if (!s || !s.idToken || !s.localId) return null;
    return { email: s.email || '', localId: s.localId };
  }

  function signOutAdmin() {
    writeStorage(null);
  }

  async function ensureFreshToken() {
    const cfg = requireConfig();
    const s = readStorage();
    if (!s || !s.idToken) return null;
    if (typeof s.expiresAt === 'number' && Date.now() < s.expiresAt - 60000) {
      return s.idToken;
    }
    if (!s.refreshToken) {
      signOutAdmin();
      return null;
    }
    try {
      const res = await fetch(withKey(`${secureTokenBaseUrl(cfg)}/token`, cfg.apiKey), {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: s.refreshToken,
        }).toString(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.id_token) {
        signOutAdmin();
        return null;
      }
      const nextSession = {
        ...s,
        idToken: data.id_token,
        refreshToken: data.refresh_token || s.refreshToken,
        expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000,
      };
      writeStorage(nextSession);
      return nextSession.idToken;
    } catch {
      return s.idToken;
    }
  }

  async function signInAdmin(email, password) {
    const cfg = requireConfig();
    const cleanEmail = String(email || '').trim();
    const cleanPassword = String(password || '');
    if (!cleanEmail || !cleanPassword) {
      throw new FirebaseFeedbackError('Vui lòng nhập đầy đủ email và mật khẩu quản trị.', 400);
    }

    const res = await fetch(withKey(`${authBaseUrl(cfg)}/accounts:signInWithPassword`, cfg.apiKey), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: cleanEmail,
        password: cleanPassword,
        returnSecureToken: true,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.idToken || !data.localId) {
      const code = data?.error?.message || '';
      if (code.includes('INVALID_LOGIN_CREDENTIALS') || code.includes('INVALID_PASSWORD') || code.includes('EMAIL_NOT_FOUND')) {
        throw new FirebaseFeedbackError('Email hoặc mật khẩu quản trị chưa đúng.', 401, code);
      }
      if (code.includes('TOO_MANY_ATTEMPTS_TRY_LATER')) {
        throw new FirebaseFeedbackError('Thử đăng nhập quá nhiều lần. Vui lòng đợi ít phút rồi thử lại.', 429, code);
      }
      throw new FirebaseFeedbackError('Không thể đăng nhập Firebase Authentication.', 401, code);
    }

    // Verify allowlist membership in admins/{uid}
    const adminCheckRes = await fetch(
      withKey(`${firestoreBaseUrl(cfg)}/documents/admins/${encodeURIComponent(data.localId)}`, cfg.apiKey),
      {
        headers: { Authorization: `Bearer ${data.idToken}` },
      }
    );
    if (!adminCheckRes.ok) {
      signOutAdmin();
      const errBody = await adminCheckRes.json().catch(() => null);
      const rawMsg = String(errBody?.error?.message || '').toLowerCase();
      const isMissingAdminDoc =
        (adminCheckRes.status === 404 && !rawMsg.includes('database') && !rawMsg.includes('project')) ||
        (adminCheckRes.status === 403 && !rawMsg.includes('api has not been used') && !rawMsg.includes('disabled'));
      if (isMissingAdminDoc) {
        throw new FirebaseFeedbackError(
          `Tài khoản này chưa được cấp quyền quản trị trong Firestore (thiếu document admins/${data.localId}).`,
          403,
          'NOT_ADMIN'
        );
      }
      throw parseFirestoreError(adminCheckRes, errBody);
    }

    const session = {
      idToken: data.idToken,
      refreshToken: data.refreshToken || '',
      expiresAt: Date.now() + Number(data.expiresIn || 3600) * 1000,
      email: data.email || cleanEmail,
      localId: data.localId,
    };
    writeStorage(session);
    return { email: session.email, localId: session.localId };
  }

  async function lookupFeedback(idInput) {
    const cfg = requireConfig();
    const id = String(idInput || '').trim();
    if (!RECEIPT_RE.test(id)) {
      throw new FirebaseFeedbackError('Mã tra cứu chưa đúng.', 400);
    }
    const url = withKey(
      `${firestoreBaseUrl(cfg)}/documents/feedback_public/${encodeURIComponent(id)}`,
      cfg.apiKey
    );
    const res = await fetch(url);
    const body = await res.json().catch(() => null);
    if (res.status === 404) {
      throw new FirebaseFeedbackError('Không tìm thấy mã này.', 404);
    }
    if (!res.ok) {
      throw parseFirestoreError(res, body);
    }
    const decoded = decodeFeedbackDoc(body);
    return {
      id: decoded.id,
      status: decoded.status,
      created_at: decoded.created_at,
      updated_at: decoded.updated_at,
    };
  }

  async function submitFeedback(rawPayload) {
    const cfg = requireConfig();
    const value = validateSubmission(rawPayload);

    const privateFields = encodeFields({
      id: value.id,
      series: value.series,
      language: value.language,
      volume: value.volume,
      anchor: value.anchor,
      printed: value.printed,
      pdf_page: value.pdfPage,
      excerpt: value.excerpt,
      category: value.category,
      message: value.message,
      suggestion: value.suggestion,
      reference: value.reference,
      name: value.name,
      email: value.email,
      status: 'new',
      editorial_note: '',
      public_note: '',
      published: false,
      original: '',
      revision: '',
      release_commit: '',
    });

    const publicFields = encodeFields({
      id: value.id,
      status: 'new',
      published: false,
      series: value.series,
      language: value.language,
      volume: value.volume,
      printed: value.printed,
      pdf_page: value.pdfPage,
      anchor: value.anchor,
      public_note: '',
      release_commit: '',
    });

    const timestampTransforms = [
      { fieldPath: 'created_at', setToServerValue: 'REQUEST_TIME' },
      { fieldPath: 'updated_at', setToServerValue: 'REQUEST_TIME' },
    ];

    try {
      await requestJson(withKey(`${firestoreBaseUrl(cfg)}/documents:commit`, cfg.apiKey), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          writes: [
            {
              update: {
                name: docPath(cfg, 'feedback', value.id),
                fields: privateFields,
              },
              currentDocument: { exists: false },
              updateTransforms: timestampTransforms,
            },
            {
              update: {
                name: docPath(cfg, 'feedback_public', value.id),
                fields: publicFields,
              },
              currentDocument: { exists: false },
              updateTransforms: timestampTransforms,
            },
          ],
        }),
      });
      return { id: value.id, status: 'new', received: true };
    } catch (err) {
      if (
        err instanceof FirebaseFeedbackError &&
        (err.status === 409 || err.code === 'ALREADY_EXISTS' || (err.status === 403 && err.code === 'PERMISSION_DENIED'))
      ) {
        try {
          const existing = await lookupFeedback(value.id);
          return { id: value.id, status: existing.status || 'new', received: true };
        } catch {}
      }
      throw err;
    }
  }

  async function getCorrections() {
    const cfg = requireConfig();
    const rows = await requestJson(withKey(`${firestoreBaseUrl(cfg)}/documents:runQuery`, cfg.apiKey), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: 'feedback_public' }],
          where: {
            compositeFilter: {
              op: 'AND',
              filters: [
                {
                  fieldFilter: {
                    field: { fieldPath: 'published' },
                    op: 'EQUAL',
                    value: { booleanValue: true },
                  },
                },
                {
                  fieldFilter: {
                    field: { fieldPath: 'status' },
                    op: 'IN',
                    value: {
                      arrayValue: {
                        values: [
                          { stringValue: 'resolved' },
                          { stringValue: 'unchanged' },
                        ],
                      },
                    },
                  },
                },
              ],
            },
          },
          orderBy: [{ field: { fieldPath: 'updated_at' }, direction: 'DESCENDING' }],
          limit: 100,
        },
      }),
    });

    const entries = (Array.isArray(rows) ? rows : [])
      .filter(item => item && item.document)
      .map(item => {
        const d = decodeFeedbackDoc(item.document);
        return {
          id: d.id,
          series: d.series,
          language: d.language,
          release_commit: d.release_commit,
          volume: d.volume,
          printed: d.printed,
          pdf_page: d.pdf_page,
          anchor: d.anchor,
          status: d.status,
          public_note: d.public_note,
          updated_at: d.updated_at,
        };
      });

    return { entries };
  }

  async function listReviewFeedback({ offset = 0 } = {}) {
    const cfg = requireConfig();
    const token = await ensureFreshToken();
    if (!token) {
      throw new FirebaseFeedbackError(
        'Chỉ người phụ trách đã được cấp quyền mới xem được góp ý. Vui lòng đăng nhập.',
        401
      );
    }

    const safeOffset = Number.isFinite(Number(offset))
      ? Math.max(0, Math.min(100000, Math.trunc(Number(offset))))
      : 0;

    const structuredQuery = {
      from: [{ collectionId: 'feedback' }],
      orderBy: [{ field: { fieldPath: 'created_at' }, direction: 'DESCENDING' }],
      limit: 100,
    };
    if (safeOffset > 0) structuredQuery.offset = safeOffset;

    try {
      const rows = await requestJson(withKey(`${firestoreBaseUrl(cfg)}/documents:runQuery`, cfg.apiKey), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ structuredQuery }),
      });

      const entries = (Array.isArray(rows) ? rows : [])
        .filter(item => item && item.document)
        .map(item => decodeFeedbackDoc(item.document));

      return {
        entries,
        nextOffset: entries.length === 100 ? safeOffset + 100 : null,
      };
    } catch (err) {
      if (err instanceof FirebaseFeedbackError && (err.status === 401 || err.status === 403)) {
        signOutAdmin();
      }
      throw err;
    }
  }

  async function saveReviewFeedback(update) {
    const cfg = requireConfig();
    const token = await ensureFreshToken();
    if (!token) {
      throw new FirebaseFeedbackError('Không có quyền cập nhật.', 401);
    }

    if (!update || typeof update !== 'object' || Array.isArray(update)) {
      throw new FirebaseFeedbackError('Dữ liệu cập nhật chưa đúng yêu cầu.', 400);
    }

    const id = update.id;
    const status = update.status;
    const editorialNote = update.editorial_note;
    const publicNote = update.public_note;
    const published = update.published;
    const original = update.original;
    const revision = update.revision;
    const releaseCommit = update.release_commit;

    if (
      typeof id !== 'string' ||
      !LOOSE_RECEIPT_RE.test(id) ||
      typeof status !== 'string' ||
      !STATUSES.includes(status) ||
      typeof editorialNote !== 'string' ||
      editorialNote.length > 4000 ||
      typeof publicNote !== 'string' ||
      publicNote.length > 4000 ||
      typeof published !== 'boolean' ||
      typeof original !== 'string' ||
      original.length > 12000 ||
      typeof revision !== 'string' ||
      revision.length > 12000 ||
      typeof releaseCommit !== 'string' ||
      (releaseCommit !== '' && !/^[a-f0-9]{40}$/.test(releaseCommit))
    ) {
      throw new FirebaseFeedbackError('Dữ liệu cập nhật chưa đúng yêu cầu.', 400);
    }

    if (published && (!['resolved', 'unchanged'].includes(status) || publicNote.trim().length < 10)) {
      throw new FirebaseFeedbackError(
        'Chỉ công bố sau khi đã xử lý (Đã sửa / Giữ nguyên) và có giải thích công khai ít nhất 10 ký tự.',
        400
      );
    }

    let existingRaw;
    try {
      existingRaw = await requestJson(
        withKey(`${firestoreBaseUrl(cfg)}/documents/feedback/${encodeURIComponent(id)}`, cfg.apiKey),
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
    } catch (err) {
      if (err instanceof FirebaseFeedbackError && err.status === 404) {
        throw new FirebaseFeedbackError('Không tìm thấy góp ý tương ứng.', 404);
      }
      if (err instanceof FirebaseFeedbackError && (err.status === 401 || err.status === 403)) {
        signOutAdmin();
      }
      throw err;
    }

    const existing = decodeFeedbackDoc(existingRaw);
    if (update.expectedUpdateTime && existing._update_time && update.expectedUpdateTime !== existing._update_time) {
      throw new FirebaseFeedbackError('Góp ý vừa thay đổi. Hãy tải lại trước khi lưu.', 409);
    }

    const before = original.trim();
    const after = revision.trim();
    const sameRevision = existing.original === before && existing.revision === after;

    if (
      status === 'approved' &&
      (!before || !after || before === after || !sameRevision || !['reviewing', 'approved'].includes(existing.status))
    ) {
      throw new FirebaseFeedbackError(
        'Hãy lưu hai đoạn khác nhau ở trạng thái Đang đối chiếu, rồi mở lại và duyệt.',
        409
      );
    }

    if (
      status === 'resolved' &&
      !(existing.status === 'resolved' && !existing.original && !existing.revision) &&
      (!sameRevision || !releaseCommit || !['approved', 'resolved'].includes(existing.status))
    ) {
      throw new FirebaseFeedbackError(
        'Hãy duyệt bản sửa và nhập mã commit GitHub đầy đủ sau khi kiểm tra bản đã lên website.',
        409
      );
    }

    const nextReleaseCommit = status === 'resolved' ? releaseCommit : '';
    const privatePatchFields = encodeFields({
      status,
      editorial_note: editorialNote.trim(),
      public_note: publicNote.trim(),
      published,
      original: before,
      revision: after,
      release_commit: nextReleaseCommit,
    });

    const publicMirrorFields = {
      ...encodeFields({
        id: existing.id,
        status,
        published,
        series: existing.series,
        language: existing.language,
        volume: existing.volume,
        printed: existing.printed,
        pdf_page: existing.pdf_page,
        anchor: existing.anchor,
        public_note: published ? publicNote.trim() : '',
        release_commit: published ? nextReleaseCommit : '',
      }),
      created_at: encodeTimestamp(existing.created_at),
    };

    let commitRes;
    try {
      commitRes = await requestJson(withKey(`${firestoreBaseUrl(cfg)}/documents:commit`, cfg.apiKey), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          writes: [
            {
              update: {
                name: docPath(cfg, 'feedback', id),
                fields: privatePatchFields,
              },
              updateMask: {
                fieldPaths: [
                  'status',
                  'editorial_note',
                  'public_note',
                  'published',
                  'original',
                  'revision',
                  'release_commit',
                ],
              },
              currentDocument: existing._update_time ? { updateTime: existing._update_time } : { exists: true },
              updateTransforms: [{ fieldPath: 'updated_at', setToServerValue: 'REQUEST_TIME' }],
            },
            {
              update: {
                name: docPath(cfg, 'feedback_public', id),
                fields: publicMirrorFields,
              },
              updateTransforms: [{ fieldPath: 'updated_at', setToServerValue: 'REQUEST_TIME' }],
            },
          ],
        }),
      });
    } catch (err) {
      if (err instanceof FirebaseFeedbackError && (err.status === 401 || err.status === 403)) {
        signOutAdmin();
      }
      throw err;
    }

    const newUpdateTime = commitRes?.writeResults?.[0]?.updateTime || commitRes?.commitTime || '';
    return {
      saved: true,
      updateTime: newUpdateTime,
      updated_at: commitRes?.commitTime || new Date().toISOString(),
    };
  }

  const api = {
    CATEGORIES,
    STATUSES,
    FirebaseFeedbackError,
    isConfigured,
    validateSubmission,
    submitFeedback,
    lookupFeedback,
    getCorrections,
    getAdminSession,
    signInAdmin,
    signOutAdmin,
    listReviewFeedback,
    saveReviewFeedback,
    _internals: {
      encodeValue,
      encodeFields,
      encodeTimestamp,
      decodeValue,
      decodeFields,
      decodeFeedbackDoc,
    },
  };

  if (typeof window !== 'undefined') {
    window.nibbanaFeedback = api;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
