import { app, BrowserWindow, ipcMain, dialog, shell, Menu, session, nativeImage } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import net from 'node:net'
import tls from 'node:tls'
import { fileURLToPath } from 'url'
import { dirname, join, extname, basename } from 'path'
import { exec } from 'node:child_process'
import { initErrorReporter, log as reportLog, watchMainWindow, flushPendingCritical } from './errorReporter.js'
import { createRoom, closeRoom, stopServer } from './multiplayer/wsServer.js'

// 主窗口引用（模块级，供单实例 second-instance 回调聚焦使用）
let mainWindow = null

// 单实例锁：防止玩家多开游戏导致存档互相覆盖
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  // 已有实例在运行，直接退出当前实例
  app.quit()
} else {
  // 第二个实例被启动时，聚焦到已打开的主窗口
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

// 固定用户数据目录为 %APPDATA%\yingguangjiyou（卸载重装不丢档）
// 打包版默认目录是 %APPDATA%\萤光纪游，这里统一固定并做一次迁移，老玩家数据自动搬过来
const preferredUserData = join(app.getPath('appData'), 'yingguangjiyou')
try {
  if (path.resolve(app.getPath('userData')) !== path.resolve(preferredUserData)) {
    const targetHasData = fs.existsSync(preferredUserData) && fs.readdirSync(preferredUserData).length > 0
    if (!targetHasData) {
      fs.mkdirSync(preferredUserData, { recursive: true })
      const legacyDirs = [join(app.getPath('appData'), '萤光纪游'), join(app.getPath('appData'), 'cas_nodeItem')]
      for (const legacyDir of legacyDirs) {
        if (fs.existsSync(legacyDir)) {
          copyDirMerge(legacyDir, preferredUserData)
          break // 只迁移找到的第一个旧目录，旧目录保留作为备份
        }
      }
    }
    app.setPath('userData', preferredUserData)
  }
} catch (_) { /* 迁移失败不阻塞启动 */ }

// 递归合并复制目录（目标已存在的文件会被覆盖）
function copyDirMerge(srcDir, destDir) {
  fs.mkdirSync(destDir, { recursive: true })
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const src = join(srcDir, entry.name)
    const dest = join(destDir, entry.name)
    if (entry.isDirectory()) copyDirMerge(src, dest)
    else fs.copyFileSync(src, dest)
  }
}

// 初始化 PCL 风格错误报告系统（必须在 app ready 前）
initErrorReporter()

const AUDIO_EXTS = ['.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac', '.opus', '.wma']
const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp']

// 应用数据目录
const userDataPath = app.getPath('userData')
const imagesPath = join(userDataPath, 'images')

// 确保图片存储目录存在
if (!fs.existsSync(imagesPath)) {
  fs.mkdirSync(imagesPath, { recursive: true })
}

