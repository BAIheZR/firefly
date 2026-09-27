<template>
  <div
    class="music-page"
    :class="{ playing: isPlaying }"
  >
    <div class="music-body">
      <!-- 主播放器 -->
      <div class="player-main" :style="{ '--panel-alpha': panelAlpha }">
        <!-- 左侧：唱片 + 歌曲信息 + 操作栏 -->
        <div class="player-left">
          <!-- 透明度滑动条 -->
          <div class="opacity-control">
            <i class="fa-solid fa-droplet" title="面板透明度"></i>
            <input
              type="range"
              min="0"
              max="100"
              v-model.number="opacityPercent"
              class="opacity-slider"
            />
            <span class="opacity-value">{{ opacityPercent }}%</span>
          </div>

          <!-- 唱片 -->
          <div class="disc-wrap">
            <div class="disc" :class="{ spin: isPlaying }">
              <div class="disc-cover">
                <img v-if="currentCover" :src="currentCover" alt="cover" class="cover-img" />
                <div v-else class="cover-placeholder">
                  <i class="fa-solid fa-music"></i>
                </div>
              </div>
            </div>
            <div class="tone-arm" :class="{ playing: isPlaying }">
              <div class="tone-arm-pivot"></div>
              <div class="tone-arm-bar"></div>
              <div class="tone-arm-head"></div>
            </div>
          </div>

          <!-- 歌曲信息 -->
          <div class="player-info">
            <div class="track-title" :title="track?.title">{{ track?.title || '未选择音乐' }}</div>
            <div class="track-sub">{{ track?.fileName || '选择文件夹开始播放' }}</div>
          </div>

          <!-- 操作栏 -->
          <div class="player-ops">
            <div class="ops-top">
              <div class="waveform" ref="waveformRef">
                <span
                  v-for="i in 48"
                  :key="i"
                  class="wave-bar"
                  :style="{ height: barHeights[i % barHeights.length] + 'px' }"
                ></span>
                <div class="wave-handle" :style="{ left: progressPercent + '%' }"></div>
              </div>
              <div class="ops-icons">
                <span class="icon-btn" @click="openFolderPicker" title="选择音乐文件夹">
                  <i class="fa-solid fa-folder-open"></i>
                </span>
              </div>
            </div>

            <div class="time-row">
              <span class="time-text">{{ formatTime(currentTime) }}</span>
              <div class="progress-track" @click="onProgressClick">
                <div class="progress-fill" :style="{ width: progressPercent + '%' }"></div>
                <div class="progress-dot" :style="{ left: progressPercent + '%' }"></div>
              </div>
              <span class="time-text">{{ formatTime(duration) }}</span>
            </div>

            <div class="ctrl-row">
              <button class="ctrl-btn" @click="goBack" title="返回">
                <i class="fa-solid fa-arrow-left"></i>
              </button>
              <button
                class="ctrl-btn"
                :class="{ active: loopMode !== 'off' }"
                @click="toggleLoopMode"
                :title="loopModeLabel"
              >
                <MorphIcon :icon="loopMode === 'one' ? Repeat1 : Repeat" class="morph-icon" />
              </button>
              <button
                class="ctrl-btn"
                :class="{ active: playMode === 'random' }"
                @click="togglePlayMode"
                :title="playModeLabel"
              >
                <i v-if="playMode === 'random'" class="fa-solid fa-shuffle"></i>
                <i v-else class="fa-solid fa-arrow-right-arrow-left"></i>
              </button>
              <button class="ctrl-btn ctrl-btn-lg" @click="playPrev" title="上一首">
                <i class="fa-solid fa-backward-step"></i>
              </button>
              <button class="ctrl-btn ctrl-play" @click="togglePlay" :title="isPlaying ? '暂停' : '播放'">
                <MorphIcon :icon="isPlaying ? Pause : Play" class="morph-icon" />
              </button>
              <button class="ctrl-btn ctrl-btn-lg" @click="playNext" title="下一首">
                <i class="fa-solid fa-forward-step"></i>
              </button>
              <button class="ctrl-btn" :class="{ active: showList }" @click="toggleList" title="播放列表">
                <i class="fa-solid fa-list"></i>
              </button>
            </div>
          </div>

          <!-- 音频可视化柱状条 -->
          <div class="visualizer">
            <span
              v-for="(h, i) in vizBars"
              :key="i"
              class="viz-bar"
              :style="{ height: h + 'px' }"
            ></span>
          </div>
        </div>
        <div class="player-right" :style="wallpaperStyle">
          <button class="wallpaper-btn" @click="pickWallpaper" title="导入壁纸">
            <i class="fa-solid fa-image"></i>
          </button>
        </div>
      </div>

      <!-- 隐藏的 audio 元素（实际播放使用 App.vue 全局 #global-audio，此处仅占位避免模板引用错误） -->

      <!-- 播放列表浮层 -->
      <Transition name="list-slide">
        <div v-if="showList" class="playlist-overlay" @click.self="toggleList">
          <div class="playlist-panel">
            <div class="playlist-header">
              <div class="pl-title">
                <i class="fa-solid fa-music"></i>
                <span>播放列表</span>
                <span class="pl-count">{{ tracks.length }} 首</span>
              </div>
              <div class="pl-header-actions">
                <button class="pl-folder-btn" @click="openFolderPicker">
                  <i class="fa-solid fa-folder-plus"></i>
                  <span>选择文件夹</span>
                </button>
                <button class="pl-close-btn" @click="toggleList" title="关闭">
                  <i class="fa-solid fa-xmark"></i>
                </button>
              </div>
            </div>
            <div class="pl-current" v-if="track">
              <span class="pl-tag">当前</span>
              <span class="pl-current-name">{{ track.title }}</span>
            </div>
            <div class="pl-scroll" v-if="tracks.length > 0">
              <div
                v-for="(t, i) in tracks"
                :key="t.filePath"
                class="pl-item"
                :class="{ active: currentIndex === i }"
                @click="selectTrack(i)"
              >
                <div class="pl-index">{{ i + 1 }}</div>
                <div class="pl-cover">
                  <img v-if="t._coverSrc" :src="t._coverSrc" />
                  <i v-else class="fa-solid fa-music"></i>
                </div>
                <div class="pl-info">
                  <div class="pl-name">{{ t.title }}</div>
                  <div class="pl-file">{{ t.fileName }}</div>
                </div>
                <div class="pl-play-icon">
                  <i v-if="currentIndex === i && isPlaying" class="fa-solid fa-volume-high"></i>
                  <i v-else class="fa-solid fa-play"></i>
                </div>
              </div>
            </div>
            <div v-else class="pl-empty">
              <i class="fa-regular fa-folder-open"></i>
              <p>请点击「选择文件夹」导入音乐</p>
              <button class="pl-folder-btn" @click="openFolderPicker">立即选择</button>
            </div>
          </div>
        </div>
      </Transition>
    </div>
  </div>
