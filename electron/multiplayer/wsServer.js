// ======== 联机服务端（房主模式） ========
// 在主进程中运行，管理房间与成员。房主创建房间后，本地启动 ws 服务，
// 房主与所有加入者都通过 WebSocket 连接（房主连 127.0.0.1 本地回环，加入者连房主公网/局域网地址）。
// 数据最小化：成员昵称仅存在于内存，进程退出即清除，不落盘、不进错误日志。
import { WebSocketServer } from 'ws'

// 默认 8765，可用环境变量 MP_PORT 覆盖（便于自测时避开正在运行的实例）
const MP_PORT = Number(process.env.MP_PORT) || 8765

let wss = null
let heartbeatTimer = null

// roomCode -> room
// room: { roomCode, hostToken, capacity, password, hostId, members: Map<memberId, member> }
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
      capacity: Math.min(Math.max(Number(capacity) || 2, 2), 8),
      password: password || '',
      hostId: null,
      members: new Map(),
    }
    rooms.set(roomCode, room)
    return { roomCode, hostToken, port: MP_PORT }
  })
}

// 关闭房间（房主取消或房主断开）
function closeRoom(roomCode) {
  const room = rooms.get(roomCode)
  if (!room) return false
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
      removeMember(ws)
      break
    case 'game':
      handleGame(ws, msg)
      break
    default:
      break
  }
}

function handleJoin(ws, msg) {
  const { roomCode, password, name, hostToken } = msg
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
  if (!isHost && room.members.size >= room.capacity) {
    return send(ws, { type: 'error', message: '房间已满' })
  }

  const memberId = genCode(12, 'abcdefghijklmnopqrstuvwxyz0123456789')
  const member = {
    id: memberId,
    name: (name || '玩家').slice(0, 16),
    isHost,
    ws,
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

function removeMember(ws) {
  const roomCode = ws._roomCode
  const memberId = ws._memberId
  if (!roomCode || !memberId) return
  const room = rooms.get(roomCode)
  if (!room) return
  room.members.delete(memberId)
  // 房主离开 → 关闭整个房间
  if (room.hostId === memberId) {
    closeRoom(roomCode)
    return
  }
  broadcast(room, { type: 'member-left', memberId })
}

export { startServer, stopServer, createRoom, closeRoom }
