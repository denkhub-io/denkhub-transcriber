#!/usr/bin/env node
/**
 * DenkHub Transcriber — MCP Server
 *
 * Exposes local whisper.cpp transcription and history as MCP tools
 * for Claude Code / Claude Desktop.
 *
 * Reads the same SQLite database and settings as the Electron app,
 * so transcriptions are fully synced.
 */

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');
const Database = require('better-sqlite3');
const { execFile, execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

// ---------------------------------------------------------------------------
// Paths — resolve the same locations the Electron app uses
// ---------------------------------------------------------------------------

const USER_DATA = process.platform === 'win32'
  ? path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'denkhub-transcriber')
  : path.join(os.homedir(), 'Library', 'Application Support', 'denkhub-transcriber');
const SETTINGS_PATH = path.join(USER_DATA, 'denkhub-transcriber-settings.json');
const DB_PATH = path.join(USER_DATA, 'transcriptions.db');

// Project root (one level up from mcp-server/)
const PROJECT_ROOT = path.join(__dirname, '..');

// ---------------------------------------------------------------------------
// Settings (read-only, same file as electron-store)
// ---------------------------------------------------------------------------

function loadSettings() {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
  } catch {
    return {
      modelsDirectory: path.join(os.homedir(), 'Documents', 'DenkHub Transcriber', 'Modelli'),
      lastUsedModel: 'base',
      lastUsedLanguage: 'auto',
    };
  }
}

// ---------------------------------------------------------------------------
// Database (same schema as Electron app)
// ---------------------------------------------------------------------------

let db = null;

