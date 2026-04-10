const { BrowserWindow } = require('electron');
const settings = require('./settings');
const modelManager = require('./model-manager');
const transcription = require('./transcription');
const whisperBinary = require('./whisper-binary');
const database = require('./database');

function registerIpcHandlers(ipcMain, dialog) {

  // --- Settings ---
  ipcMain.handle('settings:get', async () => {
    return await settings.getAll();
  });

  ipcMain.handle('settings:update', async (event, partial) => {
    return await settings.update(partial);
  });

  ipcMain.handle('settings:is-first-run', async () => {
    const val = await settings.get('setupComplete');
    return !val;
  });

  ipcMain.handle('settings:complete-setup', async () => {
    await settings.set('setupComplete', true);
    return true;
  });

  // --- Default paths ---
  ipcMain.handle('settings:default-path', (event, purpose) => {
    const { app } = require('electron');
    const path = require('path');
    const homeDir = app.getPath('documents');
    const base = path.join(homeDir, 'DenkHub Transcriber');
    if (purpose === 'models') return path.join(base, 'Modelli');
    return path.join(base, 'Trascrizioni');
  });

  // --- Dialogs ---
  ipcMain.handle('dialog:choose-directory', async (event, purpose) => {
    const win = BrowserWindow.getFocusedWindow();
    const result = await dialog.showOpenDialog(win, {
      title: purpose === 'models' ? 'Scegli cartella modelli' : 'Scegli cartella trascrizioni',
      properties: ['openDirectory', 'createDirectory']
    });
    if (result.canceled) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('dialog:open-file', async () => {
    const win = BrowserWindow.getFocusedWindow();
    const result = await dialog.showOpenDialog(win, {
      title: 'Seleziona file audio o video',
      filters: [
        { name: 'Audio/Video', extensions: ['mp3', 'wav', 'ogg', 'm4a', 'opus', 'mp4', 'mov', 'avi', 'mkv'] }
      ],
      properties: ['openFile']
    });
    if (result.canceled) return null;
    return {
      filePath: result.filePaths[0],
      fileName: require('path').basename(result.filePaths[0])
    };
  });

  // --- Models ---
  ipcMain.handle('models:list', async () => {
    const models = await modelManager.listModels();
    console.log('[models:list]', models.map(m => `${m.name}: ${m.downloaded}`).join(', '));
    return models;
  });

  ipcMain.handle('models:download', async (event, modelName) => {
    const modelsDir = await settings.get('modelsDirectory');
    if (!modelsDir) return { success: false, error: 'Cartella modelli non configurata' };

    const win = BrowserWindow.getFocusedWindow();
    try {
      const result = await modelManager.downloadModel(modelName, modelsDir, (progress) => {
        if (win && !win.isDestroyed()) {
          win.webContents.send('models:download-progress', progress);
        }
      });
      return result;
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('models:delete', async (event, modelName) => {
    return await modelManager.deleteModel(modelName);
  });

  ipcMain.handle('models:cancel-download', () => {
    modelManager.cancelDownload();
    return { success: true };
  });

  // --- Whisper binary ---
  ipcMain.handle('whisper:check', () => {
    return whisperBinary.isBinaryReady();
  });

  ipcMain.handle('whisper:download', async (event) => {
    const win = BrowserWindow.getFocusedWindow();
    try {
      await whisperBinary.downloadBinary((progress) => {
        if (win && !win.isDestroyed()) {
          win.webContents.send('whisper:download-progress', progress);
        }
      });
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // --- Transcription ---
  ipcMain.handle('transcribe:start', async (event, options) => {
    console.log('[transcribe:start] options:', JSON.stringify(options));
    const win = BrowserWindow.getFocusedWindow();

    // Create pending entry in DB immediately so it appears in history
    let pendingId = null;
    try {
      const fs = require('fs');
      let fileSize = 0;
      try { fileSize = fs.statSync(options.filePath).size; } catch {}

      pendingId = database.insertTranscription({
        filename: options.displayName || require('path').basename(options.filePath),
        filePath: options.filePath,
        language: options.language,
        model: options.model,
        fileSize,
        status: 'pending'
      });
      console.log('[transcribe] created pending entry, id:', pendingId);
    } catch (dbErr) {
      console.error('[transcribe] db pending error:', dbErr.message);
    }

    try {
      const result = await transcription.transcribe(options, (progress) => {
        if (win && !win.isDestroyed()) {
          win.webContents.send('transcribe:progress', progress);
        }
      });

      // Complete the pending entry
      if (result.success !== false && result.words && pendingId) {
        try {
          const duration = result.words.length > 0 ? result.words[result.words.length - 1].end : 0;

          // If trimmed audio, copy from /tmp/ to permanent location
          let permanentAudioPath = null;
          if (result.audioPath && result.audioPath !== options.filePath) {
            try {
              const fs = require('fs');
              const path = require('path');
              const { app } = require('electron');
              const audioDir = path.join(app.getPath('userData'), 'trimmed-audio');
              fs.mkdirSync(audioDir, { recursive: true });
              const dest = path.join(audioDir, `trim_${pendingId}_${Date.now()}.wav`);
              fs.copyFileSync(result.audioPath, dest);
              permanentAudioPath = dest;
              console.log('[transcribe] saved trimmed audio to:', dest);
            } catch (copyErr) {
              console.warn('[transcribe] could not save trimmed audio:', copyErr.message);
            }
          }

          database.completeTranscription(pendingId, {
            text: result.text || '',
            words: result.words,
            duration,
            audioPath: permanentAudioPath
          });
          result.id = pendingId;
          console.log('[transcribe] completed, id:', pendingId);
        } catch (dbErr) {
          console.error('[transcribe] db complete error:', dbErr.message);
        }
      }

      return result;
    } catch (err) {
      // Clean up failed pending entry
      if (pendingId) database.failTranscription(pendingId);
      return { success: false, error: err.message };
    }
  });

  // --- History ---
  ipcMain.handle('history:search', (event, options) => {
    return database.searchTranscriptions(options || {});
  });

  ipcMain.handle('history:get', (event, id) => {
    return database.getTranscription(id);
  });

  ipcMain.handle('history:update-name', (event, { id, filename }) => {
    return database.updateTranscriptionName(id, filename);
  });

  ipcMain.handle('history:update-words', (event, { id, words }) => {
    return database.updateTranscriptionWords(id, words);
  });

  ipcMain.handle('history:delete', (event, id) => {
    return database.deleteTranscription(id);
  });

  ipcMain.handle('history:export-txt', async (event, id) => {
    const item = database.getTranscription(id);
    if (!item) return { success: false, error: 'Trascrizione non trovata' };

    const win = BrowserWindow.fromWebContents(event.sender) || BrowserWindow.getFocusedWindow();
    const result = await dialog.showSaveDialog(win, {
      title: 'Esporta trascrizione',
      defaultPath: item.filename.replace(/\.[^.]+$/, '') + '.txt',
      filters: [{ name: 'Testo', extensions: ['txt'] }]
    });

    if (result.canceled) return { success: false };

    const fs = require('fs');
    fs.writeFileSync(result.filePath, item.full_text, 'utf8');
    return { success: true, path: result.filePath };
  });
  ipcMain.handle('history:export-srt', async (event, id) => {
    const item = database.getTranscription(id);
    if (!item) return { success: false, error: 'Trascrizione non trovata' };

    const words = JSON.parse(item.words_json || '[]');
    if (words.length === 0) return { success: false, error: 'Nessuna parola con timestamp' };

    const win = BrowserWindow.fromWebContents(event.sender) || BrowserWindow.getFocusedWindow();
    const result = await dialog.showSaveDialog(win, {
      title: 'Esporta sottotitoli SRT',
      defaultPath: item.filename.replace(/\.[^.]+$/, '') + '.srt',
      filters: [{ name: 'SubRip', extensions: ['srt'] }]
    });

    if (result.canceled) return { success: false };

    const srtContent = wordsToSrt(words);
    const fs = require('fs');
    fs.writeFileSync(result.filePath, srtContent, 'utf8');
    return { success: true, path: result.filePath };
  });

  // --- Changelog ---
  ipcMain.handle('app:should-show-changelog', async () => {
    const { app } = require('electron');
    const current = app.getVersion();
    const seen = await settings.get('lastChangelogSeen');
    return seen !== current;
  });

  ipcMain.handle('app:changelog-seen', async () => {
    const { app } = require('electron');
    await settings.set('lastChangelogSeen', app.getVersion());
    return true;
  });

  // --- Utility ---
  ipcMain.handle('app:open-external', (event, url) => {
    const { shell } = require('electron');
    shell.openExternal(url);
  });

  // --- Recording ---
  ipcMain.handle('recording:save', async (event, { buffer, ext }) => {
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    const ts = Date.now();
    const webmPath = path.join(os.tmpdir(), `recording_${ts}.${ext || 'webm'}`);
    const wavPath = path.join(os.tmpdir(), `recording_${ts}.wav`);
    fs.writeFileSync(webmPath, Buffer.from(buffer));

    // Convert to WAV for proper seeking/duration support
    try {
      const { ensureFfmpeg } = require('./transcription');
      const ffmpegPath = await ensureFfmpeg(() => {});
      await new Promise((resolve, reject) => {
        const { execFile } = require('child_process');
        execFile(ffmpegPath, [
          '-i', webmPath, '-vn', '-ar', '44100', '-ac', '1', '-f', 'wav', '-y', wavPath
        ], { timeout: 60000 }, (err) => {
          if (err) reject(err); else resolve();
        });
      });
      // Clean up WebM
      fs.unlink(webmPath, () => {});
      return wavPath;
    } catch (convErr) {
      console.warn('[recording] WAV conversion failed, using WebM:', convErr.message);
      return webmPath;
    }
  });

  // --- File read (for waveform rendering) ---
  ipcMain.handle('file:read-buffer', (event, filePath) => {
    const fs = require('fs');
    return fs.readFileSync(filePath);
  });

  // --- Download update ---
  ipcMain.handle('app:download-update', async (event, downloadUrl) => {
    const https = require('https');
    const fs = require('fs');
    const path = require('path');
    const { app } = require('electron');

    try {
      const downloadsDir = app.getPath('downloads');
      const fileName = path.basename(new URL(downloadUrl).pathname);
      const destPath = path.join(downloadsDir, fileName);

      await new Promise((resolve, reject) => {
        function doGet(url) {
          const parsedUrl = new URL(url);
          https.get({ hostname: parsedUrl.hostname, path: parsedUrl.pathname + parsedUrl.search, headers: { 'User-Agent': 'DenkHub-Transcriber' } }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
              res.resume();
              doGet(res.headers.location);
              return;
            }
            if (res.statusCode !== 200) { res.resume(); reject(new Error(`HTTP ${res.statusCode}`)); return; }
            const file = fs.createWriteStream(destPath);
            res.pipe(file);
            file.on('finish', () => file.close(resolve));
            file.on('error', reject);
          }).on('error', reject);
        }
        doGet(downloadUrl);
      });

      return { success: true, path: destPath };
    } catch (err) {
      console.error('[download-update] error:', err.message);
      return { success: false, error: err.message };
    }
  });

  // --- Install update: open installer and quit app ---
  ipcMain.handle('app:install-update', async (event, filePath) => {
    const { shell, app } = require('electron');
    shell.openPath(filePath);
    // Give the OS a moment to mount/open the installer before quitting
    setTimeout(() => app.quit(), 1000);
  });

  // --- Update check ---
  ipcMain.handle('app:check-update', async () => {
    const https = require('https');
    const { app } = require('electron');
    const currentVersion = app.getVersion();

    try {
      const release = await new Promise((resolve, reject) => {
        const options = {
          hostname: 'api.github.com',
          path: '/repos/denkhub-io/denkhub-transcriber/releases/latest',
          headers: { 'User-Agent': 'DenkHub-Transcriber/' + currentVersion }
        };
        https.get(options, (res) => {
          if (res.statusCode === 404) return resolve(null);
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            try { resolve(JSON.parse(data)); } catch { resolve(null); }
          });
        }).on('error', () => resolve(null));
      });

      if (!release || !release.tag_name) return null;

      const latestVersion = release.tag_name.replace(/^v/, '');
      if (latestVersion === currentVersion) return null;

      // Simple semver compare
      const cur = currentVersion.split('.').map(Number);
      const lat = latestVersion.split('.').map(Number);
      const isNewer = lat[0] > cur[0] || (lat[0] === cur[0] && lat[1] > cur[1]) || (lat[0] === cur[0] && lat[1] === cur[1] && lat[2] > cur[2]);

      if (!isNewer) return null;

      const ext = process.platform === 'win32' ? '.exe' : '.dmg';
      const asset = (release.assets || []).find(a => a.name.endsWith(ext));
      return {
        version: latestVersion,
        url: release.html_url,
        downloadUrl: asset ? asset.browser_download_url : release.html_url,
        notes: release.body || ''
      };
    } catch {
      return null;
    }
  });
}

// --- SRT generation with intelligent segmentation ---
function wordsToSrt(words) {
  const MAX_WORDS = 12;
  const MAX_DURATION = 5;    // max seconds per subtitle
  const GAP_THRESHOLD = 0.6; // seconds of silence = new subtitle
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

    if (current.length === 0) {
      startTime = w.start;
    }

    current.push(w);

    const duration = w.end - startTime;
    const nextWord = words[i + 1];
    const gap = nextWord ? nextWord.start - w.end : 0;
    const endsPhrase = SENTENCE_ENDS.test(w.word);

    // Break conditions
    if (
      current.length >= MAX_WORDS ||
      duration >= MAX_DURATION ||
      (endsPhrase && current.length >= 3) ||
      gap >= GAP_THRESHOLD
    ) {
      flush();
    }
  }

  flush();

  // Format SRT
  return subtitles.map((sub, i) => {
    return `${i + 1}\n${formatSrtTime(sub.start)} --> ${formatSrtTime(sub.end)}\n${sub.text}\n`;
  }).join('\n');
}

function formatSrtTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

module.exports = { registerIpcHandlers };
