// ======== 多人联机全局 store ========
// 关键点：WebSocket 连接必须活在整个应用生命周期里，而不是挂在 Multiplayer.vue 组件上。
// 若连接归页面持有，进入对局页（router.push 到 /chess 等）时组件卸载会关闭连接，
// 房主断开还会触发服务端 closeRoom，整个房间直接消失。
//
// 角色约定：房主 = host，加入者 = guest。
// 消息走服务端的 game 中转通道：{ type:'game', data:{ kind, ... }, to? }
//   to 为空  → 广播给房间内其他人
//   to 指定  → 只发给该成员（用于给新加入者补发局面快照）
import { defineStore } from 'pinia'
import { ElMessage } from 'element-plus'
import { useUserStore } from '@/config/user'

export const MP_PORT = 8765

// 单次连接尝试的等待上限。网络被丢包（而不是明确拒绝）时 WebSocket 可能长时间
// 不给任何回调，没有这道超时就会一直卡在"连接中"。取 6s：正常握手通常 <1s。
const ATTEMPT_TIMEOUT_MS = 6000

// 模块级（非响应式）：原始 socket 与监听器。
// WebSocket 实例不能进 reactive state，否则会被 Vue 代理，导致 readyState / 身份比较异常。
let socket = null
const listeners = new Set()

