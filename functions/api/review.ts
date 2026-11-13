import { Env, isAuthorized, json, sameOrigin, statuses } from './_shared';

export async function onRequestOptions(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Key',
    },
  });
}

export async function onRequestGet(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context;

  if (!env.DB) {
    return json({ error: 'Cơ sở dữ liệu D1 chưa được liên kết.' }, 500);
  }

  if (!isAuthorized(request, env)) {
    return json({ error: 'Chỉ người phụ trách đã được cấp quyền mới xem được góp ý. Vui lòng đăng nhập.' }, 401);
  }

  const url = new URL(request.url);
  const offset = Math.max(0, Math.min(100000, Number(url.searchParams.get('offset')) || 0));

  try {
    const result = await env.DB.prepare('SELECT * FROM feedback ORDER BY created_at DESC LIMIT 100 OFFSET ?')
      .bind(offset)
      .all();

    return json({
      entries: result.results || [],
      nextOffset: (result.results || []).length === 100 ? offset + 100 : null,
    });
  } catch (err) {
    console.error('Lỗi lấy danh sách review:', err);
    return json({ error: 'Chưa tải được danh sách góp ý.' }, 503);
  }
}

export async function onRequestPatch(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context;

  if (!env.DB) {
    return json({ error: 'Cơ sở dữ liệu D1 chưa được liên kết.' }, 500);
  }

  if (!isAuthorized(request, env)) {
    return json({ error: 'Không có quyền cập nhật.' }, 401);
  }

  if (!sameOrigin(request)) {
    return json({ error: 'Nguồn gốc yêu cầu không hợp lệ.' }, 403);
  }

  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > 90000) {
    return json({ error: 'Nội dung quá dài.' }, 413);
  }

  let body: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (raw.length > 90000) throw new Error();
    body = JSON.parse(raw);
  } catch {
    return json({ error: 'Dữ liệu chưa đúng định dạng JSON.' }, 400);
  }

  const id = body.id;
  const status = body.status;
  const editorialNote = body.editorial_note;
  const publicNote = body.public_note;
  const published = body.published;
  const original = body.original;
  const revision = body.revision;
  const releaseCommit = body.release_commit;

  if (
    typeof id !== 'string' ||
    !/^GY-[0-9a-f-]{36}$/.test(id) ||
    typeof status !== 'string' ||
    !statuses.includes(status as typeof statuses[number]) ||
    typeof editorialNote !== 'string' ||
    editorialNote.length > 4000 ||
    typeof publicNote !== 'string' ||
    publicNote.length > 4000 ||
    typeof published !== 'boolean' ||
    typeof original !== 'string' || original.length > 12000 ||
    typeof revision !== 'string' || revision.length > 12000 ||
    typeof releaseCommit !== 'string' || (releaseCommit !== '' && !/^[a-f0-9]{40}$/.test(releaseCommit))
  ) {
    return json({ error: 'Dữ liệu cập nhật chưa đúng yêu cầu.' }, 400);
  }

  if (published && (!['resolved', 'unchanged'].includes(status) || publicNote.trim().length < 10)) {
    return json({ error: 'Chỉ công bố sau khi đã xử lý (Đã sửa / Giữ nguyên) và có giải thích công khai ít nhất 10 ký tự.' }, 400);
  }

  try {
    const existing = await env.DB.prepare(
      'SELECT status, original, revision, release_commit FROM feedback WHERE id=?'
    ).bind(id).first<{ status: string; original: string; revision: string; release_commit: string }>();
    if (!existing) return json({ error: 'Không tìm thấy góp ý tương ứng.' }, 404);

    const before = original.trim();
    const after = revision.trim();
    const sameRevision = existing.original === before && existing.revision === after;
    if (status === 'approved' && (!before || !after || before === after || !sameRevision ||
        !['reviewing', 'approved'].includes(existing.status))) {
      return json({ error: 'Hãy lưu hai đoạn khác nhau ở trạng thái Đang đối chiếu, rồi mở lại và duyệt.' }, 409);
    }
    if (status === 'resolved' && !(existing.status === 'resolved' && !existing.original && !existing.revision) &&
        (!sameRevision || !releaseCommit || !['approved', 'resolved'].includes(existing.status))) {
      return json({ error: 'Hãy duyệt bản sửa và nhập mã commit GitHub đầy đủ sau khi kiểm tra bản đã lên website.' }, 409);
    }
    const now = new Date().toISOString();
    const result = await env.DB.prepare(
      `UPDATE feedback
       SET status=?, editorial_note=?, public_note=?, published=?, updated_at=?, original=?, revision=?, release_commit=?
       WHERE id=? AND status=? AND original=? AND revision=? AND release_commit=?`
    )
      .bind(status, editorialNote.trim(), publicNote.trim(), published ? 1 : 0, now,
        before, after, status === 'resolved' ? releaseCommit : '', id,
        existing.status, existing.original, existing.revision, existing.release_commit)
      .run();

    return result.meta.changes ? json({ saved: true }) : json({ error: 'Góp ý vừa thay đổi. Hãy tải lại trước khi lưu.' }, 409);
  } catch (err) {
    console.error('Lỗi cập nhật feedback:', err);
    return json({ error: 'Chưa thể lưu thay đổi vào cơ sở dữ liệu.' }, 503);
  }
}