function getDb() {
  if (db) return db;
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  // Ensure tables exist (mirrors database.js)
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
      status TEXT NOT NULL DEFAULT 'done',
      audio_path TEXT
    );
  `);
  try { db.exec(`ALTER TABLE transcriptions ADD COLUMN status TEXT NOT NULL DEFAULT 'done'`); } catch {}
  try { db.exec(`ALTER TABLE transcriptions ADD COLUMN audio_path TEXT`); } catch {}

  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS transcriptions_fts USING fts5(
      filename, full_text, language, model_used,
      content='transcriptions', content_rowid='id'
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

// ---------------------------------------------------------------------------
// Model registry (same as model-manager.js)
// ---------------------------------------------------------------------------

const MODELS = {
  tiny:   { size: '75 MB',   bytes: 77691713,   file: 'ggml-tiny.bin' },
  base:   { size: '142 MB',  bytes: 147951465,  file: 'ggml-base.bin' },
  small:  { size: '466 MB',  bytes: 487601967,  file: 'ggml-small.bin' },
  medium: { size: '1.5 GB',  bytes: 1533774781, file: 'ggml-medium.bin' },
  large:  { size: '3.1 GB',  bytes: 3094623691, file: 'ggml-large-v3.bin' },
};

// ---------------------------------------------------------------------------
// Find binaries
// ---------------------------------------------------------------------------

function findWhisperCli() {
  const execName = process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli';
  const platformDir = process.platform === 'win32' ? 'win32' : 'darwin';

  const candidates = [
    path.join(PROJECT_ROOT, 'vendor', platformDir, execName),
    path.join(USER_DATA, 'whisper-bin', execName),
  ];

  // System PATH fallback
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }

  // Try system PATH
  try {
    const cmd = process.platform === 'win32' ? 'where' : 'which';
    const result = execFileSync(cmd, ['whisper-cli'], { encoding: 'utf8' }).trim();
    if (result) return result.split('\n')[0].trim();
  } catch {}

  return null;
}

function findFfmpeg() {
  // System PATH first (always works with regular Node.js)
  try {
    const cmd = process.platform === 'win32' ? 'where' : 'which';
    const result = execFileSync(cmd, ['ffmpeg'], { encoding: 'utf8' }).trim();
    if (result) return result.split('\n')[0].trim();
  } catch {}

  // ffmpeg-static from MCP server's own node_modules
  try {
    const ffmpegStatic = require('ffmpeg-static');
    if (ffmpegStatic && fs.existsSync(ffmpegStatic)) return ffmpegStatic;
  } catch {}

  return null;
}

// ---------------------------------------------------------------------------
// Audio conversion (same logic as transcription.js)
// ---------------------------------------------------------------------------

function needsConversion(filePath) {
  return path.extname(filePath).toLowerCase() !== '.wav';
}

function extractAudio(inputPath, outputPath, ffmpegPath) {
  return new Promise((resolve, reject) => {
    const args = [
      '-i', inputPath,
      '-vn', '-ar', '16000', '-ac', '1', '-f', 'wav', '-y',
      outputPath,
    ];
    execFile(ffmpegPath, args, { timeout: 300000 }, (err, _stdout, stderr) => {
      if (err) reject(new Error(`ffmpeg error: ${stderr || err.message}`));
      else resolve(outputPath);
    });
  });
}

// ---------------------------------------------------------------------------
// Whisper output parsing (same as transcription.js)
// ---------------------------------------------------------------------------

function isSpecialToken(text) {
  if (!text) return true;
  return /^\[.*\]$/.test(text.trim());
}

function parseWhisperJson(data) {
  const words = [];
  let fullText = '';

  if (data.transcription) {
    for (const segment of data.transcription) {
      if (segment.tokens) {
        let currentWord = null;
        for (const token of segment.tokens) {
          const text = token.text;
          if (!text || isSpecialToken(text)) continue;

          const startMs = token.offsets ? token.offsets.from : 0;
          const endMs = token.offsets ? token.offsets.to : 0;
          const startsNewWord = text.startsWith(' ');

          if (startsNewWord) {
            if (currentWord) words.push(currentWord);
            currentWord = { word: text.trimStart(), start: startMs / 1000, end: endMs / 1000 };
          } else {
            if (currentWord) {
              currentWord.word += text;
              currentWord.end = endMs / 1000;
            } else {
              currentWord = { word: text, start: startMs / 1000, end: endMs / 1000 };
            }
          }
        }
        if (currentWord) { words.push(currentWord); currentWord = null; }
      }
      if (segment.text) fullText += segment.text;
    }
  }

  fullText = fullText.replace(/\[_[A-Z_]+_?\d*\]/g, '').replace(/\s+/g, ' ').trim();
  return { text: fullText, words };
}

// ---------------------------------------------------------------------------
// Core transcription
// ---------------------------------------------------------------------------

function runTranscription(filePath, modelName, language) {
  return new Promise(async (resolve, reject) => {
    const settings = loadSettings();
    const modelsDir = settings.modelsDirectory;
    const model = MODELS[modelName];
    if (!model) return reject(new Error(`Modello sconosciuto: ${modelName}. Disponibili: ${Object.keys(MODELS).join(', ')}`));

    const modelFile = path.join(modelsDir, model.file);
    if (!fs.existsSync(modelFile)) {
      return reject(new Error(`Modello ${modelName} non scaricato. File atteso: ${modelFile}`));
    }

    const whisperCli = findWhisperCli();
    if (!whisperCli) return reject(new Error('whisper-cli non trovato'));

    // Convert to WAV if needed
    let audioPath = filePath;
    let tempWav = null;

    if (needsConversion(filePath)) {
      const ffmpeg = findFfmpeg();
      if (!ffmpeg) return reject(new Error('ffmpeg non trovato — necessario per convertire il file'));
      tempWav = path.join(os.tmpdir(), `mcp_transcriber_${Date.now()}.wav`);
      try {
        await extractAudio(filePath, tempWav, ffmpeg);
      } catch (e) {
        return reject(new Error(`Conversione audio fallita: ${e.message}`));
      }
      audioPath = tempWav;
    }

    const args = [
      '-m', modelFile,
      '-f', audioPath,
      '-l', language === 'auto' ? 'auto' : language,
      '-ojf',
      '-t', String(Math.max(2, os.cpus().length - 2)),
    ];

    execFile(whisperCli, args, {
      timeout: 0,
      maxBuffer: 50 * 1024 * 1024,
    }, (err, stdout, stderr) => {
      // Clean temp WAV
      if (tempWav && fs.existsSync(tempWav)) {
        fs.unlink(tempWav, () => {});
      }

      if (err) return reject(new Error(`Trascrizione fallita: ${stderr || err.message}`));

      // Parse JSON output file (whisper-cli -ojf writes <input>.json)
      let text = stdout.trim();
      let words = [];

      const jsonPath = audioPath + '.json';
      if (fs.existsSync(jsonPath)) {
        try {
          const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
          const parsed = parseWhisperJson(data);
          text = parsed.text;
          words = parsed.words;
        } catch {}
        // Clean up JSON file
        fs.unlink(jsonPath, () => {});
      }
      // Also clean temp JSON for temp WAV
      if (tempWav) {
        const tmpJson = tempWav + '.json';
        if (fs.existsSync(tmpJson)) {
          try {
            const data = JSON.parse(fs.readFileSync(tmpJson, 'utf8'));
            const parsed = parseWhisperJson(data);
            text = parsed.text;
            words = parsed.words;
          } catch {}
          fs.unlink(tmpJson, () => {});
        }
      }

      resolve({ text, words });
    });
  });
}

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'denkhub-transcriber',
  version: '1.2.0',
});

// ---------------------------------------------------------------------------
// File search — find files in common user directories
// ---------------------------------------------------------------------------

const SEARCH_DIRS = [
  path.join(os.homedir(), 'Downloads'),
  path.join(os.homedir(), 'Desktop'),
  path.join(os.homedir(), 'Documents'),
  path.join(os.homedir(), 'Music'),
  path.join(os.homedir(), 'Movies'),
  os.tmpdir(),
];

const AUDIO_VIDEO_EXTS = new Set([
  '.mp3', '.wav', '.ogg', '.opus', '.m4a', '.flac', '.aac', '.wma', '.webm',
  '.mp4', '.mov', '.avi', '.mkv', '.wmv', '.flv', '.ts',
]);

function findFileByName(filename) {
  // If it's already an absolute path that exists, return it
  if (path.isAbsolute(filename) && fs.existsSync(filename)) return filename;

  // Search common directories (non-recursive, then one level deep)
  for (const dir of SEARCH_DIRS) {
    try {
      // Direct match
      const direct = path.join(dir, filename);
      if (fs.existsSync(direct)) return direct;

      // Try case-insensitive match in the directory
      const entries = fs.readdirSync(dir);
      const match = entries.find(e => e.toLowerCase() === filename.toLowerCase());
      if (match) return path.join(dir, match);
    } catch {}
  }

  // Try partial filename match (e.g. user says "WhatsApp Audio" and file is "WhatsApp Audio 2026-04-11 at 18.23.24.opus")
  for (const dir of SEARCH_DIRS) {
    try {
      const entries = fs.readdirSync(dir);
      const matches = entries.filter(e => e.toLowerCase().includes(filename.toLowerCase()));
      if (matches.length === 1) return path.join(dir, matches[0]);
    } catch {}
  }

  return null;
}

function listRecentAudioVideo(maxAge = 7 * 24 * 60 * 60 * 1000) {
  const cutoff = Date.now() - maxAge;
  const results = [];

  for (const dir of SEARCH_DIRS) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        const ext = path.extname(entry.name).toLowerCase();
        if (!AUDIO_VIDEO_EXTS.has(ext)) continue;
        const fullPath = path.join(dir, entry.name);
        try {
          const stat = fs.statSync(fullPath);
          if (stat.mtimeMs > cutoff) {
            results.push({
              name: entry.name,
              path: fullPath,
              size: stat.size,
              modified: stat.mtime.toISOString(),
            });
          }
        } catch {}
      }
    } catch {}
  }

  return results.sort((a, b) => new Date(b.modified) - new Date(a.modified));
}

// ---------------------------------------------------------------------------

// Find the best (largest) installed model
function getBestInstalledModel() {
  const settings = loadSettings();
  const modelsDir = settings.modelsDirectory;
  // Ordered from best to worst
  const priority = ['large', 'medium', 'small', 'base', 'tiny'];
  for (const name of priority) {
    const info = MODELS[name];
    const modelPath = path.join(modelsDir, info.file);
    if (fs.existsSync(modelPath)) {
      try {
        const stat = fs.statSync(modelPath);
        if (stat.size >= info.bytes * 0.99) return name;
      } catch {}
    }
  }
  return 'base'; // fallback
}

// --- Tool: transcribe ---

server.tool(
  'transcribe',
  'Transcribe an audio or video file using local whisper.cpp. Accepts ANY audio/video format (mp3, mp4, opus, ogg, webm, m4a, wav, flac, aac, wma, avi, mkv, mov, etc.) — ffmpeg handles conversion automatically. Do NOT convert the file yourself, just pass it directly. Returns text with word-level timestamps. The transcription is saved in the DenkHub Transcriber app history. IMPORTANT: When the user uploads/attaches a file in chat, use file_name with the original filename — the server will automatically search Downloads, Desktop, Documents and other common folders to find it locally. Do NOT pass base64 file_content unless absolutely necessary. Do NOT use paths like /mnt/user-data/uploads/ — those are server paths and not accessible locally.',
  {
    file_path: z.string().optional().describe('Absolute local path to the audio/video file. Use this when the user provides a specific path.'),
    file_name: z.string().optional().describe('Filename to search for in common directories (Downloads, Desktop, Documents, etc.). Use this when the user uploads a file in chat or mentions a filename without a full path.'),
    file_content: z.string().optional().describe('Base64-encoded file content. AVOID using this — prefer file_name search. Only use as last resort if file cannot be found locally.'),
    model: z.enum(['tiny', 'base', 'small', 'medium', 'large']).optional()
      .describe('Whisper model to use (default: best installed model)'),
    language: z.string().optional()
      .describe('Language code (e.g. "it", "en", "de") or "auto" for auto-detection. Default: auto'),
  },
  async ({ file_path: filePath, file_content: fileContent, file_name: fileName, model, language }) => {
    let actualPath = null;
    let tempFile = null;

    // Priority 1: explicit local path
    if (filePath && fs.existsSync(filePath)) {
      actualPath = filePath;
    }

    // Priority 2: search by filename in common directories
    if (!actualPath && fileName) {
      const found = findFileByName(fileName);
      if (found) actualPath = found;
    }

    // Priority 3: try file_path as a filename to search for
    if (!actualPath && filePath) {
      const found = findFileByName(path.basename(filePath));
      if (found) actualPath = found;
    }

    // Priority 4: base64 content (last resort)
    if (!actualPath && fileContent) {
      if (!fileName) fileName = `upload_${Date.now()}.wav`;
      const ext = path.extname(fileName) || '.wav';
      tempFile = path.join(os.tmpdir(), `mcp_upload_${Date.now()}${ext}`);
      try {
        fs.writeFileSync(tempFile, Buffer.from(fileContent, 'base64'));
        actualPath = tempFile;
      } catch (e) {
        return { content: [{ type: 'text', text: `Errore salvataggio file: ${e.message}` }], isError: true };
      }
    }

    if (!actualPath) {
      // Give helpful error with recent files list
      const recent = listRecentAudioVideo(24 * 60 * 60 * 1000).slice(0, 5);
      let hint = '';
      if (recent.length > 0) {
        hint = '\n\nFile audio/video recenti trovati:\n' + recent.map(f => `- ${f.name} (${f.path})`).join('\n');
      }
      return { content: [{ type: 'text', text: `Errore: file non trovato. Assicurati che il file sia in Downloads, Desktop o Documenti.${hint}` }], isError: true };
    }

    const modelName = model || getBestInstalledModel();
    const lang = language || 'auto';

    try {
      const result = await runTranscription(actualPath, modelName, lang);

      // Save to database
      const d = getDb();
      const dbFilename = fileName || path.basename(actualPath);
      let fileSize = 0;
      try { fileSize = fs.statSync(actualPath).size; } catch {}

      const duration = result.words.length > 0
        ? result.words[result.words.length - 1].end
        : 0;

      const stmt = d.prepare(`
        INSERT INTO transcriptions (filename, file_path, duration_seconds, language, model_used, full_text, words_json, file_size_bytes, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'done')
      `);
      const dbResult = stmt.run(dbFilename, filePath || '(uploaded)', duration, lang, modelName, result.text, JSON.stringify(result.words), fileSize);

      // Clean up temp file
      if (tempFile && fs.existsSync(tempFile)) fs.unlinkSync(tempFile);

      const wordCount = result.words.length;
      const durationStr = duration > 0 ? ` (${Math.floor(duration / 60)}m ${Math.round(duration % 60)}s)` : '';

      return {
        content: [{
          type: 'text',
          text: `Trascrizione completata${durationStr} — ${wordCount} parole, modello: ${modelName}, lingua: ${lang}\nSalvata nel database (id: ${dbResult.lastInsertRowid})\n\n${result.text}`,
        }],
      };
    } catch (e) {
      // Clean up temp file on error
      if (tempFile && fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
      return { content: [{ type: 'text', text: `Errore: ${e.message}` }], isError: true };
    }
  }
);

// --- Tool: list_transcriptions ---

server.tool(
  'list_transcriptions',
  'Search or list transcriptions from the DenkHub Transcriber history. Supports full-text search across filenames, text content, language, and model.',
  {
    search: z.string().optional().describe('Search query (full-text search). Omit to list all.'),
    limit: z.number().optional().describe('Max results to return (default: 20)'),
    offset: z.number().optional().describe('Offset for pagination (default: 0)'),
  },
  async ({ search, limit = 20, offset = 0 }) => {
    const d = getDb();

    let items, total;
    if (search && search.trim()) {
      const query = search.trim().replace(/"/g, '""');
      items = d.prepare(`
        SELECT t.id, t.filename, t.created_at, t.duration_seconds, t.language, t.model_used,
               substr(t.full_text, 1, 200) as preview, t.status
        FROM transcriptions t
        JOIN transcriptions_fts fts ON t.id = fts.rowid
        WHERE transcriptions_fts MATCH ?
        ORDER BY t.created_at DESC LIMIT ? OFFSET ?
      `).all(`"${query}"`, limit, offset);
      total = d.prepare(`
        SELECT COUNT(*) as count FROM transcriptions t
        JOIN transcriptions_fts fts ON t.id = fts.rowid
        WHERE transcriptions_fts MATCH ?
      `).get(`"${query}"`).count;
    } else {
      items = d.prepare(`
        SELECT id, filename, created_at, duration_seconds, language, model_used,
               substr(full_text, 1, 200) as preview, status
        FROM transcriptions ORDER BY created_at DESC LIMIT ? OFFSET ?
      `).all(limit, offset);
      total = d.prepare(`SELECT COUNT(*) as count FROM transcriptions`).get().count;
    }

    const lines = items.map(t => {
      const dur = t.duration_seconds > 0
        ? `${Math.floor(t.duration_seconds / 60)}m${Math.round(t.duration_seconds % 60)}s`
        : '?';
      return `[${t.id}] ${t.filename} — ${t.created_at} — ${dur} — ${t.model_used} — ${t.language || 'auto'}\n    ${t.preview}${t.preview && t.preview.length >= 200 ? '...' : ''}`;
    });

    return {
      content: [{
        type: 'text',
        text: `${total} trascrizioni trovate (mostrando ${items.length}):\n\n${lines.join('\n\n')}`,
      }],
    };
  }
);

// --- Tool: get_transcription ---

server.tool(
  'get_transcription',
  'Get the full text and word-level timestamps of a specific transcription by ID.',
  {
    id: z.number().describe('Transcription ID'),
    include_words: z.boolean().optional().describe('Include word-level timestamps (default: false, can be very long)'),
  },
  async ({ id, include_words = false }) => {
    const d = getDb();
    const t = d.prepare('SELECT * FROM transcriptions WHERE id = ?').get(id);

    if (!t) {
      return { content: [{ type: 'text', text: `Trascrizione con id ${id} non trovata.` }], isError: true };
    }

    const dur = t.duration_seconds > 0
      ? `${Math.floor(t.duration_seconds / 60)}m ${Math.round(t.duration_seconds % 60)}s`
      : 'sconosciuta';

    let text = `# ${t.filename}\n- ID: ${t.id}\n- Data: ${t.created_at}\n- Durata: ${dur}\n- Modello: ${t.model_used}\n- Lingua: ${t.language || 'auto'}\n- File: ${t.file_path || 'N/A'}\n\n## Testo\n${t.full_text}`;

    if (include_words) {
      try {
        const words = JSON.parse(t.words_json);
        if (words.length > 0) {
          const wordLines = words.map(w =>
            `[${w.start.toFixed(1)}s → ${w.end.toFixed(1)}s] ${w.word}`
          ).join('\n');
          text += `\n\n## Parole con timestamp (${words.length})\n${wordLines}`;
        }
      } catch {}
    }

    return { content: [{ type: 'text', text }] };
  }
);

