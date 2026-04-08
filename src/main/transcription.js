const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const settings = require('./settings');
const whisperBinary = require('./whisper-binary');

// Resolve ffmpeg binary path
function getFfmpegPath() {
  const { app } = require('electron');
  const baseDir = path.join(__dirname, '..', '..');

  // 1. Check vendor directory (pre-bundled for Windows)
  if (process.platform === 'win32') {
    const vendorPaths = [
      process.resourcesPath ? path.join(process.resourcesPath, 'vendor', 'win32', 'ffmpeg.exe') : null,
      path.join(baseDir, 'vendor', 'win32', 'ffmpeg.exe'),
      path.join(baseDir.replace('app.asar', 'app.asar.unpacked'), 'vendor', 'win32', 'ffmpeg.exe')
    ].filter(Boolean);
    console.log('[ffmpeg] searching win32 paths:', vendorPaths.map(p => `${p} (${fs.existsSync(p) ? 'EXISTS' : 'missing'})`));
    for (const p of vendorPaths) {
      if (fs.existsSync(p)) return p;
    }
  }

  // 2. Check user-local downloaded ffmpeg
  const localName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  const localPath = path.join(app.getPath('userData'), 'ffmpeg-bin', localName);
  if (fs.existsSync(localPath)) return localPath;

  // 3. Check bundled ffmpeg-static (macOS)
  try {
    let ffmpegPath = require('ffmpeg-static');
    if (ffmpegPath.includes('app.asar')) {
      ffmpegPath = ffmpegPath.replace('app.asar', 'app.asar.unpacked');
    }
    if (fs.existsSync(ffmpegPath)) return ffmpegPath;
  } catch {}

  // 4. Check system PATH
  const { execFileSync } = require('child_process');
  try {
    const cmd = process.platform === 'win32' ? 'where' : 'which';
    const result = execFileSync(cmd, ['ffmpeg'], { encoding: 'utf8' }).trim();
    if (result) return result.split('\n')[0].trim();
  } catch {}

  return null;
}

// Download ffmpeg for Windows if not found
async function ensureFfmpeg(onProgress) {
  if (getFfmpegPath()) return getFfmpegPath();

  if (process.platform !== 'win32') {
    throw new Error('ffmpeg non trovato. Installa ffmpeg sul sistema.');
  }

  onProgress({ stage: 'Scaricamento ffmpeg...' });
  console.log('[transcribe] ffmpeg not found, downloading...');

  const { app } = require('electron');
  const ffmpegDir = path.join(app.getPath('userData'), 'ffmpeg-bin');
  await fs.promises.mkdir(ffmpegDir, { recursive: true });

  // Download ffmpeg essentials from gyan.dev (widely used Windows builds)
  const zipUrl = 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip';
  const zipPath = path.join(ffmpegDir, 'ffmpeg.zip');

  await downloadFile(zipUrl, zipPath, (pct) => {
    onProgress({ stage: `Scaricamento ffmpeg... ${Math.round(pct)}%`, percent: pct });
  });

  onProgress({ stage: 'Estrazione ffmpeg...', percent: 95 });

  // Extract using PowerShell
  await new Promise((resolve, reject) => {
    const { execFile: ef } = require('child_process');
    ef('powershell', ['-Command', `Expand-Archive -Path "${zipPath}" -DestinationPath "${ffmpegDir}" -Force`],
      { timeout: 120000 }, (err) => { if (err) reject(err); else resolve(); });
  });

  // Find ffmpeg.exe in extracted files
  const found = findFileRecursive(ffmpegDir, 'ffmpeg.exe');
  if (!found) throw new Error('ffmpeg.exe non trovato nell\'archivio');

  const destPath = path.join(ffmpegDir, 'ffmpeg.exe');
  if (found !== destPath) {
    await fs.promises.copyFile(found, destPath);
  }

  // Cleanup zip
  await fs.promises.unlink(zipPath).catch(() => {});

  console.log('[transcribe] ffmpeg downloaded to:', destPath);
  return destPath;
}

function downloadFile(url, destPath, onProgress) {
  return new Promise((resolve, reject) => {
    function doGet(reqUrl) {
      const parsedUrl = new URL(reqUrl);
      const mod = parsedUrl.protocol === 'https:' ? require('https') : require('http');
      mod.get({ hostname: parsedUrl.hostname, path: parsedUrl.pathname + parsedUrl.search, headers: { 'User-Agent': 'DenkHub-Transcriber/1.0' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          doGet(res.headers.location);
          return;
        }
        if (res.statusCode !== 200) { res.resume(); reject(new Error(`HTTP ${res.statusCode}`)); return; }
        const total = parseInt(res.headers['content-length'], 10) || 0;
        let dl = 0;
        const file = fs.createWriteStream(destPath);
        res.on('data', chunk => { dl += chunk.length; if (total && onProgress) onProgress((dl / total) * 90); });
        res.pipe(file);
        file.on('finish', () => file.close(() => resolve()));
        file.on('error', reject);
      }).on('error', reject);
    }
    doGet(url);
  });
}

