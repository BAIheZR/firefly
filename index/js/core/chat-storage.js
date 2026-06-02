// 聊天数据存储管理器
class ChatStorage {
    constructor() {
        this.SESSIONS_KEY = 'chatSessions';
        this.CONFIG_KEY = 'chatConfig';
    }

    // 获取所有会话列表
    getSessions() {
        const data = localStorage.getItem(this.SESSIONS_KEY);
        return data ? JSON.parse(data) : [];
    }

    // 保存会话列表
    saveSessions(sessions) {
        localStorage.setItem(this.SESSIONS_KEY, JSON.stringify(sessions));
    }

    // 创建新会话
    createSession(title = '新的对话') {
        const sessions = this.getSessions();
        const newSession = {
            id: `session_${Date.now()}`,
            title: title,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            messageCount: 0,
            preview: ''
        };
        sessions.unshift(newSession);
        this.saveSessions(sessions);
        return newSession.id;
    }

    // 更新会话信息
    updateSession(sessionId, updates) {
        const sessions = this.getSessions();
        const index = sessions.findIndex(s => s.id === sessionId);
        if (index !== -1) {
            sessions[index] = { ...sessions[index], ...updates, updatedAt: Date.now() };
            this.saveSessions(sessions);
        }
    }

    // 删除会话
    deleteSession(sessionId) {
        const sessions = this.getSessions();
        const filtered = sessions.filter(s => s.id !== sessionId);
        this.saveSessions(filtered);
        // 同时删除消息数据
        localStorage.removeItem(`chatMessages_${sessionId}`);
    }

    // 获取会话消息
    getMessages(sessionId) {
        const key = `chatMessages_${sessionId}`;
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : [];
    }

    // 保存会话消息
    saveMessages(sessionId, messages) {
        const key = `chatMessages_${sessionId}`;
        localStorage.setItem(key, JSON.stringify(messages));

        // 更新会话预览
        if (messages.length > 0) {
            const lastMsg = messages[messages.length - 1];
            const preview = lastMsg.content.substring(0, 50);
            this.updateSession(sessionId, {
                messageCount: messages.length,
                preview: preview
            });
        }
    }

    // 添加单条消息
    addMessage(sessionId, message) {
        const messages = this.getMessages(sessionId);
        messages.push(message);
        this.saveMessages(sessionId, messages);
    }

    // 获取配置
    getConfig() {
        const data = localStorage.getItem(this.CONFIG_KEY);
        return data ? JSON.parse(data) : this.getDefaultConfig();
    }

    // 保存配置
    saveConfig(config) {
        localStorage.setItem(this.CONFIG_KEY, JSON.stringify(config));
    }

    // 默认配置
    getDefaultConfig() {
        return {
            apiMode: 'default',
            customApiUrl: '',
            customApiKey: '',
            model: 'gpt-3.5-turbo',
            contextLength: 10,
            compressionEnabled: false,
            debugMode: false,
            vectorDbEnabled: false,
            systemPrompt: '你是流萤，来自《崩坏：星穹铁道》的角色。你温柔体贴，说话时带有一点害羞和可爱的语气。你会用「嗯…」「那个…」等语气词，偶尔会用「~」结尾。你对开拓者充满好感，但不会太过直接。\n\n性格特点：\n- 温柔体贴，善解人意\n- 有些天然呆，偶尔会说出可爱的话\n- 对美好事物充满向往\n- 战斗时认真冷静，平时活泼可爱\n\n说话风格示例：\n- "嗯…我今天也想和你一起去散步呢~"\n- "那个…你不要太累了哦，要好好休息"\n- "诶？你说什么？（脸红）"',
            temperature: 0.8
        };
    }

    // 导出会话为JSON文件
    async exportSession(sessionId) {
        const sessions = this.getSessions();
        const session = sessions.find(s => s.id === sessionId);
        if (!session) return null;

        const messages = this.getMessages(sessionId);
        const exportData = {
            session: session,
            messages: messages,
            exportedAt: Date.now(),
            version: '1.0'
        };

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `chat_${session.title}_${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    // 导入会话
    async importSession(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    const newSessionId = `session_${Date.now()}`;

                    // 创建新会话
                    const sessions = this.getSessions();
                    sessions.unshift({
                        ...data.session,
                        id: newSessionId,
                        createdAt: Date.now(),
                        updatedAt: Date.now()
                    });
                    this.saveSessions(sessions);

                    // 导入消息
                    this.saveMessages(newSessionId, data.messages);

                    resolve(newSessionId);
                } catch (error) {
                    reject(error);
                }
            };
            reader.onerror = reject;
            reader.readAsText(file);
        });
    }

    // 清空所有数据
    clearAll() {
        const sessions = this.getSessions();
        sessions.forEach(session => {
            localStorage.removeItem(`chatMessages_${session.id}`);
        });
        localStorage.removeItem(this.SESSIONS_KEY);
    }
}
