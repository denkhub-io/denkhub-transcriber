const fs = require('fs');
const path = require('path');
const https = require('https');
const settings = require('./settings');

const MODELS = {
  tiny:   { size: '75 MB',   bytes: 77691713,   file: 'ggml-tiny.bin' },
  base:   { size: '142 MB',  bytes: 147951465,  file: 'ggml-base.bin' },
  small:  { size: '466 MB',  bytes: 487601967,  file: 'ggml-small.bin' },
  medium: { size: '1.5 GB',  bytes: 1533774781, file: 'ggml-medium.bin' },
  large:  { size: '3.1 GB',  bytes: 3094623691,  file: 'ggml-large-v3.bin' }
};

const BASE_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main';

let activeDownload = null;

function getModelFileName(name) {
  const model = MODELS[name];
  return model ? model.file : `ggml-${name}.bin`;
}

function getModelPath(modelsDir, name) {
  return path.join(modelsDir, getModelFileName(name));
}

async function ensureDir(dir) {
  await fs.promises.mkdir(dir, { recursive: true });
}

// Old model files that should be cleaned up
const DEPRECATED_FILES = ['ggml-large-v3-turbo.bin'];

async function listModels() {
  const modelsDir = await settings.get('modelsDirectory');
  if (!modelsDir) return [];

  try {
    await ensureDir(modelsDir);
    const files = await fs.promises.readdir(modelsDir);

    // Clean up deprecated model files
    for (const oldFile of DEPRECATED_FILES) {
      if (files.includes(oldFile)) {
        try { await fs.promises.unlink(path.join(modelsDir, oldFile)); } catch {}
      }
    }

    const result = [];

    for (const [name, info] of Object.entries(MODELS)) {
      const filePath = getModelPath(modelsDir, name);
      const downloaded = files.includes(getModelFileName(name));
      let fileSize = 0;
      if (downloaded) {
        try {
          const stat = await fs.promises.stat(filePath);
          fileSize = stat.size;
        } catch {}
      }
      result.push({
        name,
        size: info.size,
        bytes: info.bytes,
        downloaded,
        fileSize,
        path: filePath
      });
    }
    return result;
  } catch {
    return [];
  }
}

function downloadModel(name, modelsDir, onProgress) {
  return new Promise((resolve, reject) => {
    const info = MODELS[name];
    if (!info) return reject(new Error(`Modello sconosciuto: ${name}`));

    const STALL_TIMEOUT = 30000; // 30s without data = stall
    const MAX_RETRIES = 5;

    ensureDir(modelsDir).then(async () => {
      const finalPath = getModelPath(modelsDir, name);
      const tempPath = finalPath + '.downloading';
      const url = `${BASE_URL}/${getModelFileName(name)}`;

      const controller = new AbortController();
      activeDownload = { name, controller };

      // Check existing partial download for resume
      let startBytes = 0;
      try {
        const stat = await fs.promises.stat(tempPath);
        startBytes = stat.size;
      } catch {}

      let attempt = 0;

      function tryDownload() {
        attempt++;

        function doRequest(requestUrl) {
          const parsedUrl = new URL(requestUrl);
          const headers = { 'User-Agent': 'DenkHub-Transcriber/1.0' };
          if (startBytes > 0) {
            headers['Range'] = `bytes=${startBytes}-`;
          }
          const options = {
            hostname: parsedUrl.hostname,
            path: parsedUrl.pathname + parsedUrl.search,
            headers
          };

          const req = https.get(options, (res) => {
            // Follow redirects
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
              res.resume();
              doRequest(res.headers.location);
              return;
            }

            // Server doesn't support Range — restart from zero
            if (startBytes > 0 && res.statusCode === 200) {
              startBytes = 0;
            }

            if (res.statusCode !== 200 && res.statusCode !== 206) {
              res.resume();
              reject(new Error(`HTTP ${res.statusCode}`));
              return;
            }

            const contentLength = parseInt(res.headers['content-length'], 10) || 0;
            const totalBytes = (res.statusCode === 206) ? startBytes + contentLength : contentLength || info.bytes;
            let downloadedBytes = startBytes;

            const fileStream = fs.createWriteStream(tempPath, startBytes > 0 && res.statusCode === 206 ? { flags: 'a' } : {});

            // Stall detection
            let stallTimer = setTimeout(() => handleStall(), STALL_TIMEOUT);

            function handleStall() {
              req.destroy();
              fileStream.close(() => {
                if (controller.signal.aborted) return;
                if (attempt < MAX_RETRIES) {
                  // Update startBytes from what we've written so far
                  try { startBytes = fs.statSync(tempPath).size; } catch { startBytes = downloadedBytes; }
                  tryDownload();
                } else {
                  activeDownload = null;
                  reject(new Error(`Download bloccato dopo ${MAX_RETRIES} tentativi. Riprova più tardi.`));
                }
              });
            }

            res.on('data', (chunk) => {
              clearTimeout(stallTimer);
              stallTimer = setTimeout(() => handleStall(), STALL_TIMEOUT);
              downloadedBytes += chunk.length;
              const percent = (downloadedBytes / totalBytes) * 100;
              onProgress({
                model: name,
                percent,
                downloadedBytes,
                totalBytes
              });
            });

            res.pipe(fileStream);

            fileStream.on('finish', () => {
              clearTimeout(stallTimer);
              fileStream.close(() => {
                // Verify file size before renaming
                const stat = fs.statSync(tempPath);
                if (totalBytes > 0 && stat.size < totalBytes * 0.99) {
                  // Incomplete but finished — retry with resume
                  if (attempt < MAX_RETRIES) {
                    startBytes = stat.size;
                    tryDownload();
                    return;
                  }
                  fs.unlink(tempPath, () => {});
                  activeDownload = null;
                  reject(new Error(`Download incompleto: ${Math.round(stat.size / 1024 / 1024)} MB di ${Math.round(totalBytes / 1024 / 1024)} MB. Riprova.`));
                  return;
                }
                // Rename temp to final
                fs.rename(tempPath, finalPath, (err) => {
                  activeDownload = null;
                  if (err) reject(err);
                  else resolve({ success: true, path: finalPath });
                });
              });
            });

            res.on('error', (err) => {
              clearTimeout(stallTimer);
              fileStream.close(() => {
                if (controller.signal.aborted) return;
                if (attempt < MAX_RETRIES) {
                  try { startBytes = fs.statSync(tempPath).size; } catch { startBytes = 0; }
                  tryDownload();
                } else {
                  fs.unlink(tempPath, () => {});
                  activeDownload = null;
                  reject(err);
                }
              });
            });
          });

          req.on('error', (err) => {
            if (controller.signal.aborted) return;
            if (attempt < MAX_RETRIES) {
              try { startBytes = fs.statSync(tempPath).size; } catch { startBytes = 0; }
              tryDownload();
            } else {
              fs.unlink(tempPath, () => {});
              activeDownload = null;
              reject(err);
            }
          });

          // Handle abort
          controller.signal.addEventListener('abort', () => {
            req.destroy();
            fs.unlink(tempPath, () => {});
            activeDownload = null;
            reject(new Error('Download annullato'));
          });
        }

        doRequest(url);
      }

      tryDownload();
    }).catch(reject);
  });
}

async function deleteModel(name) {
  const modelsDir = await settings.get('modelsDirectory');
  const filePath = getModelPath(modelsDir, name);
  try {
    await fs.promises.unlink(filePath);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function cancelDownload() {
  if (activeDownload) {
    activeDownload.controller.abort();
    activeDownload = null;
  }
}

module.exports = { listModels, downloadModel, deleteModel, cancelDownload, MODELS };