// --- Tool: list_models ---

server.tool(
  'list_models',
  'List available Whisper models and their download status.',
  {},
  async () => {
    const settings = loadSettings();
    const modelsDir = settings.modelsDirectory;

    const lines = Object.entries(MODELS).map(([name, info]) => {
      const modelPath = path.join(modelsDir, info.file);
      const downloaded = fs.existsSync(modelPath);
      let status = downloaded ? 'scaricato' : 'non scaricato';
      if (downloaded) {
        try {
          const stat = fs.statSync(modelPath);
          if (stat.size < info.bytes * 0.99) status = 'incompleto';
        } catch {}
      }
      return `- **${name}** (${info.size}) — ${status}`;
    });

    return {
      content: [{
        type: 'text',
        text: `Modelli Whisper disponibili (directory: ${modelsDir}):\n\n${lines.join('\n')}\n\nModello predefinito: ${settings.lastUsedModel || 'base'}`,
      }],
    };
  }
);

// --- Tool: list_audio_files ---

server.tool(
  'list_audio_files',
  'List recent audio and video files found in common directories (Downloads, Desktop, Documents, Music, Movies). Useful to find the right file to transcribe.',
  {
    max_days: z.number().optional().describe('How many days back to search (default: 7)'),
  },
  async ({ max_days = 7 }) => {
    const files = listRecentAudioVideo(max_days * 24 * 60 * 60 * 1000);
    if (files.length === 0) {
      return { content: [{ type: 'text', text: 'Nessun file audio/video recente trovato.' }] };
    }

    const lines = files.map(f => {
      const sizeMB = (f.size / 1024 / 1024).toFixed(1);
      const date = new Date(f.modified).toLocaleString('it-IT');
      return `- **${f.name}** (${sizeMB} MB) — ${date}\n  ${f.path}`;
    });

    return {
      content: [{
        type: 'text',
        text: `${files.length} file audio/video trovati (ultimi ${max_days} giorni):\n\n${lines.join('\n\n')}`,
      }],
    };
  }
);

