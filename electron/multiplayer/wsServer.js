//  联机服务端
import { WebSocketServer } from 'ws'

// 默认 8765，可用环境变量 MP_PORT 覆盖（便于自测时避开正在运行的实例）
const MP_PORT = Number(process.env.MP_PORT) || 8765

// 成员断线后的宽限期：期间保留其成员记录与桌位，等他带同一 clientId 重连复用 memberId（不广播 member-left）
const MEMBER_GRACE_MS = Number(process.env.MP_MEMBER_GRACE_MS) || 5 * 60 * 1000

let wss = null
let heartbeatTimer = null

const rooms = new Map()

// 生成随机码
function genCode(len, chars) {
  let s = ''
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return s
}

// 启动 ws 服务（监听所有网卡，供局域网/穿透接入）
function startServer() {
  if (wss) return Promise.resolve({ port: MP_PORT })
  return new Promise((resolve, reject) => {
    const server = new WebSocketServer({ port: MP_PORT, host: '0.0.0.0' })
    server.on('listening', () => {
      wss = server
      startHeartbeat()
      resolve({ port: MP_PORT })
    })
    server.on('error', (err) => {
      reject(err)
    })
    server.on('connection', (ws) => {
      ws.isAlive = true
      ws.on('pong', () => { ws.isAlive = true })
      ws.on('message', (raw) => handleMessage(ws, raw))
      ws.on('close', () => removeMember(ws))
      ws.on('error', () => {})
    })
  })
}

function startHeartbeat() {
  if (heartbeatTimer) return
  heartbeatTimer = setInterval(() => {
    if (!wss) return
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) return ws.terminate()
      ws.isAlive = false
      ws.ping()
    })
  }, 30000)
}

function stopServer() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer)
    heartbeatTimer = null
  }
  if (wss) {
    wss.clients.forEach((ws) => {
      try { ws.close() } catch (_) { /* ignore */ }
    })
    wss.close()
    wss = null
  }
  // 关服时把宽限期计时器都清掉
  rooms.forEach((r) => {
    if (r.pending) r.pending.forEach((p) => clearTimeout(p.timer))
  })
  rooms.clear()
}

// 创建房间：确保服务已启动，生成房间码 + 房主凭证，返回给房主
function createRoom({ capacity = 2, password = '' } = {}) {
  return startServer().then(() => {
    const roomCode = genCode(6, 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789')
    const hostToken = genCode(16, 'abcdefghijklmnopqrstuvwxyz0123456789')
    const room = {
      roomCode,
      hostToken,
      // 房间不再限制人数（限流交给前端的「桌」）：传 0 或不传 = 无上限，给正数则 handleJoin 自动校验
      capacity: Math.max(0, Number(capacity) || 0),
      password: password || '',
      hostId: null,
      members: new Map(),
      // clientId → { memberId, timer }：断线后处于宽限期的成员，等他回来复用 memberId
      pending: new Map(),
    }
    rooms.set(roomCode, room)
    return { roomCode, hostToken, port: MP_PORT }
  })
}

// 关闭房间（房主取消或房主断开）
function closeRoom(roomCode) {
  const room = rooms.get(roomCode)
  if (!room) return false
  // 房间都没了，宽限期计时器一并清掉，免得它们之后再对着空房间广播
  if (room.pending) {
    room.pending.forEach((p) => clearTimeout(p.timer))
    room.pending.clear()
  }
  broadcast(room, { type: 'room-closed' })
  room.members.forEach((m) => {
    try { m.ws.close() } catch (_) { /* ignore */ }
  })
  rooms.delete(roomCode)
  return true
}

function send(ws, obj) {
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify(obj))
  }
}

function broadcast(room, obj, exceptId = null) {
  room.members.forEach((m) => {
    if (exceptId && m.id === exceptId) return
    send(m.ws, obj)
  })
}

function handleMessage(ws, raw) {
  let msg
  try {
    msg = JSON.parse(raw.toString())
  } catch (_) {
    return
  }
  if (!msg || !msg.type) return

  switch (msg.type) {
    case 'join':
      handleJoin(ws, msg)
      break
    case 'leave':
      removeMember(ws, true)
      break
    case 'game':
      handleGame(ws, msg)
      break
    default:
      break
  }
}