function createWindow() {
  // 图标定位：开发根目录、dist 内 public 拷贝、打包后 asar 外部的 extraFiles 三层覆盖
  const rootIcon = join(__dirname, '..', 'favicon.ico')
  const distIcon = join(__dirname, '..', 'dist', 'favicon.ico')
  const asarExternalIcon = join(process.resourcesPath, '..', 'favicon.ico')
  let iconPath
  if (fs.existsSync(rootIcon)) iconPath = rootIcon
  else if (fs.existsSync(distIcon)) iconPath = distIcon
  else if (fs.existsSync(asarExternalIcon)) iconPath = asarExternalIcon

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: '萤光纪游',
    icon: iconPath,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // 允许加载本地文件资源
      webSecurity: false,
    },
  })
  // Windows 任务栏图标：在窗口 ready-to-show 后设置，避免被 electron.exe 默认图标覆盖
  mainWindow.once('ready-to-show', () => {
    try {
      if (process.platform === 'win32' && iconPath && fs.existsSync(iconPath)) {
        const appIcon = nativeImage.createFromPath(iconPath)
        if (!appIcon.isEmpty()) {
          mainWindow.setAppDetails({ appIcon })
          mainWindow.setIcon(appIcon)
        }
      }
    } catch (_) { /* ignore older Electron APIs */ }
  })

  // F12 / Ctrl+Shift+I 打开开发者工具（打包后如仍白屏，按 F12 查看控制台错误）
  mainWindow.webContents.on('before-input-event', (_e, input) => {
    if (input.type !== 'keyDown') return
    const f12 = input.key === 'F12'
    const csi = (input.control || input.meta) && input.shift && (input.key === 'I' || input.key === 'i')
    if (f12 || csi) {
      if (mainWindow.webContents.isDevToolsOpened()) mainWindow.webContents.closeDevTools()
      else mainWindow.webContents.openDevTools({ mode: 'detach' })
    }
  })
  mainWindow.on('closed', () => {
    try { mainWindow.webContents.closeDevTools() } catch (_) { /* ignore */ }
  })

  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL)
  } else {
    // 生产 asar 环境：dist 与 dist-electron 都在 app.asar 内部，优先用相对路径
    const indexInAsar = join(__dirname, '..', 'dist', 'index.html')
    const indexExternal = join(process.resourcesPath, 'app', 'dist', 'index.html')
    const target = fs.existsSync(indexInAsar) ? indexInAsar : indexExternal
    mainWindow.loadFile(target)
  }

  // 接入错误报告系统：白屏看门狗 + 渲染进程崩溃/加载失败/预加载错误监听
  watchMainWindow(mainWindow)
}

// 联机隧道：自签名证书放行
const trustedWsHosts = new Set()

ipcMain.handle('mp:trust-ws-host', (_event, host) => {
  const h = String(host || '').trim().toLowerCase()
  if (h) {
    trustedWsHosts.add(h)
    console.log(`[mp] 已登记待放行证书的隧道主机：${h}`)
  }
  return true
})

app.on('certificate-error', (event, _webContents, url, error, _certificate, callback) => {
  let host = ''
  try {
    host = new URL(url).host.toLowerCase()
  } catch (_) { /* 无法解析则按默认行为拒绝 */ }
  if (host && trustedWsHosts.has(host)) {
    event.preventDefault()
    console.warn(`[mp] 已放行联机隧道主机的证书校验：${host}（${error}）`)
    callback(true)
    return
  }
  // 未登记的站点一律拒绝，但把拒绝原因打进日志：AI 接口等出问题时便于定位
  console.warn(`[mp] 证书校验未通过且未登记放行：${host || url}（${error}）`)
  callback(false)
})

// 第二道保险。certificate-error 是「校验已经失败之后」才触发的事件，对 WebSocket 握手
function installCertificateVerifyProc() {
  const ses = session.defaultSession
  if (!ses || typeof ses.setCertificateVerifyProc !== 'function') return
  ses.setCertificateVerifyProc((request, callback) => {
    const host = String(request.hostname || '').toLowerCase()
    const port = Number(request.port) || 0
    const withPort = port && port !== 443 ? `${host}:${port}` : host
    if (host && (trustedWsHosts.has(host) || trustedWsHosts.has(withPort))) {
      console.warn(`[mp] 证书校验放行（verify proc）：${withPort}`)
      callback(0)
      return
    }
    // -3 = 采用 Chromium 的默认校验结果（即维持严格校验）
    callback(-3)
  })
}

app.whenReady().then(() => {
  // 固定 AppUserModelId：与 electron-builder.yml 的 appId 一致，
  app.setAppUserModelId('com.cas.nodeitem')
  Menu.setApplicationMenu(null)
  // 注册联机隧道的证书放行回调（必须在 session 可用之后）
  installCertificateVerifyProc()
  flushPendingCritical()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
  createWindow()
})

