// Custom audio player with word-level sync and speed controls
document.addEventListener('DOMContentLoaded', () => {

  // Initialize a player instance for a given set of elements
  function initPlayer(config) {
    const { audio, playBtn, playIcon, pauseIcon, currentTimeEl, durationEl, track, trackFill, speedBtns, transcriptionArea } = config;
    if (!audio || !playBtn) return;

    let syncFrame;
    let lastActiveIndex = -1;

    // Play/Pause
    playBtn.addEventListener('click', () => {
      if (audio.paused) audio.play();
      else audio.pause();
    });

    audio.addEventListener('play', () => {
      playIcon.style.display = 'none';
      pauseIcon.style.display = '';
      syncFrame = requestAnimationFrame(syncLoop);
    });

    audio.addEventListener('pause', () => {
      playIcon.style.display = '';
      pauseIcon.style.display = 'none';
      cancelAnimationFrame(syncFrame);
    });

    // Time update
    audio.addEventListener('loadedmetadata', () => {
      durationEl.textContent = formatTime(audio.duration);
    });

    function syncLoop() {
      const t = audio.currentTime;
      currentTimeEl.textContent = formatTime(t);

      // Track fill
      if (audio.duration) {
        trackFill.style.width = (t / audio.duration * 100) + '%';
      }

      // Word highlight
      if (transcriptionArea) {
        const words = transcriptionArea.querySelectorAll('.word');
        if (words.length > 0) {
          let activeIndex = -1;
          for (let i = 0; i < words.length; i++) {
            const start = parseFloat(words[i].dataset.start);
            const nextStart = (i + 1 < words.length) ? parseFloat(words[i + 1].dataset.start) : Infinity;
            if (t >= start && t < nextStart) {
              activeIndex = i;
              break;
            }
          }
          if (activeIndex !== lastActiveIndex) {
            if (lastActiveIndex >= 0 && lastActiveIndex < words.length) words[lastActiveIndex].classList.remove('active');
            if (activeIndex >= 0) {
              words[activeIndex].classList.add('active');
              words[activeIndex].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
            lastActiveIndex = activeIndex;
          }
        }
      }

      if (!audio.paused) syncFrame = requestAnimationFrame(syncLoop);
    }

    // Seek on track click
    track.addEventListener('click', (e) => {
      const rect = track.getBoundingClientRect();
      const pct = (e.clientX - rect.left) / rect.width;
      audio.currentTime = pct * audio.duration;
    });

    // Speed buttons
    speedBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const speed = parseFloat(btn.dataset.speed);
        audio.playbackRate = speed;
        speedBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // Reset on new content
    return {
      reset() { lastActiveIndex = -1; }
    };
  }

  // --- Main player (transcribe view) ---
  const mainPlayer = initPlayer({
    audio: document.getElementById('audioPlayer'),
    playBtn: document.getElementById('playerPlayBtn'),
    playIcon: document.getElementById('playerPlayIcon'),
    pauseIcon: document.getElementById('playerPauseIcon'),
    currentTimeEl: document.getElementById('playerCurrentTime'),
    durationEl: document.getElementById('playerDuration'),
    track: document.getElementById('playerTrack'),
    trackFill: document.getElementById('playerTrackFill'),
    speedBtns: document.querySelectorAll('#resultContainer .player-speed-btn'),
    transcriptionArea: document.getElementById('transcriptionText')
  });

  // --- History player ---
  const historyPlayer = initPlayer({
    audio: document.getElementById('historyAudioPlayer'),
    playBtn: document.getElementById('historyPlayerPlayBtn'),
    playIcon: document.querySelector('#historyPlayerPlayBtn .play-icon'),
    pauseIcon: document.querySelector('#historyPlayerPlayBtn .pause-icon'),
    currentTimeEl: document.querySelector('.history-current-time'),
    durationEl: document.querySelector('.history-duration'),
    track: document.querySelector('.history-track'),
    trackFill: document.querySelector('.history-track-fill'),
    speedBtns: document.querySelectorAll('#historyDetail .player-speed-btn'),
    transcriptionArea: document.getElementById('historyTranscriptionText')
  });

  // Expose for reset
  window._mainPlayer = mainPlayer;
  window._historyPlayer = historyPlayer;

  function formatTime(s) {
    if (!s || isNaN(s) || !isFinite(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
  }
});
