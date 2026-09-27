import { contextBridge, ipcRenderer } from 'electron'

// 安全暴露 IPC API 给渲染进程
const electronAPI = {
  // 对话框
  showOpenDialog: (options) => ipcRenderer.invoke('dialog:show-open', options),
  showSaveDialog: (options) => ipcRenderer.invoke('dialog:show-save', options),

  // 用系统浏览器打开外链（Windows 优先 Edge）
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),

  // 图片存储
  saveImage: (id, data, ext) => ipcRenderer.invoke('storage:save-image', { id, data, ext }),
  deleteImage: (id, ext) => ipcRenderer.invoke('storage:delete-image', { id, ext }),
  getImage: (id, ext) => ipcRenderer.invoke('storage:get-image', { id, ext }),
  listImages: () => ipcRenderer.invoke('storage:list-images'),
  // 清空全部落盘数据（存档槽文件 + 图片目录）
  clearAllData: () => ipcRenderer.invoke('storage:clear-all'),

  // 文件操作
  writeFile: (path, content) => ipcRenderer.invoke('fs:write-file', { path, content }),
  readFile: (path) => ipcRenderer.invoke('fs:read-file', { path }),

  // 存档槽
  saveSaveSlot: (slotId, payload) => ipcRenderer.invoke('game:save-slot', { slotId, payload }),
  loadSaveSlot: (slotId) => ipcRenderer.invoke('game:load-slot', slotId),
  deleteSaveSlot: (slotId) => ipcRenderer.invoke('game:delete-slot', slotId),

  // 米哈游扫码登录（获取崩铁 UID）
  mihoyoCreateQrcode: () => ipcRenderer.invoke('mihoyo:create-qrcode'),
  mihoyoQueryQrcode: (ticket, deviceId) => ipcRenderer.invoke('mihoyo:query-qrcode', { ticket, deviceId }),
  mihoyoGetCookieToken: (stoken, uid, mid) => ipcRenderer.invoke('mihoyo:get-cookie-token', { stoken, uid, mid }),
  mihoyoGetGameRoles: (cookieToken, accountId) => ipcRenderer.invoke('mihoyo:get-game-roles', { cookieToken, accountId }),

  // 音乐
  musicPickFolder: () => ipcRenderer.invoke('music:pick-folder'),
  musicScanFolder: (folderPath) => ipcRenderer.invoke('music:scan-folder', { folderPath }),
  musicReadFile: (filePath) => ipcRenderer.invoke('music:read-file', { filePath }),

  // 游戏启动相关
  launchGame: (path) => ipcRenderer.invoke('launch-game', path),
  selectGamePath: () => ipcRenderer.invoke('select-game-path'),

  // AI 对话
  aiChat: (config, messages) => ipcRenderer.invoke('ai:chat', { config, messages }),

  // 多人联机（房主模式）
  mpCreateRoom: (capacity, password) => ipcRenderer.invoke('mp:create-room', { capacity, password }),
  mpCloseRoom: (roomCode) => ipcRenderer.invoke('mp:close-room', { roomCode }),
  // 连接 wss:// 隧道前登记主机，放行其自签名证书（仅限本次要连的隧道，不全局降级）
  mpTrustWsHost: (host) => ipcRenderer.invoke('mp:trust-ws-host', host),
  // 本机可用于对外联机的 IPv4 列表（含虚拟局域网卡），供房主挑选对外地址
  mpListIps: () => ipcRenderer.invoke('mp:list-ips'),
  // 探测穿透地址可用哪种协议（TLS / 明文），返回 scheme: 'wss' | 'ws'
  mpProbeTunnel: (addr) => ipcRenderer.invoke('mp:probe-tunnel', addr),

  // 错误上报（PCL 风格报错系统）
  reportError: (level, source, message, detail) => ipcRenderer.send('error-report:log', { level, source, message, detail }),
  reportAlive: () => ipcRenderer.send('error-report:alive'),

  // 退出应用（用于撤销条款同意等需强制退出的场景）
  quitApp: () => ipcRenderer.invoke('app:quit'),

  // 检测是否在 Electron 环境
  isElectron: true,
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)