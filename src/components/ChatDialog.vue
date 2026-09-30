<template>
  <div class="chat-dialog" @click.stop>
    <div class="chat-panel">
      <div class="chat-header">
        <div class="chat-title">
          <i class="fa-solid fa-comment-dots"></i>
          <span>流萤</span>
        </div>
        <div class="chat-actions">
          <button class="chat-icon-btn chat-close" title="关闭" @click="emit('close')">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
      </div>

      <!-- 未配置 AI -->
      <div v-if="!configured" class="chat-empty">
        <i class="fa-solid fa-robot"></i>
        <p>尚未配置 AI，无法与流萤对话</p>
        <button class="chat-go-set" @click="goSettings">
          <i class="fa-solid fa-gear"></i>
          前往设置配置 AI
        </button>
      </div>

      <!-- 对话区 -->
      <template v-else>
        <div ref="messagesEl" class="chat-messages">
          <div v-for="(m, i) in messages" :key="i" :class="['chat-msg', m.role]">
            <div class="chat-bubble">{{ m.content }}</div>
          </div>
          <div v-if="loading" class="chat-msg assistant">
            <div class="chat-bubble chat-typing">…</div>
          </div>
        </div>
        <div class="chat-input-row">
          <input
            v-model="inputText"
            type="text"
            class="chat-input"
            placeholder="和流萤说点什么…"
            :disabled="loading"
            @keyup.enter="send"
          />
          <button class="chat-send" :disabled="loading || !inputText.trim()" title="发送" @click="send">
            <i class="fa-solid fa-paper-plane"></i>
          </button>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { chatWithAI, extractMemories, condenseChronicle, hasAIConfig } from '@/services/ai'
import {
  loadCurrentChat,
  saveCurrentChat,
  loadMemory,
  saveMemory,
  mergeFacts,
  pickEventsToArchive,
  buildMemoryText,
  CONTEXT_WINDOW,
  SUMMARY_TRIGGER,
} from '@/services/chatHistory'
import { getCurrentAffection } from '@/config/inventory'
import { getAffectionStageInfo } from '@/config/affectionStages'

const emit = defineEmits(['close'])

// 剥离 AI 回复末尾的 [emotion:xxx] 标签，只保留正文
const EMOTION_TAG_RE = /\[emotion:\w+\]\s*$/
function stripEmotionTag(raw) {
  return raw ? raw.replace(EMOTION_TAG_RE, '').trim() : ''
}
const router = useRouter()

const configured = ref(hasAIConfig())
const messages = ref([])
const inputText = ref('')
const loading = ref(false)
const messagesEl = ref(null)
// 长期记忆：{ summary, chronicle, facts[] }（记忆卡全量永久保存，不设上限）
const memory = ref(loadMemory())
// 已整理水位线：summarizedCount 之前的消息已沉淀为长期记忆卡（跨会话持久）
const summarizedCount = ref(0)
// 记忆整理进行中标志，防止重入
let summarizing = false

onMounted(() => {
  // 恢复当前会话与长期记忆；新会话给一条问候语
  const saved = loadCurrentChat()
  if (saved.messages.length) {
    messages.value = saved.messages
    summarizedCount.value = saved.summarizedCount || 0
  } else if (configured.value) {
    messages.value.push({ role: 'assistant', content: '开拓者，你来了呀。' })
  }
  memory.value = loadMemory()
})

// 消息变化时暂存为「当前会话」（必须带上水位线，否则整理进度会被清零）
watch(
  messages,
  (val) => saveCurrentChat(val, summarizedCount.value),
  { deep: true }
)

function scrollToBottom() {
  nextTick(() => {
    if (messagesEl.value) {
      messagesEl.value.scrollTop = messagesEl.value.scrollHeight
    }
  })
}

