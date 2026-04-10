// Word Editor — edit mode with merge and inline edit/split
// Intercepts word clicks via capture phase when active
// Stores original timestamps on merge so split can restore them accurately

(function () {
  'use strict';

  let editMode = false;
  let selected = [];       // sorted indices of selected words
  let ctx = null;           // { container, words, audioEl, onPersist, onReRender }
  let toolbarEl = null;
  let popupEl = null;

  // ── Public API ──────────────────────────────────────────
  window.WordEditMode = {
    toggle(container, words, audioEl, onPersist, onReRender) {
      if (editMode) { deactivate(); return false; }
      activate(container, words, audioEl, onPersist, onReRender);
      return true;
    },
    isActive: () => editMode,
    deactivate,
  };

  // ── Activate / Deactivate ───────────────────────────────
  function activate(container, words, audioEl, onPersist, onReRender) {
    if (editMode) deactivate();

    editMode = true;
    selected = [];
    ctx = { container, words, audioEl, onPersist, onReRender };

    container.classList.add('edit-mode');

    container._weCaptureClick = (e) => {
      const wordEl = e.target.closest('.word');
      if (!wordEl) { clearSelection(); return; }
      e.stopPropagation();
      e.preventDefault();
      handleWordClick(parseInt(wordEl.dataset.index), e.shiftKey || e.metaKey || e.ctrlKey);
    };
    container._weCaptureCtx = (e) => {
      if (e.target.closest('.word')) { e.stopPropagation(); e.preventDefault(); }
    };
    container.addEventListener('click', container._weCaptureClick, true);
    container.addEventListener('contextmenu', container._weCaptureCtx, true);

    createToolbar();
    updateToolbar();

    document._weEscHandler = (e) => { if (e.key === 'Escape' && editMode) deactivate(); };
    document.addEventListener('keydown', document._weEscHandler);
  }

  function deactivate() {
    if (!ctx) return;
    editMode = false;
    clearSelection();

    ctx.container.classList.remove('edit-mode');
    ctx.container.removeEventListener('click', ctx.container._weCaptureClick, true);
    ctx.container.removeEventListener('contextmenu', ctx.container._weCaptureCtx, true);
    document.removeEventListener('keydown', document._weEscHandler);

    removeToolbar();
    removePopup();
    ctx = null;

    window.dispatchEvent(new CustomEvent('word-edit-mode-changed', { detail: { active: false } }));
  }

  // ── Selection ───────────────────────────────────────────
  function handleWordClick(index, multiKey) {
    if (multiKey && selected.length > 0) {
      const all = [...selected, index];
      const min = Math.min(...all);
      const max = Math.max(...all);
      selected = [];
      for (let i = min; i <= max; i++) selected.push(i);
    } else {
      const already = selected.length === 1 && selected[0] === index;
      selected = already ? [] : [index];
    }
    updateSelectionUI();
    updateToolbar();
  }

  function clearSelection() {
    selected = [];
    updateSelectionUI();
    updateToolbar();
    removePopup();
  }

  function updateSelectionUI() {
    if (!ctx) return;
    const spans = ctx.container.querySelectorAll('.word');
    const set = new Set(selected);
    spans.forEach((el, i) => el.classList.toggle('we-selected', set.has(i)));
  }

  // ── Toolbar ─────────────────────────────────────────────
  function createToolbar() {
    toolbarEl = document.createElement('div');
    toolbarEl.className = 'we-toolbar';
    toolbarEl.innerHTML = `
      <div class="we-toolbar-left">
        <span class="we-toolbar-badge">MODIFICA</span>
        <span class="we-toolbar-info">Clicca una parola per selezionarla · Shift/Cmd+click per intervallo</span>
      </div>
      <div class="we-toolbar-actions">
        <button class="we-btn" data-action="edit" disabled title="Modifica parola (aggiungi spazi per dividere)">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
          Modifica
        </button>
        <button class="we-btn" data-action="merge" disabled title="Unisci parole adiacenti (2+ parole)">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8"/><path d="M12 15v6"/><path d="m17 4-5 7-5-7"/></svg>
          Unisci
        </button>
      </div>
    `;

    ctx.container.parentNode.insertBefore(toolbarEl, ctx.container.nextSibling);

    toolbarEl.querySelector('[data-action="edit"]').addEventListener('click', editSelected);
    toolbarEl.querySelector('[data-action="merge"]').addEventListener('click', mergeSelected);
  }

  function removeToolbar() {
    if (toolbarEl) { toolbarEl.remove(); toolbarEl = null; }
  }

  function updateToolbar() {
    if (!toolbarEl || !ctx) return;

    const info = toolbarEl.querySelector('.we-toolbar-info');
    const editBtn = toolbarEl.querySelector('[data-action="edit"]');
    const mergeBtn = toolbarEl.querySelector('[data-action="merge"]');

    if (selected.length === 0) {
      info.textContent = 'Clicca una parola per selezionarla · Shift/Cmd+click per intervallo';
      editBtn.disabled = true;
      mergeBtn.disabled = true;
    } else if (selected.length === 1) {
      const w = ctx.words[selected[0]];
      const t = `${w.start.toFixed(2)}s → ${w.end.toFixed(2)}s`;
      const merged = w._originals ? ` (${w._originals.length} originali)` : '';
      info.innerHTML = `<strong>"${escHtml(w.word)}"</strong> <span style="opacity:0.5">${t}${merged}</span>`;
      editBtn.disabled = false;
      mergeBtn.disabled = true;
    } else {
      const contiguous = isContiguous(selected);
      const preview = selected.map(i => ctx.words[i].word).join(contiguous ? '' : ' … ');
      info.innerHTML = `${selected.length} parole · <strong>"${escHtml(preview)}"</strong>`;
      editBtn.disabled = true;
      mergeBtn.disabled = !contiguous;
    }
  }

  // ── Timestamp redistribution ───────────────────────────
  // Uses original word boundaries when available (from merge),
  // falls back to proportional-by-character distribution.

  function redistributeTimestamps(word, parts) {
    if (word._originals && word._originals.length > 0) {
      return redistributeFromOriginals(word._originals, parts, word);
    }
    return redistributeProportional(word, parts);
  }

  // Map new parts onto original word time boundaries.
  // Each character position in the merged text has a known time from the originals.
  // We scale the new parts' character positions to the original character space
  // and interpolate timestamps from the original boundaries.
  function redistributeFromOriginals(originals, parts, mergedWord) {
    const totalOrigChars = originals.reduce((s, o) => s + o.word.length, 0);
    const totalNewChars = parts.reduce((s, p) => s + p.length, 0);

    // Build time breakpoints from originals
    const timeBreaks = []; // [{charStart, charEnd, timeStart, timeEnd}]
    let charPos = 0;
    originals.forEach(o => {
      timeBreaks.push({
        charStart: charPos,
        charEnd: charPos + o.word.length,
        timeStart: o.start,
        timeEnd: o.end
      });
      charPos += o.word.length;
    });

    // Map each char position (in original char space) to a time
    function charPosToTime(cp) {
      if (cp <= 0) return originals[0].start;
      if (cp >= totalOrigChars) return originals[originals.length - 1].end;
      for (const tb of timeBreaks) {
        if (cp <= tb.charEnd) {
          const frac = (cp - tb.charStart) / (tb.charEnd - tb.charStart);
          return tb.timeStart + frac * (tb.timeEnd - tb.timeStart);
        }
      }
      return originals[originals.length - 1].end;
    }

    let newCharPos = 0;
    const result = [];

    parts.forEach(part => {
      // Scale new char positions to original char space
      const scaledStart = (newCharPos / totalNewChars) * totalOrigChars;
      const scaledEnd = ((newCharPos + part.length) / totalNewChars) * totalOrigChars;

      result.push({
        word: part,
        start: round3(charPosToTime(scaledStart)),
        end: round3(charPosToTime(scaledEnd)),
      });

      newCharPos += part.length;
    });

    return result;
  }

  // Simple proportional distribution by character count
  function redistributeProportional(word, parts) {
    const duration = word.end - word.start;
    const totalChars = parts.reduce((s, p) => s + p.length, 0);
    const result = [];
    let currentStart = word.start;

    parts.forEach(text => {
      const proportion = text.length / totalChars;
      const wordDuration = duration * proportion;
      result.push({
        word: text,
        start: round3(currentStart),
        end: round3(currentStart + wordDuration),
      });
      currentStart += wordDuration;
    });

    return result;
  }

  // ── Edit / Split (unified) ─────────────────────────────
  function editSelected() {
    if (selected.length !== 1 || !ctx) return;
    const index = selected[0];
    const word = ctx.words[index];
    const wordEl = ctx.container.querySelectorAll('.word')[index];
    if (!wordEl) return;

    removePopup();

    popupEl = document.createElement('div');
    popupEl.className = 'we-split-popup';
    popupEl.innerHTML = `
      <input type="text" class="we-split-input" value="${escAttr(word.word)}">
      <div class="we-split-preview"></div>
    `;
    document.body.appendChild(popupEl);
    positionPopup(popupEl, wordEl, 260);

    const input = popupEl.querySelector('.we-split-input');
    const preview = popupEl.querySelector('.we-split-preview');
    let saved = false; // guard against double-fire (Enter + clickOutside)

    input.focus();
    input.select();

    function updatePreview() {
      const parts = input.value.trim().split(/\s+/).filter(Boolean);
      if (parts.length < 2) {
        preview.textContent = '';
        return;
      }
      // Show split preview with timestamps from redistribution
      const newWords = redistributeTimestamps(word, parts);
      preview.innerHTML = newWords.map(nw =>
        `<span class="we-split-token">"${escHtml(nw.word)}" ${nw.start.toFixed(2)}s→${nw.end.toFixed(2)}s</span>`
      ).join('');
    }

    input.addEventListener('input', updatePreview);
    updatePreview();

    function save() {
      if (saved) return;
      saved = true;
      const raw = input.value.trim();
      if (!raw) { removePopup(); return; }

      const parts = raw.split(/\s+/).filter(Boolean);

      if (parts.length === 1) {
        // Simple text edit — keep timestamps
        if (parts[0] !== word.word) {
          ctx.words[index].word = parts[0];
          wordEl.textContent = parts[0];
          ctx.onPersist(ctx.words);
          updateToolbar();
        }
        removePopup();
      } else {
        // Split — redistribute using originals if available
        const newWords = redistributeTimestamps(word, parts);

        // Propagate confidence from original if present
        if (word.confidence !== undefined) {
          newWords.forEach(nw => { nw.confidence = word.confidence; });
        }

        ctx.words.splice(index, 1, ...newWords);
        selected = [];
        reRender();
        ctx.onPersist(ctx.words);
        removePopup();
      }
    }

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') save();
      if (e.key === 'Escape') removePopup();
      e.stopPropagation();
    });
    onClickOutside(popupEl, save);
  }

  // ── Merge (multiple words → one) ───────────────────────
  // Stores _originals so timestamps can be restored on re-split.
  function mergeSelected() {
    if (selected.length < 2 || !ctx) return;
    const sorted = [...selected].sort((a, b) => a - b);
    if (!isContiguous(sorted)) return;

    // Collect all originals (flatten if any word was already a merge)
    const originals = [];
    sorted.forEach(i => {
      const w = ctx.words[i];
      if (w._originals && w._originals.length > 0) {
        // Already merged — flatten the originals chain
        w._originals.forEach(o => originals.push({ word: o.word, start: o.start, end: o.end }));
      } else {
        originals.push({ word: w.word, start: w.start, end: w.end });
      }
    });

    const mergedText = originals.map(o => o.word).join('');
    const newWord = {
      word: mergedText,
      start: originals[0].start,
      end: originals[originals.length - 1].end,
      _originals: originals,
    };

    if (ctx.words[sorted[0]].confidence !== undefined) {
      newWord.confidence = sorted.reduce((s, i) => s + (ctx.words[i].confidence || 0), 0) / sorted.length;
    }

    ctx.words.splice(sorted[0], sorted.length, newWord);
    selected = [sorted[0]];
    reRender();
    ctx.onPersist(ctx.words);
  }

  // ── Re-render ───────────────────────────────────────────
  function reRender() {
    if (!ctx || !ctx.onReRender) return;
    ctx.onReRender(ctx.words, ctx.container, ctx.audioEl);
    updateSelectionUI();
    updateToolbar();
  }

  // ── Popup helpers ───────────────────────────────────────
  function removePopup() {
    if (popupEl) { popupEl.remove(); popupEl = null; }
  }

  function positionPopup(el, anchor, width) {
    const rect = anchor.getBoundingClientRect();
    let left = rect.left;
    if (left + width > window.innerWidth - 16) left = window.innerWidth - width - 16;
    if (left < 8) left = 8;

    const spaceBelow = window.innerHeight - rect.bottom;
    if (spaceBelow < 140) {
      el.style.left = left + 'px';
      el.style.bottom = (window.innerHeight - rect.top + 6) + 'px';
    } else {
      el.style.left = left + 'px';
      el.style.top = (rect.bottom + 6) + 'px';
    }
  }

  function onClickOutside(el, callback) {
    setTimeout(() => {
      document.addEventListener('mousedown', function handler(e) {
        if (el && !el.contains(e.target)) {
          callback();
          document.removeEventListener('mousedown', handler);
        }
      });
    }, 30);
  }

  // ── Utilities ───────────────────────────────────────────
  function isContiguous(indices) {
    const s = [...indices].sort((a, b) => a - b);
    for (let i = 1; i < s.length; i++) {
      if (s[i] !== s[i - 1] + 1) return false;
    }
    return true;
  }

  function round3(n) { return Math.round(n * 1000) / 1000; }
  function escHtml(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function escAttr(s) { return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;'); }
})();
