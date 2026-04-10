// Populate version strings
window.api.getVersion().then(v => {
  document.getElementById('sidebarVersion').textContent = `v${v}`;
  document.getElementById('settingsVersion').textContent = `Transcriber v${v}`;
});

// Check for updates on startup
window.api.checkUpdate().then(async (update) => {
  if (!update) return;
  const banner = document.getElementById('updateBanner');
  const message = document.getElementById('updateMessage');
  const link = document.getElementById('updateLink');
  const dismiss = document.getElementById('updateDismiss');

  // Check if auto-download is enabled
  const settings = await window.api.getSettings();
  if (settings.autoUpdate !== false) {
    message.textContent = `Scaricamento v${update.version}...`;
    link.style.display = 'none';
    banner.style.display = 'flex';
    dismiss.addEventListener('click', () => banner.style.display = 'none');
    const result = await window.api.downloadUpdate(update.downloadUrl);
    if (result && result.success) {
      message.textContent = `v${update.version} pronta!`;
      link.textContent = 'Installa ora';
      link.style.display = '';
      link.addEventListener('click', (e) => {
        e.preventDefault();
        if (confirm(`Installare la versione ${update.version}? L'app verrà chiusa.`)) {
          window.api.installUpdate(result.path);
        }
      });
    } else {
      message.textContent = `Nuova versione disponibile: v${update.version}`;
      link.style.display = '';
      link.addEventListener('click', (e) => { e.preventDefault(); window.api.openExternal(update.downloadUrl); });
    }
  } else {
    message.textContent = `Nuova versione disponibile: v${update.version}`;
    link.addEventListener('click', (e) => { e.preventDefault(); window.api.openExternal(update.downloadUrl); });
    dismiss.addEventListener('click', () => banner.style.display = 'none');
    banner.style.display = 'flex';
  }
}).catch(() => {});

