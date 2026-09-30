// 多人联机全局
import { defineStore } from 'pinia'
import { ElMessage } from 'element-plus'
import { useUserStore } from '@/config/user'

// 桌号的「宽限期」：刚开/刚进的桌，房主的全量广播还没回来时，
// 本地 sessions 里查不到它 —— 这段时间内不许把它当成「已经不在了」。
const SESSION_GRACE_MS = 4000

export const MP_PORT = 8765
const ATTEMPT_TIMEOUT_MS = 6000
let socket = null
// 本轮 connect 用到的「重连凭证草稿」：成功进房（收到 joined）后才正式落进
// state.reconnectInfo；连接彻底失败时清空，避免拿一个根本连不上的凭证反复重试。
let pendingReconnect = null
const listeners = new Set()

// 设备级的「客户端身份」。join 时带上它，服务端在宽限期内就能把同一个人认回来
// （复用同一个 memberId）—— 于是同桌其他人的对局状态（按 memberId 索引）不用重建，
// 手机切后台再回来在别人眼里就是「没断过」。
// 用 localStorage 但**不进存档白名单**：它是设备级的，不属于任何存档槽。
const CLIENT_ID_KEY = 'mp_client_id'
function getClientId() {
  try {
    let id = localStorage.getItem(CLIENT_ID_KEY)
    if (!id) {
      id = 'c' + Math.random().toString(36).slice(2, 12)
      localStorage.setItem(CLIENT_ID_KEY, id)
    }
    return id
  } catch (_) {
    return ''
  }
}

