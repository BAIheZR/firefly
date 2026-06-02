// 上下文记忆管理器（L1短期记忆）
class ChatMemory {
    constructor(config) {
        this.config = config;
        this.maxLength = config.contextLength || 10;
        this.compressionEnabled = config.compressionEnabled || false;
    }

    // 构建上下文（包含system prompt）
    buildContext(messages) {
        // 添加系统提示词
        const systemMessage = {
            role: 'system',
            content: this.config.systemPrompt
        };

        // 如果消息数量没有超过限制，直接返回
        if (messages.length <= this.maxLength) {
            return [systemMessage, ...messages];
        }

        // 超过限制时的处理
        if (this.compressionEnabled) {
            return this.buildCompressedContext(systemMessage, messages);
        } else {
            // 简单截断：保留最近的N条消息
            const recentMessages = messages.slice(-this.maxLength);
            return [systemMessage, ...recentMessages];
        }
    }

    // 构建压缩的上下文
    buildCompressedContext(systemMessage, messages) {
        // 保留最近的消息
        const recentMessages = messages.slice(-this.maxLength);

        // 压缩旧消息
        const oldMessages = messages.slice(0, -this.maxLength);
        if (oldMessages.length > 0) {
            const summary = this.summarizeMessages(oldMessages);
            const summaryMessage = {
                role: 'system',
                content: `[历史对话摘要] ${summary}`
            };
            return [systemMessage, summaryMessage, ...recentMessages];
        }

        return [systemMessage, ...recentMessages];
    }

    // 简单的消息摘要
    summarizeMessages(messages) {
        // 提取用户的主要问题
        const userQuestions = messages
            .filter(m => m.role === 'user')
            .map(m => m.content)
            .join('; ');

        if (userQuestions.length > 200) {
            return userQuestions.substring(0, 200) + '...';
        }
        return userQuestions;
    }

    // 更新配置
    updateConfig(config) {
        this.config = { ...this.config, ...config };
        this.maxLength = config.contextLength || 10;
        this.compressionEnabled = config.compressionEnabled || false;
    }

    // 估算token数量（粗略估算）
    estimateTokens(messages) {
        let totalChars = 0;
        messages.forEach(msg => {
            totalChars += msg.content.length;
        });
        // 粗略估算：平均4个字符约等于1个token（中文约2字符1token）
        return Math.ceil(totalChars / 3);
    }

    // 检查是否需要压缩
    shouldCompress(messages) {
        return messages.length > this.maxLength;
    }

    // 获取上下文统计信息
    getContextStats(messages) {
        return {
            totalMessages: messages.length,
            recentMessages: Math.min(messages.length, this.maxLength),
            estimatedTokens: this.estimateTokens(messages),
            needsCompression: this.shouldCompress(messages)
        };
    }
}
