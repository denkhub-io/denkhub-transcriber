// History view — search, browse, and view past transcriptions
document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('historySearch');
  const historyList = document.getElementById('historyList');
  const historyDetail = document.getElementById('historyDetail');
  const historyBackBtn = document.getElementById('historyBackBtn');
  let searchTimeout = null;
  let currentDetailId = null;

  function showList() {
    historyList.style.display = '';
    historyDetail.style.display = 'none';
    searchInput.parentElement.style.display = '';
    currentDetailId = null;
    // Pause history audio if playing
    const audio = document.getElementById('historyAudioPlayer');
    if (audio) audio.pause();
  }

  function showDetail() {
    historyList.style.display = 'none';
    historyDetail.style.display = '';
    searchInput.parentElement.style.display = 'none';
  }

  async function loadHistory(query = '') {
    const { items, total } = await window.api.getHistory({
      search: query,
      limit: 50,
      offset: 0
    });

    if (items.length === 0) {
      historyList.innerHTML = `
        <p style="color: var(--text-secondary); text-align: center; padding: var(--space-xl) 0;">
          ${query ? 'Nessun risultato per la ricerca.' : 'Nessuna trascrizione ancora. Inizia a trascrivere!'}
        </p>
      `;
      return;
    }

    historyList.innerHTML = '';
    items.forEach(item => {
      const isPending = item.status === 'pending';
      const el = document.createElement('div');
      el.className = 'surface-card history-item' + (isPending ? ' history-item-pending' : '');
      el.innerHTML = `
        <div class="history-item-info">
          <div class="history-item-name">
            ${escapeHtml(item.filename)}
            ${isPending ? '<span class="pill pill-warn" style="margin-left: 8px;">In corso</span>' : ''}
          </div>
          <div class="history-item-meta">
            ${formatDate(item.created_at)} &middot;
            ${item.model_used} &middot;
            ${item.language || 'auto'}
            ${!isPending && item.duration_seconds ? ' &middot; ' + formatDuration(item.duration_seconds) : ''}
          </div>
        </div>
        <div class="history-item-actions">
          ${isPending
            ? '<span style="color: var(--text-secondary); font-size: 0.78rem;">Trascrizione in corso...</span>'
            : `<button class="btn btn-secondary btn-sm" data-action="open" data-id="${item.id}">Apri</button>
               <button class="btn btn-ghost btn-sm" data-action="export" data-id="${item.id}">Esporta</button>
               <button class="btn btn-danger btn-sm" data-action="delete" data-id="${item.id}">Elimina</button>`
          }
        </div>
      `;
      historyList.appendChild(el);
    });

    // Bind actions
    historyList.querySelectorAll('[data-action="open"]').forEach(btn => {
      btn.addEventListener('click', () => openTranscription(parseInt(btn.dataset.id)));
    });

    historyList.querySelectorAll('[data-action="export"]').forEach(btn => {
      btn.addEventListener('click', () => window.api.exportTxt(parseInt(btn.dataset.id)));
    });

    historyList.querySelectorAll('[data-action="delete"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Eliminare questa trascrizione?')) return;
        await window.api.deleteTranscription(parseInt(btn.dataset.id));
        loadHistory(searchInput.value.trim());
      });
    });
  }

  async function openTranscription(id) {
    const data = await window.api.getTranscription(id);
    if (!data) return;

    currentDetailId = id;
    const words = JSON.parse(data.words_json || '[]');

    // Populate header
    document.getElementById('historyDetailTitle').textContent = data.filename;
    const meta = document.getElementById('historyDetailMeta');
    const durationStr = formatDuration(data.duration_seconds);
    meta.innerHTML = [
      `<span>${formatDate(data.created_at)}</span>`,
      `<span>${data.model_used}</span>`,
      data.language ? `<span>${data.language}</span>` : '',
      durationStr ? `<span>${durationStr}</span>` : '',
      `<span>${words.length} parole</span>`
    ].filter(Boolean).join('<span style="opacity:0.4;">&middot;</span>');

    // Audio player
    const playerContainer = document.getElementById('historyPlayerContainer');
    const audio = document.getElementById('historyAudioPlayer');
    if (data.file_path) {
      audio.src = window.api.getMediaUrl(data.file_path);
      playerContainer.style.display = '';
    } else {
      playerContainer.style.display = 'none';
    }

    // Render words with edit support
    const textContainer = document.getElementById('historyTranscriptionText');
    renderHistoryWords(words, textContainer, audio);

    // Make title editable
    const titleEl = document.getElementById('historyDetailTitle');
    const newTitle = titleEl.cloneNode(true);
    titleEl.replaceWith(newTitle);
    newTitle.id = 'historyDetailTitle';
    newTitle.style.cursor = 'pointer';
    newTitle.addEventListener('click', function () {
      if (this.contentEditable === 'true') return;
      const original = this.textContent;
      this.contentEditable = 'true';
      this.classList.add('result-title-editing');
      this.focus();
      const range = document.createRange();
      range.selectNodeContents(this);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);

      const save = () => {
        this.contentEditable = 'false';
        this.classList.remove('result-title-editing');
        const newText = this.textContent.trim();
        if (newText && newText !== original) {
          window.api.updateName(id, newText);
        } else {
          this.textContent = original;
        }
      };
      this.addEventListener('blur', save, { once: true });
      this.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); this.blur(); }
        if (e.key === 'Escape') { this.textContent = original; this.blur(); }
      });
    });

    if (window._historyPlayer) window._historyPlayer.reset();
    showDetail();

    // Bind detail actions
    const copyBtn = historyDetail.querySelector('.history-detail-copy');
    const exportBtn = historyDetail.querySelector('.history-detail-export');
    const deleteBtn = historyDetail.querySelector('.history-detail-delete');

    // Remove old listeners by cloning
    const newCopy = copyBtn.cloneNode(true);
    const newExport = exportBtn.cloneNode(true);
    const newDelete = deleteBtn.cloneNode(true);
    copyBtn.replaceWith(newCopy);
    exportBtn.replaceWith(newExport);
    deleteBtn.replaceWith(newDelete);

    newCopy.addEventListener('click', () => {
      navigator.clipboard.writeText(words.map(w => w.word).join(' '));
    });
    newExport.addEventListener('click', () => window.api.exportTxt(id));
    newDelete.addEventListener('click', async () => {
      if (!confirm('Eliminare questa trascrizione?')) return;
      await window.api.deleteTranscription(id);
      showList();
      loadHistory(searchInput.value.trim());
    });
  }

  function renderHistoryWords(words, container, audioEl) {
    container.innerHTML = '';
    if (!words || words.length === 0) {
      container.textContent = 'Nessun testo.';
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
        if (audioEl) {
          audioEl.currentTime = w.start;
          audioEl.play();
        }
      });

      span.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showWordEdit(span, w, i, words, container);
      });

      fragment.appendChild(span);
    });
    container.appendChild(fragment);
  }

  // Edit popup with auto-save
  let historyActivePopup = null;

  function saveAndCloseHistoryPopup() {
    if (!historyActivePopup) return;
    const { input, span, wordObj, index, wordsArray, popup } = historyActivePopup;
    const newText = input.value.trim();
    if (newText && newText !== wordObj.word) {
      wordObj.word = newText;
      span.textContent = newText;
      wordsArray[index].word = newText;
      // Persist to database
      if (currentDetailId) {
        window.api.updateWords(currentDetailId, wordsArray);
      }
    }
    popup.remove();
    historyActivePopup = null;
  }

  function showWordEdit(span, wordObj, index, wordsArray, container) {
    saveAndCloseHistoryPopup();

    const popup = document.createElement('div');
    popup.className = 'word-edit-popup';
    const input = document.createElement('input');
    input.type = 'text';
    input.value = wordObj.word;
    popup.appendChild(input);

    document.body.appendChild(popup);

    const rect = span.getBoundingClientRect();
    let left = rect.left;
    const popupWidth = 160;
    if (left + popupWidth > window.innerWidth - 16) left = window.innerWidth - popupWidth - 16;
    if (left < 8) left = 8;

    popup.style.left = left + 'px';
    popup.style.top = (rect.bottom + 4) + 'px';
    input.focus();
    input.select();

    historyActivePopup = { input, span, wordObj, index, wordsArray, popup };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') saveAndCloseHistoryPopup();
      if (e.key === 'Escape') { popup.remove(); historyActivePopup = null; }
    });

    setTimeout(() => {
      document.addEventListener('mousedown', function h(e) {
        if (!popup.contains(e.target) && e.target !== span) {
          saveAndCloseHistoryPopup();
          document.removeEventListener('mousedown', h);
        }
      });
    }, 10);
  }

  // Back button — reload list to show updated names
  historyBackBtn.addEventListener('click', () => {
    showList();
    loadHistory(searchInput ? searchInput.value.trim() : '');
  });

  // Search with debounce
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        loadHistory(searchInput.value.trim());
      }, 300);
    });
  }

  // Reload history list when view becomes visible (but don't reset detail view)
  const observer = new MutationObserver(() => {
    const historyView = document.getElementById('historyView');
    if (historyView && historyView.style.display !== 'none') {
      // Only refresh the list if we're not viewing a detail
      if (!currentDetailId) {
        loadHistory(searchInput ? searchInput.value.trim() : '');
      }
    }
  });

  const historyView = document.getElementById('historyView');
  if (historyView) {
    observer.observe(historyView, { attributes: true, attributeFilter: ['style'] });
  }

  // Helpers
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function formatDate(isoStr) {
    const d = new Date(isoStr);
    return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function formatDuration(seconds) {
    if (!seconds) return '';
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }
});
