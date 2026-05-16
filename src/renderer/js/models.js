// Models management view
document.addEventListener('DOMContentLoaded', () => {
  const MODELS = [
    { name: 'tiny', size: '75 MB', sizeBytes: 75e6, desc: 'Velocissimo, meno preciso. Ideale per test rapidi.' },
    { name: 'base', size: '142 MB', sizeBytes: 142e6, desc: 'Buon compromesso tra velocità e precisione.' },
    { name: 'small', size: '466 MB', sizeBytes: 466e6, desc: 'Buona precisione per la maggior parte degli usi.' },
    { name: 'medium', size: '1.5 GB', sizeBytes: 1.5e9, desc: 'Molto preciso. Consigliato per contenuti importanti.' },
    { name: 'large', size: '3.1 GB', sizeBytes: 3.1e9, desc: 'Massima precisione. Richiede più tempo e risorse.' }
  ];

  const grid = document.getElementById('modelsGrid');
  let activeDownloads = new Set(); // track downloads in progress

  async function renderModels() {
    // Don't re-render if downloads are active
    if (activeDownloads.size > 0) return;

    const allModels = await window.api.getModels();
    const downloadedNames = allModels.filter(m => m.downloaded).map(m => m.name);
    grid.innerHTML = '';

    MODELS.forEach(m => {
      const isDownloaded = allModels.find(am => am.name === m.name)?.downloaded || false;
      const card = document.createElement('div');
      card.className = 'surface-card model-manage-card';
      card.id = `model-card-${m.name}`;
      card.innerHTML = `
        <div class="model-manage-header">
          <div class="model-manage-name">${m.name.charAt(0).toUpperCase() + m.name.slice(1)}</div>
          ${isDownloaded
            ? '<span class="pill pill-success">Scaricato</span>'
            : `<span class="pill pill-info">${m.size}</span>`
          }
        </div>
        <div class="model-manage-details">${m.desc}</div>
        <div class="model-manage-progress" style="display: none; margin-bottom: var(--space-sm);">
          <div class="progress-track">
            <div class="progress-fill" style="width: 0%;"></div>
          </div>
          <span style="font-size: 0.78rem; color: var(--text-secondary);">0%</span>
        </div>
        ${isDownloaded
          ? `<button class="btn btn-danger btn-sm" data-action="delete" data-model="${m.name}">Elimina</button>`
          : `<button class="btn btn-secondary btn-sm" data-action="download" data-model="${m.name}">Scarica</button>`
        }
      `;
      grid.appendChild(card);
    });

    // Bind actions
    grid.querySelectorAll('[data-action="download"]').forEach(btn => {
      btn.addEventListener('click', () => downloadModel(btn.dataset.model, btn));
    });

    grid.querySelectorAll('[data-action="delete"]').forEach(btn => {
      btn.addEventListener('click', () => deleteModel(btn.dataset.model));
    });

    // Also update the transcription model dropdown
    updateModelDropdown(downloadedNames);
  }

  async function downloadModel(name, btn) {
    const card = btn.closest('.model-manage-card');
    const progressDiv = card.querySelector('.model-manage-progress');
    const progressFill = progressDiv.querySelector('.progress-fill');
    const progressText = progressDiv.querySelector('span');

    btn.disabled = true;
    btn.textContent = 'Scaricamento...';
    progressDiv.style.display = '';
    activeDownloads.add(name);

    window.api.onDownloadProgress((data) => {
      if (data.model === name) {
        const pct = Math.round(data.percent);
        progressFill.style.width = pct + '%';
        progressText.textContent = pct + '%';
      }
    });

    await window.api.downloadModel(name);
    activeDownloads.delete(name);
    renderModels();
  }

  async function deleteModel(name) {
    if (!confirm(`Eliminare il modello "${name}"?`)) return;
    await window.api.deleteModel(name);
    renderModels();
  }

  function updateModelDropdown(downloadedNames) {
    const select = document.getElementById('modelSelect');
    if (!select) return;

    select.innerHTML = '';
    if (downloadedNames.length === 0) {
      const opt = document.createElement('option');
      opt.textContent = 'Nessun modello scaricato';
      opt.disabled = true;
      select.appendChild(opt);
      return;
    }

    downloadedNames.forEach(name => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name.charAt(0).toUpperCase() + name.slice(1);
      select.appendChild(opt);
    });
  }

  // Render when models view becomes visible, but only if no downloads active
  const observer = new MutationObserver(() => {
    const modelsView = document.getElementById('modelsView');
    if (modelsView && modelsView.style.display !== 'none') {
      renderModels();
    }
  });

  const modelsView = document.getElementById('modelsView');
  if (modelsView) {
    observer.observe(modelsView, { attributes: true, attributeFilter: ['style'] });
  }

  // Initial render to populate dropdown
  renderModels();

  // --- Diarization model card ---------------------------------------------

  const diarContainer = document.getElementById('diarizationCard');
  let diarDownloading = false;

  async function renderDiarizationCard() {
    if (!diarContainer) return;
    if (diarDownloading) return;
    let info;
    try {
      info = await window.api.getDiarizationInfo();
    } catch (e) {
      diarContainer.innerHTML = `<div class="surface-card" style="padding: var(--space-md); color: var(--text-secondary); font-size: 0.85rem;">Modulo diarization non disponibile in questa build.</div>`;
      return;
    }
    const ready = info && info.ready;
    diarContainer.innerHTML = `
      <div class="surface-card model-manage-card" style="max-width: 520px;">
        <div class="model-manage-header">
          <div class="model-manage-name">Modelli diarization</div>
          ${ready
            ? '<span class="pill pill-success">Scaricato</span>'
            : '<span class="pill pill-info">~35 MB</span>'
          }
        </div>
        <div class="model-manage-details">Segmentazione pyannote 3.0 + embedding CAM++ multilingua. Necessari per identificare automaticamente i parlanti durante la trascrizione.</div>
        <div class="diar-progress" style="display: none; margin-bottom: var(--space-sm);">
          <div class="progress-track"><div class="diar-progress-fill progress-fill" style="width: 0%;"></div></div>
          <span class="diar-progress-text" style="font-size: 0.78rem; color: var(--text-secondary);">0%</span>
        </div>
        ${ready
          ? '<button class="btn btn-ghost btn-sm" data-action="diar-info" disabled>Pronto</button>'
          : '<button class="btn btn-secondary btn-sm" data-action="diar-download">Scarica modelli</button>'
        }
      </div>
    `;
    const btn = diarContainer.querySelector('[data-action="diar-download"]');
    if (btn) btn.addEventListener('click', downloadDiarizationModels);
  }

  async function downloadDiarizationModels() {
    if (diarDownloading) return;
    diarDownloading = true;
    const progressDiv = diarContainer.querySelector('.diar-progress');
    const progressFill = diarContainer.querySelector('.diar-progress-fill');
    const progressText = diarContainer.querySelector('.diar-progress-text');
    const btn = diarContainer.querySelector('[data-action="diar-download"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Scaricamento...'; }
    if (progressDiv) progressDiv.style.display = '';

    window.api.onDiarizationProgress((data) => {
      const pct = Math.round(data.percent || 0);
      if (progressFill) progressFill.style.width = pct + '%';
      if (progressText) progressText.textContent = `${pct}% — ${data.stage || ''}`;
    });

    const result = await window.api.downloadDiarizationModels();
    diarDownloading = false;
    if (result && result.success === false) {
      alert('Download fallito: ' + (result.error || 'errore sconosciuto'));
    }
    renderDiarizationCard();
  }

  // Render on view show (and once at start, to populate state)
  const diarObserver = new MutationObserver(() => {
    const v = document.getElementById('modelsView');
    if (v && v.style.display !== 'none') renderDiarizationCard();
  });
  const modelsViewEl = document.getElementById('modelsView');
  if (modelsViewEl) diarObserver.observe(modelsViewEl, { attributes: true, attributeFilter: ['style'] });
  renderDiarizationCard();
});