// 长期记忆整理（异步非阻塞，失败静默跳过、下次重试）：
// 1. 水位线之外、发送窗口之外的新消息交给 AI 提取记忆卡 + 更新近期摘要
// 2. 事件卡超过注入上限时，最老的事件压缩进「往事纪要」，原卡归档（永久保留不删除）
// 3. 推进水位线；消息原文不裁剪，聊天界面始终完整保留
async function maybeSummarize(force = false) {
  if (summarizing) return
  // force：关闭抽屉时把所有未整理的消息（含仍在窗口内的）立即录入记忆
  const pendingEnd = force ? messages.value.length : messages.value.length - CONTEXT_WINDOW
  const pending = pendingEnd - summarizedCount.value
  if (pending <= 0) return
  // 常规模式：每累积（SUMMARY_TRIGGER - CONTEXT_WINDOW）条窗口外消息整理一次
  if (!force && pending < SUMMARY_TRIGGER - CONTEXT_WINDOW) return
  summarizing = true
  const oldMessages = messages.value.slice(summarizedCount.value, pendingEnd)
  try {
    const mem = memory.value
    const result = await extractMemories(mem, oldMessages)
    mem.facts = mergeFacts(mem.facts, result.facts, result.obsolete)
    mem.summary = result.summary || mem.summary

    // 事件卡过多：把最老的事件并入往事纪要后归档
    const toArchive = pickEventsToArchive(mem.facts)
    if (toArchive.length) {
      try {
        mem.chronicle = await condenseChronicle(mem.chronicle, toArchive)
        const archiveIds = new Set(toArchive.map((f) => f.id))
        mem.facts = mem.facts.map((f) => (archiveIds.has(f.id) ? { ...f, archived: true } : f))
      } catch (e) {
        console.warn('往事纪要整理失败，将在下次对话后重试', e)
      }
    }

    saveMemory(mem)
    memory.value = { ...mem }
    // 推进水位线：这些消息已沉淀为记忆卡（原文仍保留在界面里）
    summarizedCount.value = pendingEnd
    saveCurrentChat(messages.value, summarizedCount.value)
  } catch (e) {
    console.warn('长期记忆整理失败，将在下次对话后重试', e)
  } finally {
    summarizing = false
  }
}

// 按实时好感度生成「关系状态」文本，注入 system prompt，
// 让流萤的语气/称呼随关系阶段自然变化（打通好感度与对话的断层）
function buildRelationText() {
  let aff = 100
  try {
    aff = getCurrentAffection()
  } catch (e) {
    const raw = Number(localStorage.getItem('player_affection'))
    aff = Number.isFinite(raw) ? raw : 100
  }
  const info = getAffectionStageInfo(aff)
  const lines = [
    `当前关系阶段：${info.title}（好感度 ${aff}）`,
    `对开拓者的称呼：${info.call}`,
    `语气倾向：${info.tone}`,
  ]
  const journey = (memory.value.milestones || []).map((m) => m.title)
  if (journey.length > 1) lines.push(`关系历程：${journey.join(' → ')}`)
  return lines.join('。') + '。'
}

async function send() {
  const text = inputText.value.trim()
  if (!text || loading.value) return
  messages.value.push({ role: 'user', content: text })
  inputText.value = ''
  loading.value = true
  scrollToBottom()
  try {
    // 近期原文窗口（当前对话连贯性）+ 长期记忆（关系状态/档案卡/近期事件/往事纪要/近期摘要）
    const windowMessages = messages.value.slice(-CONTEXT_WINDOW)
    const rawReply = await chatWithAI(windowMessages, buildMemoryText(memory.value, buildRelationText()))
    // 剥离 AI 回复中的 [emotion:xxx] 标签，只显示正文
    messages.value.push({ role: 'assistant', content: stripEmotionTag(rawReply) })
  } catch (err) {
    if (err?.code === 'NO_CONFIG') {
      configured.value = false
    } else {
      messages.value.push({ role: 'assistant', content: `（出错了：${err?.message || '未知错误'}）` })
    }
  } finally {
    loading.value = false
    scrollToBottom()
  }
  // 对话达到阈值后，后台静默整理长期记忆（不阻塞界面）
  maybeSummarize()
}

function goSettings() {
  emit('close')
  router.push('/set')
}

// 供父组件在抽屉关闭时调用：立即整理一次，短对话也能录入长期记忆
defineExpose({
  onDrawerClosed: () => maybeSummarize(true),
})
</script>

<style scoped>
.chat-dialog {
  width: 100%;
  height: 100%;
}