function handleJoin(ws, msg) {
  const { roomCode, password, name, hostToken, clientId } = msg
  const room = rooms.get(roomCode)
  if (!room) {
    return send(ws, { type: 'error', message: '房间不存在' })
  }
  // 同一条连接重复 join：先撤销它上一次的成员记录，避免一个 ws 在房间里占多个位置（房主身份除外）
  if (ws._memberId && ws._roomCode) {
    const prevRoom = rooms.get(ws._roomCode)
    if (prevRoom && prevRoom.hostId !== ws._memberId) {
      prevRoom.members.delete(ws._memberId)
    }
  }
  if (room.password && room.password !== (password || '')) {
    return send(ws, { type: 'error', message: '房间口令错误' })
  }
  // 房主身份：需持有正确 hostToken；重复房主拒绝
  const isHost = !!hostToken && hostToken === room.hostToken
  if (isHost && room.hostId) {
    return send(ws, { type: 'error', message: '房主已在线' })
  }
  // 断线重连：同一 clientId 在宽限期内回到本房间则复用原 memberId，其他人按 memberId 索引的状态不用重建
  //   重连的人从未被广播过 member-left，所以这里也不再广播 member-joined。
  if (clientId && room.pending && room.pending.has(clientId)) {
    const p = room.pending.get(clientId)
    const existed = room.members.get(p.memberId)
    clearTimeout(p.timer)
    room.pending.delete(clientId)
    if (existed) {
      existed.ws = ws
      existed.away = false
      ws._roomCode = roomCode
      ws._memberId = p.memberId
      if (existed.isHost) room.hostId = p.memberId
      send(ws, {
        type: 'joined',
        roomCode,
        selfId: p.memberId,
        hostId: room.hostId,
        isHost: existed.isHost,
        capacity: room.capacity,
        members: [...room.members.values()].map(({ id, name, isHost }) => ({ id, name, isHost })),
      })
      return
    }
    // 成员记录已经不在了（异常）：当作全新成员，走下面的常规路径
  }

  // capacity 为 0 = 房间无上限，不校验人数（默认行为）
  if (!isHost && room.capacity > 0 && room.members.size >= room.capacity) {
    return send(ws, { type: 'error', message: '房间已满' })
  }

  const memberId = genCode(12, 'abcdefghijklmnopqrstuvwxyz0123456789')
  const member = {
    id: memberId,
    name: (name || '玩家').slice(0, 16),
    isHost,
    ws,
    clientId: clientId || '',
  }
  ws._roomCode = roomCode
  ws._memberId = memberId
  room.members.set(memberId, member)
  if (isHost) room.hostId = memberId

  send(ws, {
    type: 'joined',
    roomCode,
    selfId: memberId,
    hostId: room.hostId,
    isHost,
    capacity: room.capacity,
    members: [...room.members.values()].map(({ id, name, isHost }) => ({ id, name, isHost })),
  })

  broadcast(
    room,
    { type: 'member-joined', member: { id: memberId, name: member.name, isHost } },
    memberId
  )
}

function handleGame(ws, msg) {
  const room = rooms.get(ws._roomCode)
  if (!room) return
  // to 指定成员 id 时只投递给该成员（用于给新加入者补发当前局面快照），
  // 不指定则广播给房间内其他所有人
  if (msg.to) {
    const target = room.members.get(msg.to)
    if (target) send(target.ws, { type: 'game', from: ws._memberId, data: msg.data })
    return
  }
  broadcast(room, { type: 'game', from: ws._memberId, data: msg.data }, ws._memberId)
}

// immediate=true：主动离开（收到 leave 消息）——立即摘除，不给宽限期。
// immediate=false：连接断开（掉线 / 切后台）——带 clientId 的先软挂起等重连。
function removeMember(ws, immediate = false) {
  const roomCode = ws._roomCode
  const memberId = ws._memberId
  if (!roomCode || !memberId) return
  const room = rooms.get(roomCode)
  if (!room) return
  const cur = room.members.get(memberId)
  // 已经处理过了（例如主动 leave 之后紧跟着的 close），或已被更新的重连连接顶替
  if (!cur || cur.ws !== ws) return
  // 房主离开 → 关闭整个房间（房主跑在桌面端，不会因切后台断线，这里多半是真的退出）
  if (room.hostId === memberId) {
    closeRoom(roomCode)
    return
  }
  // ★ 掉线且有 clientId：先「软挂起」——保留成员记录与桌位，给一个宽限期等他重连。
  //   宽限期内不广播 member-left，别人界面里这人还在，桌也给他留着。
  if (!immediate && cur.clientId) {
    cur.away = true
    const timer = setTimeout(() => {
      const r = rooms.get(roomCode)
      if (!r) return
      const m = r.members.get(memberId)
      if (!m || !m.away) return   // 已经重连回来了
      r.members.delete(memberId)
      if (r.pending) r.pending.delete(cur.clientId)
      broadcast(r, { type: 'member-left', memberId })
    }, MEMBER_GRACE_MS)
    if (room.pending) room.pending.set(cur.clientId, { memberId, timer })
    return
  }
  // 主动离开 / 老客户端（没带 clientId）：立即摘除并广播
  if (cur.clientId && room.pending) {
    const p = room.pending.get(cur.clientId)
    if (p) {
      clearTimeout(p.timer)
      room.pending.delete(cur.clientId)
    }
  }
  room.members.delete(memberId)
  broadcast(room, { type: 'member-left', memberId })
}

export { startServer, stopServer, createRoom, closeRoom }