// --- Tool: download_model ---

server.tool(
  'download_model',
  'Download a Whisper model to use for transcription. The model will be available in the DenkHub Transcriber app as well. This can take a while for large models.',
  {
    model: z.enum(['tiny', 'base', 'small', 'medium', 'large'])
      .describe('Model to download: tiny (75MB), base (142MB), small (466MB), medium (1.5GB), large (3.1GB)'),
  },
  async ({ model: modelName }) => {
    const settings = loadSettings();
    const modelsDir = settings.modelsDirectory;
    const info = MODELS[modelName];
    if (!info) {
      return { content: [{ type: 'text', text: `Modello sconosciuto: ${modelName}` }], isError: true };
    }

    const finalPath = path.join(modelsDir, info.file);

    // Already downloaded?
    if (fs.existsSync(finalPath)) {
      try {
        const stat = fs.statSync(finalPath);
        if (stat.size >= info.bytes * 0.99) {
          return { content: [{ type: 'text', text: `Modello ${modelName} (${info.size}) già scaricato: ${finalPath}` }] };
        }
      } catch {}
    }

    // Ensure directory exists
    fs.mkdirSync(modelsDir, { recursive: true });

    const BASE_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main';
    const url = `${BASE_URL}/${info.file}`;
    const tempPath = finalPath + '.downloading';

    try {
      await downloadFile(url, tempPath, info.bytes);

      // Verify and rename
      const stat = fs.statSync(tempPath);
      if (stat.size < info.bytes * 0.99) {
        fs.unlinkSync(tempPath);
        return { content: [{ type: 'text', text: `Download incompleto: ${Math.round(stat.size / 1024 / 1024)}MB di ${info.size}. Riprova.` }], isError: true };
      }

      fs.renameSync(tempPath, finalPath);
      return {
        content: [{
          type: 'text',
          text: `Modello ${modelName} (${info.size}) scaricato con successo.\nPath: ${finalPath}\nOra disponibile sia nel server MCP che nell'app DenkHub Transcriber.`,
        }],
      };
    } catch (e) {
      try { fs.unlinkSync(tempPath); } catch {}
      return { content: [{ type: 'text', text: `Errore download: ${e.message}` }], isError: true };
    }
  }
);