.chat-panel {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: rgba(255, 255, 255, 0.25);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  overflow: hidden;
  /* 抽屉从底部滑出，顶部加圆角更精致 */
  border-top-left-radius: 16px;
  border-top-right-radius: 16px;
  box-shadow: 0 -8px 30px rgba(0, 0, 0, 0.18);
}

.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: linear-gradient(90deg, #3FA98A, #2E8B6F);
  color: #fff;
}

.chat-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 700;
}

.chat-title i {
  font-size: 15px;
}

.chat-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.chat-icon-btn {
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: #fff;
  font-size: 14px;
  cursor: pointer;
  transition: background 0.2s ease, transform 0.2s ease;
}

.chat-icon-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  transform: translateY(-1px);
}

/* 未配置 */
.chat-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 28px 24px;
  color: #6b7280;
  text-align: center;
}

.chat-empty i {
  font-size: 34px;
  color: #3FA98A;
}

.chat-empty p {
  font-size: 14px;
  margin: 0;
}

.chat-go-set {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border: 1px solid #3FA98A;
  border-radius: 999px;
  background: #3FA98A;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.25s ease;
}

.chat-go-set:hover {
  background: #2E8B6F;
  border-color: #2E8B6F;
  transform: translateY(-2px);
}

/* 消息区：自适应填满标题栏与输入框之间的空间 */
.chat-messages {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.chat-msg {
  display: flex;
}

.chat-msg.user {
  justify-content: flex-end;
}

.chat-msg.assistant {
  justify-content: flex-start;
}

.chat-bubble {
  max-width: 78%;
  padding: 10px 14px;
  border-radius: 14px;
  font-size: 14px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.chat-msg.user .chat-bubble {
  background: #3FA98A;
  color: #fff;
  border-bottom-right-radius: 4px;
}

.chat-msg.assistant .chat-bubble {
  background: #f0fdfa;
  color: #1f2937;
  border: 1px solid rgba(63, 169, 138, 0.25);
  border-bottom-left-radius: 4px;
}

.chat-typing {
  color: #6b7280;
  letter-spacing: 2px;
}

/* 输入区 */
.chat-input-row {
  display: flex;
  gap: 8px;
  padding: 10px 12px;
  border-top: 1px solid rgba(63, 169, 138, 0.2);
}

.chat-input {
  flex: 1;
  padding: 10px 14px;
  border: 1px solid rgba(63, 169, 138, 0.4);
  border-radius: 999px;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s ease;
}

.chat-input:focus {
  border-color: #3FA98A;
}

.chat-send {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 50%;
  background: #3FA98A;
  color: #fff;
  font-size: 15px;
  cursor: pointer;
  transition: all 0.25s ease;
  flex-shrink: 0;
}

.chat-send:hover:not(:disabled) {
  background: #2E8B6F;
  transform: translateY(-2px);
}

.chat-send:disabled {
  background: #cbd5e1;
  cursor: not-allowed;
}

/*  移动端适配  */
@media (max-width: 768px) {
  .chat-header { padding: 10px 12px; }
  .chat-messages { padding: 10px 12px; gap: 8px; }
  .chat-bubble { max-width: 84%; font-size: 14px; padding: 9px 12px; }
  /* 16px 是关键：小于 16px 时 iOS Safari 聚焦输入框会强制放大整个页面 */
  .chat-input {
    font-size: 16px;
    padding: 11px 14px;
  }
  .chat-input-row {
    padding: 8px 10px max(8px, env(safe-area-inset-bottom));
    gap: 6px;
  }
  .chat-send { width: 44px; height: 44px; flex-shrink: 0; }

  /* 毛玻璃降级兜底：面板原本是 rgba(255,255,255,0.25) + blur(18px)，
     移动端全站关掉 backdrop-filter 后，25% 白底等于没有，人物立绘会直接
     透到消息区缝隙里，观感很脏。这里补成接近实色的白。 */
  .chat-panel {
    background: rgba(255, 255, 255, 0.94);
  }
}

/* 深色模式下不要用上面的亮色兜底 */
@media (max-width: 768px) {
  :global(html.dark) .chat-panel {
    background: rgba(24, 26, 25, 0.94);
  }
}
</style>
