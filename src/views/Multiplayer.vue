<template>
  <div class="mp-page">
    <div class="mp-body">
      <div class="mp-card">
        <!-- 顶部标题 -->
        <div class="mp-top">
          <h2 class="mp-title"><i class="fa-solid fa-tower-broadcast"></i> 多人游戏</h2>
          <div class="mp-top-right">
            <span class="mp-user" v-if="username">
              <i class="fa-solid fa-user"></i> {{ username }}
            </span>
            <button class="btn-secondary" @click="openCreate()" title="创建联机房间">
              <i class="fa-solid fa-plus"></i> 创建房间
            </button>
            <button class="btn-secondary" @click="openJoin()" title="加入好友房间">
              <i class="fa-solid fa-link"></i> 加入房间
            </button>
            <button class="btn-secondary" @click="goHome" title="返回主页">
              <i class="fa-solid fa-house"></i> 回主页
            </button>
          </div>
        </div>

        <!-- 房间状态（连接成功后显示） -->
        <div v-if="mp.connected" class="mp-room-bar">
          <div class="mp-room-bar-info">
            <span class="mp-room-bar-code">
              <i class="fa-solid fa-key"></i> 房间 {{ mp.roomCode }}
            </span>
            <span class="mp-room-bar-count">{{ mp.memberCount }}/{{ mp.roomCapacity }} 人</span>
          </div>
          <div class="mp-member-list">
            <span v-for="m in mp.members" :key="m.id" class="mp-member">
              <i class="fa-solid fa-user"></i> {{ m.name }}<em v-if="m.isHost">（房主）</em>
            </span>
          </div>
          <div class="mp-room-bar-actions">
            <button v-if="mp.selfIsHost" class="btn-secondary" @click="copyInvite">
              <i class="fa-solid fa-copy"></i> 复制邀请链接
            </button>
            <button class="btn-secondary" @click="leaveRoom">
              <i class="fa-solid fa-right-from-bracket"></i> 离开房间
            </button>
          </div>
        </div>

        <!-- 游戏列表 -->
        <div class="mp-section">
          <div class="mp-section-label">
            <i class="fa-solid fa-gamepad"></i> 可游玩游戏
            <em v-if="mp.connected && !mp.selfIsHost" class="mp-section-hint">（只有房主可以选择游戏）</em>
          </div>
          <div class="mp-games">
            <div
              v-for="g in games"
              :key="g.id"
              class="mp-game-card"
              @click="enterGame(g)"
            >
              <div class="mp-game-icon" :style="{ background: g.color }">
                <i :class="g.icon"></i>
              </div>
              <div class="mp-game-info">
                <div class="mp-game-name">{{ g.name }}</div>
                <div class="mp-game-desc">{{ g.desc }}</div>
              </div>
              <div class="mp-game-status">
                <i class="fa-solid fa-chevron-right"></i>
              </div>
            </div>
          </div>
        </div>

        <!-- 说明 -->
        <div class="mp-notice">
          <i class="fa-solid fa-circle-info"></i>
          <span>联机功能采用房主模式：创建房间者的设备同时作为服务器，需保持软件运行。异地联机请填写内网穿透地址（需 TCP 隧道），同一局域网可留空。游戏由房主选择，选择后全员自动进入对局。</span>
        </div>

        <!-- 排障日志：连不上时每一步的尝试结果都记在这里，异地好友截图即可反馈，不必开开发者工具 -->
        <details v-if="mp.logs.length" class="mp-logs">
          <summary>
            <i class="fa-solid fa-file-lines"></i>
            连接日志（{{ mp.logs.length }} 条，排障用）
          </summary>
          <pre class="mp-logs-body">{{ mp.logs.join('\n') }}</pre>
          <div class="mp-logs-actions">
            <button class="btn-secondary" @click="mp.clearLogs()">
              <i class="fa-solid fa-eraser"></i> 清空日志
            </button>
          </div>
        </details>
        <div v-if="mp.lastErrorDetail" class="mp-logs-lasterr">
          <i class="fa-solid fa-triangle-exclamation"></i>
          <span>{{ mp.lastErrorDetail }}</span>
        </div>
      </div>
    </div>

    <!-- 联机房间弹框：创建房间 / 加入房间 -->
    <el-dialog
      v-model="configDialogVisible"
      :show-close="mp.connected"
      :close-on-click-modal="mp.connected"
      :close-on-press-escape="mp.connected"
      title="联机房间"
      width="480px"
      class="mp-config-dialog"
      align-center
    >
      <div class="mp-dialog-body">
        <!-- Tab 切换 -->
        <div class="mp-tabs">
          <button
            :class="['mp-tab', { active: activeTab === 'create' }]"
            @click="activeTab = 'create'"
          >
            <i class="fa-solid fa-house-chimney"></i> 创建房间
          </button>
          <button
            :class="['mp-tab', { active: activeTab === 'join' }]"
            @click="activeTab = 'join'"
          >
            <i class="fa-solid fa-link"></i> 加入房间
          </button>
        </div>

        <!-- 昵称（共用，只读） -->
        <div class="mp-field">
          <label class="mp-field-label">我的昵称 <em>（使用游戏内已设置的名称）</em></label>
          <div class="mp-nickname-readonly">
            <i class="fa-solid fa-user"></i>
            <span>{{ username }}</span>
          </div>
        </div>

        <!-- 创建房间表单 -->
        <div v-if="activeTab === 'create'">
          <div class="mp-field">
            <label class="mp-field-label">房间容量 <em>（2~8 人）</em></label>
            <el-select v-model="hostForm.capacity" class="mp-select" placeholder="选择房间容量">
              <el-option v-for="n in 7" :key="n" :label="`${n + 1} 人`" :value="n + 1" />
            </el-select>
          </div>
          <div class="mp-field">
            <label class="mp-field-label">房间口令 <em>（选填，设置后加入者需输入）</em></label>
            <input
              v-model="hostForm.roomPassword"
              type="text"
              class="mp-input"
              placeholder="可留空，允许任何人加入"
              maxlength="16"
            />
          </div>
          <div class="mp-field">
            <label class="mp-field-label">穿透地址 <em>（异地联机填，局域网 / 虚拟局域网可留空）</em></label>
            <div class="mp-input-row">
              <input
                v-model="hostForm.tunnelAddr"
                type="text"
                class="mp-input"
                placeholder="如 frp-bus.com:37515（协议头可省略，自动识别）"
                @input="onTunnelInput"
              />
              <button
                class="mp-mini-btn"
                :disabled="!hostForm.tunnelAddr.trim() || mp.probing"
                @click="probeTunnel"
              >
                <i :class="mp.probing ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-satellite-dish'"></i>
                {{ mp.probing ? '检测中' : '检测' }}
              </button>
            </div>
            <!-- 实时显示最终会用的地址：协议头是按输入自动判定的，写清楚避免误会 -->
            <div v-if="resolvedTunnel" class="mp-field-tip">
              <i class="fa-solid fa-link"></i>
              <span>
                邀请链接将使用 <b>{{ resolvedTunnel }}</b>
                <template v-if="!tunnelHasScheme">（未写协议头，自动判定为 {{ resolvedScheme }}://）</template>
              </span>
            </div>
            <!-- 探测结论：点「检测」实测端口是讲 TLS 还是明文，不用猜 -->
            <div v-if="probeTip" :class="['mp-field-tip', { warn: probeTip.warn }]">
              <i :class="probeTip.warn ? 'fa-solid fa-triangle-exclamation' : 'fa-solid fa-circle-check'"></i>
              <span>{{ probeTip.text }}</span>
            </div>
            <div v-else-if="tunnelMissingPort" class="mp-field-tip warn">
              <i class="fa-solid fa-triangle-exclamation"></i>
              <span>
                缺少远程端口：穿透地址要写成「域名:端口」（如 frp-bus.com:37515），端口在穿透面板的隧道详情里
              </span>
            </div>
            <div v-else-if="tunnelNoScheme" class="mp-field-tip warn">
              <i class="fa-solid fa-circle-question"></i>
              <span>
                未写协议头，将按主机形态自动判定为 {{ resolvedScheme }}://。建议点「检测」实测一次，
                或手动写成 wss:// / ws://
              </span>
            </div>
          </div>

          <!-- 没填穿透地址时，让房主挑选「对方能访问到的本机地址」 -->
          <div v-if="!hostForm.tunnelAddr.trim()" class="mp-field">
            <label class="mp-field-label">本机地址 <em>（对方就填这个：局域网或虚拟局域网卡）</em></label>
            <el-select
              v-model="mp.localAddr"
              class="mp-select"
              placeholder="选择对方能访问到的网卡地址"
              @change="mp.setLocalAddr($event)"
            >
              <el-option
                v-for="ip in mp.lanIps"
                :key="ip.address"
                :label="`${ip.name} · ${ip.address}`"
                :value="ip.address"
              />
            </el-select>
            <div class="mp-field-tip">
              <template v-if="mp.lanIps.length">
                异地好友请选虚拟局域网卡（ZeroTier / EasyTier 等）对应的地址
              </template>
              <template v-else>
                未检测到可用网卡地址。若走虚拟局域网，请先装好组网软件并入网，再重开本弹框
              </template>
            </div>
          </div>
        </div>

        <!-- 加入房间表单 -->
        <div v-else>
          <div class="mp-field">
            <label class="mp-field-label">邀请链接 <em>（粘贴后自动填充下方内容）</em></label>
            <input
              v-model="joinForm.inviteLink"
              type="text"
              class="mp-input"
              placeholder="ws://地址:端口?room=房间码&pwd=口令（走 TLS 时为 wss://，粘贴后自动识别）"
            />
          </div>
          <div class="mp-field">
            <label class="mp-field-label">服务器地址 <em>（必填）</em></label>
            <input
              v-model="joinForm.serverAddr"
              type="text"
              class="mp-input"
              placeholder="房主提供的地址，如 192.168.1.5:8765 或 frp-bus.com:37515"
            />
            <div class="mp-field-tip">
              <i class="fa-solid fa-circle-info"></i>
              <span>协议头可省略：wss:// 和 ws:// 会自动依次尝试，哪一个能握手成功就用哪一个</span>
            </div>
          </div>
          <div class="mp-field">
            <label class="mp-field-label">房间码 <em>（必填，6 位）</em></label>
            <input
              v-model="joinForm.roomCode"
              type="text"
              class="mp-input"
              placeholder="房主提供的 6 位房间码"
              maxlength="6"
            />
          </div>
          <div class="mp-field">
            <label class="mp-field-label">房间口令 <em>（房主设置时才需要）</em></label>
            <input
              v-model="joinForm.roomPassword"
              type="text"
              class="mp-input"
              placeholder="房主设定的房间口令"
              maxlength="16"
            />
          </div>
        </div>
      </div>

      <template #footer>
        <div class="mp-dialog-footer">
          <button class="btn-secondary" @click="goBack">
            <i class="fa-solid fa-arrow-left"></i> 返回上一页
          </button>
          <div class="mp-dialog-footer-actions">
            <button
              v-if="activeTab === 'create'"
              class="btn-primary mp-connect-btn"
              :disabled="mp.connecting"
              @click="createRoom"
            >
              <i class="fa-solid fa-spinner fa-spin" v-if="mp.connecting"></i>
              <i class="fa-solid fa-plus" v-else></i> {{ mp.connecting ? '创建中…' : '创建房间' }}
            </button>
            <button
              v-else
              class="btn-primary mp-connect-btn"
              :disabled="mp.connecting"
              @click="joinRoom"
            >
              <i class="fa-solid fa-spinner fa-spin" v-if="mp.connecting"></i>
              <i class="fa-solid fa-plug-circle-check" v-else></i> {{ mp.connecting ? '连接中…' : '加入房间' }}
            </button>
          </div>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { reactive, computed, watch, onMounted, onBeforeUnmount, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useUserStore } from '@/config/user'