// HTTP download helper with redirect + resume support
function downloadFile(url, destPath, expectedBytes) {
  const https = require('https');
  const http = require('http');

  return new Promise((resolve, reject) => {
    // Check for partial download (resume)
    let startBytes = 0;
    try { startBytes = fs.statSync(destPath).size; } catch {}

    function doRequest(reqUrl) {
      const parsedUrl = new URL(reqUrl);
      const proto = parsedUrl.protocol === 'https:' ? https : http;
      const headers = { 'User-Agent': 'DenkHub-Transcriber-MCP/1.2.0' };
      if (startBytes > 0) headers['Range'] = `bytes=${startBytes}-`;

      proto.get({ hostname: parsedUrl.hostname, path: parsedUrl.pathname + parsedUrl.search, headers }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          doRequest(res.headers.location);
          return;
        }
        if (startBytes > 0 && res.statusCode === 200) startBytes = 0; // server doesn't support range
        if (res.statusCode !== 200 && res.statusCode !== 206) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode}`));
        }

        const fileStream = fs.createWriteStream(destPath,
          startBytes > 0 && res.statusCode === 206 ? { flags: 'a' } : {}
        );

        res.pipe(fileStream);
        fileStream.on('finish', () => fileStream.close(() => resolve()));
        fileStream.on('error', reject);
        res.on('error', reject);
      }).on('error', reject);
    }

    doRequest(url);
  });
}

// --- Tool: export_srt ---

// SRT generation with intelligent segmentation (same logic as Electron app)
function wordsToSrt(words) {
  const MAX_WORDS = 12;
  const MAX_DURATION = 5;
  const GAP_THRESHOLD = 0.6;
  const SENTENCE_ENDS = /[.!?;:]$/;

  const subtitles = [];
  let current = [];
  let startTime = 0;

  function flush() {
    if (current.length === 0) return;
    const endTime = current[current.length - 1].end;
    const text = current.map(w => w.word).join(' ');
    subtitles.push({ start: startTime, end: endTime, text });
    current = [];
  }

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (current.length === 0) startTime = w.start;
    current.push(w);
    const duration = w.end - startTime;
    const nextWord = words[i + 1];
    const gap = nextWord ? nextWord.start - w.end : 0;
    const endsPhrase = SENTENCE_ENDS.test(w.word);
    if (current.length >= MAX_WORDS || duration >= MAX_DURATION || (endsPhrase && current.length >= 3) || gap >= GAP_THRESHOLD) {
      flush();
    }
  }
  flush();

  return subtitles.map((sub, i) => {
    const fmt = (sec) => {
      const h = Math.floor(sec / 3600);
      const m = Math.floor((sec % 3600) / 60);
      const s = Math.floor(sec % 60);
      const ms = Math.round((sec % 1) * 1000);
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
    };
    return `${i + 1}\n${fmt(sub.start)} --> ${fmt(sub.end)}\n${sub.text}\n`;
  }).join('\n');
}

server.tool(
  'export_srt',
  'Export a transcription as SRT subtitle file. Returns the SRT content and optionally saves it to disk.',
  {
    id: z.number().describe('Transcription ID to export'),
    save_path: z.string().optional().describe('Optional: absolute path to save the .srt file. If omitted, returns SRT content only.'),
  },
  async ({ id, save_path: savePath }) => {
    const d = getDb();
    const t = d.prepare('SELECT * FROM transcriptions WHERE id = ?').get(id);

    if (!t) {
      return { content: [{ type: 'text', text: `Trascrizione con id ${id} non trovata.` }], isError: true };
    }

    let words = [];
    try { words = JSON.parse(t.words_json); } catch {}

    if (words.length === 0) {
      return { content: [{ type: 'text', text: `Nessun timestamp disponibile per la trascrizione ${id}. Impossibile generare SRT.` }], isError: true };
    }

    const srt = wordsToSrt(words);

    if (savePath) {
      try {
        fs.writeFileSync(savePath, srt, 'utf8');
        return { content: [{ type: 'text', text: `SRT salvato in: ${savePath}\n\n${srt}` }] };
      } catch (e) {
        return { content: [{ type: 'text', text: `Errore salvataggio: ${e.message}\n\nContenuto SRT:\n${srt}` }], isError: true };
      }
    }

    return { content: [{ type: 'text', text: srt }] };
  }
);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[denkhub-transcriber-mcp] Server started');
}

main().catch(err => {
  console.error('[denkhub-transcriber-mcp] Fatal error:', err);
  process.exit(1);
});
