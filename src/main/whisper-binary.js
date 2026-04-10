const fs = require('fs');
const path = require('path');
const https = require('https');
const { app } = require('electron');

// Where we store the downloaded binary
function getBinaryDir() {
  return path.join(app.getPath('userData'), 'whisper-bin');
}

function getBinaryPath() {
  const dir = getBinaryDir();
  const name = process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli';
  return path.join(dir, name);
}

// Check bundled binaries
function getBundledBinaryPath() {
  const execName = process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli';
  const baseDir = path.join(__dirname, '..', '..');

  const possiblePaths = [];
  const platformDir = process.platform === 'win32' ? 'win32' : 'darwin';

  // Vendor directory (extraResources lands in process.resourcesPath)
  if (process.resourcesPath) {
    possiblePaths.push(path.join(process.resourcesPath, 'vendor', platformDir, execName));
  }
  // Dev mode / direct run
  possiblePaths.push(path.join(baseDir, 'vendor', platformDir, execName));
  // asar-unpacked fallback
  possiblePaths.push(path.join(baseDir.replace('app.asar', 'app.asar.unpacked'), 'vendor', platformDir, execName));

  console.log(`[whisper-binary] searching ${platformDir} paths:`, possiblePaths.map(p => `${p} (${fs.existsSync(p) ? 'EXISTS' : 'missing'})`));

  // nodejs-whisper compiled binary (legacy fallback)
  const cppBase = path.join(baseDir, 'node_modules', 'nodejs-whisper', 'cpp', 'whisper.cpp');
  possiblePaths.push(
    path.join(cppBase, 'build', 'bin', execName),
    path.join(cppBase, 'build', 'bin', 'Release', execName)
  );
  const cppBaseUnpacked = cppBase.replace('app.asar', 'app.asar.unpacked');
  possiblePaths.push(
    path.join(cppBaseUnpacked, 'build', 'bin', execName),
    path.join(cppBaseUnpacked, 'build', 'bin', 'Release', execName)
  );

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

// Find a working whisper-cli binary
function findBinary() {
  // First check bundled vendor binaries (most reliable for packaged app)
  const bundled = getBundledBinaryPath();
  if (bundled) {
    console.log('[whisper-binary] found bundled:', bundled);
    return bundled;
  }

  // Then check user-local downloaded binary
  const downloaded = getBinaryPath();
  if (fs.existsSync(downloaded)) {
    console.log('[whisper-binary] found downloaded:', downloaded);
    return downloaded;
  }

  console.log('[whisper-binary] not found anywhere');
  return null;
}

// Check if binary exists and is usable
function isBinaryReady() {
  return findBinary() !== null;
}

// Download the correct binary for this platform
async function downloadBinary(onProgress) {
  if (process.platform !== 'win32') {
    throw new Error('Il download automatico del binario è supportato solo su Windows. Su macOS viene compilato automaticamente.');
  }

  const RELEASE_URL = 'https://api.github.com/repos/ggerganov/whisper.cpp/releases?per_page=1';
  const assetName = 'whisper-bin-x64.zip';

  // Get latest release download URL
  const releaseData = await httpGetJson(RELEASE_URL);
  const release = releaseData[0];
  const asset = release.assets.find(a => a.name === assetName);
  if (!asset) throw new Error(`Asset ${assetName} non trovato nella release ${release.tag_name}`);

  const downloadUrl = asset.browser_download_url;
  const dir = getBinaryDir();
  await fs.promises.mkdir(dir, { recursive: true });

  const zipPath = path.join(dir, 'whisper-bin.zip');

  // Download zip
  await httpDownload(downloadUrl, zipPath, (pct) => {
    if (onProgress) onProgress({ stage: `Scaricamento whisper-cli... ${Math.round(pct)}%`, percent: pct });
  });

  // Extract zip
  if (onProgress) onProgress({ stage: 'Estrazione whisper-cli...', percent: 95 });
  await extractZip(zipPath, dir);

  // Clean up zip
  await fs.promises.unlink(zipPath).catch(() => {});

  // Verify binary exists
  const binaryPath = getBinaryPath();
  if (!fs.existsSync(binaryPath)) {
    // The zip might extract into a subdirectory, search for it
    const found = findFileRecursive(dir, process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli');
    if (found) {
      await fs.promises.copyFile(found, binaryPath);
    } else {
      throw new Error('whisper-cli non trovato nell\'archivio scaricato');
    }
  }

  // Make executable (Unix)
  if (process.platform !== 'win32') {
    await fs.promises.chmod(binaryPath, 0o755);
  }

  if (onProgress) onProgress({ stage: 'whisper-cli pronto!', percent: 100 });
  return binaryPath;
}

// --- Helpers ---

function httpGetJson(url) {
  return new Promise((resolve, reject) => {
    const options = { headers: { 'User-Agent': 'DenkHub-Transcriber/1.0' } };
    function doGet(reqUrl) {
      const parsedUrl = new URL(reqUrl);
      https.get({ hostname: parsedUrl.hostname, path: parsedUrl.pathname + parsedUrl.search, headers: options.headers }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          doGet(res.headers.location);
          return;
        }
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
        });
      }).on('error', reject);
    }
    doGet(url);
  });
}

function httpDownload(url, destPath, onProgress) {
  return new Promise((resolve, reject) => {
    function doGet(reqUrl) {
      const parsedUrl = new URL(reqUrl);
      https.get({ hostname: parsedUrl.hostname, path: parsedUrl.pathname + parsedUrl.search, headers: { 'User-Agent': 'DenkHub-Transcriber/1.0' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          doGet(res.headers.location);
          return;
        }
        if (res.statusCode !== 200) { res.resume(); reject(new Error(`HTTP ${res.statusCode}`)); return; }

        const totalBytes = parseInt(res.headers['content-length'], 10) || 0;
        let downloaded = 0;
        const file = fs.createWriteStream(destPath);

        res.on('data', chunk => {
          downloaded += chunk.length;
          if (totalBytes && onProgress) onProgress((downloaded / totalBytes) * 90);
        });
        res.pipe(file);
        file.on('finish', () => file.close(() => resolve()));
        file.on('error', reject);
      }).on('error', reject);
    }
    doGet(url);
  });
}

function extractZip(zipPath, destDir) {
  // Use Node.js built-in zlib + a simple unzip
  const { execFile } = require('child_process');

  if (process.platform === 'win32') {
    // Use PowerShell on Windows
    return new Promise((resolve, reject) => {
      execFile('powershell', ['-Command', `Expand-Archive -Path "${zipPath}" -DestinationPath "${destDir}" -Force`], (err) => {
        if (err) reject(err); else resolve();
      });
    });
  } else {
    // Use unzip on macOS/Linux
    return new Promise((resolve, reject) => {
      execFile('unzip', ['-o', zipPath, '-d', destDir], (err) => {
        if (err) reject(err); else resolve();
      });
    });
  }
}

function findFileRecursive(dir, filename) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isFile() && entry.name === filename) return fullPath;
    if (entry.isDirectory()) {
      const found = findFileRecursive(fullPath, filename);
      if (found) return found;
    }
  }
  return null;
}

module.exports = { findBinary, isBinaryReady, downloadBinary, getBinaryPath };
