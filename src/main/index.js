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

app.whenReady().then(async () => {
  // Set dock icon on macOS
  if (process.platform === 'darwin') {
    const iconPath = path.join(__dirname, '..', '..', 'assets', 'icon.png');
    const icon = nativeImage.createFromPath(iconPath);
    if (!icon.isEmpty()) app.dock.setIcon(icon);
  }

  await clearCacheIfUpdated();
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