export const useMultiplayerStore = defineStore('multiplayer', {
  state: () => ({
    connected: false,
    connecting: false,
    selfId: '',
    selfIsHost: false,
    hostId: '',           // 房主成员 id，非房主上报用
    roomCode: '',
    // 0 = 房间无上限（默认）。房间只负责把人聚在一起，
    // 「一局游戏几个座位」由下面的 sessions（桌）管。
    roomCapacity: 0,
    members: [],
    //  桌（session）：房间里可以同时开着好几局 
    // 服务端是盲中继、不存任何对局状态，所以桌列表由「房主」当唯一权威：
    // 所有人把 开桌 / 接受 / 拒绝 / 观战 / 离桌 发给房主，房主算完广播全量 sessions。
    // 房主永远在线（他掉线房间就关了），所以这个权威不会缺位。
    sessions: [],
    // [{ id, gameId, gameName, route, cap, ownerId, ownerName,
    //    seats:[{id,name}], watchers:[{id,name}], declined:[id],
    //    status:'open'|'playing', createdAt }]
    sessionId: '',      // 我当前所在的桌（玩家与旁观者都填它）
    sessionRole: '',    // 'player' | 'watcher'
    // 记下「什么时候进的这一桌」。开桌 / 接受 / 观战都是先本地记桌号、
    // 再等房主把全量桌列表广播回来，中间那一小段时间里 sessions 里还查不到这一桌 ——
    // 用它把「刚进的桌」和「已经没了的桌」区分开（见 staleSession）。
    sessionSetAt: 0,
    // 我拒绝过的桌（本地记一份，房主广播回来之前界面就能立刻不弹）
    declinedSids: [],
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
    // 被系统挂起（切后台）导致断线时的「软挂起」标记：保留房间/桌状态、
    // 不弹断开提示，回到前台 onAppVisible() 拿 reconnectInfo 自动重连。
    backgrounded: false,
    // 重连凭证：成功进房后记下「用什么地址、什么身份」重新 join，
    // 这样从后台回来无需用户手动重输。主动离开房间时清空（见 resetRoom）。
    reconnectInfo: null,
  }),

  getters: {
    memberCount: (s) => s.members.length,
    selfName: () => useUserStore().currentUser,
    // 五子棋配色：房主执黑先行，加入者执白（没有开桌时的兜底，开桌后一律以「桌主执黑」为准）
    myChessRole: (s) => (s.selfIsHost ? 1 : 2),

    //  桌相关 
    // 房间人数文案：0 = 无上限，不再显示 x/y
    capacityText: (s) =>
      s.roomCapacity > 0 ? `${s.memberCount}/${s.roomCapacity} 人` : `${s.memberCount} 人 · 无上限`,
    // 我所在的那一桌（没在任何桌里时为 null）
    mySession: (s) => s.sessions.find((x) => x.id === s.sessionId) || null,
    // 我开的桌 / 我坐在这一桌的玩家席 / 我只是旁观
    amTableOwner: (s) => {
      const t = s.sessions.find((x) => x.id === s.sessionId)
      return !!t && t.ownerId === s.selfId
    },
    isWatcher: (s) => s.sessionRole === 'watcher',
    // 我还欠一个答复的邀请：别人开的、还在招人的、我没接受也没拒绝也没在观战的桌
    pendingInvites: (s) =>
      s.sessions.filter(
        (x) =>
          x.status === 'open' &&
          // 已经在这一桌里了（刚点完接受 / 观战，房主的全量广播还在路上）就不再当邀请弹
          x.id !== s.sessionId &&
          x.ownerId !== s.selfId &&
          !(x.seats || []).some((p) => p.id === s.selfId) &&
          !(x.watchers || []).some((p) => p.id === s.selfId) &&
          !(x.declined || []).includes(s.selfId) &&
          !s.declinedSids.includes(x.id)
      ),
    // 正在进行的桌（给别人观战用）
    playingSessions: (s) => s.sessions.filter((x) => x.status === 'playing'),

    // ★ 残留桌号：本地还记着「我在某一桌」，但那张桌在房间里已经不存在了。
    // 成因很常见：桌主退了对局页 → 整桌解散 → 但其他人手上的桌号还在。
    // 不识别出来的后果就是死锁：想开新桌时被自己那句「你已经在「XX」里了，先退出」挡住，
    // 而房间里其实早就没有那张桌了，用户只能重启应用。
    staleSession: (s) =>
      !!s.sessionId &&
      !s.sessions.some((x) => x.id === s.sessionId) &&
      Date.now() - (s.sessionSetAt || 0) > SESSION_GRACE_MS,
  },

  actions: {
    //  订阅：对局页与大厅页都通过它接收房间/游戏消息 
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

    //  发送 
    // 房间级信令：永远不带桌号，房间里所有人（包括还待在大厅没开局的人）都会收到。
    // 开桌 / 接受 / 拒绝 / 观战 / 散桌 这类「不属于任何一局」的信令全走这里。
    sendRoom(data, to = null) {
      if (!socket || socket.readyState !== 1) return false
      socket.send(JSON.stringify({ type: 'game', data, to }))
      return true
    },

    // 桌内消息：自动带上当前桌号。
    // ★ 这是「房间里同时开好几局」的关键：游戏页照旧调 sendGame，一行都不用改，
    //   消息就自动只落在我所在的那一桌；收端按同一个桌号过滤（见 handleMessage），
    //   于是几张桌各打各的，互不串台。
    sendGame(data, to = null) {
      if (!socket || socket.readyState !== 1) return false
      const payload = this.sessionId ? { ...data, sid: this.sessionId } : data
      socket.send(JSON.stringify({ type: 'game', data: payload, to }))
      return true
    },

    //  排障日志 
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

    //  连接管理 
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
    // 记下「用什么地址、什么身份」重新 join，进房成功后再正式落进 state.reconnectInfo
    pendingReconnect = { urls: list, payload, hint }
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
      // 连不上：重连凭证作废，免得从后台回来拿一个死地址反复重试
      pendingReconnect = null
      this.reconnectInfo = null
      this.backgrounded = false
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
            // 切到后台被系统挂起导致断线：先「软挂起」——保留房间/桌状态，不弹断开提示；
            // 回到前台时 onAppVisible() 会拿 reconnectInfo 自动重连，对用户而言「没断过」。
            if (typeof document !== 'undefined' && document.hidden) {
              if (this.connected) {
                this.backgrounded = true
                this.pushLog('warn', `${url} 连接被系统挂起（可能切到后台），回到前台将自动重连`)
              }
              this.connected = false
              return
            }
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

    //  从后台回到前台：自动重连 
    // 手机切后台时系统会掐掉 WebSocket（见 tryConnect 里的 onclose 软挂起分支）。
    // 回到前台时若处于「软挂起」且手里还有重连凭证，就原地重连 —— 用户视角就是「没断过」。
    // 由 App.vue 的 visibilitychange 监听调用。
    onAppVisible() {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      // ★ 这里刻意不清 backgrounded：要留到收到 joined 时再读它，才能判定这次是
      //   「从后台恢复」，进而做「重新挂回原桌 + 重拉快照」。清它由 joined / 连接失败 / resetRoom 负责。
      if (this.reconnectInfo && !this.connected && !this.connecting) {
        this.pushLog('info', '从后台返回，自动重连房间')
        this.connectWithFallback(
          this.reconnectInfo.urls,
          this.reconnectInfo.payload,
          '从后台返回，自动重连'
        )
      }
    },

    //  房主：对外地址 
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

    //  房主：探测穿透地址可用哪种协议 
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

    //  房主：创建房间 
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
          clientId: getClientId(),
        })
      } catch (e) {
        this.connecting = false
        this.pushLog('error', `创建房间异常：${e.message || e}`)
        ElMessage.error('创建房间失败：' + (e.message || ''))
        return false
      }
    },

    //  加入者：加入房间 
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
        { type: 'join', roomCode, password: password || '', name: this.selfName, clientId: getClientId() },
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

    //  服务端消息 
    handleMessage(msg) {
      switch (msg.type) {
        case 'joined': {
          // 是不是「从后台回来」的那次重连（软挂起后自动重连的标记）
          const wasBackgrounded = this.backgrounded
          this.connected = true
          this.connecting = false
          this.backgrounded = false
          this.selfId = msg.selfId
          this.selfIsHost = !!msg.isHost
          this.hostId = msg.hostId || ''
          this.roomCapacity = msg.capacity
          this.roomCode = msg.roomCode
          this.members = dedupe(msg.members)
          // 进房成功 → 把本轮的重连凭证正式留下，供下次被系统挂起后照原样重连
          if (pendingReconnect) this.reconnectInfo = pendingReconnect
          this.pushLog('info', `已进入房间 ${msg.roomCode}，身份=${msg.isHost ? '房主' : '加入者'}，当前 ${this.capacityText}`)
          ElMessage.success(
            wasBackgrounded
              ? '已从后台恢复连接'
              : this.selfIsHost ? '房间已就绪，等待好友加入' : '已加入房间'
          )
          this.emitGame({ kind: 'mp:joined' })
          // 后进来的人要一份当前开了哪些桌（房主自己就是权威，不用问）
          this.requestSessions()
          // 从后台回来：房主会在收到 member-left 时把我从桌上摘掉，
          // 这里要主动「重新挂回原来那一桌」，并让桌主重推一份对局快照（三页都已实现 mp:sync-request）。
          if (wasBackgrounded && this.sessionId) {
            const sid = this.sessionId
            this.sendRoom(
              { kind: 'mp:session-rejoin', sid, role: this.sessionRole },
              this.hostId || null
            )
            setTimeout(() => {
              if (this.sessionId !== sid) return
              const owner = this.mySession?.ownerId
              if (owner && owner !== this.selfId) {
                this.sendGame({ kind: 'mp:sync-request' }, owner)
              }
            }, 600)
          }
          break
        }
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
          // 新人刚进来不知道有哪些桌，房主主动推一份
          if (this.selfIsHost) this.broadcastSessions()
          break
        case 'member-left':
          this.members = this.members.filter((m) => m.id !== msg.memberId)
          // 人走了要把它从各桌的座位 / 观战名单里摘掉，否则桌永远等不到人
          if (this.selfIsHost && this.sessions.length) {
            this.sessions.forEach((t) => {
              t.seats = t.seats.filter((p) => p.id !== msg.memberId)
              t.watchers = t.watchers.filter((p) => p.id !== msg.memberId)
              t.declined = t.declined.filter((x) => x !== msg.memberId)
              if (msg.memberId === t.ownerId || !t.seats.length) {
                this.sessions = this.sessions.filter((x) => x.id !== t.id)
              } else if (t.status === 'playing' && t.seats.length < t.cap) {
                t.status = 'open'
              }
            })
            this.broadcastSessions()
          }
          this.emitGame({ kind: 'mp:member-left', memberId: msg.memberId })
          break
        case 'room-closed':
          this.resetRoom()
          this.pushLog('warn', '房主已关闭房间')
          ElMessage.warning('房主已关闭房间')
          this.emitGame({ kind: 'mp:room-closed' })
          break
        case 'game': {
          const d = msg.data || {}
          // 桌内消息按桌过滤：房间里可能同时开着好几局，不是我这桌的包直接丢掉，
          // 免得别桌的落子 / 发言污染我这一局。
          // ★ 但「桌信令」必须豁免：它们虽然带着 sid（要指明是哪一桌），却是发给全房间的
          //   （开桌 / 满员开打 / 全量桌列表）。房主此刻可能正坐在另一桌上打牌，
          //   若按 sid 一滤，这些信令会被房主自己丢弃，桌列表就再也更新不了了。
          const kind = typeof d.kind === 'string' ? d.kind : ''
          const isTableSignal = kind === 'mp:sessions' || kind.startsWith('mp:session')
          // 桌内流量必须「桌号完全对得上」：待在大厅（没桌号）的人也不该收到别桌的落子 / 快照
          if (!isTableSignal && d.sid && d.sid !== this.sessionId) return
          // 房主广播回来的全量桌列表：所有人（含房主自己）以它为准
          if (d.kind === 'mp:sessions') {
            this.sessions = Array.isArray(d.sessions) ? d.sessions : []
          }
          // 房主是桌列表的唯一权威，桌相关信令先吃掉，不再往游戏页分发
          if (this.selfIsHost && typeof d.kind === 'string' && d.kind.startsWith('mp:session-')) {
            this.hostHandleSession(d, msg.from)
            return
          }
          this.emitGame(d, msg.from)
          break
        }
        default:
          break
      }
    },

    //  桌（session）：房间里可以同时开着好几局 
    //
    // 为什么需要「桌」：房间已经无上限了，可一局游戏的座位是有限的
    // （五子棋 2 人、萤火夜话 6 人）。房间只负责把人聚在一起，真正限流的是桌。
    // 于是：房主在打牌，其他人也能自己开一桌；谁先坐满谁先开局；
    // 没进去的人可以观战，或者再开一桌。
    //
    // 服务端是盲中继、不存任何对局状态，所以桌列表由「房主」当唯一权威：
    // 大家把 开桌/接受/拒绝/观战/离桌 发给房主，房主算完广播全量 sessions。
    // 房主永远在线（他掉线房间就关了），这个权威不会缺位。

    // 开一张桌。开桌即等于向房间内所有人发出邀请（用户要求：默认全员收到）。
    // 开桌人自动占第一个座位（先到先得）。返回桌号，调用方拿它跳转对局页。
    openSession(game, cap) {
      if (!this.connected) return ''
      const sid = `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
      this.sessionId = sid
      this.sessionRole = 'player'
      this.sessionSetAt = Date.now()
      this.declinedSids = this.declinedSids.filter((x) => x !== sid)
      this.sendRoom(
        {
          kind: 'mp:session-open',
          sid,
          gameId: game.id,
          gameName: game.name,
          route: game.route || '',
          cap: Math.max(2, Number(cap) || game.minCapacity || 2),
        },
        this.hostId || null
      )
      return sid
    },

    // 接受邀请 → 占一个座位。先到先得，坐满就开局（由房主判定）。
    acceptSession(sid) {
      if (!this.connected || !sid) return
      this.sessionId = sid
      this.sessionRole = 'player'
      this.sessionSetAt = Date.now()
      this.declinedSids = this.declinedSids.filter((x) => x !== sid)
      this.sendRoom({ kind: 'mp:session-accept', sid }, this.hostId || null)
    },

    // 拒绝邀请 → 留在大厅，可以观战，也可以自己另开一桌
    declineSession(sid) {
      if (!sid) return
      if (!this.declinedSids.includes(sid)) this.declinedSids.push(sid)
      this.sendRoom({ kind: 'mp:session-decline', sid }, this.hostId || null)
    },

    // 观战 → 进对局页，只接收广播，不占座位
    watchSession(sid) {
      if (!this.connected || !sid) return
      this.sessionId = sid
      this.sessionRole = 'watcher'
      this.sessionSetAt = Date.now()
      this.sendRoom({ kind: 'mp:session-watch', sid }, this.hostId || null)
    },

    // 离开当前所在的桌（玩家离席 / 旁观者退出观战）
    leaveSession() {
      const sid = this.sessionId
      if (!sid) return
      this.sendRoom({ kind: 'mp:session-leave', sid }, this.hostId || null)
      this.sessionId = ''
      this.sessionRole = ''
      this.sessionSetAt = 0
    },

    // 桌主散桌
    endSession(sid) {
      if (!sid) return
      this.sendRoom({ kind: 'mp:session-end', sid }, this.hostId || null)
      if (this.sessionId === sid) {
        this.sessionId = ''
        this.sessionRole = ''
        this.sessionSetAt = 0
      }
    },

    //  离开对局页 = 关掉这张桌 
    // 用户要求：玩家只要退了对局、回到游戏大厅，这张桌就直接关掉。
    // 不这么做会留下一张没人管的空桌，把所有人卡在「你已经在某桌里了」上。
    // 分工：自己开的桌 → 散桌（整桌连带清掉）；坐别人的桌 / 观战 → 让出席位。
    exitSession() {
      const sid = this.sessionId
      if (!sid) return
      if (this.amTableOwner) this.endSession(sid)
      else this.leaveSession()
    },

    // 只清本地那份残留桌号（那张桌在房间里其实已经没了，不需要也不能再发信令）
    clearSession() {
      this.sessionId = ''
      this.sessionRole = ''
      this.sessionSetAt = 0
    },

    // 刚进房间的人向房主要一份当前桌列表（房主自己不需要）
    requestSessions() {
      if (!this.connected || this.selfIsHost) return
      this.sendRoom({ kind: 'mp:sessions-request' }, this.hostId || null)
    },

    // 直接刷新对局页时，store 里的桌号会丢（地址栏的 ?sid= 还在）—— 用它补回来。
    // 不补的后果很具体：sendGame 不会带 sid，我这桌的落子会广播到整个房间去。
    restoreSession(sid, watch = false) {
      if (sid) {
        this.sessionId = sid
        // 刷新页面重新接上这一桌，同样算「刚进桌」，别被当成残留桌号清掉
        this.sessionSetAt = Date.now()
      }
      if (this.sessionId) this.sessionRole = watch ? 'watcher' : 'player'
    },

    //  房主：桌列表的唯一权威 
    hostHandleSession(d, fromId) {
      const nameOf = (id) => this.members.find((m) => m.id === id)?.name || '有人'
      const find = (sid) => this.sessions.find((x) => x.id === sid)
      switch (d.kind) {
        case 'mp:sessions-request':
          return this.broadcastSessions()

        case 'mp:session-open': {
          if (find(d.sid)) return this.broadcastSessions()
          const cap = Math.max(2, Number(d.cap) || 2)
          const owner = { id: fromId, name: nameOf(fromId) }
          const table = {
            id: d.sid,
            gameId: d.gameId,
            gameName: d.gameName,
            route: d.route || '',
            cap,
            ownerId: fromId,
            ownerName: owner.name,
            seats: [owner],
            watchers: [],
            declined: [],
            status: 'open',
            createdAt: Date.now(),
          }
          this.sessions = [...this.sessions, table]
          if (table.seats.length >= cap) {
            table.status = 'playing'
            this.announceStart(table)
          }
          return this.broadcastSessions()
        }

        case 'mp:session-accept': {
          const t = find(d.sid)
          if (!t || t.status !== 'open') return this.broadcastSessions()
          if (t.seats.some((p) => p.id === fromId)) return this.broadcastSessions()
          // 已经坐满，晚到的人进不去（先到先得）
          if (t.seats.length >= t.cap) return this.broadcastSessions()
          t.seats.push({ id: fromId, name: nameOf(fromId) })
          t.declined = t.declined.filter((x) => x !== fromId)
          t.watchers = t.watchers.filter((p) => p.id !== fromId)
          // 席位一满立刻开局（用户要求：先到先得，满员即开）
          if (t.seats.length >= t.cap) {
            t.status = 'playing'
            this.announceStart(t)
          }
          return this.broadcastSessions()
        }

        case 'mp:session-decline': {
          const t = find(d.sid)
          if (!t || t.status !== 'open') return this.broadcastSessions()
          if (!t.declined.includes(fromId)) t.declined.push(fromId)
          return this.broadcastSessions()
        }

        case 'mp:session-watch': {
          const t = find(d.sid)
          if (!t) return this.broadcastSessions()
          if (!t.watchers.some((p) => p.id === fromId)) {
            t.watchers.push({ id: fromId, name: nameOf(fromId) })
          }
          return this.broadcastSessions()
        }

        // 从后台回来后「重新挂回原来那一桌」。
        // 为什么需要它：手机切后台时连接会被系统掐掉，服务端随即广播 member-left，
        // 房主已经把我从座位/观战名单里摘掉了；重连成功后要主动把自己塞回去，
        // 否则人会「在房间里、却不在任何一桌」，对局页也就收不到后续广播了。
        // ★ 这里只补位、不 announceStart —— 对局是续着打的，重新喊「开打」会把牌桌重置。
        case 'mp:session-rejoin': {
          const t = find(d.sid)
          if (!t) return this.broadcastSessions()
          const asWatcher = d.role === 'watcher'
          if (asWatcher) {
            if (!t.watchers.some((p) => p.id === fromId)) {
              t.watchers.push({ id: fromId, name: nameOf(fromId) })
            }
          } else if (!t.seats.some((p) => p.id === fromId)) {
            if (t.seats.length < t.cap) {
              t.seats.push({ id: fromId, name: nameOf(fromId) })
            } else if (!t.watchers.some((p) => p.id === fromId)) {
              // 席位被别人占了：退而观战，总比被挡在门外强
              t.watchers.push({ id: fromId, name: nameOf(fromId) })
            }
          }
          // 座位重新坐满 → 状态回到 playing（纯展示用，不发 announceStart）
          if (t.seats.length >= t.cap) t.status = 'playing'
          return this.broadcastSessions()
        }

        case 'mp:session-leave': {
          const t = find(d.sid)
          if (!t) return this.broadcastSessions()
          t.seats = t.seats.filter((p) => p.id !== fromId)
          t.watchers = t.watchers.filter((p) => p.id !== fromId)
          // 桌主走了、或一个座位都不剩 → 散桌
          if (fromId === t.ownerId || !t.seats.length) {
            this.sessions = this.sessions.filter((x) => x.id !== d.sid)
          } else if (t.status === 'playing' && t.seats.length < t.cap) {
            // 打到一半有人跑了：退回招人状态，让别人还能补位
            t.status = 'open'
            t.declined = t.declined.filter((x) => !t.seats.some((p) => p.id === x))
          }
          return this.broadcastSessions()
        }

        case 'mp:session-end': {
          const t = find(d.sid)
          // 只有桌主能散自己的桌；房主也能散（方便清场）
          if (!t || (fromId !== t.ownerId && fromId !== this.hostId)) return this.broadcastSessions()
          this.sessions = this.sessions.filter((x) => x.id !== d.sid)
          return this.broadcastSessions()
        }

        default:
          return
      }
    },

    // 满员：告诉桌上的人「可以开了」，各游戏页自己决定怎么开
    announceStart(t) {
      this.sendRoom({
        kind: 'mp:session-start',
        sid: t.id,
        gameId: t.gameId,
        seats: t.seats.map((p) => p.id),
      })
    },

    // 把全量桌列表广播给房间里的其他人（自己本地已经是最新的，服务端会排除发送者）
    broadcastSessions() {
      this.sendRoom({ kind: 'mp:sessions', sessions: JSON.parse(JSON.stringify(this.sessions)) })
    },

    //  离开房间 
    leaveRoom() {
      const isHost = this.selfIsHost
      const code = this.roomCode
      // 主动离开：先明确告诉服务端「我走了」，别让它把这当成掉线而给我留宽限期
      if (socket && socket.readyState === 1) {
        try { socket.send(JSON.stringify({ type: 'leave' })) } catch (_) { /* ignore */ }
      }
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
      // 房间已经真的没了（主动离开 / 房主关房 / 前台掉线）：重连凭证一并作废，
      // 免得从后台回来又拿老凭证去 join 一个不存在的房间。
      this.backgrounded = false
      this.reconnectInfo = null
      pendingReconnect = null
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
      // 房间都没了，桌自然也全没了
      this.sessions = []
      this.sessionId = ''
      this.sessionRole = ''
      this.sessionSetAt = 0
      this.declinedSids = []
    },
  },
})

// 解析「穿透地址」输入，统一成可直接连接的 WebSocket 地址。
// 为什么需要它：内网穿透工具不一定放开明文 HTTP。例如 SakuraFrp 在国内节点上会以合规为由
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