</template>

<script>
export default { name: 'Music' }
// 模块级缓存：跨组件实例复用，保证退出页面后 audioCtx 不被销毁，歌曲继续播放
// （createMediaElementSource 同一 audio 只能调一次，所以必须在模块级保存）
let audioCtx = null
let analyser = null
let sourceNode = null
let dataArray = null
// 听歌时长累计：基于时间戳，跨页面/跨实例保留余数，不丢失不足 1 分钟的部分
let listenStartAt = null
const LS_LISTEN_ACCUM_KEY = 'music_listen_accum_ms'
// 页面打开/模块加载时，先把上一次不足 1 分钟的余数读回来（不丢秒）
let listenAccumMs = Number(localStorage.getItem(LS_LISTEN_ACCUM_KEY) || 0) || 0
function persistListenAccumMs() {
  try { localStorage.setItem(LS_LISTEN_ACCUM_KEY, String(listenAccumMs | 0)) } catch (_) {}
}
</script>
<script setup>
import { ref, computed, onMounted, onBeforeUnmount, onActivated, onDeactivated, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useTasksStore } from '@/config/tasks'
import { useMusicStore, useAudioSettingsStore } from '@/config/music'
import { MorphIcon } from 'morphicons/vue'
import { Play, Pause, Repeat, Repeat1 } from 'lucide'

const router = useRouter()
const tasksStore = useTasksStore()
const musicStore = useMusicStore()
const audioStore = useAudioSettingsStore()

