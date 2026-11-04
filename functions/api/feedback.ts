import { Env, validateSubmission, sameOrigin, json } from './_shared';

export async function onRequestOptions(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Key',
    },
  });
}

export async function onRequestPost(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context;

  if (!env.DB) {
    return json({ error: 'Cơ sở dữ liệu D1 (DB) chưa được liên kết trong Cloudflare Pages Settings.' }, 500);
  }

  if (!sameOrigin(request)) {
    return json({ error: 'Yêu cầu không hợp lệ (sai nguồn gốc).' }, 403);
  }

  const contentType = request.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    return json({ error: 'Định dạng dữ liệu không hợp lệ.' }, 400);
  }

  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > 24000) {
    return json({ error: 'Ý kiến quá dài (vượt quá dung lượng cho phép).' }, 413);
  }

  let value;
  try {
    const body = await request.text();
    if (body.length > 24000) {
      return json({ error: 'Ý kiến quá dài.' }, 413);
    }
    value = validateSubmission(JSON.parse(body));
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Dữ liệu chưa hợp lệ.' }, 400);
  }

  try {
    // Idempotent check
    const existing = await env.DB.prepare('SELECT id FROM feedback WHERE id=?').bind(value.id).first();
    if (existing) {
      return json({ id: value.id, status: 'new', received: true });
    }

    // Rate limiting: max 50 submissions per minute
    const oneMinuteAgo = new Date(Date.now() - 60000).toISOString();
    const recent = await env.DB.prepare('SELECT count(*) AS n FROM feedback WHERE created_at>?')
      .bind(oneMinuteAgo)
      .first<{ n: number }>();

    if ((recent?.n || 0) >= 50) {
      return json({ error: 'Hệ thống đang nhận nhiều góp ý. Vui lòng thử lại sau một phút.' }, 429);
    }

    const now = new Date().toISOString();
    await env.DB.prepare(
      `INSERT INTO feedback (
        id, created_at, updated_at, volume, anchor, printed, pdf_page,
        excerpt, category, message, suggestion, reference, name, email,
        status, editorial_note, public_note, published
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        value.id,
        now,
        now,
        value.volume,
        value.anchor,
        value.printed,
        value.pdfPage,
        value.excerpt,
        value.category,
        value.message,
        value.suggestion,
        value.reference,
        value.name,
        value.email,
        'new',
        '',
        '',
        0
      )
      .run();

    return json({ id: value.id, status: 'new', received: true }, 201);
  } catch (err) {
    console.error('Lỗi lưu feedback:', err);
    return json({ error: 'Chưa lưu được ý kiến. Vui lòng giữ nội dung và thử gửi lại; chưa có xác nhận tiếp nhận.' }, 503);
  }
}

export async function onRequestGet(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context;

  if (!env.DB) {
    return json({ error: 'Cơ sở dữ liệu D1 chưa được liên kết.' }, 500);
  }

  const url = new URL(request.url);
  const id = url.searchParams.get('id') || '';

  if (!/^GY-[0-9a-f-]{36}$/.test(id)) {
    return json({ error: 'Mã tra cứu chưa đúng.' }, 400);
  }

  try {
    const row = await env.DB.prepare('SELECT id, status, created_at, updated_at FROM feedback WHERE id=?')
      .bind(id)
      .first();

    return row ? json(row) : json({ error: 'Không tìm thấy mã này.' }, 404);
  } catch (err) {
    console.error('Lỗi tra cứu feedback:', err);
    return json({ error: 'Chưa thể tra cứu. Vui lòng thử lại sau.' }, 503);
  }
}

