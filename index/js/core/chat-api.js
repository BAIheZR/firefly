// AI聊天API封装（混合模式：默认+自定义）
class ChatAPI {
    constructor(config) {
        this.config = config;
        this.abortController = null;
    }

    // 发送消息（自动选择模式）
    async sendMessage(messages, onChunk, onError) {
        if (this.config.apiMode === 'default') {
            return await this.sendToDefaultAPI(messages, onChunk, onError);
        } else {
            return await this.sendToCustomAPI(messages, onChunk, onError);
        }
    }

    // 默认API（模拟流萤回复）
    async sendToDefaultAPI(messages, onChunk, onError) {
        // 初始化AbortController以支持停止功能
        this.abortController = new AbortController();

        // 流萤的回复模板
        const responses = this.generateFireflyResponse(messages);

        // 模拟流式输出
        for (let i = 0; i < responses.length; i++) {
            await this.sleep(50); // 模拟网络延迟
            if (this.abortController?.signal.aborted) {
                break;
            }
            onChunk(responses[i]);
        }

        return responses.join('');
    }

    // 生成流萤风格的回复
    generateFireflyResponse(messages) {
        const lastMessage = messages[messages.length - 1];
        const userInput = lastMessage.content.toLowerCase();

        // 根据关键词生成回复
        let response = '';

        if (userInput.includes('你好') || userInput.includes('hi') || userInput.includes('hello')) {
            response = '你好呀！我是流萤，很高兴能和你聊天~今天过得怎么样呢？';
        } else if (userInput.includes('你是谁') || userInput.includes('介绍')) {
            response = '嗯…我是流萤，来自星穹铁道的一名成员。虽然有时候会有点笨拙，但我会尽我所能帮助你的！';
        } else if (userInput.includes('喜欢') || userInput.includes('爱好')) {
            response = '我喜欢看星空，还有…和你在一起的时光也让我很开心呢~（脸红）';
        } else if (userInput.includes('帮助') || userInput.includes('问题')) {
            response = '当然可以！虽然我可能不是最聪明的，但我会努力帮你的！有什么需要尽管告诉我~';
        } else if (userInput.includes('谢谢') || userInput.includes('感谢')) {
            response = '不用客气啦~能帮到你我就很开心了！以后有什么事情也可以随时找我哦~';
        } else if (userInput.includes('再见') || userInput.includes('拜拜')) {
            response = '嗯…要走了吗？那我等你下次再来找我聊天！一路平安~';
        } else if (userInput.includes('游戏') || userInput.includes('玩')) {
            response = '说到游戏…这个萤光纪游就很有趣呢！你玩过了吗？我觉得挑战关卡的感觉很刺激~';
        } else {
            // 通用回复
            const genericResponses = [
                '嗯…这个问题让我想想。我觉得' + this.generateThoughtfulResponse(userInput),
                '那个…你说得很有道理呢。关于这个，我的想法是' + this.generateThoughtfulResponse(userInput),
                '诶？这个话题很有意思呢~让我好好想想…' + this.generateThoughtfulResponse(userInput),
                '嗯嗯，我明白了。其实' + this.generateThoughtfulResponse(userInput)
            ];
            response = genericResponses[Math.floor(Math.random() * genericResponses.length)];
        }

        return response.split('');
    }

    // 生成有深度的回复
    generateThoughtfulResponse(input) {
        const thoughts = [
            '每个人都有自己的看法，最重要的是找到属于自己的答案呢~',
            '这个世界上有很多美好的事情等着我们去发现！',
            '虽然有时候会遇到困难，但只要不放弃，就一定能找到出路的！',
            '和你聊天让我学到了很多东西，谢谢你愿意和我分享~',
            '我会一直陪在你身边的，不管遇到什么都不要害怕哦~'
        ];
        return thoughts[Math.floor(Math.random() * thoughts.length)];
    }

