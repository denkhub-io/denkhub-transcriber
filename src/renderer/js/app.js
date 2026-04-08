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

  // --- UI States ---
  function showUploadState() {
    heroElements.forEach(el => el.style.display = '');
    settingsBar.style.display = '';
    uploadCard.style.display = '';
    processingScreen.style.display = 'none';
    resultContainer.style.display = 'none';
    transcribeBtn.disabled = !currentFilePath;
  }

  function showProcessingState() {
    heroElements.forEach(el => el.style.display = 'none');
    settingsBar.style.display = 'none';
    uploadCard.style.display = 'none';
    resultContainer.style.display = 'none';
    processingScreen.style.display = '';
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
    };
    media.onerror = () => { fileDuration = 600; };
    media.src = objectUrl;
  }

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

      const result = await window.api.transcribe({
        filePath: currentFilePath,
        model,
        language
      });

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

  document.getElementById('exportTxtBtn').addEventListener('click', async () => {
    if (currentTranscriptionId) {
      await window.api.exportTxt(currentTranscriptionId);
    } else {
      // Fallback: copy to clipboard
      const text = currentWords.map(w => w.word).join(' ');
      navigator.clipboard.writeText(text);
    }
  });

  document.getElementById('clearBtn').addEventListener('click', () => {
    currentFilePath = null;
    currentFileName = null;
    currentWords = [];
    fileDuration = 0;
    selectedFileName.textContent = '';
    audioPlayer.pause();
    audioPlayerContainer.style.display = 'none';
    showUploadState();
  });

  // Clicking "Trascrivi" in sidebar always resets to fresh upload
  window.addEventListener('reset-transcribe', () => {
    currentFilePath = null;
    currentFileName = null;
    currentWords = [];
    currentTranscriptionId = null;
    fileDuration = 0;
    selectedFileName.textContent = '';
    transcriptionText.innerHTML = '';
    audioPlayer.pause();
    audioPlayerContainer.style.display = 'none';
    editHistory.undoStack = [];
    editHistory.redoStack = [];
    showUploadState();
  });
});