export const useMultiplayerStore = defineStore('multiplayer', {
  state: () => ({
    connected: false,
    connecting: false,
    selfId: '',
    selfIsHost: false,
    hostId: '',           // 房主成员 id，非房主上报用
    roomCode: '',
    roomCapacity: 0,
    members: [],
    hostToken: '',
    inviteLink: '',
    // 房主对外地址相关：穿透地址优先；留空时用 localAddr（局域网 / 虚拟局域网卡地址）
    tunnelAddr: '',
    roomPassword: '',
    localAddr: '',
    lanIps: [],           // 主进程枚举出的本机 IPv4，含网卡名，供房主挑选
    port: MP_PORT,
    currentGame: '',      // 房主选中的游戏 id，全员同步
    lastError: '',
    // 最近一次失败的详细信息（地址、每轮尝试结果、耗时），排障时直接看界面上这一行
    lastErrorDetail: '',
    // 排障日志：联机相关问题（连不上、证书被拒、服务端报错）都会记到这里，
    // 既打到控制台，也留在界面上，方便异地好友截图反馈而不必开开发者工具
    logs: [],
    // 穿透地址探测结果：{ reachable, scheme:'wss'|'ws', tls, blocked, error }
    tunnelProbe: null,
    probing: false,
  }),

  getters: {
    memberCount: (s) => s.members.length,
    selfName: () => useUserStore().currentUser,
    // 五子棋配色：房主执黑先行，加入者执白
    myChessRole: (s) => (s.selfIsHost ? 1 : 2),
  },

  actions: {
    // ===== 订阅：对局页与大厅页都通过它接收房间/游戏消息 =====
    // fn(data, fromId)；返回取消订阅函数
    onGame(fn) {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    emitGame(data, fromId) {
      listeners.forEach((fn) => {
        try { fn(data, fromId) } catch (e) { console.error('[mp] 消息处理异常', e) }
      })
    },

    // ===== 发送 =====
    sendGame(data, to = null) {
      if (!socket || socket.readyState !== 1) return false
      socket.send(JSON.stringify({ type: 'game', data, to }))
      return true
    },

    // ===== 排障日志 =====
    // 联机的失败原因大多在"代码之外"（穿透节点拦明文、自签名证书被拒、隧道没启动、
    // 防火墙没放行），所以把关键步骤都留痕：
    //   1) 打到控制台 —— 房主/加入者自己排障、F12 就能看
    //   2) 存进 state.logs —— 界面上直接可见，异地好友截图即可反馈，不用教他开开发者工具
    pushLog(level, message) {
      const time = new Date().toLocaleTimeString('zh-CN', { hour12: false })
      const line = `[${time}] ${level.toUpperCase()} ${message}`
      this.logs = [...this.logs, line].slice(-80)
      const out = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log
      out('[mp]', message)
    },
    clearLogs() {
      this.logs = []
      this.lastErrorDetail = ''
    },

    // ===== 连接管理 =====
    // 只允许存在一条连接：旧连接先解绑回调再关闭，避免旧连接继续改写状态（曾导致人数虚高成 3/2）
    closeSocket() {
      const old = socket
      socket = null
      if (!old) return
      old.onopen = null
      old.onmessage = null
      old.onerror = null
      old.onclose = null
      try { old.close() } catch (_) { /* ignore */ }
    },

    // 按候选地址依次尝试，前一个失败自动换下一个。
    // 存在的意义：穿透地址该写 ws:// 还是 wss:// 取决于隧道有没有开加密，
    // 用户不该为此反复试错 —— 写错协议时自动回退一次，连上就完事。
    async connectWithFallback(urls, payload, hint = '') {
      this.closeSocket()
      this.connecting = true
      this.lastError = ''
      this.lastErrorDetail = ''
      const list = (urls || []).filter(Boolean)
      if (!list.length) {
        this.connecting = false
        this.lastError = '连接地址为空'
        this.pushLog('error', '连接地址为空，未发起任何尝试')
        ElMessage.error(this.lastError)
        return false
      }
      this.pushLog('info', `${hint ? hint + '：' : ''}开始连接，候选地址 ${list.length} 个 → ${list.join(' → ')}`)

      const tried = []
      for (let i = 0; i < list.length; i++) {
        const r = await this.tryConnect(list[i], payload, i, list.length)
        tried.push(`${list[i]} → ${r.ok ? '成功' : r.reason}`)
        if (r.ok) return true
      }

      this.connecting = false
      const last = tried[tried.length - 1] || ''
      const insecure = list.some((u) => /^ws:\/\//i.test(u))
      this.lastErrorDetail = tried.join('；')
      // 提示写具体：把最后一次的原始原因带上，避免"连接失败"这种无从下手的提示
      this.lastError = '连接失败：' + (last.split('→ ')[1] || '所有候选地址均未握手成功')
      if (insecure) {
        this.lastError += '（国内穿透节点会拦明文 HTTP，若隧道已开加密请用 wss://）'
      }
      this.pushLog('error', `全部候选地址均失败：${this.lastErrorDetail}`)
      ElMessage.error(this.lastError)
      return false
    },

    // 单次尝试：resolve({ ok, reason })。不抛异常，失败原因一律转成人类可读文本
    tryConnect(url, payload, idx = 0, total = 0) {
      return new Promise(async (resolve) => {
        const tag = total > 1 ? `第 ${idx + 1}/${total} 次 ` : ''
        const started = Date.now()
        // wss:// 多半是穿透工具的自签名证书，先登记给主进程放行，否则握手必然被拒
        await this.trustTunnelHost(url)

        let ws
        try {
          ws = new WebSocket(url)
        } catch (e) {
          this.pushLog('error', `${tag}${url} 地址无效：${e.message || e}`)
          return resolve({ ok: false, reason: `地址无效（${e.message || e}）` })
        }
        socket = ws

        let settled = false
        let errHint = ''
        const settleFail = (reason) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          try { ws.close() } catch (_) { /* ignore */ }
          if (socket === ws) socket = null
          // 解绑回调：这条已经废弃的连接不允许再改写 store 状态
          ws.onopen = null
          ws.onmessage = null
          ws.onerror = null
          ws.onclose = null
          resolve({ ok: false, reason })
        }
        // 卡死保护：网络被丢包时 WebSocket 可能长时间不给任何回调
        const timer = setTimeout(
          () => settleFail(`超时（${ATTEMPT_TIMEOUT_MS}ms 内未完成握手）`),
          ATTEMPT_TIMEOUT_MS
        )

        // 服务端回包（含 joined / error / 游戏消息）必须从握手前就挂上：
        // 加入请求在 onopen 里发出，回包可能紧接着到达
        ws.onmessage = (e) => {
          if (socket !== ws) return
          let msg
          try {
            msg = JSON.parse(e.data)
          } catch (_) {
            this.pushLog('warn', `收到无法解析的服务端消息：${String(e.data).slice(0, 120)}`)
            return
          }
          this.handleMessage(msg)
        }

        ws.onopen = () => {
          settled = true
          clearTimeout(timer)
          this.pushLog('info', `${tag}${url} 握手成功，用时 ${Date.now() - started}ms，发送加入请求`)
          try {
            ws.send(JSON.stringify(payload))
          } catch (e) {
            this.pushLog('error', `${tag}${url} 发送加入请求失败：${e.message || e}`)
          }
          // 握手成功后换成"长连接"回调：这里才是房间断开、连接出错的处理
          ws.onerror = (e) => {
            if (socket !== ws) return
            this.pushLog('error', `${url} 连接出错：${describeWsError(e)}`)
          }
          ws.onclose = (e) => {
            if (socket !== ws) return
            socket = null
            this.connecting = false
            this.pushLog('warn', `${url} 连接已关闭：code=${e.code}${e.reason ? ` reason=${e.reason}` : ''} clean=${e.wasClean}`)
            if (this.connected) {
              this.resetRoom()
              this.lastError = '与房间的连接已断开'
              ElMessage.warning('与房间的连接已断开')
            }
          }
          resolve({ ok: true, reason: '' })
        }
        ws.onerror = () => {
          if (settled) return
          // 浏览器的 error 事件不带细节；等 onclose 带来的 code/reason，给 300ms 窗口
          errHint = '握手阶段出错（端口无响应 / 协议不匹配 / 证书被拒）'
          setTimeout(() => settleFail(errHint), 300)
        }
        ws.onclose = (e) => {
          if (settled) return
          const code = `code=${e.code}`
          const reason = e.reason ? `，reason=${e.reason}` : ''
          settleFail(`${errHint ? errHint + '；' : '连接被关闭 '}（${code}${reason}，用时 ${Date.now() - started}ms）`)
        }
      })
    },

    // 兼容旧调用：单地址连接（房主走本机回环时用，不需要回退）
    connect(url, payload) {
      return this.connectWithFallback([url], payload)
    },

    // ===== 房主：对外地址 =====
    // 拉取本机 IPv4 列表（含虚拟局域网卡）。创建房间前就拉一次，
    // 房主可以先看清"对方该填哪个地址"再开房。
    async refreshLocalIps() {
      if (!window.electronAPI?.mpListIps) return this.lanIps
      try {
        const res = await window.electronAPI.mpListIps()
        if (Array.isArray(res?.lanIps)) this.lanIps = res.lanIps
      } catch (_) { /* 非桌面端或调用失败：保持原值 */ }
      return this.lanIps
    },

    // 房主切换对外地址（局域网 / 虚拟局域网卡），邀请链接随之更新
    setLocalAddr(addr) {
      this.localAddr = addr || ''
      this.inviteLink = this.buildInviteLink()
    },

    // 生成邀请链接：穿透地址优先，否则用本机地址。
    // 「留空时用 127.0.0.1」是历史 bug —— 对方必然连不上，这里不再兜底回环地址。
    // 协议头规则见 resolveTunnelUrl：写了就听用户的，没写就按探测结果 / 主机形态自动判定，
    // 所以房主只填「frp-bus.com:37515」也能得到正确的 wss:// 链接。
    buildInviteLink() {
      const tunnel = (this.tunnelAddr || '').trim()
      const port = this.port || MP_PORT
      let base = ''
      if (tunnel) {
        base = resolveTunnelUrl(tunnel, port, this.probeScheme)
      } else {
        const addr = (this.localAddr || '').trim() || this.lanIps[0]?.address || ''
        base = addr ? `ws://${addr}:${port}` : ''
      }
      if (!base || !this.roomCode) return ''
      let link = `${base}?room=${this.roomCode}`
      if (this.roomPassword) link += `&pwd=${encodeURIComponent(this.roomPassword)}`
      return link
    },

    // ===== 房主：探测穿透地址可用哪种协议 =====
    // 只对「域名:端口」有意义：域名多半是穿透隧道，是否加密只能实测。
    // 结论会存进 tunnelProbe，并立刻反映到邀请链接的协议头上。
    async probeTunnel(addrInput) {
      const addr = (addrInput ?? this.tunnelAddr ?? '').trim()
      if (!addr) {
        ElMessage.warning('请先填写穿透地址')
        return null
      }
      if (!window.electronAPI?.mpProbeTunnel) {
        ElMessage.warning('协议检测仅桌面端可用，请手动写明 wss:// 或 ws://')
        return null
      }
      this.probing = true
      this.tunnelProbe = null
      this.pushLog('info', `开始检测穿透地址：${addr}`)
      try {
        const res = await window.electronAPI.mpProbeTunnel(addr)
        this.probing = false
        if (!res?.success) {
          this.tunnelProbe = null
          this.pushLog('error', `穿透地址检测失败：${res?.error || '未知原因'}`)
          ElMessage.error(res?.error || '检测失败')
          return null
        }
        this.tunnelProbe = res
        if (!res.reachable) {
          this.pushLog('warn', `穿透地址 ${res.host}:${res.port} 端口不通：${res.error}`)
          ElMessage.error(res.error || '端口未连通：隧道可能没启动，或地址/端口写错')
        } else if (res.scheme === 'wss') {
          this.pushLog('info', `检测结果：${res.host}:${res.port} 支持 TLS，使用 wss://${res.selfSigned ? '（自签名证书，客户端已允许放行）' : ''}`)
          ElMessage.success(`已连通并检测到 TLS，将使用 wss://${res.selfSigned ? '（自签名证书）' : ''}`)
        } else if (res.blocked) {
          this.pushLog('error', `检测结果：${res.host}:${res.port} 明文 HTTP 被节点拦下（${res.statusLine}），需开启隧道「自动 HTTPS」`)
          ElMessage.error(res.error)
        } else {
          this.pushLog('info', `检测结果：${res.host}:${res.port} 仅支持明文，使用 ws://`)
          ElMessage.success('已连通，端口只支持明文，将使用 ws://')
        }
        this.inviteLink = this.buildInviteLink()
        return res
      } catch (e) {
        this.probing = false
        this.tunnelProbe = null
        this.pushLog('error', `穿透地址检测异常：${e.message || e}`)
        ElMessage.error('检测异常：' + (e.message || ''))
        return null
      }
    },

    // 探测结论里可用的协议（无结论时返回空串，交给 resolveTunnelUrl 的启发式判断）
    probeScheme(state) {
      const p = (state || this).tunnelProbe
      if (!p || !p.reachable) return ''
      return p.scheme === 'wss' ? 'wss' : 'ws'
    },

    // ===== 房主：创建房间 =====
    async createRoom(capacity, password, tunnelAddr, port = MP_PORT) {
      if (!window.electronAPI?.mpCreateRoom) {
        ElMessage.error('房主模式需要桌面端（Electron）环境')
        return false
      }
      if (this.connected) {
        ElMessage.warning('你已在房间中，请先「离开房间」再创建新房间')
        return false
      }
      this.connecting = true
      try {
        const res = await window.electronAPI.mpCreateRoom(capacity, password)
        if (!res.success) {
          this.connecting = false
          this.pushLog('error', `创建房间失败：${res.error || '未知原因'}`)
          ElMessage.error(res.error || '创建房间失败')
          return false
        }
        this.hostToken = res.hostToken
        this.roomCode = res.roomCode
        this.roomCapacity = capacity
        this.port = res.port || port
        const nextTunnel = (tunnelAddr || '').trim()
        // 地址换了，之前的探测结论就作废，避免拿着旧协议头去拼邀请链接
        if (nextTunnel !== this.tunnelAddr) this.tunnelProbe = null
        this.tunnelAddr = nextTunnel
        this.roomPassword = password || ''
        if (Array.isArray(res.lanIps) && res.lanIps.length) this.lanIps = res.lanIps
        // 未手动指定过对外地址时，采用主进程给的最佳猜测（虚拟组网网卡优先）
        if (!this.localAddr) this.localAddr = res.lanIp || this.lanIps[0]?.address || ''
        this.inviteLink = this.buildInviteLink()
        this.pushLog('info', `房间已创建：${res.roomCode}，本机监听端口 ${res.port}`)
        if (this.inviteLink) {
          this.pushLog('info', `邀请链接：${this.inviteLink}`)
        } else {
          ElMessage.warning('未取到可用的本机地址，异地联机请填写内网穿透地址')
        }
        // 房主自己通过本机回环接入
        return this.connect(`ws://127.0.0.1:${res.port}`, {
          type: 'join',
          roomCode: res.roomCode,
          hostToken: res.hostToken,
          name: this.selfName,
        })
      } catch (e) {
        this.connecting = false
        this.pushLog('error', `创建房间异常：${e.message || e}`)
        ElMessage.error('创建房间失败：' + (e.message || ''))
        return false
      }
    },

    // ===== 加入者：加入房间 =====
    async joinRoom(addr, roomCode, password) {
      if (this.connected) {
        ElMessage.warning('你已在房间中，请先「离开房间」再加入其他房间')
        return false
      }
      const raw = (addr || '').trim()
      if (!raw) {
        ElMessage.warning('请填写服务器地址')
        return false
      }
      // 候选地址可能有两个（例如 wss://xxx.frp.com:37515 与 ws://xxx.frp.com:37515），
      // 按顺序试，第一个握手成功就停 —— 地址协议写反了也能自动连上
      const candidates = buildWsCandidates(raw, this.port || MP_PORT)
      return this.connectWithFallback(
        candidates,
        { type: 'join', roomCode, password: password || '', name: this.selfName },
        `加入房间 ${roomCode}（输入地址「${raw}」）`
      )
    },

    // 放行指定 wss 主机上的证书校验错误（仅 Electron 桌面端有效）
    async trustTunnelHost(url) {
      if (!/^wss:\/\//i.test(url)) return
      if (!window.electronAPI?.mpTrustWsHost) return
      try {
        await window.electronAPI.mpTrustWsHost(new URL(url).host)
      } catch (_) { /* 浏览器端或解析失败时静默忽略 */ }
    },

    // ===== 服务端消息 =====
    handleMessage(msg) {
      switch (msg.type) {
        case 'joined':
          this.connected = true
          this.connecting = false
          this.selfId = msg.selfId
          this.selfIsHost = !!msg.isHost
          this.hostId = msg.hostId || ''
          this.roomCapacity = msg.capacity
          this.roomCode = msg.roomCode
          this.members = dedupe(msg.members)
          this.pushLog('info', `已进入房间 ${msg.roomCode}，身份=${msg.isHost ? '房主' : '加入者'}，当前 ${this.members.length}/${msg.capacity} 人`)
          ElMessage.success(this.selfIsHost ? '房间已就绪，等待好友加入' : '已加入房间')
          this.emitGame({ kind: 'mp:joined' })
          break
        case 'error':
          this.connecting = false
          this.lastError = msg.message || '连接出错'
          // 服务端明确回错（房间不存在 / 口令错误 / 已满）时，握手其实已经成功，
          // 只是没能进房间，把这点写清楚，避免误判成网络问题
          this.lastErrorDetail = `服务端返回错误：${this.lastError}（网络已连通，问题在房间侧）`
          this.pushLog('error', `服务端拒绝：${this.lastError}`)
          ElMessage.error(this.lastError)
          break
        case 'member-joined':
          if (!this.members.some((m) => m.id === msg.member.id)) {
            this.members.push(msg.member)
          }
          ElMessage.info(`${msg.member.name} 加入了房间`)
          this.emitGame({ kind: 'mp:member-joined', member: msg.member })
          break
        case 'member-left':
          this.members = this.members.filter((m) => m.id !== msg.memberId)
          this.emitGame({ kind: 'mp:member-left', memberId: msg.memberId })
          break
        case 'room-closed':
          this.resetRoom()
          this.pushLog('warn', '房主已关闭房间')
          ElMessage.warning('房主已关闭房间')
          this.emitGame({ kind: 'mp:room-closed' })
          break
        case 'game':
          this.emitGame(msg.data || {}, msg.from)
          break
        default:
          break
      }
    },

    // ===== 房主选择游戏：广播给全员，大家一起进入 =====
    selectGame(game) {
      this.currentGame = game.id
      this.sendGame({ kind: 'mp:select-game', gameId: game.id, gameName: game.name })
    },

    // ===== 离开房间 =====
    leaveRoom() {
      const isHost = this.selfIsHost
      const code = this.roomCode
      this.closeSocket()
      if (isHost && code && window.electronAPI?.mpCloseRoom) {
        window.electronAPI.mpCloseRoom(code)
      }
      this.resetRoom()
      ElMessage.info('已离开房间')
    },

    resetRoom() {
      this.connected = false
      this.connecting = false
      this.selfId = ''
      this.selfIsHost = false
      this.hostId = ''
      this.roomCode = ''
      this.roomCapacity = 0
      this.members = []
      this.hostToken = ''
      this.inviteLink = ''
      this.tunnelAddr = ''
      this.roomPassword = ''
      this.localAddr = ''
      this.port = MP_PORT
      this.tunnelProbe = null
      // lanIps 不清空：网卡列表与房间无关，下次创建房间可直接复用
      // logs 也不清空：刚断开时的日志正是排障最需要的东西
      this.currentGame = ''
    },
  },
})

// 解析「穿透地址」输入，统一成可直接连接的 WebSocket 地址。
// 为什么需要它：内网穿透工具不一定放开明文 HTTP。例如 SakuraFrp 在国内节点上会以合规为由
// 拦掉明文 HTTP（连 WebSocket 握手的 GET 也是 HTTP）并返回 501，必须走它下发的 TLS，
// 此时地址要写成 wss://，不能被强行拼成 ws://。
// 协议头优先顺序：用户显式写的 > forceScheme（探测结论）> 按主机形态猜（见 guessScheme）。
// 支持以下写法：
//   example.frp.com            → wss://example.frp.com:8765（域名默认走加密，见 guessScheme）
//   192.168.1.5                → ws://192.168.1.5:8765（IP 默认明文）
//   example.frp.com:20000      → wss://example.frp.com:20000
//   ws://example.frp.com:20000 → 原样
//   wss://example.frp.com:443  → wss://example.frp.com:443
//   https://example.frp.com    → wss://example.frp.com（https 归一到 wss）
//   wss://example.frp.com:37515/mp-ws → 保留路径
export function resolveTunnelUrl(input, port = MP_PORT, forceScheme = '') {
  const raw = (input || '').trim().replace(/\/+$/, '')
  if (!raw) return ''
  let scheme = forceScheme === 'ws' || forceScheme === 'wss' ? forceScheme : guessScheme(raw)
  let rest = raw
  const m = raw.match(/^(wss?|https?):\/\//i)
  if (m) {
    // https 与 wss 都对应加密的 WebSocket；http 与 ws 对应明文
    scheme = /^(wss|https)$/i.test(m[1]) ? 'wss' : 'ws'
    rest = raw.slice(m[0].length)
  }
  // 拆出路径，避免把路径当成端口的一部分
  const slash = rest.indexOf('/')
  const host = slash === -1 ? rest : rest.slice(0, slash)
  const path = slash === -1 ? '' : rest.slice(slash)
  if (!host) return ''
  const hostPort = host.includes(':') ? host : `${host}:${port}`
  return `${scheme}://${hostPort}${path}`
}

// 没写协议头时按主机形态猜一个默认值。
// 依据是实测出来的规律：IP 直连（局域网 / 虚拟局域网）不可能有 TLS，
// 而域名基本都是穿透隧道，国内节点八成开了「自动 HTTPS」——
// 猜错也无妨，加入侧会自动回退另一种协议试一次（见 buildWsCandidates）。
export function guessScheme(input) {
  const host = extractHost(input)
  if (!host) return 'ws'
  return isIpLiteral(host) ? 'ws' : 'wss'
}

// 从任意写法里取出主机名（去掉协议头、路径、查询串、端口）
export function extractHost(input) {
  let s = String(input || '').trim().replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
  if (!s) return ''
  s = s.split('/')[0].split('?')[0]
  if (s.startsWith('[')) {
    const end = s.indexOf(']')
    return end === -1 ? s.slice(1) : s.slice(1, end)
  }
  const idx = s.lastIndexOf(':')
  return idx === -1 ? s : s.slice(0, idx)
}

export function isIpLiteral(host) {
  const h = String(host || '')
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return true
  // IPv6 字面量（已去掉方括号）：含冒号即视为 IPv6；域名不允许出现冒号
  return h.includes(':')
}

// 生成候选连接地址。域名同时给出 ws:// 与 wss:// 两个候选，
// 因为「隧道有没有开加密」从地址字面看不出来 —— 与其让用户来回改地址试，
// 不如让客户端自己按顺序试一次，第一个连上就停。
export function buildWsCandidates(input, port = MP_PORT) {
  const raw = (input || '').trim().replace(/\/+$/, '')
  if (!raw) return []
  const primary = resolveTunnelUrl(raw, port)
  if (!primary) return []
  const host = extractHost(raw)
  // IP 直连的协议是确定的，不必浪费一次尝试
  if (!host || isIpLiteral(host)) return [primary]
  const alt = primary.startsWith('wss://')
    ? primary.replace(/^wss:\/\//i, 'ws://')
    : primary.replace(/^ws:\/\//i, 'wss://')
  return alt && alt !== primary ? [primary, alt] : [primary]
}

// 浏览器对 WebSocket 的错误事件只给一个几乎空的 Event 对象，
// 能拿到的信息都在 close 的 code/reason 上，这里只做兜底描述。
function describeWsError(e) {
  if (!e) return '未知错误（浏览器未提供详情）'
  const parts = []
  if (e.type) parts.push(`事件类型=${e.type}`)
  if (e.message) parts.push(`message=${e.message}`)
  if (e.error) parts.push(`error=${e.error.message || e.error}`)
  return parts.length ? parts.join('，') : '未知错误（浏览器未提供详情）'
}

// 按 id 去重，避免重复消息把人数算高
function dedupe(list) {
  const map = new Map()
  ;(list || []).forEach((m) => {
    if (m && m.id) map.set(m.id, m)
  })
  return [...map.values()]
}
