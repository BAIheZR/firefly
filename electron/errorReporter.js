// 错误报告系统（主进程侧）
import { app, BrowserWindow, ipcMain, shell, clipboard } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const KEEP_LOG_DAYS = 7        // 日志保留天数
const MAX_RECENT = 300         // 内存中保留的最近日志条数
const WHITE_SCREEN_MS = 15000  // 白屏看门狗超时（渲染进程迟迟不上报心跳）；有存档时启动较重，放宽到 15s 避免误杀
const DEDUPE_MS = 60000        // 同一类错误弹窗去重间隔

let logsDir = ''
let sessionLogFile = ''
let latestErrorFile = ''
let gpuFlagFile = ''

let recent = []                // [{ time, level, source, message }]
let errorWindow = null
let currentReport = null
let pendingCritical = null     // 应用就绪前发生的致命错误，就绪后补弹
let whiteScreenTimer = null
let gotFirstAlive = false
let gpuDisabledByFlag = false
let lastShown = { id: '', at: 0 }

// ---------- 基础工具 ----------
function pad(n) { return String(n).padStart(2, '0') }

function timeStr(d = new Date()) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0')}`
}

function fullTimeStr(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function clip(text, max = 4000) {
  const s = String(text ?? '')
  return s.length > max ? s.slice(0, max) + `\n…（内容过长，已截断）` : s
}

// ---------- 特征分析库（PCL 式：报错关键词 → 人话 + 解决方案） ----------
const PATTERNS = [
  {
    id: 'gpu',
    test: /\bgpu\b|webgl|d3d|dxgi|dxdiag|angle|nvoglv|aticfx|ig9icd|igx|显卡|渲染设备|gpu[-_ ]?process/i,
    title: '显卡或图形组件初始化失败',
    cause: '显卡驱动过旧或不兼容、使用了虚拟机/远程桌面，或系统图形组件损坏。你的游戏包含 3D 画面，对显卡环境有要求。',
    solution: [
      '去显卡官网（NVIDIA / AMD / Intel）更新到最新驱动',
      '程序已自动关闭硬件加速并重启，若每次都弹此窗口，请先更新驱动',
      '如果在远程桌面或虚拟机中使用，请回到本机运行',
      '驱动修复后，可删除游戏数据目录下的 disable-gpu.flag 文件恢复硬件加速',
    ],
  },
  {
    id: 'storage',
    test: /localstorage|quotaexceeded|indexeddb|leveldb|storage|epfast|ns_error_storage/i,
    title: '本地存储不可用或已满',
    cause: '系统隐私设置或安全软件禁用了本地数据写入，或磁盘空间不足，导致游戏进度无法保存。',
    solution: [
      '检查磁盘剩余空间（游戏数据存放在 C 盘 AppData 目录）',
      '检查安全软件（电脑管家等）是否拦截了本程序的写入行为，将其加入白名单',
      '检查系统「设置 → 隐私」是否禁用了应用数据写入',
    ],
  },
  {
    id: 'file',
    test: /enoent|cannot find module|failed to load resource|net::err_file_not_found|net::err_access_denied.*\.html|404|\.pmx|\.tga|texture|模型|vshelper|not exist/i,
    title: '游戏文件不完整或被安全软件隔离',
    cause: '安装文件缺失、解压不完整，或杀毒软件把部分游戏文件当作威胁删除/隔离了。',
    solution: [
      '重新下载完整的安装包并重新安装',
      '检查杀毒软件/Windows 安全中心的「隔离区」，恢复被隔离的文件并将游戏目录加入白名单',
      '安装时不要放在含特殊字符的路径下',
    ],
  },
  {
    id: 'network',
    test: /econnrefused|etimedout|enotfound|enetdown|fetch failed|network changed|err_internet|err_connection|proxy|代理|网络/i,
    title: '网络连接异常',
    cause: '无法访问网络（AI 对话等在线功能需要联网），可能是断网、防火墙或代理设置问题。',
    solution: [
      '检查网络连接是否正常',
      '检查防火墙/安全软件是否阻止了本程序联网',
      '如使用了代理或 VPN，尝试关闭后再试',
      '离线功能（养成、存档等）不受影响',
    ],
  },
  {
    id: 'permission',
    test: /\beperm\b|\beacces\b|access is denied|拒绝访问|forbidden|unauthorized path/i,
    title: '权限不足或被安全软件拦截',
    cause: '程序没有足够的文件读写权限，或被安全软件实时防护拦截。',
    solution: [
      '右键游戏 →「以管理员身份运行」',
      '将游戏安装目录和数据目录加入安全软件白名单',
      '安装到非系统盘（如 D 盘）可减少权限问题',
    ],
  },
  {
    id: 'memory',
    test: /out of memory|heap out|allocation failure|oom|内存不足|内存溢出/i,
    title: '内存不足',
    cause: '系统可用内存不够，游戏被系统终止。',
    solution: [
      '关闭其他占用内存较大的程序后重试',
      '重启电脑释放内存',
      '如果是 32 位系统或内存小于 4GB 的设备，建议升级硬件',
    ],
  },
  {
    id: 'killed',
    test: /crashed|killed|render-process-gone|进程崩溃|被终止/i,
    title: '游戏组件异常崩溃',
    cause: '渲染进程被意外终止。常见原因：显卡驱动冲突、安全软件注入、系统资源紧张。',
    solution: [
      '更新显卡驱动后重启游戏',
      '将游戏加入安全软件白名单',
      '若反复出现，请点击「复制错误信息」发送给开发者',
    ],
  },
  {
    id: 'busy',
    test: /\bebusy\b|\beio\b|resource temporarily unavailable/i,
    title: '文件被其他程序占用',
    cause: '游戏的数据文件正被别的程序读写（常见于网盘同步、杀毒扫描进行中）。',
    solution: [
      '暂停网盘同步（OneDrive 等）和杀毒扫描后重试',
      '重启电脑后再试',
    ],
  },
]

const DEFAULT_ANALYSIS = {
  id: 'unknown',
  title: '未能自动识别的错误',
  cause: '这是一个尚未收录的错误类型。错误详情和日志已自动收集。',
  solution: [
    '点击「复制错误信息」，把内容发送给开发者以便定位问题',
    '点击「打开日志文件夹」，把里面的日志文件一并发送',
    '尝试点击「重启游戏」，部分问题重启后可恢复',
  ],
}

function analyze(text) {
  const hit = PATTERNS.find((p) => p.test.test(String(text ?? '')))
  return hit ? { id: hit.id, title: hit.title, cause: hit.cause, solution: hit.solution } : { ...DEFAULT_ANALYSIS }
}

// ---------- 日志落盘 ----------
function initDirs() {
  logsDir = path.join(app.getPath('userData'), 'Logs')
  sessionLogFile = path.join(logsDir, `游戏日志-${fullTimeStr().slice(0, 10)}.log`)
  latestErrorFile = path.join(logsDir, '最新-错误报告.txt')
  gpuFlagFile = path.join(app.getPath('userData'), 'disable-gpu.flag')
  fs.mkdirSync(logsDir, { recursive: true })
}

function cleanOldLogs() {
  try {
    const cutoff = Date.now() - KEEP_LOG_DAYS * 86400000
    for (const name of fs.readdirSync(logsDir)) {
      if (!/^游戏日志-\d{4}-\d{2}-\d{2}\.log$/.test(name)) continue
      const filePath = path.join(logsDir, name)
      if (fs.statSync(filePath).mtimeMs < cutoff) fs.unlinkSync(filePath)
    }
  } catch (_) { /* 清理失败不影响运行 */ }
}

function appendFile(line) {
  try { fs.appendFileSync(sessionLogFile, line + '\n', 'utf8') } catch (_) { /* 静默 */ }
}

// 记录一条日志（永不抛出，保证在错误路径中安全）
export function log(level, source, message, detail = '') {
  const entry = { time: timeStr(), level, source, message: String(message ?? '') }
  recent.push(entry)
  if (recent.length > MAX_RECENT) recent.shift()
  let text = `[${entry.time}] [${level}] [${source}] ${entry.message}`
  if (detail) text += `\n${clip(detail, 4000).split('\n').map((l) => '    ' + l).join('\n')}`
  appendFile(text)
  return entry
}

function recentText(lines = 60) {
  return recent.slice(-lines).map((e) => `[${e.time}] [${e.level}] [${e.source}] ${e.message}`).join('\n') || '（暂无日志）'
}

// ---------- 环境信息 ----------
function envInfo() {
  let hw = '已启用'
  if (gpuDisabledByFlag || app.commandLine.hasSwitch('disable-gpu')) hw = '已禁用（GPU 崩溃保护）'
  return {
    version: app.getVersion(),
    electron: process.versions.electron || '?',
    chrome: process.versions.chrome || '?',
    node: process.versions.node || '?',
    os: `${os.type()} ${os.release()} ${os.arch()}`,
    cpu: `${os.cpus().length} 核`,
    memory: `${Math.round(os.totalmem() / 1024 / 1024 / 1024)}GB`,
    hw,
    time: fullTimeStr(),
  }
}

function buildCopyText() {
  const env = envInfo()
  const a = currentReport?.analysis || DEFAULT_ANALYSIS
  return [
    '=== 萤光纪游 错误报告（请把本页全部内容发送给开发者）===',
    `时间：${env.time}`,
    `版本：v${env.version} | Electron ${env.electron} | Chromium ${env.chrome}`,
    `系统：${env.os} | CPU ${env.cpu} | 内存 ${env.memory} | 硬件加速：${env.hw}`,
    '',
    `【分析结果】${a.title}`,
    `【可能原因】${a.cause}`,
    '【建议操作】\n' + a.solution.map((s, i) => `  ${i + 1}. ${s}`).join('\n'),
    '',
    '【错误详情】',
    clip(currentReport?.detail || '（无）'),
    '',
    '【最近日志（末尾 60 行）】',
    recentText(60),
  ].join('\n')
}

// ---------- 错误弹窗 ----------
function resolveErrorWindowHtml() {
  const candidates = [
    path.join(__dirname, '..', 'dist', 'error-window.html'),      // 打包后（asar 内）
    path.join(__dirname, '..', 'public', 'error-window.html'),    // 开发环境
  ]
  return candidates.find((p) => fs.existsSync(p)) || candidates[0]
}

function reportPayload() {
  return {
    analysis: currentReport?.analysis || DEFAULT_ANALYSIS,
    detail: clip(currentReport?.detail || ''),
    source: currentReport?.source || '',
    env: envInfo(),
    recentLog: recentText(60),
  }
}

function showErrorWindow() {
  const now = Date.now()
  const id = currentReport?.analysis?.id || 'unknown'
  if (errorWindow && !errorWindow.isDestroyed()) {
    errorWindow.focus()
    try { errorWindow.webContents.send('error-report:update', reportPayload()) } catch (_) {}
    return
  }
  if (lastShown.id === id && now - lastShown.at < DEDUPE_MS) return
  lastShown = { id, at: now }

  const win = new BrowserWindow({
    width: 680,
    height: 700,
    minWidth: 520,
    minHeight: 460,
    title: '萤光纪游 - 错误报告',
    show: false,
    autoHideMenuBar: true,
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, 'errorPreload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })
  win.setMenuBarVisibility(false)
  win.loadFile(resolveErrorWindowHtml())
  win.once('ready-to-show', () => win.show())
  win.on('closed', () => { if (errorWindow === win) errorWindow = null })
  errorWindow = win
}

// ---------- 致命错误上报入口 ----------
export function reportCritical({ source = '未知', title, error = '', extra = '' }) {
  const detail = [error, extra].filter(Boolean).join('\n\n')
  const analysis = analyze(`${title}\n${detail}`)
  currentReport = { analysis, source, detail: clip(detail), time: fullTimeStr() }

  log('ERROR', source, title, detail)
  // 落盘一份「最新-错误报告」，方便玩家直接把这一个文件发给开发者
  try {
    fs.writeFileSync(latestErrorFile, buildCopyText(), 'utf8')
  } catch (_) { /* 静默 */ }

  if (app.isReady()) showErrorWindow()
  else pendingCritical = currentReport
}

// 应用就绪后补弹启动早期收集到的错误
export function flushPendingCritical() {
  if (pendingCritical) {
    currentReport = pendingCritical
    pendingCritical = null
    showErrorWindow()
  }
}

// ---------- GPU 崩溃自动降级 ----------
function applyGpuFlag() {
  try {
    if (fs.existsSync(gpuFlagFile)) {
      app.commandLine.appendSwitch('disable-gpu')
      app.disableHardwareAcceleration()
      gpuDisabledByFlag = true
      log('WARN', 'GPU', '检测到 GPU 崩溃标记，本次启动已禁用硬件加速')
    }
  } catch (_) { /* 静默 */ }
}

function handleGpuCrash(details) {
  log('ERROR', 'GPU', `GPU 进程异常退出（${details.reason}）`, `exitCode=${details.exitCode}`)
  if (!fs.existsSync(gpuFlagFile)) {
    // 第一次 GPU 崩溃：写入标记 → 自动以禁用硬件加速方式重启（标记存在，不会死循环）
    try { fs.writeFileSync(gpuFlagFile, new Date().toISOString()) } catch (_) {}
    log('WARN', 'GPU', '已写入禁用硬件加速标记，即将以禁用硬件加速方式重启…')
    // 退避 500ms 再重启：先让当前进程彻底退出并释放单实例锁，
    // 避免新旧实例抢锁导致恢复实例静默退出（表现为「闪白屏后自动退出」）
    setTimeout(() => {
      try { app.relaunch({ args: [...process.argv.slice(1), '--disable-gpu'] }) } catch (_) {}
      app.exit(0)
    }, 500)
    return
  } else {
    // 已降级仍崩溃：交给错误弹窗分析
    reportCritical({
      source: 'GPU',
      title: '显卡组件反复崩溃',
      error: `GPU process gone: reason=${details.reason}, exitCode=${details.exitCode}`,
      extra: '当前已处于禁用硬件加速模式，仍发生 GPU 崩溃，多为显卡驱动损坏，请更新或重装显卡驱动。',
    })
  }
}

// ---------- 主窗口看护（白屏检测 + 崩溃监听） ----------
function startWhiteScreenWatch() {
  clearWhiteScreenWatch()
  whiteScreenTimer = setTimeout(() => {
    if (gotFirstAlive) return
    reportCritical({
      source: '白屏检测',
      title: '主窗口加载超时，未能进入游戏（白屏）',
      error: recentText(40),
      extra: '主窗口启动后长时间未收到渲染进程的存活心跳。常见原因：显卡不支持 WebGL、本地存储被禁用、游戏文件不完整或被杀毒软件拦截。',
    })
  }, WHITE_SCREEN_MS)
}

function clearWhiteScreenWatch() {
  if (whiteScreenTimer) { clearTimeout(whiteScreenTimer); whiteScreenTimer = null }
}

export function watchMainWindow(win) {
  win.webContents.on('render-process-gone', (_e, details) => {
    if (details.reason === 'clean-exit') return
    reportCritical({
      source: '渲染进程',
      title: '游戏画面进程异常退出',
      error: `reason=${details.reason}, exitCode=${details.exitCode}`,
    })
  })
  win.webContents.on('did-fail-load', (_e, code, desc, url, isMainFrame) => {
    if (!isMainFrame || code === -3) return // -3 = ABORTED（正常跳转），忽略
    reportCritical({
      source: '页面加载',
      title: '游戏主页面加载失败',
      error: `code=${code}, desc=${desc}, url=${url}`,
    })
  })
  win.webContents.on('preload-error', (_e, preloadPath, err) => {
    reportCritical({
      source: '预加载脚本',
      title: '游戏安全桥接脚本加载失败',
      error: `preload=${preloadPath}\n${err?.stack || err}`,
    })
  })
  win.on('closed', clearWhiteScreenWatch)
  startWhiteScreenWatch()
  log('INFO', '主窗口', '主窗口已创建，白屏看门狗已启动')
}

// ---------- 初始化 ----------
function registerProcessHandlers() {
  process.on('uncaughtException', (err) => {
    try {
      reportCritical({
        source: '主进程',
        title: '主进程发生未捕获异常',
        error: err?.stack || String(err),
      })
    } catch (_) { /* 防递归 */ }
  })
  process.on('unhandledRejection', (reason) => {
    log('WARN', '主进程', '未处理的 Promise 拒绝', reason?.stack || String(reason))
  })
}

function registerIpc() {
  // 渲染进程日志与心跳
  ipcMain.on('error-report:log', (_e, { level = 'INFO', source = '渲染', message = '', detail = '' } = {}) => {
    log(String(level).toUpperCase(), String(source), String(message), String(detail ?? ''))
  })
  ipcMain.on('error-report:alive', () => {
    if (!gotFirstAlive) {
      gotFirstAlive = true
      clearWhiteScreenWatch()
      log('INFO', '渲染', '主窗口挂载完成，白屏看门狗已解除')
    }
  })
  // 错误弹窗专用
  ipcMain.handle('error-report:get', () => reportPayload())
  ipcMain.handle('error-report:open-logs', async () => {
    const result = await shell.openPath(logsDir)
    return { success: !result }
  })
  ipcMain.handle('error-report:copy', () => {
    try {
      clipboard.writeText(buildCopyText())
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })
  ipcMain.handle('error-report:restart', () => {
    app.relaunch()
    app.exit(0)
  })
}

// 必须在 app ready 之前调用（appendSwitch/disableHardwareAcceleration 的时机要求）
export function initErrorReporter() {
  try {
    initDirs()
    applyGpuFlag()
    cleanOldLogs()
    const env = envInfo()
    log('INFO', '启动', [
      `萤光纪游 v${env.version} 启动`,
      `Electron ${env.electron} | Chromium ${env.chrome} | Node ${env.node}`,
      `系统：${env.os} | CPU ${env.cpu} | 内存 ${env.memory}`,
      `硬件加速：${env.hw} | 参数：${process.argv.slice(1).join(' ') || '（无）'}`,
    ].join('\n'))
    registerProcessHandlers()
    registerIpc()
    // GPU 进程崩溃监听（app 级）
    app.on('child-process-gone', (_e, details) => {
      if (details.type === 'GPU Process') handleGpuCrash(details)
      else if (details.type === 'Utility Process' && String(details.reason) !== 'clean-exit') {
        log('WARN', '子进程', `Utility 进程退出（${details.reason}）`, `exitCode=${details.exitCode}`)
      }
    })
  } catch (err) {
    // 报错系统自身初始化失败也绝不能阻塞游戏启动
    try { console.error('[errorReporter] 初始化失败:', err) } catch (_) {}
  }
}

export function getLogsDir() {
  return logsDir
}
