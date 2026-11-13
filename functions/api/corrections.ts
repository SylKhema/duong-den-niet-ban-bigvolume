import { Env, json } from './_shared';

export async function onRequestOptions(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

export async function onRequestGet(context: { request: Request; env: Env }): Promise<Response> {
  const { env } = context;

  if (!env.DB) {
    return json({ error: 'Cơ sở dữ liệu D1 chưa được liên kết.' }, 500);
  }

  try {
    const result = await env.DB.prepare(
      `SELECT id, series, language, release_commit, volume, printed, pdf_page, anchor, status, public_note, updated_at
       FROM feedback
       WHERE published=1 AND status IN (?, ?)
       ORDER BY updated_at DESC
       LIMIT 100`
    )
      .bind('resolved', 'unchanged')
      .all();

    return json({ entries: result.results || [] });
  } catch (err) {
    console.error('Lỗi lấy nhật ký hiệu đính:', err);
    return json({ error: 'Chưa tải được nhật ký hiệu đính.' }, 503);
  }
}