// 环境检测
const isElectron = typeof window !== 'undefined' && window.electronAPI && window.electronAPI.isElectron
const LS_FOLDER_KEY = 'music_folder_path'

// 数据
const tracks = ref([])
const folderPath = ref('')
const currentIndex = ref(-1)
const isPlaying = ref(false)
const loopMode = ref('off')
// 播放模式：'order' = 顺序播放（到末尾停/循环由 loopMode 决定），'random' = 随机播放
const playMode = ref('order')
const showList = ref(false)
const currentCover = ref('')
const currentTime = ref(0)
const duration = ref(0)
const progressPercent = ref(0)
const waveformRef = ref(null)

// audio
const audioEl = ref(null)
let playReqId = 0

// Web Audio API 可视化
// audioCtx / analyser / sourceNode / dataArray 为模块级变量（见上方 <script>），跨实例复用
let rafId = null
const NUM_BARS = 28
const vizBars = ref(new Array(NUM_BARS).fill(3))

function setupAnalyser() {
  if (!audioEl.value || audioCtx) return
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)()
    analyser = audioCtx.createAnalyser()
    analyser.fftSize = 128
    analyser.smoothingTimeConstant = 0.75
    sourceNode = audioCtx.createMediaElementSource(audioEl.value)
    sourceNode.connect(analyser)
    analyser.connect(audioCtx.destination)
    dataArray = new Uint8Array(analyser.frequencyBinCount)
  } catch (e) {
    console.warn('AudioContext 初始化失败:', e)
  }
}

function startVisualizer() {
  if (!analyser) return
  const update = () => {
    analyser.getByteFrequencyData(dataArray)
    const step = Math.max(1, Math.floor(dataArray.length / NUM_BARS))
    for (let i = 0; i < NUM_BARS; i++) {
      const val = dataArray[i * step] || 0
      vizBars.value[i] = Math.max(3, (val / 255) * 40)
    }
    rafId = requestAnimationFrame(update)
  }
  update()
}

function stopVisualizer() {
  if (rafId) {
    cancelAnimationFrame(rafId)
    rafId = null
  }
  vizBars.value = new Array(NUM_BARS).fill(3)
}

// 听歌时长统计（基于时间戳累计，不重新计时，不丢失余数）
// listenStartAt / listenAccumMs 为模块级变量（见上方 <script>），跨页面/跨实例保留
function startListenTimer() {
  if (audioEl.value && audioEl.value.paused) return
  if (listenStartAt != null) return // 已经在计时，不要重置起点
  listenStartAt = Date.now()
}
function stopListenTimer() {
  if (listenStartAt == null) return
  listenAccumMs += Date.now() - listenStartAt
  listenStartAt = null
  // 每 满 60000ms 提交 1 分钟，余数保留到下次累计
  while (listenAccumMs >= 60000) {
    tasksStore.addStat('totalListenMinutes', 1)
    listenAccumMs -= 60000
  }
  persistListenAccumMs()
}
// 心跳：每 5 秒把当前余数写回 localStorage（防断电/崩溃/杀进程丢秒），并在浏览器真在播时推进累计
let listenHeartbeatTimer = null
function startListenHeartbeat() {
  if (listenHeartbeatTimer) return
  listenHeartbeatTimer = window.setInterval(() => {
    // 如果 audio 真在播放，直接按"从 listenStartAt 到现在"推进 5 秒（时间戳法天然准确，不需要 setInterval 对齐）
    if (listenStartAt != null && audioEl.value && !audioEl.value.paused && !audioEl.value.seeking) {
      const elapsed = Date.now() - listenStartAt
      if (elapsed >= 60000) {
        // 先结算一波到分钟，再把 listenStartAt 挪到"刚刚"，避免后续 stop 时重复加
        const minutes = Math.floor(elapsed / 60000)
        tasksStore.addStat('totalListenMinutes', minutes)
        listenStartAt += minutes * 60000
      }
      // 即使没到 1 分钟，listenAccumMs 保持为 0，余数由 stopListenTimer 时一次性并入
    }
    persistListenAccumMs()
  }, 5000)
}
function stopListenHeartbeat() {
  if (listenHeartbeatTimer) {
    clearInterval(listenHeartbeatTimer)
    listenHeartbeatTimer = null
  }
}

