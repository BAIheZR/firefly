// 错误报告弹窗专用 preload：只暴露错误窗口需要的最小 API
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('errorAPI', {
  getReport: () => ipcRenderer.invoke('error-report:get'),
  openLogs: () => ipcRenderer.invoke('error-report:open-logs'),
  copyError: () => ipcRenderer.invoke('error-report:copy'),
  restartApp: () => ipcRenderer.invoke('error-report:restart'),
  // 弹窗已打开时又有新错误 → 主进程推送更新
  onUpdate: (cb) => ipcRenderer.on('error-report:update', (_e, data) => cb(data)),
})