app.on('window-all-closed', () => {
  stopServer()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// IPC: 文件对话框
ipcMain.handle('dialog:show-open', async (_event, options) => {
  const result = await dialog.showOpenDialog(options)
  return result
})

ipcMain.handle('dialog:show-save', async (_event, options) => {
  const result = await dialog.showSaveDialog(options)
  return result
})

// IPC: 强制退出应用（撤销条款同意等场景）
ipcMain.handle('app:quit', async () => {
  app.quit()
  return { success: true }
})

// IPC: 用系统浏览器打开外链（Windows 优先 Edge）
ipcMain.handle('shell:open-external', async (_event, url) => {
  if (!url) return { success: false, error: 'URL 为空' }
  try {
    if (process.platform === 'win32') {
      // 优先尝试用 Edge 打开
      await new Promise((resolve, reject) => {
        exec(`start msedge "${url}"`, (err) => {
          if (err) reject(err)
          else resolve()
        })
      })
      return { success: true }
    }
    // 非 Windows 用系统默认浏览器
    await shell.openExternal(url)
    return { success: true }
  } catch (e) {
    // Edge 打开失败，回退到系统默认浏览器
    try {
      await shell.openExternal(url)
      return { success: true }
    } catch (e2) {
      return { success: false, error: e2.message }
    }
  }
})

// IPC: 图片存储
ipcMain.handle('storage:save-image', async (_event, { id, data, ext }) => {
  try {
    const fileName = `${id}.${ext}`
    const filePath = join(imagesPath, fileName)
    fs.writeFileSync(filePath, Buffer.from(data, 'base64'))
    return { success: true, path: filePath }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('storage:delete-image', async (_event, { id, ext }) => {
  try {
    const fileName = `${id}.${ext}`
    const filePath = join(imagesPath, fileName)
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('storage:list-images', async () => {
  try {
    if (!fs.existsSync(imagesPath)) {
      return []
    }
    return fs.readdirSync(imagesPath)
  } catch (err) {
    return []
  }
})

ipcMain.handle('storage:get-image', async (_event, { id, ext }) => {
  try {
    const fileName = `${id}.${ext}`
    const filePath = join(imagesPath, fileName)
    if (!fs.existsSync(filePath)) {
      return { success: false, error: '文件不存在' }
    }
    const data = fs.readFileSync(filePath, { encoding: 'base64' })
    return { success: true, data }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// IPC: 文件操作 
ipcMain.handle('fs:write-file', async (_event, { path: targetPath, content }) => {
  try {
    fs.writeFileSync(targetPath, content, 'utf-8')
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('fs:read-file', async (_event, { path: targetPath }) => {
  try {
    const content = fs.readFileSync(targetPath, 'utf-8')
    return { success: true, content }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// IPC: 清空全部本地数据（存档槽文件 + 图片目录）
ipcMain.handle('storage:clear-all', async () => {
  const result = { removedSlots: 0, removedImages: 0, errors: [] }
  // 1) 删除全部存档槽文件 save_slot_<n>.cns（含槽位数上限之外的残留文件）
  try {
    if (fs.existsSync(userDataPath)) {
      for (const name of fs.readdirSync(userDataPath)) {
        if (!/^save_slot_\d+\.cns$/.test(name)) continue
        try {
          fs.unlinkSync(join(userDataPath, name))
          result.removedSlots++
        } catch (e) {
          result.errors.push(`${name}: ${e.message}`)
        }
      }
    }
    // 2) 清空图片目录（头像、壁纸等落盘图片）
    if (fs.existsSync(imagesPath)) {
      for (const name of fs.readdirSync(imagesPath)) {
        const target = join(imagesPath, name)
        try {
          if (fs.statSync(target).isDirectory()) continue
          fs.unlinkSync(target)
          result.removedImages++
        } catch (e) {
          result.errors.push(`${name}: ${e.message}`)
        }
      }
    }
    return { success: true, ...result }
  } catch (err) {
    return { success: false, error: err.message, ...result }
  }
})

// IPC: 存档槽（每个槽位独立文件，支持大小号）
const getSaveSlotPath = (slotId) => join(userDataPath, `save_slot_${slotId}.cns`)

ipcMain.handle('game:save-slot', async (_event, { slotId, payload }) => {
  try {
    const filePath = getSaveSlotPath(slotId)
    fs.writeFileSync(filePath, JSON.stringify(payload), 'utf-8')
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('game:load-slot', async (_event, slotId) => {
  try {
    const filePath = getSaveSlotPath(slotId)
    if (!fs.existsSync(filePath)) return { success: true, payload: null }
    const raw = fs.readFileSync(filePath, 'utf-8')
    return { success: true, payload: JSON.parse(raw) }
  } catch (err) {
    // 存档损坏：把坏档备份到 Logs/corrupted 后按空档处理，避免玩家卡死
    try {
      const backupDir = join(userDataPath, 'Logs', 'corrupted')
      fs.mkdirSync(backupDir, { recursive: true })
      const sourcePath = getSaveSlotPath(slotId)
      if (fs.existsSync(sourcePath)) {
        fs.copyFileSync(sourcePath, join(backupDir, `save_slot_${slotId}_${Date.now()}.cns.bak`))
      }
    } catch (_) { /* 备份失败不阻塞读取 */ }
    reportLog('ERROR', '存档', `存档槽 ${slotId} 读取失败，坏档已自动备份（原文件保留）`, err?.stack || err?.message)
    return { success: false, error: err.message, payload: null }
  }
})

ipcMain.handle('game:delete-slot', async (_event, slotId) => {
  try {
    const filePath = getSaveSlotPath(slotId)
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
})


// IPC: 音乐功能
ipcMain.handle('music:pick-folder', async () => {
  try {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, canceled: true }
    }
    const folderPath = result.filePaths[0]
    const list = scanMusicFolder(folderPath)
    return { success: true, folderPath, tracks: list }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// 扫描指定文件夹中的音乐文件
ipcMain.handle('music:scan-folder', async (_event, { folderPath }) => {
  try {
    if (!folderPath || !fs.existsSync(folderPath)) {
      return { success: false, error: '文件夹不存在' }
    }
    const list = scanMusicFolder(folderPath)
    return { success: true, folderPath, tracks: list }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// 读取本地文件为 base64 dataURL（供 audio 元素播放）
ipcMain.handle('music:read-file', async (_event, { filePath }) => {
  try {
    if (!filePath || !fs.existsSync(filePath)) {
      return { success: false, error: '文件不存在' }
    }
    const ext = extname(filePath).toLowerCase().replace('.', '')
    const mimeMap = {
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
      ogg: 'audio/ogg',
      flac: 'audio/flac',
      m4a: 'audio/mp4',
      aac: 'audio/aac',
      opus: 'audio/opus',
      wma: 'audio/x-ms-wma',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      bmp: 'image/bmp',
      webp: 'image/webp'
    }
    const mime = mimeMap[ext] || 'application/octet-stream'
    const data = fs.readFileSync(filePath, { encoding: 'base64' })
    const dataURL = `data:${mime};base64,${data}`
    return { success: true, dataURL }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// 扫描音乐文件夹：音频文件 + 封面图匹配
function scanMusicFolder(folderPath) {
  const entries = fs.readdirSync(folderPath, { withFileTypes: true })
  const audioFiles = []
  const imageFiles = []

  for (const entry of entries) {
    if (!entry.isFile()) continue
    const name = entry.name
    const ext = extname(name).toLowerCase()
    if (AUDIO_EXTS.includes(ext)) {
      audioFiles.push(name)
    } else if (IMAGE_EXTS.includes(ext)) {
      imageFiles.push(name)
    }
  }

  const tracks = audioFiles.map((audioName) => {
    const audioPath = join(folderPath, audioName)
    const baseName = basename(audioName, extname(audioName))
    // 优先匹配同名图片，否则匹配 cover/front/folder 等通用封面名，否则取第一张图
    let coverName = imageFiles.find((img) => basename(img, extname(img)).toLowerCase() === baseName.toLowerCase())
    if (!coverName) {
      coverName = imageFiles.find((img) => /^(cover|folder|front|album|thumb|封面)$/i.test(basename(img, extname(img))))
    }
    if (!coverName && imageFiles.length > 0) {
      coverName = imageFiles[0]
    }
    return {
      title: baseName,
      fileName: audioName,
      filePath: audioPath,
      coverPath: coverName ? join(folderPath, coverName) : null
    }
  })
  return tracks
}

// IPC: 官方游戏启动 
const SR_DOWNLOAD_URL = 'https://sr.mihoyo.com/'

// 校验路径是否为可执行文件（不再限制文件名，任何 .exe 都允许）
const isValidLauncher = (p) => {
  if (!p) return false
  return extname(p).toLowerCase() === '.exe'
}

// 1. 选择游戏路径：弹出系统文件选择器，允许选择任意 .exe
ipcMain.handle('select-game-path', async () => {
  try {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      title: '请选择游戏可执行文件',
      defaultPath: 'C:\\Program Files\\',
      filters: [{ name: '可执行文件', extensions: ['exe'] }]
    })
    if (result.canceled || !result.filePaths.length) {
      return { path: '', error: '' }
    }
    const selected = result.filePaths[0]
    if (!isValidLauncher(selected)) {
      return {
        path: '',
        error: '文件格式不正确，请选择 .exe 文件'
      }
    }
    return { path: selected, error: '' }
  } catch (err) {
    console.error('选择游戏路径失败:', err)
    return { path: '', error: err.message }
  }
})

// 2. 启动游戏：路径为 .exe 且文件存在则启动，否则跳转官网下载
ipcMain.handle('launch-game', async (_event, gamePath) => {
  // 路径为可执行文件且文件确实存在 → 直接启动
  if (isValidLauncher(gamePath) && fs.existsSync(gamePath)) {
    try {
      const errMsg = await shell.openPath(gamePath)
      if (!errMsg) {
        return { success: true, msg: '正在启动官方游戏...' }
      }
      // openPath 返回非空字符串表示错误信息
      return { success: false, msg: `启动失败：${errMsg}` }
    } catch (e) {
      return { success: false, msg: '启动失败，请检查路径权限。' }
    }
  }

  // 路径未配置 / 不是 .exe / 文件不存在 → 跳转官网下载
  if (process.platform === 'win32') {
    exec(`start msedge "${SR_DOWNLOAD_URL}"`, (error) => {
      if (error) {
        // 没装 Edge，回退到系统默认浏览器
        shell.openExternal(SR_DOWNLOAD_URL)
      }
    })
  } else {
    // macOS / Linux：直接用系统默认浏览器
    shell.openExternal(SR_DOWNLOAD_URL)
  }
  return { success: false, msg: '未检测到游戏，正在跳转官网下载...' }
})

//  IPC: AI 对话（通用 OpenAI 兼容接口） 
ipcMain.handle('ai:chat', async (_event, { config, messages }) => {
  try {
    const { baseUrl, apiKey, model } = config || {}
    if (!baseUrl || !apiKey || !model) {
      return { success: false, error: 'AI 配置不完整，请先在设置中填写' }
    }
    const url = baseUrl.replace(/\/+$/, '') + '/chat/completions'
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, messages, temperature: 0.8 }),
      signal: AbortSignal.timeout(60000),
    })
    if (!resp.ok) {
      const errText = await resp.text()
      return { success: false, error: `请求失败(${resp.status})：${errText}` }
    }
    const data = await resp.json()
    const content = data?.choices?.[0]?.message?.content
    if (!content) {
      return { success: false, error: 'AI 未返回有效内容', data }
    }
    return { success: true, content }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// IPC: 多人联机（房主模式）
function listLocalIps() {
  const out = []
  const ifaces = os.networkInterfaces()
  for (const [name, addrs] of Object.entries(ifaces)) {
    for (const a of addrs || []) {
      // Node 18 起 family 是数字 4，更早的版本是字符串 'IPv4'，两种都要兼容
      const isV4 = a.family === 'IPv4' || a.family === 4
      if (!isV4 || a.internal) continue
      out.push({ name, address: a.address, virtual: isVirtualAdapter(name) })
    }
  }
  // 排序只决定下拉框的默认选中项：虚拟组网网卡优先（异地联机是主线场景），其次常见局域网段
  out.sort((x, y) => ipRank(x) - ipRank(y))
  return out
}

// 虚拟组网工具的网卡名特征；让「异地联机」这一主场景默认选中正确的地址
function isVirtualAdapter(name) {
  return /zerotier|tailscale|easytier|wireguard|openvpn|tap|tun|蒲公英|星空/i.test(name || '')
}

function ipRank(ip) {
  if (ip.virtual) return 0
  if (ip.address.startsWith('192.168.')) return 1
  if (ip.address.startsWith('172.')) return 2
  if (ip.address.startsWith('10.')) return 3
  return 4
}

ipcMain.handle('mp:list-ips', async () => ({ success: true, lanIps: listLocalIps() }))

// 联机：探测穿透地址可用哪种协议  
const PROBE_DEFAULT_PORT = Number(process.env.MP_PORT) || 8765
function parseHostPort(input) {
  let s = String(input || '').trim().replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
  if (!s) return null
  const slash = s.indexOf('/')
  if (slash !== -1) s = s.slice(0, slash)
  const q = s.indexOf('?')
  if (q !== -1) s = s.slice(0, q)
  const m6 = s.match(/^\[([^\]]+)\](?::(\d+))?$/)
  if (m6) return { host: m6[1], port: Number(m6[2]) || PROBE_DEFAULT_PORT, explicitPort: !!m6[2] }
  const idx = s.lastIndexOf(':')
  if (idx === -1) return { host: s, port: PROBE_DEFAULT_PORT, explicitPort: false }
  const host = s.slice(0, idx)
  const port = Number(s.slice(idx + 1))
  if (!host || !Number.isInteger(port) || port <= 0 || port > 65535) return null
  return { host, port, explicitPort: true }
}

// 只测 TCP 能否连上（用来区分「端口不通」与「端口通但协议不对」）
function probeTcp(host, port, timeout = 4000) {
  return new Promise((resolve) => {
    const sock = net.connect({ host, port })
    let settled = false
    const done = (ok, err) => {
      if (settled) return
      settled = true
      try { sock.destroy() } catch (_) { /* ignore */ }
      resolve({ ok, error: err || '' })
    }
    sock.setTimeout(timeout)
    sock.once('connect', () => done(true))
    sock.once('timeout', () => done(false, `TCP 连接超时（${timeout}ms）`))
    sock.once('error', (e) => done(false, `TCP 连接失败：${e.code || e.message}`))
  })
}

// 试 TLS 握手。rejectUnauthorized:false 是刻意的：穿透工具下发的就是自签名证书，
// 这里只关心「端口是否讲 TLS」；证书可不可信由客户端侧的放行逻辑决定。
function probeTls(host, port, timeout = 6000) {
  return new Promise((resolve) => {
    let sock
    try {
      sock = tls.connect({ host, port, servername: host, rejectUnauthorized: false })
    } catch (e) {
      return resolve({ ok: false, error: e.message })
    }
    let settled = false
    const done = (r) => {
      if (settled) return
      settled = true
      try { sock.destroy() } catch (_) { /* ignore */ }
      resolve(r)
    }
    sock.setTimeout(timeout)
    sock.once('secureConnect', () => {
      const cert = sock.getPeerCertificate() || {}
      const fmt = (o) => (o && typeof o === 'object' ? Object.entries(o).map(([k, v]) => `${k}=${v}`).join(', ') : '')
      const subject = fmt(cert.subject)
      const issuer = fmt(cert.issuer)
      done({ ok: true, subject, issuer, selfSigned: !!subject && subject === issuer })
    })
    sock.once('timeout', () => done({ ok: false, error: 'TLS 握手超时' }))
    sock.once('error', (e) => done({ ok: false, error: `TLS 握手失败：${e.code || e.message}` }))
  })
}

// 试明文 HTTP：穿透节点拦明文时这里会看到 501 + SakuraFrp 标记，
// 而项目自己的 ws 服务对普通 GET 回的是 426 Upgrade Required —— 两者可区分。
function probePlainHttp(host, port, timeout = 5000) {
  return new Promise((resolve) => {
    const sock = net.connect({ host, port })
    let raw = ''
    let settled = false
    const parse = () => {
      const head = raw.slice(0, 2048)
      const statusLine = (head.split('\r\n')[0] || '').trim()
      const blocked = /(?:\b501\b|SakuraFrp|natfrp|Not Implemented)/i.test(head)
      return { blocked, statusLine, head }
    }
    const done = (r) => {
      if (settled) return
      settled = true
      try { sock.destroy() } catch (_) { /* ignore */ }
      resolve(r)
    }
    sock.setTimeout(timeout)
    sock.once('connect', () => {
      sock.write(`GET / HTTP/1.1\r\nHost: ${host}\r\nConnection: close\r\n\r\n`)
    })
    sock.on('data', (chunk) => {
      raw += chunk.toString('latin1')
      if (raw.length >= 2048 || /\r\n\r\n/.test(raw)) done(parse())
    })
    sock.once('timeout', () => done(raw ? parse() : { blocked: false, statusLine: '', head: '', error: '明文探测无响应' }))
    sock.once('error', (e) => done({ blocked: false, statusLine: '', head: '', error: `明文探测失败：${e.code || e.message}` }))
  })
}

ipcMain.handle('mp:probe-tunnel', async (_event, addr) => {
  const target = parseHostPort(addr)
  if (!target) return { success: false, error: '地址无法解析，请按「域名:端口」填写（如 frp-bus.com:37515）' }
  const { host, port, explicitPort } = target
  // 穿透隧道的远程端口是随机分配的，漏写时默认 8765 必然连不上 —— 直接说清楚，别报含糊的失败
  const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':')
  if (!explicitPort && !isIp) {
    return {
      success: false,
      error: '缺少远程端口：穿透面板里的访问地址形如「域名:端口」（如 frp-bus.com:37515），请把端口一起填上',
    }
  }
  console.log(`[mp] 开始探测穿透地址 ${host}:${port}`)

  const tcp = await probeTcp(host, port)
  if (!tcp.ok) {
    console.warn(`[mp] 探测 ${host}:${port} 失败：${tcp.error}`)
    return { success: true, host, port, reachable: false, scheme: 'wss', error: tcp.error }
  }

  const t = await probeTls(host, port)
  if (t.ok) {
    console.log(`[mp] 探测 ${host}:${port} 成功：端口讲 TLS，应按 wss:// 连接（自签名=${t.selfSigned}）`)
    return {
      success: true, host, port, reachable: true, scheme: 'wss',
      tls: true, selfSigned: !!t.selfSigned, issuer: t.issuer || '', subject: t.subject || '',
      error: '',
    }
  }

  const plain = await probePlainHttp(host, port)
  if (plain.blocked) {
    console.warn(`[mp] 探测 ${host}:${port}：明文 HTTP 被穿透节点拦下（${plain.statusLine}），需改用 wss://`)
    return {
      success: true, host, port, reachable: true, scheme: 'ws',
      tls: false, blocked: true, statusLine: plain.statusLine || '',
      error: '端口不通 TLS，且明文 HTTP 被穿透节点拦下（返回 501）——请到穿透面板为这条隧道开启「自动 HTTPS」，再按 wss:// 使用',
    }
  }
  console.log(`[mp] 探测 ${host}:${port} 成功：端口只讲明文，应按 ws:// 连接（${plain.statusLine || '无响应体'}）`)
  return {
    success: true, host, port, reachable: true, scheme: 'ws',
    tls: false, blocked: false, statusLine: plain.statusLine || '',
    error: plain.error || '',
  }
})

ipcMain.handle('mp:create-room', async (_event, { capacity, password }) => {
  try {
    const result = await createRoom({ capacity, password })
    const lanIps = listLocalIps()
    // lanIp 保留为「最佳猜测」，供旧逻辑兜底；界面主要用 lanIps 让用户挑选
    return { success: true, ...result, lanIps, lanIp: lanIps[0]?.address || '' }
  } catch (err) {
    return { success: false, error: err.message || '联机服务启动失败' }
  }
})

ipcMain.handle('mp:close-room', async (_event, { roomCode }) => {
  try {
    closeRoom(roomCode)
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
})