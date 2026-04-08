const fs = require('fs');
const path = require('path');
const https = require('https');
const settings = require('./settings');

const MODELS = {
  tiny:   { size: '75 MB',   bytes: 77691713,   file: 'ggml-tiny.bin' },
  base:   { size: '142 MB',  bytes: 147951465,  file: 'ggml-base.bin' },
  small:  { size: '466 MB',  bytes: 487601967,  file: 'ggml-small.bin' },
  medium: { size: '1.5 GB',  bytes: 1533774781, file: 'ggml-medium.bin' },
  large:  { size: '1.5 GB',  bytes: 1624555275,  file: 'ggml-large-v3-turbo.bin' }
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

async function listModels() {
  const modelsDir = await settings.get('modelsDirectory');
  if (!modelsDir) return [];

  try {
    await ensureDir(modelsDir);
    const files = await fs.promises.readdir(modelsDir);
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

    ensureDir(modelsDir).then(() => {
      const finalPath = getModelPath(modelsDir, name);
      const tempPath = finalPath + '.downloading';
      const url = `${BASE_URL}/${getModelFileName(name)}`;

      const controller = new AbortController();
      activeDownload = { name, controller };

      function doRequest(requestUrl) {
        const parsedUrl = new URL(requestUrl);
        const options = {
          hostname: parsedUrl.hostname,
          path: parsedUrl.pathname + parsedUrl.search,
          headers: { 'User-Agent': 'DenkHub-Transcriber/1.0' }
        };

        const req = https.get(options, (res) => {
          // Follow redirects
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            res.resume();
            doRequest(res.headers.location);
            return;
          }

          if (res.statusCode !== 200) {
            res.resume();
            reject(new Error(`HTTP ${res.statusCode}`));
            return;
          }

          const totalBytes = parseInt(res.headers['content-length'], 10) || info.bytes;
          let downloadedBytes = 0;

          const fileStream = fs.createWriteStream(tempPath);

          res.on('data', (chunk) => {
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
            fileStream.close(() => {
              // Verify file size before renaming
              const stat = fs.statSync(tempPath);
              if (totalBytes > 0 && stat.size < totalBytes * 0.99) {
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
            fileStream.close();
            fs.unlink(tempPath, () => {});
            activeDownload = null;
            reject(err);
          });
        });

        req.on('error', (err) => {
          fs.unlink(tempPath, () => {});
          activeDownload = null;
          reject(err);
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