function findFileRecursive(dir, filename) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isFile() && entry.name === filename) return fullPath;
      if (entry.isDirectory()) {
        const found = findFileRecursive(fullPath, filename);
        if (found) return found;
      }
    }
  } catch {}
  return null;
}

// Extract audio to 16kHz mono WAV
function extractAudio(inputPath, outputPath, ffmpegPath) {
  return new Promise((resolve, reject) => {
    const ffmpeg = ffmpegPath;
    if (!ffmpeg) return reject(new Error('ffmpeg non trovato'));

    const args = [
      '-i', inputPath,
      '-vn',           // no video
      '-ar', '16000',  // 16kHz
      '-ac', '1',      // mono
      '-f', 'wav',     // WAV format
      '-y',            // overwrite
      outputPath
    ];

    execFile(ffmpeg, args, { timeout: 300000 }, (err, stdout, stderr) => {
      if (err) reject(new Error(`ffmpeg error: ${stderr || err.message}`));
      else resolve(outputPath);
    });
  });
}

// Check if file needs audio conversion (everything except WAV 16kHz)
function needsConversion(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  // whisper-cli only reads WAV natively — convert everything else
  return ext !== '.wav';
}

// Transcribe audio file using whisper-cli
async function transcribe(options, onProgress) {
  const { filePath, model, language } = options;
  const modelsDir = await settings.get('modelsDirectory');

  // Find or download whisper-cli
  let whisperCli = whisperBinary.findBinary();
  if (!whisperCli) {
    onProgress({ stage: 'Scaricamento motore di trascrizione...' });
    console.log('[transcribe] whisper-cli not found, downloading...');
    whisperCli = await whisperBinary.downloadBinary(onProgress);
  }
  console.log('[transcribe] whisper-cli path:', whisperCli);

  // Model file names
  const MODEL_FILES = {
    tiny: 'ggml-tiny.bin', base: 'ggml-base.bin', small: 'ggml-small.bin',
    medium: 'ggml-medium.bin', large: 'ggml-large-v3.bin'
  };
  const modelFileName = MODEL_FILES[model] || `ggml-${model}.bin`;
  const modelFile = path.join(modelsDir, modelFileName);
  console.log('[transcribe] model file:', modelFile, 'exists:', fs.existsSync(modelFile));
  if (!fs.existsSync(modelFile)) throw new Error(`Modello "${model}" non trovato. Scaricalo dalla sezione Modelli.`);

  // Check model file integrity (detect incomplete downloads)
  const modelManager = require('./model-manager');
  const modelInfo = modelManager.MODELS[model];
  if (modelInfo) {
    const modelStat = fs.statSync(modelFile);
    if (modelStat.size < modelInfo.bytes * 0.99) {
      throw new Error(`Il modello "${model}" sembra corrotto o incompleto (${Math.round(modelStat.size / 1024 / 1024)} MB di ${modelInfo.size}). Eliminalo e riscaricalo dalla sezione Modelli.`);
    }
  }

  console.log('[transcribe] input file:', filePath, 'exists:', fs.existsSync(filePath));
  if (!fs.existsSync(filePath)) throw new Error('File non trovato: ' + filePath);

  onProgress({ stage: 'Preparazione file...' });

  // Convert to WAV if needed (whisper-cli only reads WAV)
  let audioPath = filePath;
  let tempWav = null;

  if (needsConversion(filePath)) {
    onProgress({ stage: 'Conversione audio in formato WAV...' });
    const ffmpegPath = await ensureFfmpeg(onProgress);
    tempWav = path.join(require('os').tmpdir(), `transcriber_${Date.now()}.wav`);
    console.log('[transcribe] converting to WAV:', tempWav);
    await extractAudio(filePath, tempWav, ffmpegPath);
    audioPath = tempWav;
  }

  onProgress({ stage: 'Trascrizione in corso...' });

  // Build whisper-cli arguments
  const args = [
    '-m', modelFile,
    '-f', audioPath,
    '-l', language === 'auto' ? 'auto' : language,
    '-ojf',             // output JSON full (with word timestamps)
    '-t', String(Math.max(2, require('os').cpus().length - 2)) // threads
  ];

  console.log('[transcribe] running:', whisperCli, args.join(' '));

  return new Promise((resolve, reject) => {
    const proc = execFile(whisperCli, args, {
      timeout: 600000, // 10 min max
      maxBuffer: 50 * 1024 * 1024 // 50MB buffer for large outputs
    }, (err, stdout, stderr) => {
      console.log('[transcribe] done. err:', err ? err.message : 'none');
      console.log('[transcribe] stdout length:', stdout ? stdout.length : 0);
      console.log('[transcribe] stderr:', stderr ? stderr.substring(0, 500) : 'none');
      // Clean up temp file
      if (tempWav && fs.existsSync(tempWav)) {
        fs.unlink(tempWav, () => {});
      }

      if (err) {
        return reject(new Error(`Trascrizione fallita: ${stderr || err.message}`));
      }

      try {
        const result = parseWhisperOutput(stdout, filePath);
        resolve(result);
      } catch (parseErr) {
        // If JSON parsing fails, try to extract text from stdout
        resolve({
          success: true,
          text: stdout.trim(),
          words: [],
          audioPath: filePath
        });
      }
    });
  });
}