    // 自定义API（兼容OpenAI格式）
    async sendToCustomAPI(messages, onChunk, onError) {
        this.abortController = new AbortController();

        try {
            const requestBody = {
                model: this.config.model || 'gpt-3.5-turbo',
                messages: messages,
                temperature: this.config.temperature || 0.8,
                stream: true
            };

            // 调试日志：记录请求详情
            if (this.config.debugMode) {
                console.log('[API调试] 请求URL:', this.config.customApiUrl);
                console.log('[API调试] 请求体:', JSON.stringify(requestBody, null, 2));
            }

            const response = await fetch(this.config.customApiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.config.customApiKey}`
                },
                body: JSON.stringify(requestBody),
                signal: this.abortController.signal
            });

            // 调试日志：记录响应状态
            if (this.config.debugMode) {
                console.log('[API调试] 响应状态:', response.status, response.statusText);
            }

            if (!response.ok) {
                const errorText = await response.text();
                if (this.config.debugMode) {
                    console.error('[API调试] 错误响应:', errorText);
                }
                throw new Error(`API请求失败: ${response.status} ${response.statusText}\n详情: ${errorText}`);
            }

            // 读取流式响应
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let fullContent = '';
            let chunkCount = 0;
            let rawChunkCount = 0;

            if (this.config.debugMode) {
                console.log('[API调试] 开始读取流式响应');
            }

            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    if (this.config.debugMode) {
                        console.log('[API调试] 流结束');
                    }
                    break;
                }

                rawChunkCount++;
                const chunk = decoder.decode(value, { stream: true });
                buffer += chunk;

                if (this.config.debugMode && rawChunkCount <= 3) {
                    console.log(`[API调试] 原始块 #${rawChunkCount}:`, chunk.substring(0, 200));
                }

                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (!line.trim()) continue;

                    if (line.startsWith('data: ')) {
                        const data = line.slice(6).trim();
                        if (data === '[DONE]') {
                            if (this.config.debugMode) {
                                console.log('[API调试] 收到 [DONE] 标记');
                            }
                            continue;
                        }

                        try {
                            const json = JSON.parse(data);
                            if (this.config.debugMode && chunkCount === 0) {
                                console.log('[API调试] 第一个JSON数据结构:', json);
                            }
                            const content = json.choices?.[0]?.delta?.content;
                            if (content) {
                                fullContent += content;
                                chunkCount++;
                                onChunk(content);
                            } else if (this.config.debugMode && chunkCount < 3) {
                                console.log('[API调试] 数据块无content字段:', json);
                            }
                        } catch (e) {
                            if (this.config.debugMode) {
                                console.warn('[API调试] 解析SSE数据失败:', e.message, '原始数据:', data.substring(0, 100));
                            }
                        }
                    } else if (this.config.debugMode && rawChunkCount <= 2) {
                        console.log('[API调试] 非SSE行:', line.substring(0, 100));
                    }
                }
            }

            if (this.config.debugMode) {
                console.log(`[API调试] 响应完成 - 总字符: ${fullContent.length}, 内容块: ${chunkCount}, 原始块: ${rawChunkCount}`);
                if (fullContent.length === 0) {
                    console.warn('[API调试] ⚠️ 警告：未提取到任何内容！请检查：');
                    console.warn('  1. API地址是否正确（需要完整路径，如 /v1/chat/completions）');
                    console.warn('  2. 响应格式是否符合OpenAI SSE标准');
                    console.warn('  3. 查看上方原始块内容，确认数据结构');
                }
            }

            return fullContent;
        } catch (error) {
            if (error.name === 'AbortError') {
                if (this.config.debugMode) {
                    console.log('[API调试] 请求已取消');
                }
                return '';
            }

            if (this.config.debugMode) {
                console.error('[API调试] API调用错误:', error);
                console.error('[API调试] 错误堆栈:', error.stack);
            }

            if (onError) {
                onError(error);
            }
            throw error;
        }
    }

    // 停止生成
    stopGeneration() {
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }
    }

    // 工具函数：延迟
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // 更新配置
    updateConfig(config) {
        this.config = { ...this.config, ...config };
    }
}
