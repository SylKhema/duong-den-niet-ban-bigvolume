export interface Env {
  DB: D1Database;
  ADMIN_PASSWORD?: string;
  ADMIN_KEY?: string;
}

export const categories = ['typo', 'translation', 'terminology', 'question', 'other'] as const;
export const statuses = ['new', 'reviewing', 'needs-info', 'approved', 'resolved', 'unchanged', 'duplicate'] as const;

export function validateSubmission(raw: Record<string, unknown>) {
  const field = (key: string, max: number, required = false) => {
    const v = raw[key];
    if (typeof v !== 'string' || v.length > max || (required && !v.trim())) {
      throw new Error('Vui lòng kiểm tra trường ' + key + '.');
    }
    return v.trim();
  };

  const id = field('id', 40, true);
  if (!/^GY-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)) {
    throw new Error('Mã gửi không hợp lệ. Vui lòng mở lại biểu mẫu.');
  }

  const series = raw.series ?? 'big';
  const language = raw.language ?? 'vi';
  if ((series !== 'big' && series !== 'mini') || (language !== 'vi' && language !== 'en' && language !== 'bi')) {
    throw new Error('Bộ sách hoặc ngôn ngữ không hợp lệ.');
  }
  const volume = Number(raw.volume);
  const pdfPage = Number(raw.pdfPage);
  if (!Number.isInteger(volume) || volume < 1 || volume > (series === 'mini' ? 9 : 5) || !Number.isInteger(pdfPage) || pdfPage < (series === 'mini' ? 0 : 1) || pdfPage > 1000) {
    throw new Error('Vị trí trang không hợp lệ.');
  }

  const category = field('category', 30, true);
  if (!categories.includes(category as typeof categories[number])) {
    throw new Error('Loại góp ý không hợp lệ.');
  }

  const anchor = field('anchor', 140, true);
  if (!/^[A-Za-z0-9_.:-]+$/.test(anchor) ||
      (series === 'mini' && anchor !== 'general' && !anchor.startsWith('M0' + volume + '-'))) {
    throw new Error('Mã vị trí không hợp lệ.');
  }

  const message = field('message', 4000, true);
  if (message.length < 5) {
    throw new Error('Vui lòng mô tả ý kiến rõ hơn (ít nhất 5 ký tự).');
  }

  const email = field('email', 254);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Địa chỉ email chưa đúng.');
  }

  if (raw.consent !== true) {
    throw new Error('Vui lòng xác nhận cho phép lưu ý kiến.');
  }

  if (typeof raw.website !== 'string' || raw.website !== '') {
    throw new Error('Không thể nhận yêu cầu này.');
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

export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  if (!origin) {
    const referer = req.headers.get('referer');
    if (referer) {
      try {
        return new URL(referer).origin === new URL(req.url).origin;
      } catch {
        return false;
      }
    }
    return true;
  }
  return origin === new URL(req.url).origin;
}

export function json(value: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return Response.json(value, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Access-Control-Allow-Origin': '*',
      ...extraHeaders,
    },
  });
}

export function isAuthorized(req: Request, env: Env): boolean {
  const adminSecret = env.ADMIN_PASSWORD || env.ADMIN_KEY;

  // Check Bearer token or X-Admin-Key
  if (adminSecret) {
    const authHeader = req.headers.get('authorization') || '';
    const bearer = authHeader.replace(/^Bearer\s+/i, '').trim();
    const xKey = (req.headers.get('x-admin-key') || '').trim();

    if ((bearer && bearer === adminSecret) || (xKey && xKey === adminSecret)) {
      return true;
    }
  }

  return false;
}
