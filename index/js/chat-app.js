// AI聊天主应用
class ChatApp {
    constructor() {
        this.storage = new ChatStorage();
        this.config = this.storage.getConfig();
        this.api = new ChatAPI(this.config);
        this.memory = new ChatMemory(this.config);
        this.currentSessionId = null;
        this.isStreaming = false;
        this.currentStreamingElement = null;

        this.init();
    }

    // 初始化
    init() {
        this.initDefaultSession();
        this.renderSessions();
        this.bindEvents();
        this.applyTheme();
        this.loadCustomBackground();
    }

    // 初始化默认会话
    initDefaultSession() {
        let sessions = this.storage.getSessions();
        if (sessions.length === 0) {
            // 创建第一个会话
            this.currentSessionId = this.storage.createSession('与流萤的对话');
        } else {
            // 加载最近的会话
            this.currentSessionId = sessions[0].id;
        }
        this.renderMessages();
    }

    // 渲染会话列表
    renderSessions() {
        const sessions = this.storage.getSessions();
        const container = document.getElementById('sessionList');
        container.innerHTML = '';

        sessions.forEach(session => {
            const div = document.createElement('div');
            div.className = 'session-item' + (session.id === this.currentSessionId ? ' active' : '');
            div.innerHTML = `
                <div class="session-title">${this.escapeHtml(session.title)}</div>
                <div class="session-preview">${this.escapeHtml(session.preview || '开始新对话...')}</div>
                <div class="session-time">${this.formatTime(session.updatedAt)}</div>
                <button class="session-delete">
                    <i class="fas fa-trash"></i>
                </button>
            `;
            div.onclick = (e) => {
                if (!e.target.closest('.session-delete')) {
                    this.switchSession(session.id);
                }
            };
            // 使用事件监听器而不是内联onclick
            div.querySelector('.session-delete').onclick = (e) => {
                e.stopPropagation();
                this.deleteSession(session.id, e);
            };
            container.appendChild(div);
        });

        // 重新应用当前主题
        const savedTheme = localStorage.getItem('currentTheme') || 'light';
        if (typeof applyTheme === 'function') {
            applyTheme(savedTheme);
        }
    }

    // 渲染消息列表
    renderMessages() {
        const messages = this.storage.getMessages(this.currentSessionId);
        const container = document.getElementById('chatMessages');
        container.innerHTML = '';

        messages.forEach(msg => {
            this.appendMessage(msg, false);
        });

        this.scrollToBottom();
    }

    // 添加消息到界面
    appendMessage(msg, animate = true) {
        const container = document.getElementById('chatMessages');
        const div = document.createElement('div');
        div.className = `chat-message ${msg.role}-message`;
        if (animate) div.style.animation = 'fadeIn 0.3s ease';

        const avatarHtml = msg.role === 'user'
            ? '<i class="fas fa-user"></i>'
            : '<img src="../favicon.ico" alt="流萤">';

        div.innerHTML = `
            <div class="message-avatar">${avatarHtml}</div>
            <div class="message-bubble">
                <div class="message-content">${this.renderMarkdown(msg.content)}</div>
                <div class="message-time">${this.formatTime(msg.timestamp)}</div>
            </div>
        `;

        container.appendChild(div);
        this.scrollToBottom();
        return div;
    }

