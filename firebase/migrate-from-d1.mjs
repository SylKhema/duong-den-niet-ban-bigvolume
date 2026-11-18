#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import fbClient from '../docs/firebase-feedback.js';

const { encodeFields, encodeTimestamp } = fbClient._internals;

export function loadRowsFromSqliteOrSql(inputPath) {
  const resolved = path.resolve(inputPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Không tìm thấy tệp nguồn: ${resolved}`);
  }

  let db;
  if (resolved.endsWith('.sql')) {
    db = new DatabaseSync(':memory:');
    const sql = fs.readFileSync(resolved, 'utf8');
    db.exec(sql);
  } else {
    db = new DatabaseSync(resolved, { readOnly: true });
  }

  try {
    const rows = db.prepare('SELECT * FROM feedback').all();
    return rows.map(row => ({
      id: String(row.id),
      created_at: String(row.created_at || new Date().toISOString()),
      updated_at: String(row.updated_at || row.created_at || new Date().toISOString()),
      series: row.series === 'mini' ? 'mini' : 'big',
      language: ['vi', 'en', 'bi'].includes(row.language) ? row.language : 'vi',
      volume: Number(row.volume || 1),
      anchor: String(row.anchor || 'general'),
      printed: String(row.printed || 'Bìa'),
      pdf_page: Number(row.pdf_page ?? 1),
      excerpt: String(row.excerpt || ''),
      category: String(row.category || 'other'),
      message: String(row.message || ''),
      suggestion: String(row.suggestion || ''),
      reference: String(row.reference || ''),
      name: String(row.name || ''),
      email: String(row.email || ''),
      status: String(row.status || 'new'),
      editorial_note: String(row.editorial_note || ''),
      public_note: String(row.public_note || ''),
      published: row.published === true || row.published === 1 || row.published === '1' || String(row.published).toLowerCase() === 'true',
      original: String(row.original || ''),
      revision: String(row.revision || ''),
      release_commit: String(row.release_commit || ''),
    }));
  } finally {
    db.close();
  }
}

export function buildMigrationWrites(projectId, rows) {
  const writes = [];
  for (const row of rows) {
    const privateFields = {
      ...encodeFields({
        id: row.id,
        series: row.series,
        language: row.language,
        volume: row.volume,
        anchor: row.anchor,
        printed: row.printed,
        pdf_page: row.pdf_page,
        excerpt: row.excerpt,
        category: row.category,
        message: row.message,
        suggestion: row.suggestion,
        reference: row.reference,
        name: row.name,
        email: row.email,
        status: row.status,
        editorial_note: row.editorial_note,
        public_note: row.public_note,
        published: row.published,
        original: row.original,
        revision: row.revision,
        release_commit: row.release_commit,
      }),
      created_at: encodeTimestamp(row.created_at),
      updated_at: encodeTimestamp(row.updated_at),
    };

    const publicFields = {
      ...encodeFields({
        id: row.id,
        status: row.status,
        published: row.published,
        series: row.series,
        language: row.language,
        volume: row.volume,
        printed: row.printed,
        pdf_page: row.pdf_page,
        anchor: row.anchor,
        public_note: row.published ? row.public_note : '',
        release_commit: row.published && row.status === 'resolved' ? row.release_commit : '',
      }),
      created_at: encodeTimestamp(row.created_at),
      updated_at: encodeTimestamp(row.updated_at),
    };

    writes.push(
      {
        update: {
          name: `projects/${projectId}/databases/(default)/documents/feedback/${row.id}`,
          fields: privateFields,
        },
      },
      {
        update: {
          name: `projects/${projectId}/databases/(default)/documents/feedback_public/${row.id}`,
          fields: publicFields,
        },
      }
    );
  }
  return writes;
}

export async function migrateToFirestore({
  inputPath,
  projectId,
  apiKey,
  adminEmail,
  adminPassword,
  firestoreEmulatorOrigin = '',
  authEmulatorOrigin = '',
}) {
  if (!inputPath || !projectId || !apiKey || !adminEmail || !adminPassword) {
    throw new Error('Thiếu tham số bắt buộc: inputPath, projectId, apiKey, adminEmail, adminPassword.');
  }

  const rows = loadRowsFromSqliteOrSql(inputPath);
  if (!rows.length) {
    return { totalRows: 0, committedBatches: 0 };
  }

  const authBase = authEmulatorOrigin
    ? `${authEmulatorOrigin.replace(/\/+$/, '')}/identitytoolkit.googleapis.com/v1`
    : 'https://identitytoolkit.googleapis.com/v1';
  const firestoreBase = `${(firestoreEmulatorOrigin || 'https://firestore.googleapis.com').replace(/\/+$/, '')}/v1/projects/${encodeURIComponent(projectId)}/databases/(default)`;

  const authRes = await fetch(`${authBase}/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: adminEmail, password: adminPassword, returnSecureToken: true }),
  });
  const authData = await authRes.json().catch(() => ({}));
  if (!authRes.ok || !authData.idToken) {
    throw new Error(`Đăng nhập Firebase thất bại: ${authData?.error?.message || authRes.status}`);
  }

  const writes = buildMigrationWrites(projectId, rows);
  const batchSize = 200; // 100 rows (200 document writes) per Firestore commit (limit 500)
  let committedBatches = 0;

  for (let i = 0; i < writes.length; i += batchSize) {
    const chunk = writes.slice(i, i + batchSize);
    const commitRes = await fetch(
      `${firestoreBase}/documents:commit?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authData.idToken}`,
        },
        body: JSON.stringify({ writes: chunk }),
      }
    );
    const commitBody = await commitRes.json().catch(() => ({}));
    if (!commitRes.ok) {
      throw new Error(`Lỗi ghi Firestore batch ${committedBatches + 1}: ${commitBody?.error?.message || commitRes.status}`);
    }
    committedBatches++;
  }

  return { totalRows: rows.length, committedBatches };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const inputPath = process.argv[2];
  const projectId = process.env.FIREBASE_PROJECT_ID || '';
  const apiKey = process.env.FIREBASE_API_KEY || '';
  const adminEmail = process.env.FIREBASE_ADMIN_EMAIL || '';
  const adminPassword = process.env.FIREBASE_ADMIN_PASSWORD || '';
  const firestoreEmulatorOrigin = process.env.FIREBASE_FIRESTORE_EMULATOR_ORIGIN || '';
  const authEmulatorOrigin = process.env.FIREBASE_AUTH_EMULATOR_ORIGIN || '';

  if (!inputPath || !projectId || !apiKey || !adminEmail || !adminPassword) {
    console.error(
      'Cách dùng:\n  FIREBASE_PROJECT_ID=... FIREBASE_API_KEY=... FIREBASE_ADMIN_EMAIL=... FIREBASE_ADMIN_PASSWORD=... node firebase/migrate-from-d1.mjs <duong-dan-d1.sql|feedback.db>'
    );
    process.exit(1);
  }

  migrateToFirestore({
    inputPath,
    projectId,
    apiKey,
    adminEmail,
    adminPassword,
    firestoreEmulatorOrigin,
    authEmulatorOrigin,
  })
    .then(res => {
      console.log(`Đã nhập ${res.totalRows} góp ý vào Firestore (${res.committedBatches} batch).`);
    })
    .catch(err => {
      console.error(err.message);
      process.exit(1);
    });
}