// Main transcription UI logic
document.addEventListener('DOMContentLoaded', () => {
  const dropZone = document.getElementById('dropZone');
  const selectedFileName = document.getElementById('selectedFileName');
  const transcribeBtn = document.getElementById('transcribeBtn');
  const uploadCard = document.querySelector('.upload-card');
  const settingsBar = document.querySelector('.settings-bar');
  const processingScreen = document.getElementById('processingScreen');
  const progressBar = document.getElementById('progressBar');
  const progressPercent = document.getElementById('progressPercent');
  const progressStatus = document.getElementById('progressStatus');
  const processingFileName = document.getElementById('processingFileName');
  const processingTitle = document.getElementById('processingTitle');
  const resultContainer = document.getElementById('resultContainer');
  const transcriptionText = document.getElementById('transcriptionText');
  const audioPlayerContainer = document.getElementById('audioPlayerContainer');
  const audioPlayer = document.getElementById('audioPlayer');

  // Elements to hide/show during state changes
  const heroElements = document.querySelectorAll('#transcribeView > .view-content > .section-eyebrow, #transcribeView > .view-content > .headline-xl, #transcribeView > .view-content > .lead-text');

  let currentFilePath = null;
  let currentFileName = null;
  let fileDuration = 0;
  let currentWords = [];
  let currentTranscriptionId = null;
  let simulationInterval = null;

  // --- Trimmer state ---
  const trimmerContainer = document.getElementById('trimmerContainer');
  const trimmerAudio = document.getElementById('trimmerAudio');
  const trimmerPlayBtn = document.getElementById('trimmerPlayBtn');
  const trimPlayIcon = document.getElementById('trimPlayIcon');
  const trimPauseIcon = document.getElementById('trimPauseIcon');
  const trimCurrentTime = document.getElementById('trimCurrentTime');
  const trimDurationEl = document.getElementById('trimDuration');
  const trimmerTrack = document.getElementById('trimmerTrack');
  const trimmerRange = document.getElementById('trimmerRange');
  const trimmerPlayhead = document.getElementById('trimmerPlayhead');
  const trimHandleStart = document.getElementById('trimHandleStart');
  const trimHandleEnd = document.getElementById('trimHandleEnd');
  const trimEnabled = document.getElementById('trimEnabled');
  const trimStartLabel = document.getElementById('trimStartLabel');
  const trimEndLabel = document.getElementById('trimEndLabel');
  const trimDurationLabel = document.getElementById('trimDurationLabel');

  let trimStart = 0;
  let trimEnd = 0; // set to duration on load

  // --- UI States ---
  function showUploadState() {
    heroElements.forEach(el => el.style.display = '');
    settingsBar.style.display = '';
    uploadCard.style.display = '';
    processingScreen.style.display = 'none';
    resultContainer.style.display = 'none';
    recordingPanel.style.display = 'none';
    if (!currentFilePath) hideTrimmer();
    transcribeBtn.disabled = !currentFilePath;
  }

  function showProcessingState() {
    heroElements.forEach(el => el.style.display = 'none');
    settingsBar.style.display = 'none';
    uploadCard.style.display = 'none';
    resultContainer.style.display = 'none';
    processingScreen.style.display = '';
    trimmerAudio.pause();
    processingFileName.textContent = currentFileName || '';
    processingTitle.textContent = 'Trascrizione in corso';
    progressBar.style.width = '0%';
    progressPercent.textContent = '0%';
    progressStatus.textContent = 'Preparazione...';
  }

  function showResultState() {
    heroElements.forEach(el => el.style.display = 'none');
    settingsBar.style.display = 'none';
    uploadCard.style.display = 'none';
    processingScreen.style.display = 'none';
    resultContainer.style.display = '';
  }

  // --- Drag & Drop ---
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });

  dropZone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    if (e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      currentFilePath = window.api.getPathForFile(file);
      currentFileName = file.name;
      selectedFileName.textContent = `File selezionato: ${file.name}`;
      transcribeBtn.disabled = false;
      detectDuration(file);
    }
  });

  // Click to open file dialog
  dropZone.addEventListener('click', async () => {
    const result = await window.api.openFile();
    if (result) {
      currentFilePath = result.filePath;
      currentFileName = result.fileName;
      selectedFileName.textContent = `File selezionato: ${result.fileName}`;
      transcribeBtn.disabled = false;
      const audio = new Audio(`media://${encodeURIComponent(result.filePath)}`);
      audio.preload = 'metadata';
      audio.onloadedmetadata = () => {
        fileDuration = audio.duration;
        const mins = Math.round(fileDuration / 60);
        selectedFileName.textContent += ` (${mins} min)`;
        initTrimmer(result.filePath, fileDuration);
      };
      audio.onerror = () => { fileDuration = 600; };
    }
  });

  function detectDuration(file) {
    const objectUrl = URL.createObjectURL(file);
    const isVideo = file.type.startsWith('video');
    const media = isVideo ? document.createElement('video') : document.createElement('audio');
    media.preload = 'metadata';
    media.onloadedmetadata = () => {
      fileDuration = media.duration;
      URL.revokeObjectURL(objectUrl);
      const mins = Math.round(fileDuration / 60);
      selectedFileName.textContent += ` (${mins} min)`;
      initTrimmer(currentFilePath, fileDuration);
    };
    media.onerror = () => { fileDuration = 600; };
    media.src = objectUrl;
  }

  // --- Trimmer ---
  // --- Waveform ---
  const waveformCanvas = document.getElementById('trimmerWaveform');
  const waveformCtx = waveformCanvas.getContext('2d');
  let waveformAudioCtx = null;
  let waveformData = null; // cached RMS bars for the full audio
  let zoomLevel = 1;       // 1 = full audio visible
  let zoomOffset = 0;      // 0..1, fraction of audio that's scrolled past

  function initTrimmer(filePath, duration) {
    trimStart = 0;
    trimEnd = duration;
    trimEnabled.checked = false;
    trimmerContainer.classList.remove('trim-active');
    zoomLevel = 1;
    zoomOffset = 0;
    waveformData = null;

    const mediaUrl = window.api.getMediaUrl(filePath);
    trimmerAudio.src = mediaUrl;
    trimmerAudio.preload = 'metadata';
    trimmerContainer.style.display = '';

    trimmerAudio.onloadedmetadata = () => {
      trimDurationEl.textContent = fmtTime(trimmerAudio.duration);
      trimEnd = trimmerAudio.duration;
      updateTrimUI();
    };

    updateTrimUI();
    loadWaveform(filePath);
  }

  async function loadWaveform(filePath) {
    try {
      const buffer = await window.api.readFileBuffer(filePath);
      const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

      if (!waveformAudioCtx) waveformAudioCtx = new AudioContext();
      const audioBuffer = await waveformAudioCtx.decodeAudioData(arrayBuffer);

      // Pre-compute RMS data at high resolution
      const channel = audioBuffer.getChannelData(0);
      const totalBars = 2000; // high-res data, we'll downsample when drawing
      const samplesPerBar = Math.floor(channel.length / totalBars);
      const bars = [];
      let maxRms = 0;

      for (let i = 0; i < totalBars; i++) {
        const start = i * samplesPerBar;
        const end = Math.min(start + samplesPerBar, channel.length);
        let sum = 0;
        for (let j = start; j < end; j++) sum += channel[j] * channel[j];
        const rms = Math.sqrt(sum / (end - start));
        bars.push(rms);
        if (rms > maxRms) maxRms = rms;
      }

      // Normalize
      if (maxRms > 0) {
        for (let i = 0; i < bars.length; i++) bars[i] /= maxRms;
      }

      waveformData = bars;
      drawWaveform();
    } catch (err) {
      console.warn('[trimmer] waveform failed:', err);
    }
  }

  function drawWaveform() {
    if (!waveformData) return;

    const rect = waveformCanvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    waveformCanvas.width = rect.width * dpr;
    waveformCanvas.height = rect.height * dpr;
    waveformCanvas.style.width = rect.width + 'px';
    waveformCanvas.style.height = rect.height + 'px';

    const w = waveformCanvas.width;
    const h = waveformCanvas.height;
    const midY = h / 2;

    waveformCtx.clearRect(0, 0, w, h);

    // Determine visible portion based on zoom
    const totalBars = waveformData.length;
    const visibleFraction = 1 / zoomLevel;
    const startBar = Math.floor(zoomOffset * totalBars);
    const visibleBars = Math.floor(totalBars * visibleFraction);
    const endBar = Math.min(startBar + visibleBars, totalBars);

    // Draw bars — accent blue inside trim, white outside
    const displayBars = Math.floor(w / (2 * dpr));
    const accentColor = getComputedStyle(document.documentElement).getPropertyValue('--accent-color').trim() || '#2997ff';
    const barWidth = w / displayBars;
    const dur = trimmerAudio.duration || fileDuration || 1;
    const isTrimActive = trimEnabled.checked;

    for (let i = 0; i < displayBars; i++) {
      const dataStart = startBar + Math.floor((i / displayBars) * (endBar - startBar));
      const dataEnd = startBar + Math.floor(((i + 1) / displayBars) * (endBar - startBar));

      let peak = 0;
      for (let j = dataStart; j < dataEnd && j < totalBars; j++) {
        if (waveformData[j] > peak) peak = waveformData[j];
      }

      const barH = Math.max(1.5 * dpr, peak * midY * 0.92);

      // Determine if this bar is inside the trim selection
      const barTimeFrac = (dataStart / totalBars);
      const barTime = barTimeFrac * dur;
      const insideTrim = !isTrimActive || (barTime >= trimStart && barTime <= trimEnd);

      if (insideTrim) {
        waveformCtx.fillStyle = accentColor;
        waveformCtx.globalAlpha = 0.35 + peak * 0.5;
      } else {
        waveformCtx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        waveformCtx.globalAlpha = 0.15 + peak * 0.25;
      }

      waveformCtx.fillRect(i * barWidth, midY - barH, barWidth - dpr * 0.5, barH * 2);
    }

    waveformCtx.globalAlpha = 1;
  }

  // Zoom with mouse wheel on timeline
  trimmerTrack.parentElement.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = trimmerTrack.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left) / rect.width; // 0..1 position

    const oldZoom = zoomLevel;
    const zoomDelta = e.deltaY < 0 ? 1.25 : 0.8;
    zoomLevel = Math.max(1, Math.min(50, zoomLevel * zoomDelta));

    if (zoomLevel === 1) {
      zoomOffset = 0;
    } else {
      // Keep the point under the mouse cursor stable
      const visibleBefore = 1 / oldZoom;
      const visibleAfter = 1 / zoomLevel;
      const cursorTime = zoomOffset + mouseX * visibleBefore;
      zoomOffset = cursorTime - mouseX * visibleAfter;
      zoomOffset = Math.max(0, Math.min(1 - visibleAfter, zoomOffset));
    }

    drawWaveform();
    updateTrimUI();
  }, { passive: false });

  // Redraw on resize
  let waveformResizeTimeout;
  window.addEventListener('resize', () => {
    clearTimeout(waveformResizeTimeout);
    waveformResizeTimeout = setTimeout(() => {
      if (trimmerContainer.style.display !== 'none' && waveformData) drawWaveform();
    }, 200);
  });

  function hideTrimmer() {
    trimmerContainer.style.display = 'none';
    trimmerAudio.pause();
    trimmerAudio.src = '';
  }

  // Convert absolute time (seconds) to percentage position on the visible track
  function timeToTrackPct(t) {
    const dur = trimmerAudio.duration || fileDuration || 1;
    const frac = t / dur; // 0..1 in full audio
    const visibleFrac = 1 / zoomLevel;
    return ((frac - zoomOffset) / visibleFrac) * 100;
  }

  // Convert track percentage (0..100) to absolute time
  function trackPctToTime(pct) {
    const dur = trimmerAudio.duration || fileDuration || 1;
    const visibleFrac = 1 / zoomLevel;
    const frac = zoomOffset + (pct / 100) * visibleFrac;
    return frac * dur;
  }

  function updateTrimUI() {
    const dur = trimmerAudio.duration || fileDuration || 1;
    const startPct = timeToTrackPct(trimStart);
    const endPct = timeToTrackPct(trimEnd);

    // Clamp to visible range
    const clampedStart = Math.max(0, Math.min(100, startPct));
    const clampedEnd = Math.max(0, Math.min(100, endPct));

    trimmerRange.style.left = clampedStart + '%';
    trimmerRange.style.right = (100 - clampedEnd) + '%';
    trimHandleStart.style.left = clampedStart + '%';
    trimHandleEnd.style.left = clampedEnd + '%';

    // Only show handles if within visible range
    trimHandleStart.style.display = (startPct >= -5 && startPct <= 105) ? '' : 'none';
    trimHandleEnd.style.display = (endPct >= -5 && endPct <= 105) ? '' : 'none';

    trimmerTrack.style.setProperty('--trim-start-pct', clampedStart + '%');
    trimmerTrack.style.setProperty('--trim-end-pct', clampedEnd + '%');

    trimStartLabel.textContent = fmtTime(trimStart);
    trimEndLabel.textContent = fmtTime(trimEnd);
    const selDur = trimEnd - trimStart;
    if (trimEnabled.checked && selDur < dur - 0.1) {
      trimDurationLabel.textContent = `Durata selezionata: ${fmtTime(selDur)}`;
    } else {
      trimDurationLabel.textContent = '';
    }

    // Redraw waveform to update bar colors
    drawWaveform();
  }

  // Toggle trim mode
  trimEnabled.addEventListener('change', () => {
    trimmerContainer.classList.toggle('trim-active', trimEnabled.checked);
    if (!trimEnabled.checked) {
      trimStart = 0;
      trimEnd = trimmerAudio.duration || fileDuration;
    }
    updateTrimUI();
  });

  // Play/Pause trimmer preview
  trimmerPlayBtn.addEventListener('click', () => {
    if (trimmerAudio.paused) {
      if (trimEnabled.checked) {
        trimmerAudio.currentTime = trimStart;
      }
      trimmerAudio.play();
    } else {
      trimmerAudio.pause();
    }
  });

  trimmerAudio.addEventListener('play', () => {
    trimPlayIcon.style.display = 'none';
    trimPauseIcon.style.display = '';
  });

  trimmerAudio.addEventListener('pause', () => {
    trimPlayIcon.style.display = '';
    trimPauseIcon.style.display = 'none';
  });

  trimmerAudio.addEventListener('timeupdate', () => {
    const t = trimmerAudio.currentTime;
    trimCurrentTime.textContent = fmtTime(t);

    // Playhead position (zoom-aware)
    const pct = timeToTrackPct(t);
    trimmerPlayhead.style.left = Math.max(0, Math.min(100, pct)) + '%';
    trimmerPlayhead.style.display = (pct >= 0 && pct <= 100) ? '' : 'none';

    // Stop at trim end if trim is enabled
    if (trimEnabled.checked && t >= trimEnd) {
      trimmerAudio.pause();
      trimmerAudio.currentTime = trimStart;
    }
  });

  // Click on track to seek
  trimmerTrack.parentElement.addEventListener('click', (e) => {
    if (e.target.closest('.trimmer-handle')) return;
    const rect = trimmerTrack.getBoundingClientRect();
    const pct = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    trimmerAudio.currentTime = trackPctToTime(pct);
  });

  // Drag handles
  function initHandleDrag(handleEl, isStart) {
    let dragging = false;

    const onMove = (e) => {
      if (!dragging) return;
      const rect = trimmerTrack.getBoundingClientRect();
      const pct = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
      const dur = trimmerAudio.duration || fileDuration;
      const time = Math.max(0, Math.min(dur, trackPctToTime(pct)));

      if (isStart) {
        trimStart = Math.min(time, trimEnd - 0.5);
        trimStart = Math.max(0, trimStart);
      } else {
        trimEnd = Math.max(time, trimStart + 0.5);
        trimEnd = Math.min(dur, trimEnd);
      }
      updateTrimUI();
    };

    const onUp = () => {
      dragging = false;
      handleEl.classList.remove('dragging');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    handleEl.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dragging = true;
      handleEl.classList.add('dragging');
      // Auto-enable trim on handle drag
      if (!trimEnabled.checked) {
        trimEnabled.checked = true;
        trimmerContainer.classList.add('trim-active');
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  initHandleDrag(trimHandleStart, true);
  initHandleDrag(trimHandleEnd, false);

  function fmtTime(s) {
    if (!s || isNaN(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
  }

  // --- Recording ---
  const recordBtn = document.getElementById('recordBtn');
  const recordOptionsBtn = document.getElementById('recordOptionsBtn');
  const recordOptionsMenu = document.getElementById('recordOptionsMenu');
  const recOptMic = document.getElementById('recOptMic');
  const recOptSystem = document.getElementById('recOptSystem');
  const recordingPanel = document.getElementById('recordingPanel');
  const recordingTimer = document.getElementById('recordingTimer');
  const recordingWaveform = document.getElementById('recordingWaveform');
  const recordingSources = document.getElementById('recordingSources');
  const recordStopBtn = document.getElementById('recordStopBtn');
  const recWaveCtx = recordingWaveform.getContext('2d');

  let mediaRecorder = null;
  let recordedChunks = [];
  let recordingStartTime = 0;
  let recordingTimerInterval = null;
  let recAnalyser = null;
  let recAnimFrame = null;
  let recAudioCtx = null;

  // Toggle options menu
  recordOptionsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const show = recordOptionsMenu.style.display === 'none';
    recordOptionsMenu.style.display = show ? '' : 'none';
  });

  // Close menu on click outside
  document.addEventListener('click', (e) => {
    if (!recordOptionsMenu.contains(e.target) && e.target !== recordOptionsBtn) {
      recordOptionsMenu.style.display = 'none';
    }
  });

  // Hide system audio option on non-macOS (only works on Mac)
  if (navigator.platform.indexOf('Mac') === -1) {
    recOptSystem.closest('.record-option').style.display = 'none';
  }

  // Ensure at least one source is checked
  recOptMic.addEventListener('change', () => {
    if (!recOptMic.checked && !recOptSystem.checked) recOptSystem.checked = true;
  });
  recOptSystem.addEventListener('change', () => {
    if (!recOptSystem.checked && !recOptMic.checked) recOptMic.checked = true;
  });

  // Start recording
  recordBtn.addEventListener('click', async () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') return;

    const useMic = recOptMic.checked;
    const useSystem = recOptSystem.checked;
    recordOptionsMenu.style.display = 'none';

    try {
      const streams = [];
      let sourceLabels = [];

      // Microphone stream
      if (useMic) {
        const micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        streams.push(micStream);
        sourceLabels.push('Microfono');
      }

      // System audio stream (via getDisplayMedia + loopback)
      if (useSystem) {
        try {
          const sysStream = await navigator.mediaDevices.getDisplayMedia({
            audio: true,
            video: true // required by Chromium, we discard it
          });
          // Remove video track — we only want audio
          sysStream.getVideoTracks().forEach(t => t.stop());
          if (sysStream.getAudioTracks().length > 0) {
            streams.push(sysStream);
            sourceLabels.push('Audio Mac');
          }
        } catch (sysErr) {
          console.warn('[recording] system audio failed:', sysErr);
          if (!useMic) {
            alert('Impossibile catturare audio di sistema. Abilita "Registrazione schermo" in Impostazioni > Privacy e sicurezza.');
            return;
          }
        }
      }

      if (streams.length === 0) {
        alert('Nessuna sorgente audio disponibile.');
        return;
      }

      // Combine streams if multiple
      let combinedStream;
      if (streams.length === 1) {
        combinedStream = streams[0];
      } else {
        recAudioCtx = new AudioContext();
        const dest = recAudioCtx.createMediaStreamDestination();
        streams.forEach(s => {
          const src = recAudioCtx.createMediaStreamSource(s);
          src.connect(dest);
        });
        combinedStream = dest.stream;
      }

      // Set up analyser for waveform
      const analyserCtx = recAudioCtx || new AudioContext();
      if (!recAudioCtx) recAudioCtx = analyserCtx;
      recAnalyser = analyserCtx.createAnalyser();
      recAnalyser.fftSize = 256;
      const src = analyserCtx.createMediaStreamSource(combinedStream);
      src.connect(recAnalyser);

      // MediaRecorder
      mediaRecorder = new MediaRecorder(combinedStream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus' : 'audio/webm'
      });
      recordedChunks = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunks.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        clearInterval(recordingTimerInterval);
        cancelAnimationFrame(recAnimFrame);

        // Stop all tracks
        streams.forEach(s => s.getTracks().forEach(t => t.stop()));

        const blob = new Blob(recordedChunks, { type: 'audio/webm' });
        const buffer = await blob.arrayBuffer();

        // Save to temp file
        const filePath = await window.api.saveRecording(new Uint8Array(buffer), 'webm');

        // Hide recording panel, set as current file
        recordingPanel.style.display = 'none';
        currentFilePath = filePath;
        currentFileName = `Registrazione ${new Date().toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`;
        selectedFileName.textContent = `Registrato: ${currentFileName}`;
        transcribeBtn.disabled = false;

        // Detect duration and show trimmer
        const audio = new Audio(`media://${encodeURIComponent(filePath)}`);
        audio.preload = 'metadata';
        audio.onloadedmetadata = () => {
          fileDuration = audio.duration;
          selectedFileName.textContent += ` (${fmtTime(audio.duration)})`;
          initTrimmer(filePath, audio.duration);
        };

        // Show upload area again
        dropZone.style.display = '';
        document.querySelector('.action-row').style.display = '';

        if (recAudioCtx) { recAudioCtx.close(); recAudioCtx = null; }
      };

      // Start
      mediaRecorder.start(250); // collect data every 250ms
      recordingStartTime = Date.now();
      recordedChunks = [];

      // Show recording UI
      dropZone.style.display = 'none';
      trimmerContainer.style.display = 'none';
      document.querySelector('.action-row').style.display = 'none';
      recordingPanel.style.display = '';
      recordingSources.textContent = sourceLabels.join(' + ');

      // Timer
      recordingTimerInterval = setInterval(() => {
        const elapsed = (Date.now() - recordingStartTime) / 1000;
        recordingTimer.textContent = fmtTime(elapsed);
      }, 250);

      // Waveform animation
      drawRecordingWaveform();

    } catch (err) {
      console.error('[recording] error:', err);
      if (err.name === 'NotAllowedError') {
        alert('Permesso negato. Controlla le impostazioni di privacy del sistema per microfono e registrazione schermo.');
      } else {
        alert('Errore registrazione: ' + err.message);
      }
    }
  });

  function drawRecordingWaveform() {
    if (!recAnalyser) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = recordingWaveform.getBoundingClientRect();
    recordingWaveform.width = rect.width * dpr;
    recordingWaveform.height = rect.height * dpr;
    recordingWaveform.style.width = rect.width + 'px';
    recordingWaveform.style.height = rect.height + 'px';

    const bufLen = recAnalyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufLen);

    function draw() {
      recAnimFrame = requestAnimationFrame(draw);
      recAnalyser.getByteFrequencyData(dataArray);

      const w = recordingWaveform.width;
      const h = recordingWaveform.height;
      const barCount = Math.min(bufLen, Math.floor(w / (3 * dpr)));
      const barWidth = w / barCount;

      recWaveCtx.clearRect(0, 0, w, h);

      for (let i = 0; i < barCount; i++) {
        const val = dataArray[i] / 255;
        const barH = Math.max(2 * dpr, val * h * 0.85);

        recWaveCtx.fillStyle = '#ff3b30';
        recWaveCtx.globalAlpha = 0.3 + val * 0.6;
        recWaveCtx.fillRect(i * barWidth, (h - barH) / 2, barWidth - dpr * 0.5, barH);
      }
      recWaveCtx.globalAlpha = 1;
    }

    draw();
  }

  // Stop recording
  recordStopBtn.addEventListener('click', () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
    }
  });

  // --- Transcription ---
  transcribeBtn.addEventListener('click', async () => {
    if (!currentFilePath) return;

    // Switch to processing view
    showProcessingState();
    audioPlayer.pause();
    audioPlayerContainer.style.display = 'none';
    transcriptionText.innerHTML = '';

    // Start progress simulation with fun messages
    startProcessingSimulation();

    // Listen for progress events from main process
    window.api.onTranscribeProgress((data) => {
      if (data.stage) {
        progressStatus.textContent = data.stage;
      }
    });

    try {
      const model = document.getElementById('modelSelect').value;
      const language = document.getElementById('langSelect').value;

      // Pass trim params if trim is enabled
      const transcribeOpts = { filePath: currentFilePath, model, language, displayName: currentFileName };
      if (trimEnabled.checked) {
        const dur = trimmerAudio.duration || fileDuration;
        if (trimStart > 0) transcribeOpts.trimStart = trimStart;
        if (trimEnd < dur - 0.1) transcribeOpts.trimEnd = trimEnd;
      }

      const result = await window.api.transcribe(transcribeOpts);

      clearInterval(simulationInterval);

      if (result.success === false) {
        alert('Errore: ' + (result.error || 'Trascrizione fallita'));
        showUploadState();
        return;
      }

      // Brief "done" state
      progressBar.style.width = '100%';
      progressPercent.textContent = '100%';
      progressStatus.textContent = 'Completato!';
      processingTitle.textContent = 'Fatto!';

      setTimeout(() => renderResult(result), 600);

    } catch (err) {
      clearInterval(simulationInterval);
      alert('Errore di trascrizione: ' + err.message);
      showUploadState();
    }
  });

  function renderResult(data) {
    if (data.audioPath) {
      audioPlayer.src = window.api.getMediaUrl(data.audioPath);
      audioPlayerContainer.style.display = '';
    }

    currentWords = data.words || [];
    currentTranscriptionId = data.id || null;

    // Populate result header
    const resultTitle = document.getElementById('resultTitle');
    const resultMeta = document.getElementById('resultMeta');
    resultTitle.textContent = currentFileName || 'Trascrizione';

    const model = document.getElementById('modelSelect').value;
    const lang = document.getElementById('langSelect').value;
    const wordCount = currentWords.length;
    const duration = currentWords.length > 0 ? currentWords[currentWords.length - 1].end : 0;
    const durationStr = duration > 0 ? `${Math.floor(duration / 60)}:${String(Math.floor(duration % 60)).padStart(2, '0')}` : '';

    resultMeta.innerHTML = [
      durationStr ? `<span>${durationStr}</span>` : '',
      `<span>${model}</span>`,
      lang !== 'auto' ? `<span>${lang}</span>` : '',
      `<span>${wordCount} parole</span>`
    ].filter(Boolean).join('<span style="opacity:0.4;">&middot;</span>');

    renderWords(currentWords, transcriptionText, audioPlayer);
    if (window._mainPlayer) window._mainPlayer.reset();
    showResultState();
  }


  // --- Editable title ---
  document.getElementById('resultTitle').addEventListener('click', function () {
    makeEditable(this, (newName) => {
      if (currentTranscriptionId) {
        window.api.updateName(currentTranscriptionId, newName);
      }
      currentFileName = newName;
    });
  });

  function makeEditable(el, onSave) {
    if (el.contentEditable === 'true') return;
    const original = el.textContent;
    el.contentEditable = 'true';
    el.classList.add('result-title-editing');
    el.focus();

    // Select all text
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);

    function save() {
      el.contentEditable = 'false';
      el.classList.remove('result-title-editing');
      const newText = el.textContent.trim();
      if (newText && newText !== original) {
        onSave(newText);
      } else {
        el.textContent = original;
      }
    }

    el.addEventListener('blur', save, { once: true });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); el.blur(); }
      if (e.key === 'Escape') { el.textContent = original; el.blur(); }
    });
  }

  // --- Edit history (undo/redo) ---
  const editHistory = { undoStack: [], redoStack: [] };

  function pushEdit(index, oldWord, newWord, span, wordsArray) {
    editHistory.undoStack.push({ index, oldWord, newWord, span, wordsArray });
    editHistory.redoStack = [];
    persistWords(wordsArray);
  }

  function undoEdit() {
    const entry = editHistory.undoStack.pop();
    if (!entry) return;
    entry.wordsArray[entry.index].word = entry.oldWord;
    entry.span.textContent = entry.oldWord;
    editHistory.redoStack.push(entry);
    persistWords(entry.wordsArray);
  }

  function redoEdit() {
    const entry = editHistory.redoStack.pop();
    if (!entry) return;
    entry.wordsArray[entry.index].word = entry.newWord;
    entry.span.textContent = entry.newWord;
    editHistory.undoStack.push(entry);
    persistWords(entry.wordsArray);
  }

  // Save words to database
  function persistWords(wordsArray) {
    if (currentTranscriptionId) {
      window.api.updateWords(currentTranscriptionId, wordsArray);
    }
  }

  // Ctrl+Z / Ctrl+Shift+Z
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      undoEdit();
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'z' && e.shiftKey) {
      e.preventDefault();
      redoEdit();
    }
  });

  // --- Word edit popup ---
  // Saves automatically when clicking another word or clicking outside
  let activePopup = null;

  function saveAndClosePopup() {
    if (!activePopup) return;
    const { input, span, wordObj, index, wordsArray, popup } = activePopup;
    const newText = input.value.trim();
    if (newText && newText !== wordObj.word) {
      const oldWord = wordObj.word;
      wordObj.word = newText;
      span.textContent = newText;
      wordsArray[index].word = newText;
      pushEdit(index, oldWord, newText, span, wordsArray);
    }
    popup.remove();
    activePopup = null;
  }

  function showWordEditPopup(span, wordObj, index, wordsArray, container) {
    // Save previous popup if open
    saveAndClosePopup();

    const popup = document.createElement('div');
    popup.className = 'word-edit-popup';

    const input = document.createElement('input');
    input.type = 'text';
    input.value = wordObj.word;

    popup.appendChild(input);

    // Position fixed relative to viewport
    document.body.appendChild(popup);

    const spanRect = span.getBoundingClientRect();
    let left = spanRect.left;
    const popupWidth = 160;

    // Flip left if near right edge
    if (left + popupWidth > window.innerWidth - 16) {
      left = window.innerWidth - popupWidth - 16;
    }
    if (left < 8) left = 8;

    popup.style.left = left + 'px';
    popup.style.top = (spanRect.bottom + 4) + 'px';

    input.focus();
    input.select();

    activePopup = { input, span, wordObj, index, wordsArray, popup };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { saveAndClosePopup(); }
      if (e.key === 'Escape') { popup.remove(); activePopup = null; }
      // Prevent undo/redo while editing
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') e.stopPropagation();
    });

    // Close (and save) on click outside
    setTimeout(() => {
      document.addEventListener('mousedown', function handler(e) {
        if (!popup.contains(e.target) && e.target !== span) {
          saveAndClosePopup();
          document.removeEventListener('mousedown', handler);
        }
      });
    }, 10);
  }

  function renderWords(words, container, audioEl) {
    container = container || transcriptionText;
    audioEl = audioEl || audioPlayer;
    container.innerHTML = '';

    if (!words || words.length === 0) {
      container.textContent = 'Nessun testo rilevato.';
      return;
    }

    const fragment = document.createDocumentFragment();
    words.forEach((w, i) => {
      if (i > 0) fragment.appendChild(document.createTextNode(' '));

      const span = document.createElement('span');
      span.textContent = w.word;
      span.className = 'word';
      span.dataset.start = w.start;
      span.dataset.end = w.end;
      span.dataset.index = i;

      span.addEventListener('click', () => {
        audioEl.currentTime = w.start;
        audioEl.play();
      });

      // Right-click to edit word
      span.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showWordEditPopup(span, w, i, words, container);
      });

      fragment.appendChild(span);
    });
    container.appendChild(fragment);
  }

  // --- Progress Simulation ---
  // Uses an easing curve that starts fast, slows in the middle, and never reaches 100%
  function startProcessingSimulation() {
    if (simulationInterval) clearInterval(simulationInterval);

    const startTime = Date.now();
    const interval = 250;
    let lastPct = 0;

    progressStatus.textContent = 'Avvio elaborazione neurale...';

    simulationInterval = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000; // seconds elapsed

      // Logarithmic curve: fast at start, slows down, asymptotically approaches 95%
      // pct = 95 * (1 - e^(-elapsed/tau))
      // tau controls speed: smaller = faster start
      const tau = Math.max(8, fileDuration * 0.15); // scale with file duration
      const pct = Math.min(95, 95 * (1 - Math.exp(-elapsed / tau)));

      if (Math.round(pct) !== Math.round(lastPct)) {
        progressBar.style.width = pct + '%';
        progressPercent.textContent = Math.round(pct) + '%';
        lastPct = pct;
      }

      // Change message every ~3 seconds
      if (Math.floor(elapsed) % 3 === 0 && Math.floor(elapsed) !== Math.floor(elapsed - interval/1000)) {
        const isFunny = Math.random() > 0.75;
        const pool = (isFunny && window.FUNNY_MESSAGES) ? window.FUNNY_MESSAGES : (window.TECHNICAL_MESSAGES || ['Elaborazione...']);
        progressStatus.textContent = pool[Math.floor(Math.random() * pool.length)];
      }
    }, interval);
  }

  // --- Copy / Export / Clear ---
  document.getElementById('copyBtn').addEventListener('click', () => {
    const text = currentWords.map(w => w.word).join(' ');
    navigator.clipboard.writeText(text);
  });

  // Result export dropdown
  const resultExportDropdown = document.getElementById('resultExportDropdown');
  const resultExportBtn = document.getElementById('resultExportBtn');

  resultExportBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    resultExportDropdown.classList.toggle('open');
  });

  document.addEventListener('click', (e) => {
    if (!resultExportDropdown.contains(e.target)) {
      resultExportDropdown.classList.remove('open');
    }
  });

  resultExportDropdown.querySelectorAll('.export-dropdown-item').forEach(item => {
    item.addEventListener('click', async (e) => {
      e.stopPropagation();
      resultExportDropdown.classList.remove('open');
      const format = item.dataset.format;
      if (!currentTranscriptionId) {
        navigator.clipboard.writeText(currentWords.map(w => w.word).join(' '));
        return;
      }
      if (format === 'txt') {
        await window.api.exportTxt(currentTranscriptionId);
      } else if (format === 'srt') {
        await window.api.exportSrt(currentTranscriptionId);
      }
    });
  });

  document.getElementById('clearBtn').addEventListener('click', () => {
    if (window.WordEditMode && window.WordEditMode.isActive()) window.WordEditMode.deactivate();
    currentFilePath = null;
    currentFileName = null;
    currentWords = [];
    fileDuration = 0;
    selectedFileName.textContent = '';
    audioPlayer.pause();
    audioPlayerContainer.style.display = 'none';
    showUploadState();
    updateEditBtn(false);
  });

  // --- Edit Mode toggle ---
  const editModeBtn = document.getElementById('editModeBtn');
  editModeBtn.addEventListener('click', () => {
    if (!currentWords || currentWords.length === 0) return;
    const active = window.WordEditMode.toggle(
      transcriptionText,
      currentWords,
      audioPlayer,
      (words) => persistWords(words),
      (words, container, audioEl) => renderWords(words, container, audioEl)
    );
    updateEditBtn(active);
  });

  function updateEditBtn(active) {
    editModeBtn.classList.toggle('active', active);
    editModeBtn.innerHTML = active
      ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> Chiudi modifica'
      : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg> Modifica';
  }

  // Listen for edit mode deactivation (e.g. via Esc key)
  window.addEventListener('word-edit-mode-changed', (e) => {
    if (!e.detail.active) updateEditBtn(false);
  });

  // Clicking "Trascrivi" in sidebar always resets to fresh upload
  window.addEventListener('reset-transcribe', () => {
    if (window.WordEditMode && window.WordEditMode.isActive()) window.WordEditMode.deactivate();
    currentFilePath = null;
    currentFileName = null;
    currentWords = [];
    currentTranscriptionId = null;
    fileDuration = 0;
    selectedFileName.textContent = '';
    transcriptionText.innerHTML = '';
    audioPlayer.pause();
    audioPlayerContainer.style.display = 'none';
    hideTrimmer();
    editHistory.undoStack = [];
    editHistory.redoStack = [];
    showUploadState();
    updateEditBtn(false);
  });
});