// ============== Audio 元素事件兜底：无论状态怎么变，都正确启/停计时 ==============
function onAudioPlay() {
  // audio play() 被调用 → 浏览器准备开始播（可能还会 waiting，但不要等 playing 才启）
  startListenTimer()
}
function onAudioPlaying() {
  // 真的进入播放态（waiting 解除后也会发）→ 再启一次做兜底
  startListenTimer()
}
function onAudioPause() {
  stopListenTimer()
}
function onAudioWaiting() { stopListenTimer() }   // 缓冲卡住，不算听
function onAudioSeeking() { stopListenTimer() }   // 拖动进度条时不算听
function onAudioSeeked()  { if (audioEl.value && !audioEl.value.paused) startListenTimer() } // 拖完继续播就启
function onAudioEmptied() { stopListenTimer() }   // 清空 src / 换歌
function onAudioSuspend() { stopListenTimer() }   // 切后台挂起
function onAudioAbort()   { stopListenTimer() }   // 中断
function onAudioStalled() { stopListenTimer() }   // 网络卡住
// ============== END Audio 事件兜底 ==============


// 面板透明度
const LS_OPACITY_KEY = 'music_panel_opacity'
const opacityPercent = ref(72)
const panelAlpha = computed(() => opacityPercent.value / 100)

watch(opacityPercent, (val) => {
  localStorage.setItem(LS_OPACITY_KEY, String(val))
})

// 壁纸
const LS_WALLPAPER_KEY = 'music_wallpaper_data'
const wallpaperSrc = ref('')
const wallpaperStyle = computed(() => {
  if (!wallpaperSrc.value) return {}
  return { '--wallpaper-url': `url(${wallpaperSrc.value})` }
})

