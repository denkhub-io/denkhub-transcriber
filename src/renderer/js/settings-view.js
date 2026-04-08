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
});