import { useMultiplayerStore, resolveTunnelUrl } from '@/config/multiplayer'

const router = useRouter()
const userStore = useUserStore()
const mp = useMultiplayerStore()

// 房主表单
const hostForm = reactive({
  capacity: 2,        // 房间容量 2~8
  roomPassword: '',   // 房间口令（选填）
  tunnelAddr: '',     // 内网穿透地址（选填，留空 = 本机局域网地址）
})

// 加入者表单
const joinForm = reactive({
  inviteLink: '',
  serverAddr: '',
  roomCode: '',
  roomPassword: '',
})

const configDialogVisible = ref(false)
const activeTab = ref('create')

// 游戏内已设置的名称
const username = computed(() => userStore.currentUser)

// 穿透地址是否自带协议头。不带时协议由代码判定（探测结论 > 主机形态），不再一律按明文处理，
// 所以这里只提示"会自动判定成什么"，不再是"你写错了"的警告。
const tunnelHasScheme = computed(() => /^(wss?|https?):\/\//i.test(hostForm.tunnelAddr.trim()))
const tunnelNoScheme = computed(() => !!hostForm.tunnelAddr.trim() && !tunnelHasScheme.value)

// 探测结论给出的协议；没有结论时为空串，交给 resolveTunnelUrl 按主机形态猜
const resolvedScheme = computed(() => {
  const p = mp.tunnelProbe
  if (p && p.reachable) return p.scheme === 'ws' ? 'ws' : 'wss'
  return resolveTunnelUrl(hostForm.tunnelAddr, mp.port)?.startsWith('wss://') ? 'wss' : 'ws'
})

// 最终会写进邀请链接的地址，实时可见 —— 房主要能把这一串原样报给好友
const resolvedTunnel = computed(() => {
  const s = hostForm.tunnelAddr.trim()
  if (!s) return ''
  return resolveTunnelUrl(s, mp.port, mp.tunnelProbe?.reachable ? resolvedScheme.value : '')
})

// 探测结果提示（成功用普通色、失败用警示色）
const probeTip = computed(() => {
  const p = mp.tunnelProbe
  if (!p) return null
  if (!p.reachable) return { warn: true, text: p.error || '端口未连通：隧道可能没启动，或地址 / 端口写错' }
  if (p.scheme === 'wss') {
    return {
      warn: false,
      text: `端口已连通，检测到 TLS，将使用 wss://${p.selfSigned ? '（自签名证书，客户端会自动放行）' : ''}`,
    }
  }
  if (p.blocked) return { warn: true, text: p.error }
  return { warn: false, text: '端口已连通，但不支持 TLS，将使用 ws://' }
})

// 地址改动后作废旧结论，避免拿上一轮的协议头去拼链接
function onTunnelInput() {
  mp.tunnelProbe = null
}

// 域名型穿透地址漏写端口：隧道远程端口是随机分配的，漏写必然连不上，提前拦一道
const tunnelMissingPort = computed(() => {
  const s = hostForm.tunnelAddr.trim()
  if (!s) return false
  const afterScheme = s.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').split('/')[0].split('?')[0]
  if (afterScheme.startsWith('[')) return !/^\[[^\]]+\]:\d+$/.test(afterScheme) // IPv6 需带 :端口
  const host = afterScheme.split(':')[0]
  const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(host)
  // IP 直连可以省端口（默认 8765）；域名是穿透隧道，端口必须写
  return !isIp && !/:\d+$/.test(afterScheme)
})

