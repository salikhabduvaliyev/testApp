import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'dono.db');

export const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS admins (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL DEFAULT 'Admin',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS subjects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  icon_key TEXT NOT NULL DEFAULT 'menu_book',
  color_hex TEXT NOT NULL DEFAULT '#2563EB',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS quizzes (
  id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  time_per_question_sec INTEGER NOT NULL DEFAULT 20,
  points_per_correct INTEGER NOT NULL DEFAULT 5,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_quizzes_subject_id ON quizzes(subject_id);

CREATE TABLE IF NOT EXISTS question_banks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  subject_id TEXT REFERENCES subjects(id) ON DELETE SET NULL,
  subject_hint TEXT NOT NULL DEFAULT '',
  source_type TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS quiz_banks (
  quiz_id TEXT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  bank_id TEXT NOT NULL REFERENCES question_banks(id) ON DELETE CASCADE,
  PRIMARY KEY (quiz_id, bank_id)
);

CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  bank_id TEXT NOT NULL REFERENCES question_banks(id) ON DELETE CASCADE,
  quiz_id TEXT,
  question_text TEXT NOT NULL,
  expression_text TEXT,
  option_a TEXT NOT NULL,
  option_b TEXT NOT NULL,
  option_c TEXT NOT NULL,
  option_d TEXT NOT NULL,
  correct_option TEXT NOT NULL CHECK (correct_option IN ('A','B','C','D')),
  explanation TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,
  phone TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  first_name TEXT NOT NULL DEFAULT '',
  last_name TEXT NOT NULL DEFAULT '',
  device_id TEXT NOT NULL DEFAULT '',
  recovery_code TEXT NOT NULL UNIQUE,
  region TEXT NOT NULL DEFAULT 'O‘zbekiston',
  total_points INTEGER NOT NULL DEFAULT 0,
  streak_days INTEGER NOT NULL DEFAULT 1,
  daily_questions_count INTEGER NOT NULL DEFAULT 0,
  daily_goal_target INTEGER NOT NULL DEFAULT 10,
  last_active_date TEXT NOT NULL DEFAULT (date('now')),
  last_active_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS friendships (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  friend_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(student_id, friend_id)
);

CREATE TABLE IF NOT EXISTS test_attempts (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  quiz_id TEXT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  requested_count INTEGER NOT NULL,
  total_questions INTEGER NOT NULL,
  correct_count INTEGER NOT NULL,
  wrong_count INTEGER NOT NULL,
  earned_points INTEGER NOT NULL,
  duration_sec INTEGER NOT NULL DEFAULT 0,
  score_percent REAL NOT NULL DEFAULT 0,
  completed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_attempts_completed ON test_attempts(completed_at DESC);

CREATE TABLE IF NOT EXISTS attempt_answers (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL REFERENCES test_attempts(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  selected_option TEXT,
  is_correct INTEGER NOT NULL
);
`);

function migrateStudentsToPhoneIdentity() {
  const cols = db.prepare('PRAGMA table_info(students)').all();
  const hasPhone = cols.some((c) => c.name === 'phone');
  const hasFullName = cols.some((c) => c.name === 'full_name');
  if (hasPhone && hasFullName) {
    db.exec('CREATE INDEX IF NOT EXISTS idx_students_points ON students(total_points DESC);');
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_students_phone ON students(phone);');
    return;
  }

  const existingRows = db.prepare('SELECT * FROM students ORDER BY created_at ASC').all();
  db.exec('PRAGMA foreign_keys = OFF;');
  db.exec('BEGIN;');
  try {
    db.exec(`
      CREATE TABLE students_v2 (
        id TEXT PRIMARY KEY,
        phone TEXT NOT NULL UNIQUE,
        full_name TEXT NOT NULL,
        first_name TEXT NOT NULL DEFAULT '',
        last_name TEXT NOT NULL DEFAULT '',
        device_id TEXT NOT NULL DEFAULT '',
        recovery_code TEXT NOT NULL UNIQUE,
        region TEXT NOT NULL DEFAULT 'O‘zbekiston',
        total_points INTEGER NOT NULL DEFAULT 0,
        streak_days INTEGER NOT NULL DEFAULT 1,
        daily_questions_count INTEGER NOT NULL DEFAULT 0,
        daily_goal_target INTEGER NOT NULL DEFAULT 10,
        last_active_date TEXT NOT NULL DEFAULT (date('now')),
        last_active_at TEXT NOT NULL DEFAULT (datetime('now')),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    const ins = db.prepare(`
      INSERT INTO students_v2 (
        id, phone, full_name, first_name, last_name, device_id, recovery_code,
        region, total_points, streak_days, daily_questions_count, daily_goal_target,
        last_active_date, last_active_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const demoPhoneMap = {
      '33333333-3333-3333-3333-333333333301': '+998901234501',
      '33333333-3333-3333-3333-333333333302': '+998901234502',
      '33333333-3333-3333-3333-333333333303': '+998911234503',
      '33333333-3333-3333-3333-333333333304': '+998931234504',
      '33333333-3333-3333-3333-333333333305': '+998941234505',
    };

    existingRows.forEach((r, idx) => {
      const syntheticPhone = demoPhoneMap[r.id] || `+99899000${String(1000 + idx).slice(-4)}`;
      const fullName = `${r.first_name || ''} ${r.last_name || ''}`.trim() || 'O‘quvchi';
      ins.run(
        r.id,
        r.phone || syntheticPhone,
        r.full_name || fullName,
        r.first_name || '',
        r.last_name || '',
        r.device_id || '',
        r.recovery_code,
        r.region || 'O‘zbekiston',
        r.total_points || 0,
        r.streak_days || 1,
        r.daily_questions_count || 0,
        r.daily_goal_target || 10,
        r.last_active_date || new Date().toISOString().slice(0, 10),
        r.last_active_at || new Date().toISOString(),
        r.created_at || new Date().toISOString()
      );
    });

    db.exec('DROP TABLE students;');
    db.exec('ALTER TABLE students_v2 RENAME TO students;');
    db.exec('CREATE INDEX IF NOT EXISTS idx_students_points ON students(total_points DESC);');
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_students_phone ON students(phone);');
    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  } finally {
    db.exec('PRAGMA foreign_keys = ON;');
  }
}

function migrateQuestionsToBanks() {
  const cols = db.prepare('PRAGMA table_info(questions)').all();
  const hasBankId = cols.some((c) => c.name === 'bank_id');
  if (hasBankId) {
    db.exec('CREATE INDEX IF NOT EXISTS idx_questions_bank_id ON questions(bank_id);');
    return;
  }

  const existingQuizzes = db
    .prepare(
      `SELECT qz.*, sub.name AS subject_name
       FROM quizzes qz
       LEFT JOIN subjects sub ON sub.id = qz.subject_id`
    )
    .all();
  const existingQuestions = db.prepare('SELECT * FROM questions ORDER BY created_at ASC').all();

  db.exec('PRAGMA foreign_keys = OFF;');
  db.exec('BEGIN;');
  try {
    const insBank = db.prepare(
      'INSERT OR IGNORE INTO question_banks (id, title, description, subject_hint, created_at) VALUES (?, ?, ?, ?, ?)'
    );
    const insLink = db.prepare(
      'INSERT OR IGNORE INTO quiz_banks (quiz_id, bank_id) VALUES (?, ?)'
    );

    const quizToBank = new Map();
    for (const qz of existingQuizzes) {
      const bankId = `bank-${qz.id}`;
      quizToBank.set(qz.id, bankId);
      insBank.run(
        bankId,
        qz.title,
        qz.description || '',
        qz.subject_name || '',
        qz.created_at || new Date().toISOString()
      );
      insLink.run(qz.id, bankId);
    }

    // Fallback bank if any orphan questions exist
    const orphanExists = existingQuestions.some((q) => !quizToBank.has(q.quiz_id));
    if (orphanExists) {
      insBank.run('bank-default', 'Umumiy savollar bazasi', 'Mavjud savollar', '', new Date().toISOString());
    }

    db.exec(`
      CREATE TABLE questions_v2 (
        id TEXT PRIMARY KEY,
        bank_id TEXT NOT NULL REFERENCES question_banks(id) ON DELETE CASCADE,
        quiz_id TEXT,
        question_text TEXT NOT NULL,
        expression_text TEXT,
        option_a TEXT NOT NULL,
        option_b TEXT NOT NULL,
        option_c TEXT NOT NULL,
        option_d TEXT NOT NULL,
        correct_option TEXT NOT NULL CHECK (correct_option IN ('A','B','C','D')),
        explanation TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    const insQ = db.prepare(`
      INSERT INTO questions_v2 (
        id, bank_id, quiz_id, question_text, expression_text,
        option_a, option_b, option_c, option_d, correct_option, explanation, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const q of existingQuestions) {
      const bId = quizToBank.get(q.quiz_id) || 'bank-default';
      insQ.run(
        q.id,
        bId,
        q.quiz_id || null,
        q.question_text,
        q.expression_text || null,
        q.option_a,
        q.option_b,
        q.option_c,
        q.option_d,
        q.correct_option,
        q.explanation || '',
        q.created_at || new Date().toISOString()
      );
    }

    db.exec('DROP TABLE questions;');
    db.exec('ALTER TABLE questions_v2 RENAME TO questions;');
    db.exec('CREATE INDEX IF NOT EXISTS idx_questions_bank_id ON questions(bank_id);');
    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  } finally {
    db.exec('PRAGMA foreign_keys = ON;');
  }
}

function migrateBankSubjectColumns() {
  const cols = db.prepare('PRAGMA table_info(question_banks)').all();
  const hasSubjectId = cols.some((c) => c.name === 'subject_id');
  const hasSourceType = cols.some((c) => c.name === 'source_type');

  if (!hasSubjectId) {
    db.exec('ALTER TABLE question_banks ADD COLUMN subject_id TEXT;');
  }
  if (!hasSourceType) {
    db.exec("ALTER TABLE question_banks ADD COLUMN source_type TEXT NOT NULL DEFAULT '';");
  }

  // Backfill subject_id from quiz_banks -> quizzes or matching subject_hint
  db.exec(`
    UPDATE question_banks
    SET subject_id = (
      SELECT qz.subject_id
      FROM quiz_banks qb
      JOIN quizzes qz ON qz.id = qb.quiz_id
      WHERE qb.bank_id = question_banks.id
      LIMIT 1
    )
    WHERE subject_id IS NULL;
  `);

  db.exec(`
    UPDATE question_banks
    SET subject_id = (
      SELECT s.id
      FROM subjects s
      WHERE lower(s.name) = lower(question_banks.subject_hint)
      LIMIT 1
    )
    WHERE subject_id IS NULL AND subject_hint != '';
  `);
}

migrateStudentsToPhoneIdentity();
migrateQuestionsToBanks();
migrateBankSubjectColumns();

export function normalizePhone(raw) {
  const str = String(raw || '').trim();
  const digits = str.replace(/\D/g, '');
  if (!digits) return null;

  if (digits.length === 9) {
    return `+998${digits}`;
  }
  if (digits.startsWith('998')) {
    return digits.length === 12 ? `+${digits}` : null;
  }
  if (str.startsWith('+') && digits.length >= 10 && digits.length <= 15) {
    return `+${digits}`;
  }
  if (digits.length >= 10 && digits.length <= 15) {
    return `+${digits}`;
  }
  return null;
}

export function normalizeFullName(raw) {
  return String(raw || '').trim().replace(/\s+/g, ' ');
}

function tokenizeName(name) {
  return normalizeFullName(name)
    .toLowerCase()
    .replace(/[’ʻ‘`´]/g, "'")
    .replace(/[^a-zа-яё0-9'\s]/gi, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 0 && t !== "'");
}

export function namesBelongToSamePerson(existingName, incomingName) {
  const aNorm = normalizeFullName(existingName).toLowerCase().replace(/[’ʻ‘`´]/g, "'");
  const bNorm = normalizeFullName(incomingName).toLowerCase().replace(/[’ʻ‘`´]/g, "'");
  if (!aNorm || !bNorm) return false;
  if (aNorm === bNorm) return true;

  const aTokens = new Set(tokenizeName(existingName));
  const bTokens = new Set(tokenizeName(incomingName));
  if (aTokens.size === 0 || bTokens.size === 0) return false;

  const smaller = aTokens.size <= bTokens.size ? aTokens : bTokens;
  const larger = aTokens.size <= bTokens.size ? bTokens : aTokens;

  let overlap = 0;
  for (const t of smaller) {
    if (larger.has(t)) overlap++;
  }
  return overlap === smaller.size;
}

export function splitFullName(fullName) {
  const clean = normalizeFullName(fullName);
  const parts = clean.split(' ');
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: '' };
  }
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  };
}

export function shuffleArray(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password, stored) {
  const [salt, expected] = String(stored).split(':');
  if (!salt || !expected) return false;
  const actual = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
}

export function computeLevelName(points) {
  if (points >= 2500) return 'Ustoz';
  if (points >= 1500) return 'Alloma';
  if (points >= 800) return 'Zukko';
  if (points >= 300) return 'Bilimdon';
  return 'Boshlovchi';
}

export function generateRecoveryCode() {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

function ensureDefaultAdmin() {
  const adminCount = db.prepare('SELECT COUNT(*) AS cnt FROM admins').get().cnt;
  if (adminCount === 0) {
    const defaultUser = process.env.ADMIN_USERNAME || 'admin';
    const defaultPass = process.env.ADMIN_PASSWORD || 'admin123';
    db.prepare(
      'INSERT INTO admins (id, username, password_hash, full_name) VALUES (?, ?, ?, ?)'
    ).run(crypto.randomUUID(), defaultUser, hashPassword(defaultPass), 'Bosh Admin');
  }
}

ensureDefaultAdmin();
