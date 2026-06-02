// music-manager.js - 音乐状态管理
const STORAGE_KEY = 'electron_music_state';

function saveAudioState(audio) {
  const state = {
    src: audio.src,
    currentTime: audio.currentTime,
    paused: audio.paused,
    volume: audio.volume
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function restoreAudioState(audio) {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const state = JSON.parse(raw);
    if (state.src && audio.src !== state.src) {
      audio.src = state.src;
    }
    audio.currentTime = state.currentTime || 0;
    audio.volume = state.volume !== undefined ? state.volume : 1;
    if (!state.paused) {
      audio.play().catch(e => console.warn('自动播放被阻止', e));
    }
  } catch(e) {}
}

function initMusicManager() {
  const audio = document.getElementById('bgm');
  if (!audio) return;

  restoreAudioState(audio);

  setInterval(() => {
    if (!audio.paused) saveAudioState(audio);
  }, 3000);

  window.addEventListener('beforeunload', () => {
    saveAudioState(audio);
  });
}