// 房主手动检测穿透地址
async function probeTunnel() {
  await mp.probeTunnel(hostForm.tunnelAddr)
}

// 只保留已实现的两个游戏：石头剪刀布、海龟汤尚未实现，已移除
const games = [
  {
    id: 'gomoku',
    name: '五子棋',
    desc: '房主执黑先行，对方执白，32 路棋盘抢五连',
    icon: 'fa-solid fa-chess',
    color: 'linear-gradient(135deg,#3fa98a,#5bc9a0)',
    route: '/chess',
  },
  {
    id: 'guessword',
    name: '猜字游戏',
    desc: '同一道题同时开猜，先答对的拿金币',
    icon: 'fa-solid fa-font',
    color: 'linear-gradient(135deg,#e6a23c,#f0c674)',
    route: '/guess-word',
  },
]

let offGame = null

onMounted(() => {
  userStore.loadData()

  if (!userStore.isUsernameSet) {
    ElMessage.warning('请先在设置中完成用户名设置，再使用多人联机功能')
    router.push('/set')
    return
  }

  // 已在房间中（例如从对局页返回大厅）→ 不再弹房间弹框
  if (!mp.connected) {
    activeTab.value = 'create'
    configDialogVisible.value = true
    mp.refreshLocalIps()
  }

  // 房间/游戏消息：房主选游戏 → 全员进入；非房主点游戏 → 房主收到提醒
  offGame = mp.onGame((data) => {
    if (data.kind === 'mp:select-game') {
      const g = games.find((x) => x.id === data.gameId)
      if (!g) return
      ElMessage.info(`房主开始了「${data.gameName}」`)
      enterGameRoute(g)
    } else if (data.kind === 'mp:game-click') {
      ElMessage.info(`${data.name} 想玩「${data.gameName}」`)
    }
  })
})