    // 发送消息
    async sendMessage() {
        const input = document.getElementById('messageInput');
        const content = input.value.trim();

        if (!content || this.isStreaming) return;

        // 添加用户消息
        const userMsg = {
            id: `msg_${Date.now()}`,
            role: 'user',
            content: content,
            timestamp: Date.now()
        };

        this.storage.addMessage(this.currentSessionId, userMsg);
        this.appendMessage(userMsg);
        input.value = '';
        input.style.height = 'auto';

        // 准备AI回复
        this.isStreaming = true;
        this.updateSendButton(true);

        const assistantMsg = {
            id: `msg_${Date.now() + 1}`,
            role: 'assistant',
            content: '',
            timestamp: Date.now()
        };

        const msgElement = this.appendMessage(assistantMsg);
        this.currentStreamingElement = msgElement.querySelector('.message-content');
        this.currentStreamingElement.classList.add('streaming');

        try {
            // 构建上下文
            const messages = this.storage.getMessages(this.currentSessionId);
            const context = this.memory.buildContext(messages);

            // 调试日志：记录请求
            this.addDebugLog(`📤 发送请求 - 模式: ${this.config.apiMode}, 消息数: ${context.length}`);
            if (this.config.apiMode === 'custom') {
                this.addDebugLog(`   URL: ${this.config.customApiUrl}`);
                this.addDebugLog(`   模型: ${this.config.model}`);
            }

            // 调用API
            const fullResponse = await this.api.sendMessage(
                context,
                (chunk) => this.handleStreamChunk(chunk),
                (error) => this.handleStreamError(error)
            );

            // 调试日志：记录成功
            this.addDebugLog(`✅ 响应成功 - 长度: ${fullResponse.length}字符`);

            assistantMsg.content = fullResponse;
            this.storage.addMessage(this.currentSessionId, assistantMsg);
            this.renderSessions(); // 更新会话预览

        } catch (error) {
            console.error('发送消息失败:', error);

            // 调试日志：记录错误
            this.addDebugLog(`❌ 请求失败 - ${error.message}`);
            this.addDebugLog(`   详细: ${error.stack || error.toString()}`);

            modal.error('发送失败: ' + error.message);
            msgElement.remove();
            // 不保存失败的消息
        } finally {
            this.isStreaming = false;
            this.updateSendButton(false);
            if (this.currentStreamingElement) {
                this.currentStreamingElement.classList.remove('streaming');
                // 转换为Markdown
                const text = this.currentStreamingElement.textContent;
                this.currentStreamingElement.innerHTML = this.renderMarkdown(text);
                this.currentStreamingElement = null;
            }
        }
    }

    // 处理流式响应块
    handleStreamChunk(chunk) {
        if (this.currentStreamingElement) {
            const currentText = this.currentStreamingElement.textContent || '';
            this.currentStreamingElement.textContent = currentText + chunk;
            this.scrollToBottom();
        }
    }

    // 处理流式错误
    handleStreamError(error) {
        console.error('流式响应错误:', error);
    }

    // 停止生成
    stopGeneration() {
        if (this.isStreaming) {
            this.api.stopGeneration();
            this.isStreaming = false;
            this.updateSendButton(false);
            if (this.currentStreamingElement) {
                this.currentStreamingElement.classList.remove('streaming');
                // 转换为Markdown
                const text = this.currentStreamingElement.textContent;
                this.currentStreamingElement.innerHTML = this.renderMarkdown(text);

                // 保存部分生成的消息
                const assistantMsg = {
                    id: `msg_${Date.now()}`,
                    role: 'assistant',
                    content: text,
                    timestamp: Date.now()
                };
                this.storage.addMessage(this.currentSessionId, assistantMsg);
                this.renderSessions();

                this.currentStreamingElement = null;
            }
        }
    }

    // 更新发送按钮状态
    updateSendButton(isStreaming) {
        const sendBtn = document.getElementById('sendBtn');
        const stopBtn = document.getElementById('stopBtn');

        if (isStreaming) {
            sendBtn.style.display = 'none';
            stopBtn.style.display = 'block';
        } else {
            sendBtn.style.display = 'block';
            stopBtn.style.display = 'none';
        }
    }

    // 创建新会话
    createNewSession() {
        const sessionId = this.storage.createSession('新的对话');
        this.switchSession(sessionId);
    }

    // 切换会话
    switchSession(sessionId) {
        if (this.isStreaming) {
            modal.warning('请等待当前消息发送完成');
            return;
        }

        // 清理可能残留的引用
        this.currentStreamingElement = null;

        this.currentSessionId = sessionId;
        this.renderMessages();
        this.renderSessions();
    }

    // 删除会话
    async deleteSession(sessionId, event) {
        if (event) {
            event.stopPropagation();
        }

        const confirmed = await modal.confirm('确定删除此对话？删除后无法恢复。');
        if (!confirmed) return;

        this.storage.deleteSession(sessionId);

        // 如果删除的是当前会话，切换到其他会话
        if (sessionId === this.currentSessionId) {
            const sessions = this.storage.getSessions();
            if (sessions.length > 0) {
                this.switchSession(sessions[0].id);
            } else {
                this.createNewSession();
            }
        } else {
            this.renderSessions();
        }
    }

    // 清空当前会话
    async clearCurrentSession() {
        const confirmed = await modal.confirm('确定清空当前对话？');
        if (!confirmed) return;

        this.storage.saveMessages(this.currentSessionId, []);
        this.renderMessages();
        this.renderSessions();
    }