// Parse whisper-cli JSON full output into our format
function parseWhisperOutput(stdout, originalFilePath) {
  // whisper-cli with -ojf writes a .json file next to the input
  // But with stdout, it outputs the transcription text
  // We need to read the JSON file it creates

  // Actually, -ojf outputs to a file. Let's parse the text output and
  // also check for the JSON file
  let text = '';
  let words = [];

  // Try to find and read the JSON output file
  // whisper-cli creates <inputfile>.json when using -ojf
  const possibleJsonPaths = [
    originalFilePath + '.json',
    originalFilePath.replace(/\.[^.]+$/, '.json')
  ];

  // Also check temp dir for extracted audio json
  const tmpDir = require('os').tmpdir();
  const tmpJsonFiles = fs.readdirSync(tmpDir)
    .filter(f => f.startsWith('transcriber_') && f.endsWith('.wav.json'))
    .map(f => path.join(tmpDir, f))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);

  if (tmpJsonFiles.length > 0) {
    possibleJsonPaths.unshift(tmpJsonFiles[0]);
  }

  for (const jsonPath of possibleJsonPaths) {
    if (fs.existsSync(jsonPath)) {
      try {
        const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        const result = parseWhisperJson(jsonData, originalFilePath);
        // Clean up JSON file
        fs.unlink(jsonPath, () => {});
        return result;
      } catch {}
    }
  }

  // Fallback: parse stdout text
  text = stdout.replace(/\[[\d:.]+\s*-->\s*[\d:.]+\]\s*/g, '').trim();
  return {
    success: true,
    text,
    words: [],
    audioPath: originalFilePath
  };
}

// Check if a token is a special whisper token (timestamps, markers, etc.)
function isSpecialToken(text) {
  if (!text) return true;
  // Filter: [_TT_xxx], [_BEG_], [_SOT_], [_EOT_], [_BLANK_], [_NO_SPEECH_], etc.
  return /^\[.*\]$/.test(text.trim());
}

// Parse whisper.cpp JSON full format — merge BPE tokens into whole words
function parseWhisperJson(data, originalFilePath) {
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

          // Token starting with space = new word
          // Token without leading space = continuation of current word
          const startsNewWord = text.startsWith(' ');

          if (startsNewWord) {
            // Save previous word if exists
            if (currentWord) {
              words.push(currentWord);
            }
            // Start new word (trim the leading space)
            currentWord = {
              word: text.trimStart(),
              start: startMs / 1000,
              end: endMs / 1000
            };
          } else {
            // Continuation — append to current word
            if (currentWord) {
              currentWord.word += text;
              currentWord.end = endMs / 1000;
            } else {
              // First token without space (rare, start of segment)
              currentWord = {
                word: text,
                start: startMs / 1000,
                end: endMs / 1000
              };
            }
          }
        }

        // Don't forget the last word in the segment
        if (currentWord) {
          words.push(currentWord);
          currentWord = null;
        }
      }
      if (segment.text) {
        fullText += segment.text;
      }
    }
  }

  // Clean full text from special tokens
  fullText = fullText.replace(/\[_[A-Z_]+_?\d*\]/g, '').replace(/\s+/g, ' ').trim();

  return {
    success: true,
    text: fullText,
    words,
    audioPath: originalFilePath
  };
}

module.exports = { transcribe };
