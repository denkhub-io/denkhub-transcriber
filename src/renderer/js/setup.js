// Setup Wizard — first-run experience
document.addEventListener('DOMContentLoaded', async () => {
  const isFirstRun = await window.api.isFirstRun();
  if (!isFirstRun) return;

  // Hide main views, show setup
  document.getElementById('transcribeView').style.display = 'none';
  document.getElementById('setupView').style.display = '';
  document.querySelector('.sidebar').style.display = 'none';

  const steps = document.querySelectorAll('.setup-step');
  let currentStep = 0;
  let selectedModels = new Set();

  // --- EULA Step ---
  const eulaCheckbox = document.getElementById('eulaAccept');
  const eulaNextBtn = document.getElementById('setupNext0');

  eulaCheckbox.addEventListener('change', () => {
    eulaNextBtn.disabled = !eulaCheckbox.checked;
  });

  eulaNextBtn.addEventListener('click', () => showStep(1));

  const modelsPath = document.getElementById('setupModelsPath');
  const transcriptionsPath = document.getElementById('setupTranscriptionsPath');

  // Set default paths
  const settings = await window.api.getSettings();
  const defaultModelsDir = await window.api.getDefaultPath('models');
  const defaultTranscriptionsDir = await window.api.getDefaultPath('transcriptions');

  modelsPath.value = defaultModelsDir;
  transcriptionsPath.value = defaultTranscriptionsDir;

  // Enable "Avanti" by default since we have defaults
  document.getElementById('setupNext1').disabled = false;
  document.getElementById('setupNext2').disabled = false;

  // Known models
  const MODELS = [
    { name: 'tiny', size: '75 MB', desc: 'Velocissimo, meno preciso' },
    { name: 'base', size: '142 MB', desc: 'Bilanciato (consigliato)' },
    { name: 'small', size: '466 MB', desc: 'Buona precisione' },
    { name: 'medium', size: '1.5 GB', desc: 'Molto preciso' },
    { name: 'large', size: '3.1 GB', desc: 'Massima precisione' }
  ];

  function showStep(n) {
    steps.forEach(s => {
      const stepNum = parseInt(s.dataset.step);
      s.style.display = stepNum === n ? '' : 'none';
    });
    currentStep = n;
  }

  // Start at EULA step
  showStep(0);

  // Step 1: Models directory
  document.getElementById('setupChooseModels').addEventListener('click', async () => {
    const dir = await window.api.chooseDirectory('models');
    if (dir) modelsPath.value = dir;
  });

  document.getElementById('setupNext1').addEventListener('click', () => showStep(2));

  // Step 2: Transcriptions directory
  document.getElementById('setupChooseTranscriptions').addEventListener('click', async () => {
    const dir = await window.api.chooseDirectory('transcriptions');
    if (dir) transcriptionsPath.value = dir;
  });

  document.getElementById('setupBack2').addEventListener('click', () => showStep(1));
  document.getElementById('setupNext2').addEventListener('click', () => {
    showStep(3);
    renderModelCards();
  });

  // Step 3: Choose model
  function renderModelCards() {
    const grid = document.getElementById('setupModelsList');
    grid.innerHTML = '';

    MODELS.forEach(m => {
      const card = document.createElement('div');
      card.className = 'surface-card model-card';
      card.innerHTML = `
        <div class="model-card-name">${m.name.charAt(0).toUpperCase() + m.name.slice(1)}</div>
        <div class="model-card-size">${m.size}</div>
        <div class="model-card-desc">${m.desc}</div>
      `;
      card.addEventListener('click', () => {
        card.classList.toggle('selected');
        if (card.classList.contains('selected')) {
          selectedModels.add(m.name);
        } else {
          selectedModels.delete(m.name);
        }
        document.getElementById('setupFinish').disabled = selectedModels.size === 0;
      });
      grid.appendChild(card);
    });

    // Pre-select "base"
    const baseCard = grid.children[1];
    if (baseCard) {
      baseCard.classList.add('selected');
      selectedModels.add('base');
      document.getElementById('setupFinish').disabled = false;
    }
  }

  document.getElementById('setupBack3').addEventListener('click', () => showStep(2));

  document.getElementById('setupFinish').addEventListener('click', async () => {
    const modelsArray = Array.from(selectedModels);

    // Save settings
    await window.api.updateSettings({
      modelsDirectory: modelsPath.value,
      transcriptionsDirectory: transcriptionsPath.value,
      lastUsedModel: modelsArray[0]
    });

    // Download all selected models
    const finishBtn = document.getElementById('setupFinish');
    finishBtn.disabled = true;

    const progressDiv = document.getElementById('setupDownloadProgress');
    progressDiv.style.display = '';

    window.api.onDownloadProgress((data) => {
      const pct = Math.round(data.percent);
      document.getElementById('setupProgressBar').style.width = pct + '%';
      document.getElementById('setupProgressText').textContent = `Scaricamento modello ${data.model}... ${pct}%`;
    });

    for (let i = 0; i < modelsArray.length; i++) {
      const name = modelsArray[i];
      finishBtn.textContent = `Scaricamento ${i + 1}/${modelsArray.length}...`;
      document.getElementById('setupProgressBar').style.width = '0%';
      await window.api.downloadModel(name);
    }

    // Complete setup
    await window.api.completeSetup();

    // Transition to main app
    document.getElementById('setupView').style.display = 'none';
    document.getElementById('transcribeView').style.display = '';
    document.querySelector('.sidebar').style.display = '';
  });
});