onBeforeUnmount(() => {
  // 注意：这里不能关连接。连接归 store 持有，离开大厅页（进入对局）必须保持在线
  if (offGame) offGame()
  offGame = null
})

function openCreate() {
  activeTab.value = 'create'
  configDialogVisible.value = true
  // 每次开弹框都重取一次网卡地址：用户可能刚装好/刚退出组网软件
  mp.refreshLocalIps()
}

function openJoin() {
  activeTab.value = 'join'
  configDialogVisible.value = true
}

// 房主创建房间
async function createRoom() {
  await mp.createRoom(hostForm.capacity, hostForm.roomPassword.trim(), hostForm.tunnelAddr)
  if (mp.connected || mp.connecting) configDialogVisible.value = false
}

// 加入者加入房间
// 地址协议写反（ws:// 与 wss:// 弄混）时，store 内部会自动回退另一种协议再试一次，
// 所以这里不需要提前纠错，交给连接过程处理并存进日志。
function joinRoom() {
  const addr = joinForm.serverAddr.trim()
  const code = joinForm.roomCode.trim()
  if (!addr || !code) {
    ElMessage.warning('请填写服务器地址和房间码')
    return
  }
  mp.joinRoom(addr, code, joinForm.roomPassword.trim())
}

// 解析邀请链接
// 注意：必须保留协议头。穿透走 TLS（如 SakuraFrp 启用了自动 HTTPS）时链接是 wss://，
// 若只取 u.host，加入时会被拼回明文 ws://，握手必然失败。
function parseInviteLink(link) {
  const s = (link || '').trim()
  if (!s) return null
  try {
    const u = new URL(s)
    const secure = u.protocol === 'wss:' || u.protocol === 'https:'
    const path = u.pathname && u.pathname !== '/' ? u.pathname : ''
    return {
      serverAddr: `${secure ? 'wss' : 'ws'}://${u.host}${path}`,
      roomCode: u.searchParams.get('room') || '',
      roomPassword: u.searchParams.get('pwd') || '',
    }
  } catch (e) {
    return null
  }
}

