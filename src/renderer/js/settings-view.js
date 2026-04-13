// Settings view — change models/transcriptions directories
document.addEventListener('DOMContentLoaded', () => {
  const modelsPathInput = document.getElementById('settingsModelsPath');
  const transcriptionsPathInput = document.getElementById('settingsTranscriptionsPath');

  // Load current settings when view becomes visible
  const observer = new MutationObserver(async () => {
    const view = document.getElementById('settingsView');
    if (view && view.style.display !== 'none') {
      const s = await window.api.getSettings();
      modelsPathInput.value = s.modelsDirectory || '';
      transcriptionsPathInput.value = s.transcriptionsDirectory || '';
    }
  });

  const settingsView = document.getElementById('settingsView');
  if (settingsView) {
    observer.observe(settingsView, { attributes: true, attributeFilter: ['style'] });
  }

  // Change models directory
  document.getElementById('settingsChangeModels').addEventListener('click', async () => {
    const dir = await window.api.chooseDirectory('models');
    if (dir) {
      modelsPathInput.value = dir;
      await window.api.updateSettings({ modelsDirectory: dir });
    }
  });

  // Change transcriptions directory
  document.getElementById('settingsChangeTranscriptions').addEventListener('click', async () => {
    const dir = await window.api.chooseDirectory('transcriptions');
    if (dir) {
      transcriptionsPathInput.value = dir;
      await window.api.updateSettings({ transcriptionsDirectory: dir });
    }
  });

  // --- Update settings ---
  const checkUpdateBtn = document.getElementById('settingsCheckUpdate');
  const updateStatus = document.getElementById('settingsUpdateStatus');
  const autoUpdateCheckbox = document.getElementById('settingsAutoUpdate');

  // Load auto-update preference
  window.api.getSettings().then(s => {
    autoUpdateCheckbox.checked = s.autoUpdate !== false; // default true
  });

  autoUpdateCheckbox.addEventListener('change', () => {
    window.api.updateSettings({ autoUpdate: autoUpdateCheckbox.checked });
  });

  // --- Claude MCP integration ---
  const claudeBtn = document.getElementById('settingsAddClaude');
  const claudeRemoveBtn = document.getElementById('settingsRemoveClaude');
  const claudeLabel = document.getElementById('settingsClaudeLabel');
  const claudeStatus = document.getElementById('settingsClaudeStatus');

  async function updateClaudeStatus() {
    const connected = await window.api.checkClaudeConnected();
    if (connected) {
      claudeBtn.classList.add('connected');
      claudeLabel.textContent = 'Connesso a Claude';
      claudeRemoveBtn.style.display = '';
      claudeStatus.textContent = '';
    } else {
      claudeBtn.classList.remove('connected');
      claudeLabel.textContent = 'Aggiungi a Claude';
      claudeRemoveBtn.style.display = 'none';
      claudeStatus.textContent = '';
    }
  }

  updateClaudeStatus();

  claudeBtn.addEventListener('click', async () => {
    if (claudeBtn.classList.contains('connected')) return;

    claudeBtn.disabled = true;
    claudeLabel.textContent = 'Configurazione...';

    const result = await window.api.addToClaude();
    if (result.success) {
      claudeBtn.classList.add('connected');
      claudeLabel.textContent = 'Connesso a Claude';
      claudeRemoveBtn.style.display = '';
      claudeStatus.textContent = 'Riavvia Claude Desktop per attivare.';
      claudeStatus.style.color = 'var(--accent-color)';
    } else {
      claudeLabel.textContent = 'Aggiungi a Claude';
      claudeStatus.textContent = 'Errore: ' + result.error;
      claudeStatus.style.color = '#e57373';
    }
    claudeBtn.disabled = false;
  });

  claudeRemoveBtn.addEventListener('click', async () => {
    claudeRemoveBtn.disabled = true;
    const result = await window.api.removeFromClaude();
    if (result.success) {
      claudeBtn.classList.remove('connected');
      claudeLabel.textContent = 'Aggiungi a Claude';
      claudeRemoveBtn.style.display = 'none';
      claudeStatus.textContent = 'Scollegato. Riavvia Claude Desktop.';
      claudeStatus.style.color = 'var(--text-secondary)';
    } else {
      claudeStatus.textContent = 'Errore: ' + result.error;
      claudeStatus.style.color = '#e57373';
    }
    claudeRemoveBtn.disabled = false;
  });

  checkUpdateBtn.addEventListener('click', async () => {
    updateStatus.textContent = 'Controllo in corso...';
    checkUpdateBtn.disabled = true;
    try {
      const update = await window.api.checkUpdate();
      if (update) {
        updateStatus.innerHTML = `<span style="color: var(--accent-color);">v${update.version} disponibile!</span>`;
        if (autoUpdateCheckbox.checked) {
          updateStatus.innerHTML += ' Scaricamento...';
          const result = await window.api.downloadUpdate(update.downloadUrl);
          if (result && result.success) {
            updateStatus.innerHTML = `<span style="color: var(--accent-color);">v${update.version} pronta!</span> `;
            const installBtn = document.createElement('button');
            installBtn.className = 'btn btn-primary btn-sm';
            installBtn.textContent = 'Installa ora';
            installBtn.style.marginLeft = '8px';
            installBtn.addEventListener('click', () => {
              if (confirm(`Installare la versione ${update.version}? L'app verrà chiusa.`)) {
                window.api.installUpdate(result.path);
              }
            });
            updateStatus.appendChild(installBtn);
          } else {
            updateStatus.innerHTML = `<span style="color: var(--accent-color);">v${update.version} disponibile.</span> <a href="#" id="updateManualLink" style="color: var(--accent-color);">Scarica manualmente</a>`;
            document.getElementById('updateManualLink')?.addEventListener('click', (e) => {
              e.preventDefault();
              window.api.openExternal(update.url);
            });
          }
        } else {
          const link = document.createElement('a');
          link.href = '#';
          link.style.color = 'var(--accent-color)';
          link.textContent = 'Scarica';
          link.addEventListener('click', (e) => {
            e.preventDefault();
            window.api.openExternal(update.downloadUrl);
          });
          updateStatus.append(' ', link);
        }
      } else {
        updateStatus.textContent = 'Sei aggiornato!';
      }
    } catch {
      updateStatus.textContent = 'Impossibile verificare aggiornamenti.';
    }
    checkUpdateBtn.disabled = false;
  });
});
