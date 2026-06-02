const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1520,
        height: 800,
        minWidth: 1520,
        minHeight: 600,
        autoHideMenuBar: true,
        title: '萤光纪游',
        icon: path.join(__dirname, 'favicon.ico'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            webSecurity: true
        }
    });
    
    // 阻止页面标题自动更新
    mainWindow.on('page-title-updated', function(e) {
        e.preventDefault();
        mainWindow.setTitle('萤光纪游');
    });

    const args = process.argv;
    let startPage = 'index/splash.html';

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--splash') {
            startPage = 'index/splash.html';
            break;
        } else if (args[i] === '--page' && args[i + 1]) {
            startPage = args[i + 1];
            break;
        }
    }

    mainWindow.loadFile(startPage);

    mainWindow.on('closed', function () {
        mainWindow = null;
    });
}

app.on('ready', createWindow);

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', function () {
    if (mainWindow === null) {
        createWindow();
    }
});

ipcMain.handle('save-splash-video', async (event, arrayBuffer) => {
    try {
        const userDataPath = app.getPath('userData');
        const videoDir = path.join(userDataPath, 'splash_videos');

        if (!fs.existsSync(videoDir)) {
            fs.mkdirSync(videoDir, { recursive: true });
        }

        const videoPath = path.join(videoDir, 'splash_video.mp4');
        const buffer = Buffer.from(arrayBuffer);
        fs.writeFileSync(videoPath, buffer);

        return { success: true, path: videoPath };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('get-splash-video-path', async () => {
    try {
        const userDataPath = app.getPath('userData');
        const videoPath = path.join(userDataPath, 'splash_videos', 'splash_video.mp4');

        if (fs.existsSync(videoPath)) {
            return { exists: true, path: videoPath };
        }
        return { exists: false };
    } catch (error) {
        return { exists: false, error: error.message };
    }
});

ipcMain.handle('splash-video-exists', async () => {
    try {
        const userDataPath = app.getPath('userData');
        const videoPath = path.join(userDataPath, 'splash_videos', 'splash_video.mp4');
        return fs.existsSync(videoPath);
    } catch (error) {
        return false;
    }
});

ipcMain.handle('delete-splash-video', async () => {
    try {
        const userDataPath = app.getPath('userData');
        const videoPath = path.join(userDataPath, 'splash_videos', 'splash_video.mp4');

        if (fs.existsSync(videoPath)) {
            fs.unlinkSync(videoPath);
        }
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('show-open-dialog', async (event, options) => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: [
            { name: 'Videos', extensions: ['mp4', 'webm', 'avi', 'mkv', 'mov', 'wmv', 'ogv'] }
        ],
        ...options
    });
    return result;
});

ipcMain.handle('show-save-dialog', async (event, options) => {
    const result = await dialog.showSaveDialog(mainWindow, options);
    return result;
});

ipcMain.handle('read-file', async (event, filePath) => {
    try {
        const buffer = fs.readFileSync(filePath);
        return { success: true, data: buffer };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// 存档相关 API
ipcMain.handle('save-file-exists', async (event, fileName) => {
    try {
        const userDataPath = app.getPath('userData');
        const savesDir = path.join(userDataPath, 'saves');
        
        if (!fs.existsSync(savesDir)) {
            fs.mkdirSync(savesDir, { recursive: true });
        }
        
        const filePath = path.join(savesDir, fileName);
        return fs.existsSync(filePath);
    } catch (error) {
        return false;
    }
});

ipcMain.handle('save-game-data', async (event, gameData, fileName, customDirectory) => {
    try {
        let filePath;
        
        if (customDirectory && customDirectory.trim()) {
            // 使用自定义目录
            if (!fs.existsSync(customDirectory)) {
                fs.mkdirSync(customDirectory, { recursive: true });
            }
            filePath = path.join(customDirectory, fileName);
        } else {
            // 使用默认目录
            const userDataPath = app.getPath('userData');
            const savesDir = path.join(userDataPath, 'saves');
            
            if (!fs.existsSync(savesDir)) {
                fs.mkdirSync(savesDir, { recursive: true });
            }
            
            filePath = path.join(savesDir, fileName);
        }
        
        // 检查文件是否存在
        if (fs.existsSync(filePath)) {
            return { success: false, error: 'file_exists', path: filePath };
        }
        
        const jsonData = JSON.stringify(gameData, null, 2);
        fs.writeFileSync(filePath, jsonData);
        
        return { success: true, path: filePath };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

function compareVersionStrings(a, b) {
    const aParts = String(a).split('.').map(n => parseInt(n, 10) || 0);
    const bParts = String(b).split('.').map(n => parseInt(n, 10) || 0);
    const length = Math.max(aParts.length, bParts.length);
    for (let i = 0; i < length; i++) {
        const aVal = aParts[i] || 0;
        const bVal = bParts[i] || 0;
        if (aVal > bVal) return 1;
        if (aVal < bVal) return -1;
    }
    return 0;
}

function getGitHubRepoFromRemoteUrl(remoteUrl) {
    if (!remoteUrl) return null;
    const githubSsh = /^git@github\.com:(.+?)\/(.+?)(?:\.git)?$/;
    const githubHttps = /^https:\/\/github\.com\/(.+?)\/(.+?)(?:\.git)?$/;
    let match = githubSsh.exec(remoteUrl) || githubHttps.exec(remoteUrl);
    if (!match) return null;
    const owner = match[1].trim();
    const repo = match[2].trim();
    return { owner, repo };
}

function loadUpdateConfig() {
    const appPath = app.getAppPath();
    const configPath = path.join(appPath, 'update-config.json');

    try {
        if (fs.existsSync(configPath)) {
            const raw = fs.readFileSync(configPath, 'utf8');
            const config = JSON.parse(raw);
            if (config.updateUrl && config.releaseUrl) {
                return config;
            }
        }
    } catch (error) {
        // 忽略解析错误，继续尝试从 Git 信息派生
    }

    try {
        const gitConfigPath = path.join(appPath, '.git', 'config');
        if (fs.existsSync(gitConfigPath)) {
            const gitConfig = fs.readFileSync(gitConfigPath, 'utf8');
            const lines = gitConfig.split(/\r?\n/);
            let originUrl = '';
            let insideOrigin = false;
            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed.startsWith('[remote "origin"]')) {
                    insideOrigin = true;
                    continue;
                }
                if (insideOrigin) {
                    if (trimmed.startsWith('[')) {
                        insideOrigin = false;
                        continue;
                    }
                    if (trimmed.startsWith('url =')) {
                        originUrl = trimmed.replace('url =', '').trim();
                        break;
                    }
                }
            }
            if (originUrl) {
                const repo = getGitHubRepoFromRemoteUrl(originUrl);
                if (repo) {
                    return {
                        updateUrl: `https://raw.githubusercontent.com/${repo.owner}/${repo.repo}/main/update.json`,
                        releaseUrl: `https://github.com/${repo.owner}/${repo.repo}/releases/latest`
                    };
                }
            }
        }
    } catch (error) {
        // 忽略 Git 解析错误
    }

    try {
        const packageJsonPath = path.join(appPath, 'package.json');
        if (fs.existsSync(packageJsonPath)) {
            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
            let repoUrl = null;
            if (packageJson.repository) {
                if (typeof packageJson.repository === 'string') {
                    repoUrl = packageJson.repository;
                } else if (packageJson.repository.url) {
                    repoUrl = packageJson.repository.url;
                }
            }
            if (repoUrl) {
                const repo = getGitHubRepoFromRemoteUrl(repoUrl);
                if (repo) {
                    return {
                        updateUrl: `https://raw.githubusercontent.com/${repo.owner}/${repo.repo}/main/update.json`,
                        releaseUrl: `https://github.com/${repo.owner}/${repo.repo}/releases/latest`
                    };
                }
            }
        }
    } catch (error) {
        // 忽略 package.json 解析错误
    }

    return null;
}

function fetchJsonFromUrl(url) {
    return new Promise((resolve, reject) => {
        const request = https.get(url, res => {
            let body = '';
            res.on('data', chunk => {
                body += chunk.toString();
            });
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try {
                        resolve(JSON.parse(body));
                    } catch (error) {
                        reject(new Error('远程更新信息无法解析为 JSON。'));
                    }
                } else {
                    reject(new Error(`请求更新信息失败，状态码：${res.statusCode}`));
                }
            });
        });
        request.on('error', reject);
        request.setTimeout(15000, () => {
            request.destroy(new Error('请求更新信息超时。'));
        });
    });
}

async function performUpdateCheck() {
    const config = loadUpdateConfig();
    if (!config || !config.updateUrl) {
        return {
            error: 'update_config_missing',
            message: '未找到更新配置，请在根目录创建 update-config.json 或配置 GitHub 远程仓库地址。'
        };
    }

    try {
        const remoteData = await fetchJsonFromUrl(config.updateUrl);
        if (!remoteData.version) {
            return {
                error: 'invalid_manifest',
                message: '远程更新信息格式不正确。'
            };
        }

        const currentVersion = app.getVersion();
        const latestVersion = String(remoteData.version);
        const updateAvailable = compareVersionStrings(latestVersion, currentVersion) > 0;
        return {
            updateAvailable,
            currentVersion,
            latestVersion,
            notes: remoteData.notes || '',
            releaseUrl: remoteData.releaseUrl || config.releaseUrl,
            updateUrl: config.updateUrl
        };
    } catch (error) {
        return {
            error: 'fetch_failed',
            message: error.message || '检查更新时发生错误。'
        };
    }
}

ipcMain.handle('check-for-updates', async () => {
    return await performUpdateCheck();
});

ipcMain.handle('get-app-version', () => {
    return app.getVersion();
});

ipcMain.handle('open-external-url', async (event, url) => {
    if (!url || typeof url !== 'string') {
        return { success: false, error: 'invalid_url' };
    }

    try {
        await shell.openExternal(url);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});
