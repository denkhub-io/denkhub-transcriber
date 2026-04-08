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
        filename: require('path').basename(options.filePath),
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
          database.completeTranscription(pendingId, {
            text: result.text || '',
            words: result.words,
            duration
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

    const win = BrowserWindow.getFocusedWindow();
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
  // --- Utility ---
  ipcMain.handle('app:open-external', (event, url) => {
    const { shell } = require('electron');
    shell.openExternal(url);
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

      // Open the downloaded file (DMG/installer)
      const { shell } = require('electron');
      shell.openPath(destPath);
      return { success: true, path: destPath };
    } catch (err) {
      console.error('[download-update] error:', err.message);
      return { success: false, error: err.message };
    }
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

      const dmgAsset = (release.assets || []).find(a => a.name.endsWith('.dmg') || a.name.endsWith('.exe'));
      return {
        version: latestVersion,
        url: release.html_url,
        downloadUrl: dmgAsset ? dmgAsset.browser_download_url : release.html_url,
        notes: release.body || ''
      };
    } catch {
      return null;
    }
  });
}

module.exports = { registerIpcHandlers };