async function pickWallpaper() {
  if (!isElectron) {
    ElMessage.warning('壁纸功能仅支持桌面端（Electron）环境')
    return
  }
  const res = await window.electronAPI.showOpenDialog({
    title: '选择壁纸图片',
    properties: ['openFile'],
    filters: [{ name: '图片', extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'] }],
  })
  if (!res || res.canceled || !res.filePaths || res.filePaths.length === 0) return
  const filePath = res.filePaths[0]
  const r = await window.electronAPI.musicReadFile(filePath)
  if (!r || !r.success) {
    ElMessage.error('读取壁纸失败：' + (r?.error || '未知错误'))
    return
  }
  wallpaperSrc.value = r.dataURL
  localStorage.setItem(LS_WALLPAPER_KEY, r.dataURL)
  ElMessage.success('壁纸已应用')
}

function loadStoredWallpaper() {
  const saved = localStorage.getItem(LS_WALLPAPER_KEY)
  if (saved) wallpaperSrc.value = saved
}

// 波形条高度
const barHeights = Array.from({ length: 48 }, (_, i) => {
  const seed = (Math.sin(i * 2.37) + 1) * 0.5
  return 4 + Math.round(seed * 18)
})

const track = computed(() => tracks.value[currentIndex.value] || null)
const loopModeLabel = computed(() => {
  if (loopMode.value === 'off') return '循环：关'
  if (loopMode.value === 'all') return '循环：全部'
  return '循环：单曲'
})
const playModeLabel = computed(() => {
  return playMode.value === 'random' ? '播放模式：随机' : '播放模式：顺序'
})

// 播放模式持久化
const LS_PLAY_MODE_KEY = 'music_play_mode'
function loadStoredPlayMode() {
  const saved = localStorage.getItem(LS_PLAY_MODE_KEY)
  if (saved === 'random' || saved === 'order') playMode.value = saved
}
function togglePlayMode() {
  playMode.value = playMode.value === 'random' ? 'order' : 'random'
  localStorage.setItem(LS_PLAY_MODE_KEY, playMode.value)
  ElMessage.success(playModeLabel.value)
}

// 文件夹加载
async function openFolderPicker() {
  if (!isElectron) {
    ElMessage.warning('音乐文件夹功能仅支持桌面端（Electron）环境')
    return
  }
  const res = await window.electronAPI.musicPickFolder()
  if (!res || !res.success) {
    if (res && res.error) ElMessage.error('读取失败：' + res.error)
    return
  }
  folderPath.value = res.folderPath
  localStorage.setItem(LS_FOLDER_KEY, res.folderPath)
  await loadTracks(res.tracks, true)
}

async function loadTracks(list, autoPlay = false) {
  tracks.value = []
  const loaded = await Promise.all(
    list.map(async (t) => {
      let coverSrc = ''
      if (t.coverPath && isElectron) {
        const r = await window.electronAPI.musicReadFile(t.coverPath)
        if (r && r.success) coverSrc = r.dataURL
      }
      return { ...t, _coverSrc: coverSrc, _audioSrc: null }
    })
  )
  tracks.value = loaded
  if (loaded.length > 0) {
    ElMessage.success(`已导入 ${loaded.length} 首音乐`)
    tasksStore.addStat('totalMusicImports', 1)
    if (currentIndex.value < 0) {
      currentIndex.value = 0
      refreshCover()
    }
    if (autoPlay) {
      await nextTick()
      await loadAndPlay(0)
    }
  } else {
    ElMessage.info('该文件夹没有识别到音乐文件（支持 mp3/wav/ogg/flac/m4a/aac）')
  }
}

async function scanStoredFolder() {
  if (!isElectron) return
  const saved = localStorage.getItem(LS_FOLDER_KEY)
  if (!saved) return
  const res = await window.electronAPI.musicScanFolder(saved)
  if (res && res.success) {
    folderPath.value = res.folderPath
    await loadTracks(res.tracks, false)
    if (tracks.value.length > 0) {
      const randIdx = Math.floor(Math.random() * tracks.value.length)
      await loadTrackNoPlay(randIdx)
    }
  }
}

async function loadTrackNoPlay(idx) {
  if (idx < 0 || idx >= tracks.value.length) return
  currentIndex.value = idx
  refreshCover()
  const t = tracks.value[idx]
  if (!t._audioSrc && isElectron) {
    const r = await window.electronAPI.musicReadFile(t.filePath)
    if (r && r.success) t._audioSrc = r.dataURL
  }
  if (t._audioSrc && audioEl.value) {
    audioEl.value.src = t._audioSrc
    audioEl.value.load()
  }
}

// 播放控制
function selectTrack(idx) {
  if (currentIndex.value === idx) {
    togglePlay()
  } else {
    loadAndPlay(idx)
  }
}

async function loadAndPlay(idx) {
  if (idx < 0 || idx >= tracks.value.length) return
  currentIndex.value = idx
  refreshCover()
  const t = tracks.value[idx]
  if (!t._audioSrc && isElectron) {
    const r = await window.electronAPI.musicReadFile(t.filePath)
    if (!r || !r.success) {
      ElMessage.error('读取音频失败：' + (r?.error || '未知错误'))
      return
    }
    t._audioSrc = r.dataURL
  }
  if (!t._audioSrc) {
    ElMessage.error('音频源为空')
    return
  }
  await nextTick()
  if (audioEl.value) {
    audioEl.value.pause()
    audioEl.value.src = t._audioSrc
    audioEl.value.load()
    startPlay()
  }
}

async function startPlay() {
  if (!audioEl.value) return
  const req = ++playReqId
  try {
    setupAnalyser()
    // 确保使用用户设置的主音量 × BGM 音量
    audioStore.applyBgmVolume()
    if (audioCtx && audioCtx.state === 'suspended') {
      await audioCtx.resume()
    }
    await audioEl.value.play()
    if (req === playReqId) {
      isPlaying.value = true
      startVisualizer()
      startListenTimer()
    }
  } catch (e) {
    // Chromium 误报：play() 的 Promise 在 src 切换/快速重播时会被 abort，
    // 但 audio 实际仍在播放（!paused），不应算作失败
    if (e?.name === 'AbortError' && audioEl.value && !audioEl.value.paused) {
      if (req === playReqId) {
        isPlaying.value = true
        startVisualizer()
        startListenTimer()
      }
      return
    }
    if (req === playReqId) {
      isPlaying.value = false
      ElMessage.error('播放失败：' + (e.message || e))
    }
  }
}

function stopAndReset() {
  if (!audioEl.value) return
  const req = ++playReqId
  try {
    audioEl.value.pause()
  } catch (_) {}
  audioEl.value.removeAttribute('src')
  audioEl.value.load()
  isPlaying.value = false
  stopVisualizer()
  stopListenTimer()
  if (req === playReqId) {
    currentTime.value = 0
    duration.value = 0
    progressPercent.value = 0
  }
}

async function togglePlay() {
  if (!track.value) {
    if (tracks.value.length > 0) {
      await loadAndPlay(0)
    } else {
      ElMessage.info('请先选择音乐文件夹')
    }
    return
  }
  if (!audioEl.value) return
  if (!audioEl.value.src || !tracks.value[currentIndex.value]._audioSrc) {
    await loadAndPlay(currentIndex.value)
    return
  }
  if (isPlaying.value) {
    audioEl.value.pause()
    isPlaying.value = false
    stopVisualizer()
    stopListenTimer()
  } else {
    startPlay()
  }
}

// 根据 playMode 计算下一首/上一首索引
// - order：顺序，越界则回绕（受 loopMode 控制是否真的播末尾/到末尾停）
// - random：随机选一首（避免连续重复同一首，列表 >1 时）
function nextIndex() {
  const n = tracks.value.length
  if (n === 0) return -1
  if (playMode.value === 'random') {
    if (n === 1) return 0
    let r = currentIndex.value
    while (r === currentIndex.value) {
      r = Math.floor(Math.random() * n)
    }
    return r
  }
  let idx = currentIndex.value + 1
  if (idx >= n) idx = 0
  return idx
}
function prevIndex() {
  const n = tracks.value.length
  if (n === 0) return -1
  if (playMode.value === 'random') {
    if (n === 1) return 0
    let r = currentIndex.value
    while (r === currentIndex.value) {
      r = Math.floor(Math.random() * n)
    }
    return r
  }
  let idx = currentIndex.value - 1
  if (idx < 0) idx = n - 1
  return idx
}

function playPrev() {
  if (tracks.value.length === 0) return
  loadAndPlay(prevIndex())
}
function playNext() {
  if (tracks.value.length === 0) return
  loadAndPlay(nextIndex())
}

function toggleLoopMode() {
  loopMode.value = loopMode.value === 'off' ? 'all' : loopMode.value === 'all' ? 'one' : 'off'
  ElMessage.success(loopModeLabel.value)
}

function toggleList() {
  showList.value = !showList.value
}

function goBack() {
  if (window.history.length > 1) {
    router.back()
  } else {
    router.push('/')
  }
}

function refreshCover() {
  const t = track.value
  currentCover.value = t?._coverSrc || ''
}

// 进度条
function onProgressClick(e) {
  if (!audioEl.value || !duration.value) return
  const rect = e.currentTarget.getBoundingClientRect()
  const p = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
  audioEl.value.currentTime = p * duration.value
}
function formatTime(sec) {
  if (!isFinite(sec) || sec < 0) return '00:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

// audio 事件
function onLoadedMetadata() {
  duration.value = audioEl.value?.duration || 0
}
function onTimeUpdate() {
  if (!audioEl.value) return
  currentTime.value = audioEl.value.currentTime
  if (duration.value) {
    progressPercent.value = Math.min(100, (currentTime.value / duration.value) * 100)
  }
}
function onEnded() {
  // 单曲循环：重播当前
  if (loopMode.value === 'one') {
    if (audioEl.value) {
      audioEl.value.currentTime = 0
      startPlay()
    }
    return
  }
  // 顺序播放 + 循环关 + 已经到末尾：停
  if (
    playMode.value === 'order' &&
    loopMode.value === 'off' &&
    currentIndex.value === tracks.value.length - 1
  ) {
    // 收尾：累计听歌时长（这一首末尾不再继续）
    stopListenTimer()
    isPlaying.value = false
    stopVisualizer()
    return
  }
  // 其它情况：按当前播放模式跳下一首
  // （random 模式永远继续；order+all 也回绕；order+off 未到末尾继续）
  playNext()
}
function onError() {
  ElMessage.error('音频加载失败，将尝试下一首')
  playNext()
}

watch(currentIndex, () => {
  refreshCover()
})

// 同步状态到 music store（供 MiniPlayer 使用）
watch([isPlaying, currentIndex, currentCover, tracks], () => {
  musicStore.updateState({
    isPlaying: isPlaying.value,
    track: track.value,
    cover: currentCover.value,
    hasTracks: tracks.value.length > 0,
  })
}, { deep: true })

onMounted(async () => {
  // 使用 App.vue 的全局 #global-audio 元素（常驻，不随路由切换销毁）
  // 保证退出 Music 页面后歌曲继续播放
  audioEl.value = document.getElementById('global-audio')
  if (audioEl.value) {
    audioEl.value.addEventListener('loadedmetadata', onLoadedMetadata)
    audioEl.value.addEventListener('timeupdate', onTimeUpdate)
    audioEl.value.addEventListener('ended', onEnded)
    audioEl.value.addEventListener('error', onError)
    // ==== 听歌计时兜底：绑定 audio 原生事件，任何播放状态变化都自动启/停计时 ====
    audioEl.value.addEventListener('play', onAudioPlay)
    audioEl.value.addEventListener('playing', onAudioPlaying)
    audioEl.value.addEventListener('pause', onAudioPause)
    audioEl.value.addEventListener('waiting', onAudioWaiting)
    audioEl.value.addEventListener('seeking', onAudioSeeking)
    audioEl.value.addEventListener('seeked', onAudioSeeked)
    audioEl.value.addEventListener('emptied', onAudioEmptied)
    audioEl.value.addEventListener('suspend', onAudioSuspend)
    audioEl.value.addEventListener('abort', onAudioAbort)
    audioEl.value.addEventListener('stalled', onAudioStalled)
    // 如果页面挂载时 audio 已经在播（用户之前离开 Music 页但音乐继续，再切回来）→ 立即恢复计时
    if (!audioEl.value.paused && !audioEl.value.seeking) startListenTimer()
  }
  // 启动心跳（5 秒 flush 一次余数到 localStorage，避免丢秒）
  startListenHeartbeat()
  // 注册播放控制函数，供 MiniPlayer 调用
  musicStore.setControls({ togglePlay, playNext, playPrev })
  scanStoredFolder()
  loadStoredWallpaper()
  loadStoredPlayMode()
  const savedOpacity = localStorage.getItem(LS_OPACITY_KEY)
  if (savedOpacity !== null) opacityPercent.value = Number(savedOpacity)
})

// 离开页面时不停音乐、不停听歌计时（音乐继续播放，时长继续累计），只关闭播放列表 + 停可视化
onDeactivated(() => {
  showList.value = false
  stopVisualizer()
})
// 重新进入页面时，若正在播放则恢复可视化与计时
onActivated(() => {
  if (isPlaying.value || (audioEl.value && !audioEl.value.paused)) {
    startVisualizer()
    startListenTimer()
  }
})

// 真正销毁时（应用关闭等）才清理：解绑事件、停可视化/计时，但不停 audio、不关 audioCtx
onBeforeUnmount(() => {
  if (audioEl.value) {
    audioEl.value.removeEventListener('loadedmetadata', onLoadedMetadata)
    audioEl.value.removeEventListener('timeupdate', onTimeUpdate)
    audioEl.value.removeEventListener('ended', onEnded)
    audioEl.value.removeEventListener('error', onError)
    audioEl.value.removeEventListener('play', onAudioPlay)
    audioEl.value.removeEventListener('playing', onAudioPlaying)
    audioEl.value.removeEventListener('pause', onAudioPause)
    audioEl.value.removeEventListener('waiting', onAudioWaiting)
    audioEl.value.removeEventListener('seeking', onAudioSeeking)
    audioEl.value.removeEventListener('seeked', onAudioSeeked)
    audioEl.value.removeEventListener('emptied', onAudioEmptied)
    audioEl.value.removeEventListener('suspend', onAudioSuspend)
    audioEl.value.removeEventListener('abort', onAudioAbort)
    audioEl.value.removeEventListener('stalled', onAudioStalled)
  }
  stopListenHeartbeat()
  stopVisualizer()
  stopListenTimer()
  persistListenAccumMs()
})
</script>

<style scoped src="@/assets/styles/Music.css"></style>
