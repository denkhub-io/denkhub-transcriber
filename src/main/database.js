const Database = require('better-sqlite3');
const path = require('path');
const { app } = require('electron');

let db = null;

function getDb() {
  if (db) return db;

  const dbPath = path.join(app.getPath('userData'), 'transcriptions.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS transcriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      file_path TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      duration_seconds REAL,
      language TEXT,
      model_used TEXT NOT NULL,
      full_text TEXT NOT NULL DEFAULT '',
      words_json TEXT NOT NULL DEFAULT '[]',
      file_size_bytes INTEGER,
      status TEXT NOT NULL DEFAULT 'done'
    );
  `);

  // Add status column if missing (migration for existing DBs)
  try { db.exec(`ALTER TABLE transcriptions ADD COLUMN status TEXT NOT NULL DEFAULT 'done'`); } catch {}
  // Add audio_path column (for trimmed audio)
  try { db.exec(`ALTER TABLE transcriptions ADD COLUMN audio_path TEXT`); } catch {}

  // One-time FTS rebuild to fix out-of-sync entries from previously missing update trigger
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS _migrations (key TEXT PRIMARY KEY)`);
    const done = db.prepare(`SELECT 1 FROM _migrations WHERE key = 'fts_rebuild_v1'`).get();
    if (!done) {
      db.exec(`INSERT INTO transcriptions_fts(transcriptions_fts) VALUES('rebuild')`);
      db.prepare(`INSERT INTO _migrations (key) VALUES ('fts_rebuild_v1')`).run();
    }
  } catch {}

  db.exec(`

    CREATE VIRTUAL TABLE IF NOT EXISTS transcriptions_fts USING fts5(
      filename,
      full_text,
      language,
      model_used,
      content='transcriptions',
      content_rowid='id'
    );

    CREATE TRIGGER IF NOT EXISTS transcriptions_ai AFTER INSERT ON transcriptions BEGIN
      INSERT INTO transcriptions_fts(rowid, filename, full_text, language, model_used)
      VALUES (new.id, new.filename, new.full_text, new.language, new.model_used);
    END;

    CREATE TRIGGER IF NOT EXISTS transcriptions_ad AFTER DELETE ON transcriptions BEGIN
      INSERT INTO transcriptions_fts(transcriptions_fts, rowid, filename, full_text, language, model_used)
      VALUES ('delete', old.id, old.filename, old.full_text, old.language, old.model_used);
    END;

    CREATE TRIGGER IF NOT EXISTS transcriptions_au AFTER UPDATE ON transcriptions BEGIN
      INSERT INTO transcriptions_fts(transcriptions_fts, rowid, filename, full_text, language, model_used)
      VALUES ('delete', old.id, old.filename, old.full_text, old.language, old.model_used);
      INSERT INTO transcriptions_fts(rowid, filename, full_text, language, model_used)
      VALUES (new.id, new.filename, new.full_text, new.language, new.model_used);
    END;
  `);

  return db;
}

function insertTranscription({ filename, filePath, duration, language, model, text, words, fileSize, status }) {
  const d = getDb();
  const stmt = d.prepare(`
    INSERT INTO transcriptions (filename, file_path, duration_seconds, language, model_used, full_text, words_json, file_size_bytes, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(filename, filePath, duration || 0, language, model, text || '', JSON.stringify(words || []), fileSize || 0, status || 'done');
  return result.lastInsertRowid;
}

function completeTranscription(id, { text, words, duration, audioPath }) {
  const d = getDb();
  if (audioPath) {
    d.prepare(`UPDATE transcriptions SET full_text = ?, words_json = ?, duration_seconds = ?, audio_path = ?, status = 'done' WHERE id = ?`)
      .run(text, JSON.stringify(words), duration, audioPath, id);
  } else {
    d.prepare(`UPDATE transcriptions SET full_text = ?, words_json = ?, duration_seconds = ?, status = 'done' WHERE id = ?`)
      .run(text, JSON.stringify(words), duration, id);
  }
  return { success: true };
}

function failTranscription(id) {
  const d = getDb();
  d.prepare(`DELETE FROM transcriptions WHERE id = ? AND status = 'pending'`).run(id);
  return { success: true };
}

function searchTranscriptions({ search, limit = 50, offset = 0 }) {
  const d = getDb();

  if (search && search.trim()) {
    // FTS5 search
    const query = search.trim().replace(/"/g, '""');
    const items = d.prepare(`
      SELECT t.* FROM transcriptions t
      JOIN transcriptions_fts fts ON t.id = fts.rowid
      WHERE transcriptions_fts MATCH ?
      ORDER BY t.created_at DESC
      LIMIT ? OFFSET ?
    `).all(`"${query}"`, limit, offset);

    const total = d.prepare(`
      SELECT COUNT(*) as count FROM transcriptions t
      JOIN transcriptions_fts fts ON t.id = fts.rowid
      WHERE transcriptions_fts MATCH ?
    `).get(`"${query}"`).count;

    return { items, total };
  }

  // No search — return all
  const items = d.prepare(`
    SELECT * FROM transcriptions ORDER BY created_at DESC LIMIT ? OFFSET ?
  `).all(limit, offset);

  const total = d.prepare(`SELECT COUNT(*) as count FROM transcriptions`).get().count;

  return { items, total };
}

function getTranscription(id) {
  const d = getDb();
  return d.prepare('SELECT * FROM transcriptions WHERE id = ?').get(id);
}

function updateTranscriptionName(id, filename) {
  const d = getDb();
  d.prepare('UPDATE transcriptions SET filename = ? WHERE id = ?').run(filename, id);
  return { success: true };
}

function updateTranscriptionWords(id, words) {
  const d = getDb();
  const text = words.map(w => w.word).join(' ');
  d.prepare('UPDATE transcriptions SET words_json = ?, full_text = ? WHERE id = ?')
    .run(JSON.stringify(words), text, id);
  return { success: true };
}

function deleteTranscription(id) {
  const d = getDb();
  try {
    d.prepare('DELETE FROM transcriptions WHERE id = ?').run(id);
  } catch (err) {
    // FTS index likely out of sync — rebuild and retry
    try {
      d.exec(`INSERT INTO transcriptions_fts(transcriptions_fts) VALUES('rebuild')`);
      d.prepare('DELETE FROM transcriptions WHERE id = ?').run(id);
    } catch (retryErr) {
      // FTS rebuild failed — drop triggers, delete row, recreate
      d.exec(`DROP TRIGGER IF EXISTS transcriptions_ad`);
      d.prepare('DELETE FROM transcriptions WHERE id = ?').run(id);
      d.exec(`
        CREATE TRIGGER IF NOT EXISTS transcriptions_ad AFTER DELETE ON transcriptions BEGIN
          INSERT INTO transcriptions_fts(transcriptions_fts, rowid, filename, full_text, language, model_used)
          VALUES ('delete', old.id, old.filename, old.full_text, old.language, old.model_used);
        END
      `);
      d.exec(`INSERT INTO transcriptions_fts(transcriptions_fts) VALUES('rebuild')`);
    }
  }
  return { success: true };
}

module.exports = { insertTranscription, completeTranscription, failTranscription, searchTranscriptions, getTranscription, updateTranscriptionName, updateTranscriptionWords, deleteTranscription };
