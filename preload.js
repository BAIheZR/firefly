const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    saveSplashVideo: (arrayBuffer) => ipcRenderer.invoke('save-splash-video', arrayBuffer),
    getSplashVideoPath: () => ipcRenderer.invoke('get-splash-video-path'),
    splashVideoExists: () => ipcRenderer.invoke('splash-video-exists'),
    deleteSplashVideo: () => ipcRenderer.invoke('delete-splash-video'),
    showOpenDialog: (options) => ipcRenderer.invoke('show-open-dialog', options),
    showSaveDialog: (options) => ipcRenderer.invoke('show-save-dialog', options),
    readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
    saveFileExists: (fileName) => ipcRenderer.invoke('save-file-exists', fileName),
    saveGameData: (gameData, fileName, customDirectory) => ipcRenderer.invoke('save-game-data', gameData, fileName, customDirectory),
    checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    openExternalUrl: (url) => ipcRenderer.invoke('open-external-url', url)
});
