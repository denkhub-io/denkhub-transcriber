const { app, BrowserWindow, ipcMain, protocol, dialog, nativeImage } = require('electron');
const path = require('path');
const { registerIpcHandlers } = require('./ipc-handlers');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#000000',
    icon: path.join(__dirname, '..', '..', 'assets', 'icon.png'),
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 18 },
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  // Allow system audio capture via getDisplayMedia
  const { desktopCapturer, session } = require('electron');
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    desktopCapturer.getSources({ types: ['screen'] }).then((sources) => {
      callback({ video: sources[0], audio: 'loopback' });
    }).catch(() => {
      callback({});
    });
  });
}

// Register custom protocol for serving local media files
function registerMediaProtocol() {
  protocol.registerFileProtocol('media', (request, callback) => {
    const filePath = decodeURIComponent(request.url.replace('media://', ''));
    callback({ path: filePath });
  });
}

// Clear web cache when app version changes
async function clearCacheIfUpdated() {
  const fs = require('fs');
  const versionFile = path.join(app.getPath('userData'), '.last-version');
  const current = app.getVersion();
  let last = null;
  try { last = fs.readFileSync(versionFile, 'utf8').trim(); } catch {}
  if (last !== current) {
    const ses = require('electron').session.defaultSession;
    await ses.clearCache();
    await ses.clearStorageData({ storages: ['cachestorage', 'serviceworkers'] });
    fs.writeFileSync(versionFile, current, 'utf8');
    console.log(`[update] Cache cleared (${last} -> ${current})`);
  }
}

// Windows-only: move models/transcriptions out of Documents (and cloud-sync
// folders) where Defender's Controlled Folder Access blocks writes with
// EPERM. Empty paths are also normalized to the safe default so a freshly
// installed app can download without going through the wizard.
async function migrateUnsafePaths() {
  if (process.platform !== 'win32') return;
  const fs = require('fs');
  const os = require('os');
  const settings = require('./settings');

  const localApp = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  const safeBase = path.join(localApp, 'DenkHub Transcriber');
  const safeModels = path.join(safeBase, 'Modelli');
  const safeTranscriptions = path.join(safeBase, 'Trascrizioni');
  const docsRoot = path.resolve(app.getPath('documents')).toLowerCase();

  function isUnsafe(p) {
    if (!p) return true;
    const norm = path.resolve(p).toLowerCase();
    if (norm.startsWith(docsRoot)) return true;
    return /[\\/](onedrive|google ?drive|dropbox|icloud(drive)?)([\\/]|$)/i.test(p);
  }

  function moveFolder(src, dst) {
    if (!src || !fs.existsSync(src)) {
      fs.mkdirSync(dst, { recursive: true });
      return;
    }
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    if (!fs.existsSync(dst)) {
      try { fs.renameSync(src, dst); return; } catch (err) {
        if (!['EXDEV', 'EPERM', 'EACCES', 'EBUSY'].includes(err.code)) throw err;
      }
    }
    fs.mkdirSync(dst, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      const s = path.join(src, entry);
      const d = path.join(dst, entry);
      try {
        if (!fs.existsSync(d)) fs.cpSync(s, d, { recursive: true });
        fs.rmSync(s, { recursive: true, force: true });
      } catch {}
    }
    try { fs.rmdirSync(src); } catch {}
  }

  const pairs = [
    ['modelsDirectory', safeModels],
    ['transcriptionsDirectory', safeTranscriptions]
  ];
  for (const [key, safe] of pairs) {
    const current = await settings.get(key);
    if (!isUnsafe(current) || current === safe) continue;
    try { moveFolder(current, safe); } catch (err) {
      console.warn(`[migrate] ${key} move failed: ${err.message}`);
    }
    try { fs.mkdirSync(safe, { recursive: true }); } catch {}
    await settings.set(key, safe);
    console.log(`[migrate] ${key}: ${current || '(empty)'} -> ${safe}`);
  }
}

app.whenReady().then(async () => {
  // Set dock icon on macOS
  if (process.platform === 'darwin') {
    const iconPath = path.join(__dirname, '..', '..', 'assets', 'icon.png');
    const icon = nativeImage.createFromPath(iconPath);
    if (!icon.isEmpty()) app.dock.setIcon(icon);
  }

  await clearCacheIfUpdated();
  await migrateUnsafePaths();
  registerMediaProtocol();
  registerIpcHandlers(ipcMain, dialog);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

module.exports = { getMainWindow: () => mainWindow };