    // 导出会话
    exportCurrentSession() {
        this.storage.exportSession(this.currentSessionId);
    }

    // 导入会话
    async importSession() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                const sessionId = await this.storage.importSession(file);
                this.switchSession(sessionId);
                modal.success('导入成功！');
            } catch (error) {
                modal.error('导入失败: ' + error.message);
            }
        };
        input.click();
    }

    // 打开设置
    openSettings() {
        const config = this.storage.getConfig();
        const modal = this.createSettingsModal(config);
        document.body.appendChild(modal);
    }

    // 创建设置模态框
    createSettingsModal(config) {
        const overlay = document.createElement('div');
        overlay.className = 'settings-overlay';
        overlay.innerHTML = `
            <div class="settings-modal">
                <div class="settings-header">
                    <h2><i class="fas fa-cog"></i> 聊天设置</h2>
                    <button class="close-btn" onclick="this.closest('.settings-overlay').remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="settings-body">
                    <div class="setting-group">
                        <label>API模式</label>
                        <select id="apiModeSelect">
                            <option value="default" ${config.apiMode === 'default' ? 'selected' : ''}>默认模式（模拟回复）</option>
                            <option value="custom" ${config.apiMode === 'custom' ? 'selected' : ''}>自定义API</option>
                        </select>
                    </div>

                    <div class="setting-group" id="customApiGroup" style="display: ${config.apiMode === 'custom' ? 'block' : 'none'}">
                        <label>API地址</label>
                        <input type="text" id="customApiUrl" value="${config.customApiUrl}" placeholder="https://api.openai.com/v1/chat/completions">
                        <small style="color: #888; font-size: 12px;">⚠️ 必须包含完整路径，如：/v1/chat/completions</small>

                        <label>API密钥</label>
                        <input type="password" id="customApiKey" value="${config.customApiKey}" placeholder="sk-...">

                        <label>模型名称</label>
                        <input type="text" id="modelName" value="${config.model || 'gpt-3.5-turbo'}" placeholder="gpt-3.5-turbo">
                        <small style="color: #888; font-size: 12px;">常用模型：gpt-3.5-turbo, gpt-4, gpt-4-turbo, claude-3-opus 等</small>
                    </div>

                    <div class="setting-group">
                        <label>上下文长度（保留最近几条消息）</label>
                        <input type="number" id="contextLength" value="${config.contextLength}" min="5" max="50">
                    </div>

                    <div class="setting-group">
                        <label>
                            <input type="checkbox" id="compressionEnabled" ${config.compressionEnabled ? 'checked' : ''}>
                            启用上下文压缩
                        </label>
                    </div>

                    <div class="setting-group">
                        <label>
                            <input type="checkbox" id="debugMode" ${config.debugMode ? 'checked' : ''}>
                            启用API调试模式
                        </label>
                        <small style="color: #888; font-size: 12px;">开启后会在下方显示API调用日志，帮助排查问题</small>
                    </div>

                    <div class="setting-group" id="debugLogGroup" style="display: ${config.debugMode ? 'block' : 'none'}">
                        <label>API调试日志</label>
                        <div id="debugLog" style="background: #f5f5f5; border: 1px solid #ddd; border-radius: 8px; padding: 12px; max-height: 200px; overflow-y: auto; font-family: 'Courier New', monospace; font-size: 12px; line-height: 1.6; white-space: pre-wrap;">
                            ${this.getDebugLogs()}
                        </div>
                        <button class="btn-clear-log" onclick="chatApp.clearDebugLog()" style="margin-top: 8px; padding: 6px 12px; background: #f44336; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 12px;">
                            清空日志
                        </button>
                    </div>

                    <div class="setting-group">
                        <label>系统提示词（流萤人设）</label>
                        <textarea id="systemPrompt" rows="6">${config.systemPrompt}</textarea>
                    </div>
                </div>
                <div class="settings-footer">
                    <button class="btn-cancel" onclick="this.closest('.settings-overlay').remove()">取消</button>
                    <button class="btn-save" onclick="chatApp.saveSettings()">保存</button>
                </div>
            </div>
        `;

        // API模式切换
        overlay.querySelector('#apiModeSelect').onchange = (e) => {
            const customGroup = overlay.querySelector('#customApiGroup');
            customGroup.style.display = e.target.value === 'custom' ? 'block' : 'none';
        };

        // 调试模式切换
        overlay.querySelector('#debugMode').onchange = (e) => {
            const debugLogGroup = overlay.querySelector('#debugLogGroup');
            debugLogGroup.style.display = e.target.checked ? 'block' : 'none';
        };

        return overlay;
    }

    // 保存设置
    saveSettings() {
        const newConfig = {
            apiMode: document.getElementById('apiModeSelect').value,
            customApiUrl: document.getElementById('customApiUrl').value,
            customApiKey: document.getElementById('customApiKey').value,
            model: document.getElementById('modelName').value,
            contextLength: parseInt(document.getElementById('contextLength').value),
            compressionEnabled: document.getElementById('compressionEnabled').checked,
            debugMode: document.getElementById('debugMode').checked,
            systemPrompt: document.getElementById('systemPrompt').value,
            temperature: this.config.temperature
        };

        this.storage.saveConfig(newConfig);
        this.config = newConfig;
        this.api.updateConfig(newConfig);
        this.memory.updateConfig(newConfig);

        document.querySelector('.settings-overlay').remove();
        modal.success('设置已保存！');
    }

    // 获取调试日志
    getDebugLogs() {
        const logs = localStorage.getItem('chatDebugLogs') || '暂无日志';
        return logs;
    }

    // 添加调试日志
    addDebugLog(message) {
        if (!this.config.debugMode) return;

        const timestamp = new Date().toLocaleTimeString();
        const logEntry = `[${timestamp}] ${message}\n`;

        let logs = localStorage.getItem('chatDebugLogs') || '';
        logs += logEntry;

        // 限制日志大小，保留最近5000字符
        if (logs.length > 5000) {
            logs = logs.slice(-5000);
        }

        localStorage.setItem('chatDebugLogs', logs);
    }

    // 清空调试日志
    clearDebugLog() {
        localStorage.removeItem('chatDebugLogs');
        const debugLogElement = document.getElementById('debugLog');
        if (debugLogElement) {
            debugLogElement.textContent = '日志已清空';
        }
        modal.success('调试日志已清空！');
    }

    // Markdown渲染
    renderMarkdown(text) {
        if (!text) return '';

        return this.escapeHtml(text)
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.+?)\*/g, '<em>$1</em>')
            .replace(/`(.+?)`/g, '<code>$1</code>')
            .replace(/\n/g, '<br>');
    }

    // HTML转义
    escapeHtml(text) {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // 格式化时间
    formatTime(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now - date;

        if (diff < 60000) return '刚刚';
        if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
        if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';

        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        const hour = date.getHours().toString().padStart(2, '0');
        const minute = date.getMinutes().toString().padStart(2, '0');

        return `${month}-${day} ${hour}:${minute}`;
    }

    // 滚动到底部
    scrollToBottom() {
        const container = document.getElementById('chatMessages');
        container.scrollTop = container.scrollHeight;
    }

    // 应用主题
    applyTheme() {
        const savedTheme = localStorage.getItem('currentTheme') || 'light';
        if (typeof applyTheme === 'function') {
            applyTheme(savedTheme);
        }
    }

    // 加载自定义背景
    loadCustomBackground() {
        const pageBackgrounds = JSON.parse(localStorage.getItem('pageBackgrounds')) || {};
        if (pageBackgrounds['chat']) {
            const video = document.querySelector('.video-bg');
            if (video) {
                video.style.display = 'none';
                document.body.style.background = `url(${pageBackgrounds['chat']}) center/cover no-repeat fixed`;
            }
        }
    }

    // 绑定事件
    bindEvents() {
        const input = document.getElementById('messageInput');
        const sendBtn = document.getElementById('sendBtn');
        const stopBtn = document.getElementById('stopBtn');

        // 发送按钮
        sendBtn.onclick = () => this.sendMessage();
        stopBtn.onclick = () => this.stopGeneration();

        // Enter发送，Shift+Enter换行
        input.onkeydown = (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        };

        // 自动调整输入框高度
        input.oninput = () => {
            input.style.height = 'auto';
            input.style.height = Math.min(input.scrollHeight, 120) + 'px';
        };
    }
}

// 全局实例
let chatApp;

// 页面加载完成后初始化
window.addEventListener('DOMContentLoaded', () => {
    chatApp = new ChatApp();
});
