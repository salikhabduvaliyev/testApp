import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  computeLevelName,
  db,
  generateRecoveryCode,
  namesBelongToSamePerson,
  normalizeFullName,
  normalizePhone,
  shuffleArray,
  splitFullName,
  verifyPassword,
} from './db.mjs';
import {
  buildSampleDocxBuffer,
  extractAndParseTestBuffer,
  getSampleTxtText,
} from './testParser.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.resolve(__dirname, '../admin-web/dist');
const PORT = Number(process.env.PORT || 8000);
const HOST = process.env.HOST || '0.0.0.0';
const SESSION_SECRET = process.env.SESSION_SECRET || 'dono-selfhosted-secret-2026';

// Active SSE clients for live admin dashboard updates
const sseClients = new Set();

function broadcastUpdate(eventType, payload = {}) {
  const data = `event: ${eventType}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(data);
    } catch {
      sseClients.delete(res);
    }
  }
}

function sendJson(res, status, data, extraHeaders = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, X-File-Name',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    ...extraHeaders,
  });
  res.end(JSON.stringify(data));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  return JSON.parse(raw);
}

async function readRawBody(req, maxBytes = 25 * 1024 * 1024) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBytes) {
      throw new Error('Fayl hajmi 25 MB dan oshmasligi kerak.');
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) {
      out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return out;
}

function signSession(adminId, username) {
  const payload = Buffer.from(
    JSON.stringify({ id: adminId, username, exp: Date.now() + 7 * 86400 * 1000 })
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function getAuthenticatedAdmin(req) {
  const token = parseCookies(req).dono_session;
  if (!token) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (parsed.exp < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

function requireAdmin(req, res) {
  const admin = getAuthenticatedAdmin(req);
  if (!admin) {
    sendJson(res, 401, { message: 'Admin avtorizatsiyasi talab qilinadi.' });
    return null;
  }
  return admin;
}

const OPTION_LETTERS = ['A', 'B', 'C', 'D'];

function signShuffledAnswer(qid, correct) {
  const payload = Buffer.from(JSON.stringify({ qid, correct })).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifyShuffledAnswer(token, expectedQid) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  if (!payload || !sig) return null;
  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (parsed.qid !== expectedQid) return null;
    if (!OPTION_LETTERS.includes(parsed.correct)) return null;
    return parsed.correct;
  } catch {
    return null;
  }
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function serveStatic(req, res, pathname) {
  if (!fs.existsSync(DIST_DIR)) {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('DONO Server port 8000 da ishlamoqda. admin-web/dist papkasini build qiling.');
    return;
  }
  const safePath = path.normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  let filePath = path.join(DIST_DIR, safePath === '/' ? 'index.html' : safePath);
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(DIST_DIR, 'index.html');
  }
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, X-File-Name',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    });
    res.end();
    return;
  }

  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  try {
    // ── HEALTH ───────────────────────────────────────────────────────
    if (req.method === 'GET' && pathname === '/api/health') {
      return sendJson(res, 200, { ok: true, service: 'DONO', port: PORT });
    }

    // ── ADMIN AUTH ───────────────────────────────────────────────────
    if (req.method === 'POST' && pathname === '/api/admin/login') {
      const { username, password } = await readBody(req);
      const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(String(username || '').trim());
      if (!admin || !verifyPassword(String(password || ''), admin.password_hash)) {
        return sendJson(res, 401, { message: 'Login yoki parol noto‘g‘ri.' });
      }
      const token = signSession(admin.id, admin.username);
      return sendJson(
        res,
        200,
        { ok: true, username: admin.username, full_name: admin.full_name },
        {
          'Set-Cookie': `dono_session=${encodeURIComponent(token)}; HttpOnly; Path=/; Max-Age=${7 * 86400}; SameSite=Lax`,
        }
      );
    }

    if (req.method === 'POST' && pathname === '/api/admin/logout') {
      return sendJson(
        res,
        200,
        { ok: true },
        { 'Set-Cookie': 'dono_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax' }
      );
    }

    if (req.method === 'GET' && pathname === '/api/admin/me') {
      const admin = getAuthenticatedAdmin(req);
      if (!admin) return sendJson(res, 401, { authenticated: false });
      return sendJson(res, 200, { authenticated: true, username: admin.username });
    }

    // ── ADMIN LIVE SSE ───────────────────────────────────────────────
    if (req.method === 'GET' && pathname === '/api/admin/events') {
      const admin = requireAdmin(req, res);
      if (!admin) return;
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      res.write('event: connected\ndata: {}\n\n');
      sseClients.add(res);
      req.on('close', () => sseClients.delete(res));
      return;
    }

    // ── ADMIN OVERVIEW & CRUD ────────────────────────────────────────
    if (req.method === 'GET' && pathname === '/api/admin/overview') {
      if (!requireAdmin(req, res)) return;
      const today = new Date().toISOString().slice(0, 10);
      const stats = {
        total_students: db.prepare('SELECT COUNT(*) AS c FROM students').get().c,
        active_today: db.prepare('SELECT COUNT(*) AS c FROM students WHERE last_active_date = ?').get(today).c,
        total_attempts: db.prepare('SELECT COUNT(*) AS c FROM test_attempts').get().c,
        avg_score_percent: Math.round(
          db.prepare('SELECT COALESCE(AVG(score_percent), 0) AS a FROM test_attempts').get().a
        ),
        total_subjects: db.prepare('SELECT COUNT(*) AS c FROM subjects').get().c,
        total_quizzes: db.prepare('SELECT COUNT(*) AS c FROM quizzes').get().c,
        total_banks: db.prepare('SELECT COUNT(*) AS c FROM question_banks').get().c,
        total_questions: db.prepare('SELECT COUNT(*) AS c FROM questions').get().c,
      };
      const subjects = db
        .prepare('SELECT * FROM subjects ORDER BY sort_order ASC, created_at ASC')
        .all()
        .map((s) => ({ ...s, is_active: Boolean(s.is_active) }));

      const banks = db
        .prepare(
          `SELECT qb.*,
                  sub.name AS subject_name,
                  (SELECT COUNT(*) FROM questions q WHERE q.bank_id = qb.id) AS question_count,
                  (SELECT COUNT(*) FROM quiz_banks lk WHERE lk.bank_id = qb.id) AS linked_quiz_count
           FROM question_banks qb
           LEFT JOIN subjects sub ON sub.id = qb.subject_id
           ORDER BY qb.created_at DESC`
        )
        .all();

      const quizBankRows = db.prepare('SELECT quiz_id, bank_id FROM quiz_banks').all();
      const bankIdsByQuiz = new Map();
      for (const row of quizBankRows) {
        if (!bankIdsByQuiz.has(row.quiz_id)) bankIdsByQuiz.set(row.quiz_id, []);
        bankIdsByQuiz.get(row.quiz_id).push(row.bank_id);
      }
      const quizCountRows = db
        .prepare(
          `SELECT qb.quiz_id, COUNT(DISTINCT qu.id) AS question_count
           FROM quiz_banks qb
           JOIN questions qu ON qu.bank_id = qb.bank_id
           GROUP BY qb.quiz_id`
        )
        .all();
      const countByQuiz = new Map(quizCountRows.map((r) => [r.quiz_id, r.question_count]));

      const quizzes = db
        .prepare('SELECT * FROM quizzes ORDER BY created_at ASC')
        .all()
        .map((q) => ({
          ...q,
          is_active: Boolean(q.is_active),
          bank_ids: bankIdsByQuiz.get(q.id) || [],
          question_count: countByQuiz.get(q.id) || 0,
        }));

      const questions = db.prepare('SELECT * FROM questions ORDER BY created_at DESC').all();
      const students = db.prepare('SELECT * FROM students ORDER BY phone ASC, total_points DESC').all();
      const attempts = db
        .prepare(
          `SELECT ta.*,
                  st.first_name AS s_first_name, st.last_name AS s_last_name,
                  st.full_name AS s_full_name, st.phone AS s_phone, st.region AS s_region,
                  sub.name AS sub_name,
                  qz.title AS qz_title
           FROM test_attempts ta
           JOIN students st ON st.id = ta.student_id
           JOIN subjects sub ON sub.id = ta.subject_id
           JOIN quizzes qz ON qz.id = ta.quiz_id
           ORDER BY ta.completed_at DESC
           LIMIT 150`
        )
        .all()
        .map((r) => ({
          id: r.id,
          student_id: r.student_id,
          subject_id: r.subject_id,
          quiz_id: r.quiz_id,
          requested_count: r.requested_count,
          total_questions: r.total_questions,
          correct_count: r.correct_count,
          wrong_count: r.wrong_count,
          earned_points: r.earned_points,
          duration_sec: r.duration_sec,
          score_percent: r.score_percent,
          completed_at: r.completed_at,
          students: {
            first_name: r.s_first_name,
            last_name: r.s_last_name,
            full_name: r.s_full_name || `${r.s_first_name} ${r.s_last_name}`.trim(),
            phone: r.s_phone || '',
            region: r.s_region,
          },
          subjects: { name: r.sub_name },
          quizzes: { title: r.qz_title },
        }));

      return sendJson(res, 200, { stats, subjects, banks, quizzes, questions, students, attempts });
    }

    // Subjects CRUD
    if (req.method === 'POST' && pathname === '/api/admin/subjects') {
      if (!requireAdmin(req, res)) return;
      const b = await readBody(req);
      const id = crypto.randomUUID();
      db.prepare(
        'INSERT INTO subjects (id, name, description, icon_key, color_hex, sort_order, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(
        id,
        String(b.name || '').trim(),
        String(b.description || ''),
        String(b.icon_key || 'menu_book'),
        String(b.color_hex || '#2563EB'),
        Number(b.sort_order || 0),
        b.is_active === false ? 0 : 1
      );
      broadcastUpdate('subjects');
      return sendJson(res, 201, { id });
    }

    if (pathname.startsWith('/api/admin/subjects/')) {
      if (!requireAdmin(req, res)) return;
      const id = pathname.split('/').pop();
      if (req.method === 'PATCH') {
        const b = await readBody(req);
        const cur = db.prepare('SELECT * FROM subjects WHERE id = ?').get(id);
        if (!cur) return sendJson(res, 404, { message: 'Fan topilmadi' });
        db.prepare(
          'UPDATE subjects SET name = ?, description = ?, icon_key = ?, color_hex = ?, is_active = ? WHERE id = ?'
        ).run(
          b.name ?? cur.name,
          b.description ?? cur.description,
          b.icon_key ?? cur.icon_key,
          b.color_hex ?? cur.color_hex,
          b.is_active === undefined ? cur.is_active : b.is_active ? 1 : 0,
          id
        );
        broadcastUpdate('subjects');
        return sendJson(res, 200, { ok: true });
      }
      if (req.method === 'DELETE') {
        db.prepare('DELETE FROM subjects WHERE id = ?').run(id);
        broadcastUpdate('subjects');
        return sendJson(res, 200, { ok: true });
      }
    }

    // Parse Word (.docx), PDF (.pdf), TXT test files with #a) b) c) d) format
    if (req.method === 'POST' && pathname === '/api/admin/parse-test-file') {
      if (!requireAdmin(req, res)) return;
      const rawName = String(req.headers['x-file-name'] || 'test.docx');
      let filename = rawName;
      try {
        filename = decodeURIComponent(rawName);
      } catch {
        // use rawName as fallback
      }
      const buffer = await readRawBody(req);
      const parsed = await extractAndParseTestBuffer(buffer, filename);
      return sendJson(res, 200, parsed);
    }

    if (req.method === 'GET' && pathname === '/api/admin/sample-test') {
      if (!requireAdmin(req, res)) return;
      const fmt = (url.searchParams.get('format') || 'docx').toLowerCase();
      if (fmt === 'txt') {
        const txt = getSampleTxtText();
        res.writeHead(200, {
          'Content-Type': 'text/plain; charset=utf-8',
          'Content-Disposition': 'attachment; filename="dono-test-namuna.txt"',
        });
        res.end(txt);
        return;
      }
      const docxBuf = await buildSampleDocxBuffer();
      res.writeHead(200, {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': 'attachment; filename="dono-test-namuna.docx"',
      });
      res.end(docxBuf);
      return;
    }

    // Question Banks CRUD
    if (req.method === 'POST' && pathname === '/api/admin/banks') {
      if (!requireAdmin(req, res)) return;
      const b = await readBody(req);
      const title = String(b.title || '').trim();
      if (!title) return sendJson(res, 400, { message: 'Test nomi kiritilishi shart.' });
      const id = crypto.randomUUID();
      const items = Array.isArray(b.questions) ? b.questions : [];
      const rawSubjectId = b.subject_id ? String(b.subject_id).trim() : '';
      const subjectRow = rawSubjectId
        ? db.prepare('SELECT id, name FROM subjects WHERE id = ?').get(rawSubjectId)
        : null;
      const resolvedSubjectId = subjectRow ? subjectRow.id : null;
      const resolvedHint = subjectRow ? subjectRow.name : String(b.subject_hint || '').trim();
      const sourceType = String(b.source_type || '').trim().toLowerCase();
      const autoCreateQuiz = Boolean(resolvedSubjectId && b.auto_create_quiz);
      let createdQuizId = null;

      db.exec('BEGIN');
      try {
        db.prepare(
          'INSERT INTO question_banks (id, title, description, subject_id, subject_hint, source_type) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(
          id,
          title,
          String(b.description || '').trim(),
          resolvedSubjectId,
          resolvedHint,
          sourceType
        );
        if (items.length > 0) {
          const insQ = db.prepare(
            'INSERT INTO questions (id, bank_id, quiz_id, question_text, expression_text, option_a, option_b, option_c, option_d, correct_option, explanation) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
          );
          for (const q of items) {
            insQ.run(
              crypto.randomUUID(),
              id,
              null,
              String(q.question_text || '').trim(),
              q.expression_text ? String(q.expression_text).trim() : null,
              String(q.option_a || '').trim(),
              String(q.option_b || '').trim(),
              String(q.option_c || '').trim(),
              String(q.option_d || '').trim(),
              String(q.correct_option || 'A').trim().toUpperCase(),
              String(q.explanation || '').trim()
            );
          }
        }
        if (autoCreateQuiz) {
          createdQuizId = crypto.randomUUID();
          db.prepare(
            'INSERT INTO quizzes (id, subject_id, title, description, time_per_question_sec, points_per_correct, is_active) VALUES (?, ?, ?, ?, ?, ?, 1)'
          ).run(
            createdQuizId,
            resolvedSubjectId,
            title,
            String(b.description || `${items.length} ta savolli test bazasi`).trim(),
            Math.max(0, Number(b.time_per_question_sec ?? 20)),
            Math.max(1, Number(b.points_per_correct ?? 5))
          );
          db.prepare('INSERT OR IGNORE INTO quiz_banks (quiz_id, bank_id) VALUES (?, ?)').run(
            createdQuizId,
            id
          );
        }
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
      broadcastUpdate('banks');
      if (items.length > 0) broadcastUpdate('questions');
      if (createdQuizId) broadcastUpdate('quizzes');
      return sendJson(res, 201, { id, quiz_id: createdQuizId, inserted: items.length });
    }

    if (pathname.startsWith('/api/admin/banks/')) {
      if (!requireAdmin(req, res)) return;
      const id = pathname.split('/').pop();
      if (req.method === 'PATCH') {
        const b = await readBody(req);
        const cur = db.prepare('SELECT * FROM question_banks WHERE id = ?').get(id);
        if (!cur) return sendJson(res, 404, { message: 'Test topilmadi' });
        let nextSubjectId = cur.subject_id;
        let nextHint = cur.subject_hint;
        if (b.subject_id !== undefined) {
          const rawSubId = b.subject_id ? String(b.subject_id).trim() : '';
          const subRow = rawSubId
            ? db.prepare('SELECT id, name FROM subjects WHERE id = ?').get(rawSubId)
            : null;
          nextSubjectId = subRow ? subRow.id : null;
          nextHint = subRow ? subRow.name : String(b.subject_hint || '').trim();
        } else if (b.subject_hint !== undefined) {
          nextHint = String(b.subject_hint).trim();
        }
        db.prepare(
          'UPDATE question_banks SET title = ?, description = ?, subject_id = ?, subject_hint = ? WHERE id = ?'
        ).run(
          b.title !== undefined ? String(b.title).trim() : cur.title,
          b.description !== undefined ? String(b.description).trim() : cur.description,
          nextSubjectId,
          nextHint,
          id
        );
        broadcastUpdate('banks');
        return sendJson(res, 200, { ok: true });
      }
      if (req.method === 'DELETE') {
        db.prepare('DELETE FROM question_banks WHERE id = ?').run(id);
        broadcastUpdate('banks');
        broadcastUpdate('questions');
        broadcastUpdate('quizzes');
        return sendJson(res, 200, { ok: true });
      }
    }

    // Quizzes CRUD
    if (req.method === 'POST' && pathname === '/api/admin/quizzes') {
      if (!requireAdmin(req, res)) return;
      const b = await readBody(req);
      const id = crypto.randomUUID();
      const bankIds = Array.isArray(b.bank_ids)
        ? [...new Set(b.bank_ids.map((v) => String(v || '').trim()).filter(Boolean))]
        : [];
      db.exec('BEGIN');
      try {
        db.prepare(
          'INSERT INTO quizzes (id, subject_id, title, description, time_per_question_sec, points_per_correct, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).run(
          id,
          b.subject_id,
          String(b.title || '').trim(),
          String(b.description || ''),
          Math.max(0, Number(b.time_per_question_sec ?? 20)),
          Math.max(1, Number(b.points_per_correct ?? 5)),
          b.is_active === false ? 0 : 1
        );
        if (bankIds.length > 0) {
          const checkBank = db.prepare('SELECT id FROM question_banks WHERE id = ?');
          const insLink = db.prepare('INSERT OR IGNORE INTO quiz_banks (quiz_id, bank_id) VALUES (?, ?)');
          for (const bankId of bankIds) {
            if (checkBank.get(bankId)) insLink.run(id, bankId);
          }
        }
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
      broadcastUpdate('quizzes');
      return sendJson(res, 201, { id });
    }

    if (pathname.startsWith('/api/admin/quizzes/')) {
      if (!requireAdmin(req, res)) return;
      const id = pathname.split('/').pop();
      if (req.method === 'PATCH') {
        const b = await readBody(req);
        const cur = db.prepare('SELECT * FROM quizzes WHERE id = ?').get(id);
        if (!cur) return sendJson(res, 404, { message: 'Test topilmadi' });
        db.exec('BEGIN');
        try {
          db.prepare(
            'UPDATE quizzes SET title = ?, description = ?, time_per_question_sec = ?, points_per_correct = ?, is_active = ? WHERE id = ?'
          ).run(
            b.title ?? cur.title,
            b.description ?? cur.description,
            b.time_per_question_sec ?? cur.time_per_question_sec,
            b.points_per_correct ?? cur.points_per_correct,
            b.is_active === undefined ? cur.is_active : b.is_active ? 1 : 0,
            id
          );
          if (Array.isArray(b.bank_ids)) {
            const bankIds = [...new Set(b.bank_ids.map((v) => String(v || '').trim()).filter(Boolean))];
            db.prepare('DELETE FROM quiz_banks WHERE quiz_id = ?').run(id);
            const checkBank = db.prepare('SELECT id FROM question_banks WHERE id = ?');
            const insLink = db.prepare('INSERT OR IGNORE INTO quiz_banks (quiz_id, bank_id) VALUES (?, ?)');
            for (const bankId of bankIds) {
              if (checkBank.get(bankId)) insLink.run(id, bankId);
            }
          }
          db.exec('COMMIT');
        } catch (err) {
          db.exec('ROLLBACK');
          throw err;
        }
        broadcastUpdate('quizzes');
        return sendJson(res, 200, { ok: true });
      }
      if (req.method === 'DELETE') {
        db.prepare('DELETE FROM quizzes WHERE id = ?').run(id);
        broadcastUpdate('quizzes');
        return sendJson(res, 200, { ok: true });
      }
    }

    // Questions CRUD (supports bulk insert into a question bank)
    if (req.method === 'POST' && pathname === '/api/admin/questions') {
      if (!requireAdmin(req, res)) return;
      const b = await readBody(req);
      const items = Array.isArray(b.questions) ? b.questions : [b];
      const stmt = db.prepare(
        'INSERT INTO questions (id, bank_id, quiz_id, question_text, expression_text, option_a, option_b, option_c, option_d, correct_option, explanation) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      );
      const resolveBankForQuiz = db.prepare('SELECT bank_id FROM quiz_banks WHERE quiz_id = ? LIMIT 1');
      db.exec('BEGIN');
      try {
        for (const q of items) {
          let bankId = String(q.bank_id || b.bank_id || '').trim();
          const legacyQuizId = q.quiz_id || b.quiz_id || null;
          if (!bankId && legacyQuizId) {
            const linked = resolveBankForQuiz.get(legacyQuizId);
            bankId = linked?.bank_id || '';
          }
          if (!bankId) {
            throw new Error('Savol qo‘shish uchun test baza (bank_id) tanlanishi shart.');
          }
          stmt.run(
            crypto.randomUUID(),
            bankId,
            legacyQuizId,
            String(q.question_text || '').trim(),
            q.expression_text ? String(q.expression_text).trim() : null,
            String(q.option_a || '').trim(),
            String(q.option_b || '').trim(),
            String(q.option_c || '').trim(),
            String(q.option_d || '').trim(),
            String(q.correct_option || 'A').trim().toUpperCase(),
            String(q.explanation || '').trim()
          );
        }
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
      broadcastUpdate('questions');
      broadcastUpdate('banks');
      return sendJson(res, 201, { inserted: items.length });
    }

    if (pathname.startsWith('/api/admin/questions/')) {
      if (!requireAdmin(req, res)) return;
      const id = pathname.split('/').pop();
      if (req.method === 'PATCH') {
        const b = await readBody(req);
        const cur = db.prepare('SELECT * FROM questions WHERE id = ?').get(id);
        if (!cur) return sendJson(res, 404, { message: 'Savol topilmadi' });
        db.prepare(
          'UPDATE questions SET question_text = ?, expression_text = ?, option_a = ?, option_b = ?, option_c = ?, option_d = ?, correct_option = ?, explanation = ? WHERE id = ?'
        ).run(
          b.question_text ?? cur.question_text,
          b.expression_text !== undefined ? b.expression_text : cur.expression_text,
          b.option_a ?? cur.option_a,
          b.option_b ?? cur.option_b,
          b.option_c ?? cur.option_c,
          b.option_d ?? cur.option_d,
          b.correct_option ?? cur.correct_option,
          b.explanation ?? cur.explanation,
          id
        );
        broadcastUpdate('questions');
        return sendJson(res, 200, { ok: true });
      }
      if (req.method === 'DELETE') {
        db.prepare('DELETE FROM questions WHERE id = ?').run(id);
        broadcastUpdate('questions');
        broadcastUpdate('banks');
        return sendJson(res, 200, { ok: true });
      }
    }

    // ── PUBLIC STUDENT / APK API ─────────────────────────────────────
    if (req.method === 'POST' && (pathname === '/api/student/login' || pathname === '/api/student/upsert')) {
      const b = await readBody(req);
      const phone = normalizePhone(b.phone);
      const rawName = normalizeFullName(
        b.full_name || `${String(b.first_name || '').trim()} ${String(b.last_name || '').trim()}`
      );
      const deviceId = String(b.device_id || '').trim();
      const region = String(b.region || '').trim() || 'O‘zbekiston';

      if (rawName.length < 3) {
        return sendJson(res, 400, { message: 'F.I.O (to‘liq ism-familiya) kiritilishi shart.' });
      }
      if (!phone) {
        return sendJson(res, 400, {
          message: 'To‘g‘ri telefon raqamini kiriting (masalan: +998 90 123 45 67).',
        });
      }

      const today = new Date().toISOString().slice(0, 10);
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      let st = db.prepare('SELECT * FROM students WHERE phone = ?').get(phone);

      if (!st) {
        const { firstName, lastName } = splitFullName(rawName);
        const id = crypto.randomUUID();
        const code = generateRecoveryCode();
        db.prepare(
          `INSERT INTO students (id, phone, full_name, first_name, last_name, device_id, recovery_code, region, last_active_date)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(id, phone, rawName, firstName, lastName, deviceId, code, region, today);
        st = db.prepare('SELECT * FROM students WHERE id = ?').get(id);
        broadcastUpdate('student_joined', { id });
      } else {
        const existingName = st.full_name || `${st.first_name} ${st.last_name}`.trim();
        if (!namesBelongToSamePerson(existingName, rawName)) {
          return sendJson(res, 409, {
            message:
              'Bu telefon raqami allaqachon boshqa foydalanuvchiga biriktirilgan. Har bir telefon raqam faqat bitta foydalanuvchiga tegishli.',
          });
        }

        const nextStreak =
          st.last_active_date === today
            ? st.streak_days
            : st.last_active_date === yesterday
            ? st.streak_days + 1
            : 1;
        const nextDaily = st.last_active_date === today ? st.daily_questions_count : 0;
        const keptFullName = rawName.length > existingName.length ? rawName : existingName;
        const { firstName, lastName } = splitFullName(keptFullName);
        db.prepare(
          `UPDATE students
           SET full_name = ?, first_name = ?, last_name = ?, device_id = ?,
               streak_days = ?, daily_questions_count = ?, last_active_date = ?, last_active_at = datetime('now')
           WHERE id = ?`
        ).run(
          keptFullName,
          firstName,
          lastName,
          deviceId || st.device_id,
          nextStreak,
          nextDaily,
          today,
          st.id
        );
        st = db.prepare('SELECT * FROM students WHERE id = ?').get(st.id);
      }
      return sendJson(res, 200, { ...st, level_name: computeLevelName(st.total_points) });
    }

    if (req.method === 'POST' && pathname === '/api/student/recover') {
      const b = await readBody(req);
      const code = String(b.recovery_code || '').trim().toUpperCase();
      const newDeviceId = String(b.new_device_id || '').trim();
      const st = db.prepare('SELECT * FROM students WHERE upper(recovery_code) = ?').get(code);
      if (!st) return sendJson(res, 404, { message: 'Tiklash kodi topilmadi.' });
      db.prepare("UPDATE students SET device_id = ?, last_active_at = datetime('now') WHERE id = ?").run(newDeviceId, st.id);
      const updated = db.prepare('SELECT * FROM students WHERE id = ?').get(st.id);
      return sendJson(res, 200, { ...updated, level_name: computeLevelName(updated.total_points) });
    }

    if (req.method === 'POST' && pathname === '/api/student/friends') {
      const b = await readBody(req);
      const studentId = String(b.student_id || '').trim();
      const rawInput = String(b.friend_code || b.phone || '').trim();
      const asPhone = normalizePhone(rawInput);
      const asCode = rawInput.toUpperCase();

      const friend = asPhone
        ? db.prepare('SELECT * FROM students WHERE phone = ? OR upper(recovery_code) = ?').get(asPhone, asCode)
        : db.prepare('SELECT * FROM students WHERE upper(recovery_code) = ?').get(asCode);
      if (!friend) return sendJson(res, 404, { message: 'Bunday telefon raqamli yoki kodli foydalanuvchi topilmadi.' });
      if (friend.id === studentId) return sendJson(res, 400, { message: 'O‘zingizni do‘st sifatida qo‘sholmaysiz.' });

      db.prepare('INSERT OR IGNORE INTO friendships (id, student_id, friend_id) VALUES (?, ?, ?)').run(
        crypto.randomUUID(),
        studentId,
        friend.id
      );
      db.prepare('INSERT OR IGNORE INTO friendships (id, student_id, friend_id) VALUES (?, ?, ?)').run(
        crypto.randomUUID(),
        friend.id,
        studentId
      );
      const friendName = friend.full_name || `${friend.first_name} ${friend.last_name}`.trim();
      return sendJson(res, 200, { ok: true, full_name: friendName });
    }

    if (req.method === 'GET' && pathname === '/api/subjects') {
      const rows = db
        .prepare(
          `SELECT s.*,
                  COUNT(DISTINCT CASE WHEN qz.is_active = 1 THEN qz.id END) AS quiz_count,
                  COUNT(DISTINCT CASE WHEN qz.is_active = 1 THEN qu.id END) AS question_count
           FROM subjects s
           LEFT JOIN quizzes qz ON qz.subject_id = s.id
           LEFT JOIN quiz_banks qb ON qb.quiz_id = qz.id
           LEFT JOIN questions qu ON qu.bank_id = qb.bank_id
           WHERE s.is_active = 1
           GROUP BY s.id
           ORDER BY s.sort_order ASC, s.created_at ASC`
        )
        .all();
      return sendJson(res, 200, rows);
    }

    if (req.method === 'GET' && /^\/api\/subjects\/[^/]+\/quizzes$/.test(pathname)) {
      const subjectId = pathname.split('/')[3];
      const rows = db
        .prepare(
          `SELECT qz.*, COUNT(DISTINCT qu.id) AS question_count
           FROM quizzes qz
           LEFT JOIN quiz_banks qb ON qb.quiz_id = qz.id
           LEFT JOIN questions qu ON qu.bank_id = qb.bank_id
           WHERE qz.subject_id = ? AND qz.is_active = 1
           GROUP BY qz.id
           ORDER BY qz.created_at ASC`
        )
        .all(subjectId);
      return sendJson(res, 200, rows);
    }

    if (req.method === 'GET' && /^\/api\/quizzes\/[^/]+\/questions$/.test(pathname)) {
      const quizId = pathname.split('/')[3];
      const limit = Math.max(1, Math.min(100, Number(url.searchParams.get('limit') || 10)));
      const allRows = db
        .prepare(
          `SELECT DISTINCT qu.*
           FROM questions qu
           JOIN quiz_banks qb ON qb.bank_id = qu.bank_id
           JOIN quizzes qz ON qz.id = qb.quiz_id
           WHERE qb.quiz_id = ? AND qz.is_active = 1`
        )
        .all(quizId);

      // Shuffle both question order and A/B/C/D options every time a test starts
      const picked = shuffleArray(allRows).slice(0, limit).map((q) => {
        const pairs = shuffleArray([
          { orig: 'A', text: q.option_a },
          { orig: 'B', text: q.option_b },
          { orig: 'C', text: q.option_c },
          { orig: 'D', text: q.option_d },
        ]);
        const correctIdx = pairs.findIndex((p) => p.orig === q.correct_option);
        const newCorrect = OPTION_LETTERS[correctIdx >= 0 ? correctIdx : 0];
        return {
          ...q,
          option_a: pairs[0].text,
          option_b: pairs[1].text,
          option_c: pairs[2].text,
          option_d: pairs[3].text,
          correct_option: newCorrect,
          shuffled_token: signShuffledAnswer(q.id, newCorrect),
        };
      });

      return sendJson(res, 200, picked);
    }

    if (req.method === 'POST' && pathname === '/api/attempts') {
      const b = await readBody(req);
      const student = db.prepare('SELECT * FROM students WHERE id = ?').get(b.student_id);
      const quiz = db.prepare('SELECT * FROM quizzes WHERE id = ?').get(b.quiz_id);
      if (!student || !quiz) return sendJson(res, 404, { message: 'O‘quvchi yoki test topilmadi.' });

      const answers = Array.isArray(b.answers) ? b.answers : [];
      let total = 0;
      let correct = 0;
      let wrong = 0;
      const graded = [];

      const findQuestionStmt = db.prepare(
        `SELECT DISTINCT qu.*
         FROM questions qu
         JOIN quiz_banks qb ON qb.bank_id = qu.bank_id
         WHERE qu.id = ? AND qb.quiz_id = ?`
      );

      for (const ans of answers) {
        const q = findQuestionStmt.get(ans.question_id, quiz.id);
        if (!q) continue;
        const selected = ans.selected_option ? String(ans.selected_option).trim().toUpperCase() : null;
        const expectedCorrect = ans.shuffled_token
          ? verifyShuffledAnswer(ans.shuffled_token, q.id)
          : q.correct_option;
        const isCorrect = selected !== null && expectedCorrect !== null && selected === expectedCorrect;
        total++;
        if (isCorrect) correct++;
        else wrong++;
        graded.push({ question_id: q.id, selected_option: selected, is_correct: isCorrect ? 1 : 0 });
      }

      const earnedPoints = correct * quiz.points_per_correct;
      const scorePercent = total > 0 ? Math.round((correct / total) * 10000) / 100 : 0;
      const attemptId = crypto.randomUUID();
      const today = new Date().toISOString().slice(0, 10);
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

      db.exec('BEGIN');
      try {
        db.prepare(
          `INSERT INTO test_attempts (id, student_id, subject_id, quiz_id, requested_count, total_questions, correct_count, wrong_count, earned_points, duration_sec, score_percent)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          attemptId,
          student.id,
          quiz.subject_id,
          quiz.id,
          Number(b.requested_count || total),
          total,
          correct,
          wrong,
          earnedPoints,
          Math.max(0, Number(b.duration_sec || 0)),
          scorePercent
        );

        const insAns = db.prepare(
          'INSERT INTO attempt_answers (id, attempt_id, question_id, selected_option, is_correct) VALUES (?, ?, ?, ?, ?)'
        );
        for (const g of graded) {
          insAns.run(crypto.randomUUID(), attemptId, g.question_id, g.selected_option, g.is_correct);
        }

        const nextStreak =
          student.last_active_date === today
            ? student.streak_days
            : student.last_active_date === yesterday
            ? student.streak_days + 1
            : 1;
        const nextDaily =
          student.last_active_date === today ? student.daily_questions_count + total : total;

        db.prepare(
          `UPDATE students SET total_points = total_points + ?, streak_days = ?, daily_questions_count = ?, last_active_date = ?, last_active_at = datetime('now') WHERE id = ?`
        ).run(earnedPoints, nextStreak, nextDaily, today, student.id);

        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }

      const updatedStudent = db.prepare('SELECT * FROM students WHERE id = ?').get(student.id);
      broadcastUpdate('attempt_submitted', { attempt_id: attemptId });

      return sendJson(res, 200, {
        attempt_id: attemptId,
        total_questions: total,
        correct_count: correct,
        wrong_count: wrong,
        earned_points: earnedPoints,
        new_total_points: updatedStudent.total_points,
        level_name: computeLevelName(updatedStudent.total_points),
      });
    }

    if (req.method === 'GET' && pathname === '/api/leaderboard') {
      const studentId = url.searchParams.get('student_id') || '';
      const scope = url.searchParams.get('scope') || 'all';
      const me = db.prepare('SELECT * FROM students WHERE id = ?').get(studentId);

      let rows;
      if (scope === 'region' && me) {
        rows = db
          .prepare('SELECT * FROM students WHERE region = ? ORDER BY total_points DESC, streak_days DESC')
          .all(me.region);
      } else if (scope === 'friends' && me) {
        rows = db
          .prepare(
            `SELECT * FROM students
             WHERE id = ? OR id IN (SELECT friend_id FROM friendships WHERE student_id = ?)
             ORDER BY total_points DESC, streak_days DESC`
          )
          .all(me.id, me.id);
      } else {
        rows = db.prepare('SELECT * FROM students ORDER BY total_points DESC, streak_days DESC').all();
      }

      const ranked = rows.map((s, idx) => ({
        rank: idx + 1,
        id: s.id,
        full_name: (s.full_name || `${s.first_name} ${s.last_name}`).trim(),
        region: s.region,
        total_points: s.total_points,
        streak_days: s.streak_days,
        level_name: computeLevelName(s.total_points),
        is_me: s.id === studentId,
      }));
      return sendJson(res, 200, ranked.filter((r) => r.rank <= 50 || r.is_me));
    }

    if (req.method === 'GET' && /^\/api\/students\/[^/]+\/history$/.test(pathname)) {
      const studentId = pathname.split('/')[3];
      const rows = db
        .prepare(
          `SELECT ta.id AS attempt_id, sub.name AS subject_name, qz.title AS quiz_title,
                  ta.total_questions, ta.correct_count, ta.wrong_count, ta.earned_points,
                  ta.score_percent, ta.completed_at
           FROM test_attempts ta
           JOIN subjects sub ON sub.id = ta.subject_id
           JOIN quizzes qz ON qz.id = ta.quiz_id
           WHERE ta.student_id = ?
           ORDER BY ta.completed_at DESC
           LIMIT 30`
        )
        .all(studentId);
      return sendJson(res, 200, rows);
    }

    // ── STATIC ADMIN WEB ─────────────────────────────────────────────
    return serveStatic(req, res, pathname);
  } catch (err) {
    console.error('[DONO Server Error]', err);
    return sendJson(res, 500, { message: err instanceof Error ? err.message : 'Server xatoligi' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`DONO Server listening on http://localhost:${PORT} (host=${HOST})`);
});