// 粘贴邀请链接时自动填充
watch(
  () => joinForm.inviteLink,
  (val) => {
    const parsed = parseInviteLink(val)
    if (parsed) {
      joinForm.serverAddr = parsed.serverAddr
      joinForm.roomCode = parsed.roomCode
      joinForm.roomPassword = parsed.roomPassword
    }
  }
)

// 复制邀请链接
async function copyInvite() {
  if (!mp.inviteLink) {
    ElMessage.warning('暂无邀请链接')
    return
  }
  try {
    await navigator.clipboard.writeText(mp.inviteLink)
    ElMessage.success('邀请链接已复制')
  } catch (e) {
    ElMessage.error('复制失败，请手动复制')
  }
}

// 离开房间：房主离开会解散房间，先确认
async function leaveRoom() {
  if (!mp.connected) return
  const ok = await confirmLeave()
  if (!ok) return
  mp.leaveRoom()
}

// 统一确认框：房主提示会解散房间，成员提示需重新加入
function confirmLeave() {
  const isHost = mp.selfIsHost
  const text = isHost
    ? '你现在是房主，离开会解散房间，房间内其他成员都会被踢出。确定要离开吗？'
    : '离开后将从当前房间退出，需要重新加入才能继续联机。确定要离开吗？'
  return ElMessageBox.confirm(text, '确定要离开房间吗？', {
    confirmButtonText: '确定离开',
    cancelButtonText: '再想想',
    type: 'warning',
  }).then(() => true).catch(() => false)
}

// 进入对局：只有房主能选游戏
async function enterGame(g) {
  if (!mp.connected) {
    ElMessage.info('请先创建或加入房间，连接成功后再选择游戏')
    openCreate()
    return
  }
  if (!mp.selfIsHost) {
    // 非房主：弹框告知，并把「谁想玩哪个游戏」发给房主
    mp.sendGame(
      { kind: 'mp:game-click', gameId: g.id, gameName: g.name, name: username.value },
      mp.hostId || null
    )
    ElMessageBox.alert(`只有房主才能选择游戏，已把你想玩「${g.name}」告诉房主啦`, '只有房主才能选择游戏', {
      confirmButtonText: '知道了',
      type: 'warning',
    }).catch(() => {})
    return
  }
  mp.selectGame(g)
  enterGameRoute(g)
}

// 跳进对局页（带 mp=1 标记，游戏内据此切到联机模式）
function enterGameRoute(g) {
  configDialogVisible.value = false
  router.push({ path: g.route, query: { mp: '1' } })
}

// 返回上一个页面
function goBack() {
  configDialogVisible.value = false
  router.back()
}

// 回主页：房间内必须先确认（房主离开＝解散房间），确认后离开房间再跳转
async function goHome() {
  if (mp.connected) {
    const ok = await confirmLeave()
    if (!ok) return
    mp.leaveRoom()
  }
  router.push('/')
}
</script>

<style scoped src="@/assets/styles/multiplayer.css"></style>
