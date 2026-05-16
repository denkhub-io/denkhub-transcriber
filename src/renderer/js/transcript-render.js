/**
 * Shared transcript renderer used by both the live result view (app.js) and
 * the history detail view (history.js). It supports two layouts:
 *
 *   - Plain (legacy): all words inline in a single block. Used when no
 *     word has a `speaker` field, i.e. single-speaker transcriptions or
 *     transcriptions made before diarization existed.
 *
 *   - Bubbles: words grouped into utterances by speaker turn. Each bubble
 *     is preceded by a small speaker label and gets a per-speaker color
 *     class (.speaker-s1, .speaker-s2, …) so visual separation is obvious.
 *
 * Click-to-seek and right-click-to-edit behave identically in both layouts.
 * Word `<span>` elements are produced through the same factory, so anything
 * that walks `.word` selectors (highlight-during-playback, edit mode) keeps
 * working without changes.
 *
 * window.SpeakerLabels (set by settings/UI) can override "S1" → "Marco"
 * etc. — we fall back to the raw label when nothing is mapped.
 */
(function () {
  const MAX_SPEAKER_COLORS = 8;

  function makeWordSpan(w, i, audioEl, onContextMenu) {
    const span = document.createElement('span');
    span.textContent = w.word;
    span.className = 'word';
    span.dataset.start = w.start;
    span.dataset.end = w.end;
    span.dataset.index = i;
    if (w.speaker) span.dataset.speaker = w.speaker;
    span.addEventListener('click', () => {
      if (audioEl) {
        audioEl.currentTime = w.start;
        audioEl.play();
      }
    });
    if (onContextMenu) {
      span.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        onContextMenu(span, w, i);
      });
    }
    return span;
  }

  function hasAnySpeaker(words) {
    for (const w of words) if (w && w.speaker) return true;
    return false;
  }

  // Convert raw label ("S1", "S2", …) to a stable 1-based color index in
  // [1, MAX_SPEAKER_COLORS], so we cycle gracefully with many speakers.
  function speakerColorIndex(label, knownOrder) {
    let pos = knownOrder.indexOf(label);
    if (pos === -1) {
      knownOrder.push(label);
      pos = knownOrder.length - 1;
    }
    return (pos % MAX_SPEAKER_COLORS) + 1;
  }

  function displayName(label) {
    const overrides = (typeof window !== 'undefined' && window.SpeakerLabels) || null;
    if (overrides && overrides[label]) return overrides[label];
    // "S1" → "Speaker 1"; passthrough anything else.
    const m = /^S(\d+)$/.exec(label);
    return m ? `Speaker ${m[1]}` : label;
  }

  // Group consecutive words sharing the same speaker into a single bubble.
  function groupBySpeaker(words) {
    const groups = [];
    let current = null;
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      const sp = w.speaker || 'S1';
      if (!current || current.speaker !== sp) {
        current = { speaker: sp, start: w.start, end: w.end, items: [] };
        groups.push(current);
      }
      current.items.push({ word: w, originalIndex: i });
      if (w.end > current.end) current.end = w.end;
    }
    return groups;
  }

  function renderPlain(words, container, audioEl, onContextMenu) {
    const fragment = document.createDocumentFragment();
    words.forEach((w, i) => {
      if (i > 0) fragment.appendChild(document.createTextNode(' '));
      fragment.appendChild(makeWordSpan(w, i, audioEl, onContextMenu));
    });
    container.appendChild(fragment);
  }

  function renderBubbles(words, container, audioEl, onContextMenu) {
    container.classList.add('transcription-area-bubbles');
    const groups = groupBySpeaker(words);
    const knownOrder = [];
    const fragment = document.createDocumentFragment();

    groups.forEach((g) => {
      const colorIdx = speakerColorIndex(g.speaker, knownOrder);
      const bubble = document.createElement('div');
      bubble.className = `speaker-bubble speaker-s${colorIdx}`;
      bubble.dataset.speaker = g.speaker;
      bubble.dataset.start = g.start;
      bubble.dataset.end = g.end;

      const header = document.createElement('div');
      header.className = 'speaker-label';
      const dot = document.createElement('span');
      dot.className = `speaker-dot speaker-dot-s${colorIdx}`;
      header.appendChild(dot);
      const name = document.createElement('span');
      name.className = 'speaker-name';
      name.textContent = displayName(g.speaker);
      header.appendChild(name);
      bubble.appendChild(header);

      const body = document.createElement('div');
      body.className = 'speaker-body';
      g.items.forEach((it, j) => {
        if (j > 0) body.appendChild(document.createTextNode(' '));
        body.appendChild(makeWordSpan(it.word, it.originalIndex, audioEl, onContextMenu));
      });
      bubble.appendChild(body);
      fragment.appendChild(bubble);
    });

    container.appendChild(fragment);
  }

  /**
   * Render an array of word objects into `container`.
   *
   * @param {Array<{word, start, end, speaker?}>} words
   * @param {HTMLElement} container
   * @param {HTMLAudioElement|null} audioEl
   * @param {Function|null} onContextMenu — (span, word, index) => void
   */
  function renderTranscript(words, container, audioEl, onContextMenu) {
    container.innerHTML = '';
    container.classList.remove('transcription-area-bubbles');
    if (!words || words.length === 0) {
      container.textContent = 'Nessun testo.';
      return;
    }
    if (hasAnySpeaker(words)) {
      renderBubbles(words, container, audioEl, onContextMenu);
    } else {
      renderPlain(words, container, audioEl, onContextMenu);
    }
  }

  window.TranscriptRender = { renderTranscript };
})();
