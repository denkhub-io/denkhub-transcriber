/**
 * Speaker diarization via sherpa-onnx-node.
 *
 * Pipeline (mirrors DenkHub Video's pyannote-based flow):
 *   1. Whisper produces word-level timestamps (already done before us).
 *   2. We feed the same 16 kHz mono WAV to sherpa-onnx's
 *      OfflineSpeakerDiarization, which runs:
 *         - pyannote segmentation 3.0 (~6 MB ONNX) → speaker-change boundaries
 *         - CAM++ multilingual embedding (~28 MB ONNX) → speaker vectors
 *         - clustering with either fixed numClusters or auto threshold
 *      and returns [{ start, end, speaker: <int> }].
 *   3. assignSpeakersToWords() tags each word by midpoint-in-segment, falling
 *      back to nearest segment by center distance (same heuristic as the
 *      Swift app). Speaker ints are remapped to "S1", "S2", … in
 *      first-appearance order so downstream rendering is stable.
 *
 * Cross-platform notes:
 *   - sherpa-onnx-node ships prebuilt binaries via optionalDependencies for
 *     darwin-arm64/x64 and win-x64/ia32, so `npm install` is enough on both
 *     macOS and Windows. Electron uses N-API so the prebuilds are ABI-stable.
 *   - The tar.bz2 segmentation archive is unpacked with the system `tar`,
 *     which on macOS and Windows 10/11 is libarchive-backed and auto-detects
 *     bz2. (If a future Windows build hits an environment without `tar`,
 *     swap to a JS-side tar-stream/bz2 reader.)
 *   - Models live under app.getPath('userData')/diarization-models/ to stay
 *     out of the Documents/cloud-sync trap (same reasoning as v1.2.5).
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execFile } = require('child_process');
const { app } = require('electron');

// --- Model metadata -------------------------------------------------------

const SEG_NAME = 'sherpa-onnx-pyannote-segmentation-3-0';
const SEG_URL = `https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-segmentation-models/${SEG_NAME}.tar.bz2`;
const SEG_REL = path.join(SEG_NAME, 'model.onnx');

// CAM++ trained on VoxCeleb — works robustly across languages (Italian
// included). About 28 MB on disk.
const EMB_NAME = '3dspeaker_speech_campplus_sv_en_voxceleb_16k';
const EMB_URL = `https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/${EMB_NAME}.onnx`;
const EMB_FILE = `${EMB_NAME}.onnx`;

const APPROX_TOTAL_BYTES = 35 * 1024 * 1024; // ~35 MB combined for UI display

// --- Paths ----------------------------------------------------------------

function getDir() {
  return path.join(app.getPath('userData'), 'diarization-models');
}

function getSegmentationModelPath() {
  return path.join(getDir(), SEG_REL);
}

function getEmbeddingModelPath() {
  return path.join(getDir(), EMB_FILE);
}

function isReady() {
  return fs.existsSync(getSegmentationModelPath()) && fs.existsSync(getEmbeddingModelPath());
}

function getInfo() {
  let segSize = 0;
  let embSize = 0;
  try { segSize = fs.statSync(getSegmentationModelPath()).size; } catch {}
  try { embSize = fs.statSync(getEmbeddingModelPath()).size; } catch {}
  return {
    ready: isReady(),
    approxTotalBytes: APPROX_TOTAL_BYTES,
    segmentation: { path: getSegmentationModelPath(), size: segSize },
    embedding: { path: getEmbeddingModelPath(), size: embSize }
  };
}

// --- Download -------------------------------------------------------------

let activeDownload = null;

function cancelDownload() {
  if (activeDownload) {
    try { activeDownload.controller.abort(); } catch {}
    activeDownload = null;
  }
}

async function downloadModels(onProgress) {
  const dir = getDir();
  fs.mkdirSync(dir, { recursive: true });

  const controller = new AbortController();
  activeDownload = { controller };

  try {
    // Segmentation (~6 MB after extraction, ~5 MB compressed)
    if (!fs.existsSync(getSegmentationModelPath())) {
      const archivePath = path.join(dir, `${SEG_NAME}.tar.bz2`);
      onProgress({ stage: 'Scaricamento modello segmentazione...', percent: 0 });
      await downloadFile(SEG_URL, archivePath, controller.signal, (pct) => {
        onProgress({ stage: 'Scaricamento modello segmentazione...', percent: pct * 0.2 });
      });
      onProgress({ stage: 'Estrazione modello segmentazione...', percent: 20 });
      await extractTar(archivePath, dir);
      try { fs.unlinkSync(archivePath); } catch {}
    }

    // Embedding (~28 MB)
    if (!fs.existsSync(getEmbeddingModelPath())) {
      onProgress({ stage: 'Scaricamento modello identificazione voce...', percent: 25 });
      await downloadFile(EMB_URL, getEmbeddingModelPath(), controller.signal, (pct) => {
        onProgress({ stage: 'Scaricamento modello identificazione voce...', percent: 25 + pct * 0.75 });
      });
    }

    onProgress({ stage: 'Modelli pronti', percent: 100 });
    activeDownload = null;
    return { success: true };
  } catch (err) {
    activeDownload = null;
    // Clean up half-downloaded files so a retry starts fresh
    try {
      const archivePath = path.join(dir, `${SEG_NAME}.tar.bz2`);
      if (fs.existsSync(archivePath)) fs.unlinkSync(archivePath);
    } catch {}
    return { success: false, error: err.message };
  }
}

function downloadFile(url, destPath, abortSignal, onProgress) {
  return new Promise((resolve, reject) => {
    function doGet(reqUrl) {
      const u = new URL(reqUrl);
      const req = https.get({
        hostname: u.hostname,
        path: u.pathname + u.search,
        headers: { 'User-Agent': 'DenkHub-Transcriber/1.3' }
      }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          doGet(res.headers.location);
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        const total = parseInt(res.headers['content-length'], 10) || 0;
        let dl = 0;
        const file = fs.createWriteStream(destPath);
        res.on('data', (chunk) => {
          dl += chunk.length;
          if (total && onProgress) onProgress((dl / total) * 100);
        });
        res.pipe(file);
        file.on('finish', () => file.close(() => resolve()));
        file.on('error', (err) => {
          try { fs.unlinkSync(destPath); } catch {}
          reject(err);
        });
      });
      req.on('error', reject);
      abortSignal.addEventListener('abort', () => {
        try { req.destroy(); } catch {}
        try { fs.unlinkSync(destPath); } catch {}
        reject(new Error('Download annullato'));
      });
    }
    doGet(url);
  });
}

function extractTar(archivePath, destDir) {
  return new Promise((resolve, reject) => {
    // Modern macOS and Windows 10/11 ship libarchive-based tar that
    // auto-detects bz2 from the magic bytes — no need for -j.
    execFile('tar', ['-xf', archivePath, '-C', destDir], { timeout: 120000 }, (err, _stdout, stderr) => {
      if (err) reject(new Error(`tar extraction failed: ${stderr || err.message}`));
      else resolve();
    });
  });
}

// --- Diarization run ------------------------------------------------------

async function diarize(wavPath, numSpeakers) {
  if (!isReady()) {
    throw new Error('Modelli di diarization non scaricati. Apri Modelli per scaricarli.');
  }

  let sherpa;
  try {
    sherpa = require('sherpa-onnx-node');
  } catch (err) {
    throw new Error(`sherpa-onnx-node non installato. Esegui "npm install" e ricompila l'app. (${err.message})`);
  }

  // numSpeakers: integer ≥ 2 forces that many clusters; 'auto' / falsy / <2
  // lets the algorithm pick by threshold (which is then honored).
  const wantsAuto = numSpeakers === 'auto' || !numSpeakers || Number(numSpeakers) < 2;
  const config = {
    segmentation: { pyannote: { model: getSegmentationModelPath() } },
    embedding: { model: getEmbeddingModelPath() },
    clustering: {
      numClusters: wantsAuto ? -1 : Number(numSpeakers),
      threshold: 0.5
    },
    minDurationOn: 0.2,
    minDurationOff: 0.5
  };

  const sd = new sherpa.OfflineSpeakerDiarization(config);
  const wave = sherpa.readWave(wavPath);
  if (sd.sampleRate !== wave.sampleRate) {
    throw new Error(`Sample rate atteso ${sd.sampleRate} Hz, file fornito ${wave.sampleRate} Hz. Il WAV deve essere 16 kHz mono.`);
  }

  const segments = sd.process(wave.samples); // [{ start, end, speaker }]
  return Array.isArray(segments) ? segments : [];
}

// Tag each word with a speaker label by matching its midpoint to a segment.
// Mirrors the assignSpeakers() logic in the Swift app's Utterance.swift.
function assignSpeakersToWords(words, segments) {
  if (!Array.isArray(words) || words.length === 0) return words;
  if (!Array.isArray(segments) || segments.length === 0) {
    return words.map((w) => ({ ...w, speaker: 'S1' }));
  }

  // Normalize raw cluster ids (0, 1, 2 …) to S1, S2, … in first-appearance
  // order across the audio. Keeps labels deterministic and human-friendly.
  const ordered = [...segments].sort((a, b) => a.start - b.start);
  const map = new Map();
  let next = 1;
  for (const s of ordered) {
    if (!map.has(s.speaker)) map.set(s.speaker, `S${next++}`);
  }

  function speakerFor(word) {
    const mid = (word.start + word.end) / 2;
    for (const s of segments) {
      if (mid >= s.start && mid <= s.end) return map.get(s.speaker);
    }
    let best = null;
    let bestDist = Infinity;
    for (const s of segments) {
      const center = (s.start + s.end) / 2;
      const d = Math.abs(mid - center);
      if (d < bestDist) { bestDist = d; best = s; }
    }
    return best ? map.get(best.speaker) : 'S1';
  }

  return words.map((w) => ({ ...w, speaker: speakerFor(w) }));
}

module.exports = {
  isReady,
  getInfo,
  downloadModels,
  cancelDownload,
  diarize,
  assignSpeakersToWords
};
