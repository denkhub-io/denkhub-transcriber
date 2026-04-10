// Mini Player — Spotify-style persistent bar at bottom
// Proxies whichever audio element (main or history) is currently active.
document.addEventListener('DOMContentLoaded', () => {

  const mainAudio = document.getElementById('audioPlayer');
  const historyAudio = document.getElementById('historyAudioPlayer');

  const bar = document.getElementById('miniPlayer');
  const nameBtn = document.getElementById('miniPlayerName');
  const nameText = document.getElementById('miniPlayerNameText');
  const playPauseBtn = document.getElementById('miniPlayPause');
  const playIcon = bar.querySelector('.mini-play-icon');
  const pauseIcon = bar.querySelector('.mini-pause-icon');
  const restartBtn = document.getElementById('miniRestart');
  const skipBackBtn = document.getElementById('miniSkipBack');
  const skipForwardBtn = document.getElementById('miniSkipForward');
  const track = document.getElementById('miniPlayerTrack');
  const trackFill = document.getElementById('miniPlayerTrackFill');
  const currentTimeEl = document.getElementById('miniCurrentTime');
  const durationEl = document.getElementById('miniDuration');
  const speedBtns = bar.querySelectorAll('.mini-speed-btn');
  const appContent = document.querySelector('.app-content');

  let activeSource = null; // 'main' | 'history'
  let activeAudio = null;
  let syncFrame = null;

  // --- Bind to whichever audio starts playing ---
  mainAudio.addEventListener('play', () => bind('main', mainAudio));
  historyAudio.addEventListener('play', () => bind('history', historyAudio));

  function bind(source, audioEl) {
    // If switching sources, pause the old one
    if (activeAudio && activeAudio !== audioEl && !activeAudio.paused) {
      activeAudio.pause();
    }

    activeSource = source;
    activeAudio = audioEl;

    // Get filename
    if (source === 'main') {
      const titleEl = document.getElementById('resultTitle');
      nameText.textContent = titleEl ? titleEl.textContent : 'Audio';
    } else {
      const titleEl = document.getElementById('historyDetailTitle');
      nameText.textContent = titleEl ? titleEl.textContent : 'Audio';
    }

    // Sync speed buttons
    syncSpeedUI();
    updatePlayPauseIcon();
    updateVisibility();
    startSyncLoop();
  }

  // --- Sync loop ---
  function startSyncLoop() {
    cancelAnimationFrame(syncFrame);
    syncLoop();
  }

  function syncLoop() {
    if (!activeAudio) return;

    const t = activeAudio.currentTime;
    const d = activeAudio.duration;

    currentTimeEl.textContent = formatTime(t);
    durationEl.textContent = formatTime(d);

    if (d && isFinite(d)) {
      trackFill.style.width = (t / d * 100) + '%';
    }

    updatePlayPauseIcon();

    if (!activeAudio.paused) {
      syncFrame = requestAnimationFrame(syncLoop);
    }
  }

  function updatePlayPauseIcon() {
    if (!activeAudio) return;
    if (activeAudio.paused) {
      playIcon.style.display = '';
      pauseIcon.style.display = 'none';
    } else {
      playIcon.style.display = 'none';
      pauseIcon.style.display = '';
    }
  }

  // --- Controls ---
  playPauseBtn.addEventListener('click', () => {
    if (!activeAudio) return;
    if (activeAudio.paused) activeAudio.play();
    else activeAudio.pause();
  });

  restartBtn.addEventListener('click', () => {
    if (!activeAudio) return;
    activeAudio.currentTime = 0;
    activeAudio.play();
  });

  skipBackBtn.addEventListener('click', () => {
    if (!activeAudio) return;
    activeAudio.currentTime = Math.max(0, activeAudio.currentTime - 10);
    syncLoop();
  });

  skipForwardBtn.addEventListener('click', () => {
    if (!activeAudio) return;
    activeAudio.currentTime = Math.min(activeAudio.duration || 0, activeAudio.currentTime + 10);
    syncLoop();
  });

  // Seek
  track.addEventListener('click', (e) => {
    if (!activeAudio || !activeAudio.duration) return;
    const rect = track.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    activeAudio.currentTime = pct * activeAudio.duration;
    syncLoop();
  });

  // Speed
  speedBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      if (!activeAudio) return;
      const speed = parseFloat(btn.dataset.speed);
      activeAudio.playbackRate = speed;
      speedBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      // Also sync the in-view player speed buttons
      syncInViewSpeed(speed);
    });
  });

  function syncSpeedUI() {
    if (!activeAudio) return;
    const rate = activeAudio.playbackRate;
    speedBtns.forEach(b => {
      b.classList.toggle('active', parseFloat(b.dataset.speed) === rate);
    });
  }

  function syncInViewSpeed(speed) {
    const selector = activeSource === 'main'
      ? '#resultContainer .player-speed-btn'
      : '#historyDetail .player-speed-btn';
    document.querySelectorAll(selector).forEach(b => {
      b.classList.toggle('active', parseFloat(b.dataset.speed) === speed);
    });
  }

  // --- Navigate to source on name click ---
  nameBtn.addEventListener('click', () => {
    if (!activeSource) return;

    // Show target view without triggering reset-transcribe
    const viewName = activeSource === 'main' ? 'transcribe' : 'history';
    const targetViewId = viewName + 'View';

    document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
    const sidebarBtn = document.querySelector(`.sidebar-item[data-view="${viewName}"]`);
    if (sidebarBtn) sidebarBtn.classList.add('active');

    document.querySelectorAll('.view').forEach(v => {
      v.style.display = v.id === targetViewId ? '' : 'none';
    });

    // For history: ensure the detail view is shown (not the list)
    if (activeSource === 'history') {
      const historyList = document.getElementById('historyList');
      const historyDetail = document.getElementById('historyDetail');
      const searchBar = document.querySelector('#historyView .search-bar') ||
                        (document.getElementById('historySearch') ? document.getElementById('historySearch').parentElement : null);
      if (historyList) historyList.style.display = 'none';
      if (historyDetail) historyDetail.style.display = '';
      if (searchBar) searchBar.style.display = 'none';
    }

    updateVisibility();
  });

  // --- Visibility logic ---
  function updateVisibility() {
    if (!activeAudio || !activeAudio.src || activeAudio.src === '') {
      hide();
      return;
    }

    if (isViewingSource()) {
      hide();
    } else {
      show();
    }
  }

  function show() {
    bar.style.display = '';
    bar.classList.remove('slide-out');
    appContent.classList.add('has-mini-player');
  }

  function hide() {
    bar.style.display = 'none';
    appContent.classList.remove('has-mini-player');
  }

  function isViewingSource() {
    if (activeSource === 'main') {
      const view = document.getElementById('transcribeView');
      const result = document.getElementById('resultContainer');
      return view && view.style.display !== 'none' && result && result.style.display !== 'none';
    }
    if (activeSource === 'history') {
      const view = document.getElementById('historyView');
      const detail = document.getElementById('historyDetail');
      return view && view.style.display !== 'none' && detail && detail.style.display !== 'none';
    }
    return false;
  }

  // --- Listen for view changes ---
  document.querySelectorAll('.sidebar-item').forEach(item => {
    item.addEventListener('click', () => setTimeout(updateVisibility, 10));
  });

  // History back button hides detail → show mini player if audio still active
  const historyBack = document.getElementById('historyBackBtn');
  if (historyBack) {
    historyBack.addEventListener('click', () => setTimeout(updateVisibility, 10));
  }

  // Audio events
  [mainAudio, historyAudio].forEach(a => {
    a.addEventListener('pause', () => {
      updatePlayPauseIcon();
      syncLoop(); // one last sync
    });
    a.addEventListener('ended', () => {
      updatePlayPauseIcon();
    });
    a.addEventListener('emptied', () => {
      if ((activeSource === 'main' && a === mainAudio) ||
          (activeSource === 'history' && a === historyAudio)) {
        activeSource = null;
        activeAudio = null;
        hide();
      }
    });
    a.addEventListener('loadedmetadata', () => {
      if (a === activeAudio) {
        durationEl.textContent = formatTime(a.duration);
      }
    });
  });

  // Reset transcribe pauses audio but keeps mini player available
  window.addEventListener('reset-transcribe', () => {
    if (activeAudio && !activeAudio.paused) {
      activeAudio.pause();
    }
    updateVisibility();
  });

  function formatTime(s) {
    if (!s || isNaN(s) || !isFinite(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
  }
});
