import { defineStore } from 'pinia'
import { ref } from 'vue'

// 音乐播放状态 store：由 Music.vue 注册控制函数并推送播放状态
export const useMusicStore = defineStore('music', () => {
  const isPlaying = ref(false)
  const trackTitle = ref('')
  const trackFile = ref('')
  const currentCover = ref('')
  const hasTracks = ref(false)

  // 播放控制函数引用，由 Music.vue 注册
  let _togglePlay = null
  let _playNext = null
  let _playPrev = null

  function setControls({ togglePlay, playNext, playPrev }) {
    _togglePlay = togglePlay
    _playNext = playNext
    _playPrev = playPrev
  }

  function togglePlay() { _togglePlay?.() }
  function playNext() { _playNext?.() }
  function playPrev() { _playPrev?.() }

  function updateState({ isPlaying: playing, track, cover, hasTracks: ht }) {
    isPlaying.value = playing
    trackTitle.value = track?.title || ''
    trackFile.value = track?.fileName || ''
    currentCover.value = cover || ''
    hasTracks.value = ht || false
  }

  return {
    isPlaying, trackTitle, trackFile, currentCover, hasTracks,
    setControls, togglePlay, playNext, playPrev, updateState,
  }
})

// 音频设置 store：主音量 × BGM 音量 → 应用到 #global-audio；音效 sfxVolume 暂未实现（仅 UI 显示）
export const useAudioSettingsStore = defineStore('audioSettings', () => {
  const SETTINGS_KEY = 'userSettings'
  const masterVolume = ref(80)
  const bgmVolume = ref(60)
  const sfxVolume = ref(70)

  // 从 localStorage（userSettings）加载音量
  function loadSettings() {
    const saved = localStorage.getItem(SETTINGS_KEY)
    if (!saved) return
    try {
      const parsed = JSON.parse(saved)
      if (parsed.masterVolume !== undefined) masterVolume.value = parsed.masterVolume
      if (parsed.bgmVolume !== undefined) bgmVolume.value = parsed.bgmVolume
      if (parsed.sfxVolume !== undefined) sfxVolume.value = parsed.sfxVolume
    } catch (e) {
      console.warn('读取音频设置失败', e)
    }
  }

  // 计算实际音频音量（主 × BGM），范围 0~1
  function computeBgmGain() {
    const m = Math.max(0, Math.min(100, masterVolume.value))
    const b = Math.max(0, Math.min(100, bgmVolume.value))
    return (m / 100) * (b / 100)
  }

  // 把当前设置应用到 #global-audio（Music 页面用的全局 audio 元素）
  function applyBgmVolume() {
    if (typeof document === 'undefined') return
    const audio = document.getElementById('global-audio')
    if (!audio) return
    audio.volume = computeBgmGain()
    audio.muted = audio.volume === 0
  }

  // 快捷：加载 + 应用一次
  function init() {
    loadSettings()
    applyBgmVolume()
  }

  return {
    masterVolume,
    bgmVolume,
    sfxVolume,
    loadSettings,
    computeBgmGain,
    applyBgmVolume,
    init,
  }
})
