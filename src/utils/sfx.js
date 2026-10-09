// 音效系统 —— 纯 Web Audio 合成，不依赖任何素材文件。
//
// 为什么走合成：这个项目一直有 BGM 但没有音效（config/music.js 的 sfxVolume 之前只做 UI 显示）。
// 合成的好处是零素材依赖、体积为 0、随时可调参。以后想换真素材也很简单：
// 把 mp3 放进 public/sfx/，再把 playSfx 换成 new Audio(...) 即可，**调用方一行都不用改**。
//
// 音量口径与 BGM 完全一致：主音量 × 音效音量（对齐 music.js 的 computeBgmGain）。
import { useAudioSettingsStore } from '@/config/music'

// 每种音效 = 一串「音符」：频率 Hz / 时长 s / 波形 / 相对音量 / 起始偏移 s。
// 听觉隐喻：上行音 = 获得 / 变好，下行音 = 出错 / 变差 —— 这是通用约定，不用教玩家就懂。
const RECIPES = {
  // 点击：极短的高频"嗒"。要**轻**，点按钮时不该抢注意力
  click: [{ f: 1200, d: 0.04, type: 'triangle', g: 0.1 }],
  // 获得物品 / 金币：两音上行"叮咚"
  gain: [
    { f: 784, d: 0.07, g: 0.18 },
    { f: 1175, d: 0.12, g: 0.16, at: 0.06 },
  ],
  // 开箱：三音上行，比 gain 更有仪式感
  open: [
    { f: 523, d: 0.08, g: 0.18 },
    { f: 784, d: 0.08, g: 0.18, at: 0.07 },
    { f: 1047, d: 0.22, g: 0.2, at: 0.14 },
  ],
  // 升级：四音上行大调琶音（C-E-G-C），一耳朵就听得出"升级了"
  levelup: [
    { f: 523, d: 0.09, g: 0.2 },
    { f: 659, d: 0.09, g: 0.2, at: 0.08 },
    { f: 784, d: 0.09, g: 0.2, at: 0.16 },
    { f: 1047, d: 0.3, g: 0.22, at: 0.24 },
  ],
  // 错误：两音下行 + 锯齿波，带一点"不行"的粗糙感
  error: [
    { f: 233, d: 0.1, type: 'sawtooth', g: 0.14 },
    { f: 175, d: 0.18, type: 'sawtooth', g: 0.14, at: 0.09 },
  ],
  // 好感度：柔和两音上行（用 sine，比 gain 更"软"）
  heart: [
    { f: 659, d: 0.09, g: 0.16 },
    { f: 988, d: 0.16, g: 0.14, at: 0.08 },
  ],
}

let ctx = null
let master = null

function ensureCtx() {
  if (ctx) return ctx
  const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)
  if (!AC) return null // 环境不支持就静默降级，绝不抛错
  ctx = new AC()
  master = ctx.createGain()
  master.connect(ctx.destination)
  return ctx
}

// 浏览器的自动播放策略：AudioContext 在首次用户交互前是 suspended，交互后要 resume。
// 挂 pointerdown/keydown（不能 once —— 用户可能切走再回来，状态又变 suspended）
function unlock() {
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {})
}
if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', unlock, { passive: true })
  window.addEventListener('keydown', unlock, { passive: true })
}

function currentGain() {
  try {
    const st = useAudioSettingsStore()
    const m = Math.max(0, Math.min(100, Number(st.masterVolume) || 0))
    const s = Math.max(0, Math.min(100, Number(st.sfxVolume) || 0))
    return (m / 100) * (s / 100)
  } catch (e) {
    // store 还没初始化（模块加载期 / 测试环境）→ 给个中性值，别让音效失效
    return 0.7
  }
}

// 移动端震动强度（毫秒；数组 = 震-停-震 的节奏）。
// ★ 只给「值得注意」的音效配震动 —— click 这种高频动作绝不震，否则手机会一直抖，很快就烦了。
// 不支持 vibrate 的浏览器（桌面）会静默跳过。
const VIBRATE = {
  gain: 10,
  heart: 10,
  error: 20,
  open: 30,
  levelup: [20, 40, 20], // 升级来个三段节奏，手感更"重"
}

// 播放一个音效。name 见 RECIPES；未知名字直接忽略。
// 任何异常都吞掉 —— 音效出问题绝不能影响主流程。
export function playSfx(name) {
  const recipe = RECIPES[name]
  if (!recipe) return
  try {
    const v = VIBRATE[name]
    if (v && typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(v)
  } catch (e) {
    /* 不支持就忽略 */
  }
  try {
    const c = ensureCtx()
    if (!c) return
    const gain = currentGain()
    if (gain <= 0) return // 音量拉到 0 就不必开工
    const t0 = c.currentTime
    for (const n of recipe) {
      const osc = c.createOscillator()
      const env = c.createGain()
      osc.type = n.type || 'sine'
      osc.frequency.value = n.f
      const at = t0 + (n.at || 0)
      const dur = n.d || 0.1
      const peak = Math.max(0.0001, (n.g ?? 0.2) * gain)
      // 快起 + 指数衰减 → 听起来是"叮"而不是"嘟"
      env.gain.setValueAtTime(0.0001, at)
      env.gain.linearRampToValueAtTime(peak, at + 0.008)
      env.gain.exponentialRampToValueAtTime(0.0001, at + dur)
      osc.connect(env)
      env.connect(master)
      osc.start(at)
      osc.stop(at + dur + 0.02)
    }
  } catch (e) {
    /* 忽略 */
  }
}

// 供设置页「试听」用：列出了所有可用音效名
export const SFX_NAMES = Object.keys(RECIPES)
