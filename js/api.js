/**
 * Gemini API 封裝
 * 提供文本生成（含串流）和 Embedding 功能
 */

class GeminiAPI {
    constructor() {
        this.apiKey = localStorage.getItem('gemini_api_key') || '';
        this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
        this.embeddingModel = 'text-embedding-004';

        // 載入模型設定
        this.models = {
            story: localStorage.getItem('gemini_model_story') || 'gemini-2.5-flash-lite',
            options: localStorage.getItem('gemini_model_options') || 'gemini-2.5-flash-lite',
            memory: localStorage.getItem('gemini_model_memory') || 'gemini-2.5-flash-lite'
        };
    }

    /**
     * 設定 API Key
     */
    setApiKey(key) {
        this.apiKey = key;
        localStorage.setItem('gemini_api_key', key);
    }

    /**
     * 獲取 API Key
     */
    getApiKey() {
        return this.apiKey;
    }

    /**
     * 檢查 API Key 是否已設定
     */
    hasApiKey() {
        return !!this.apiKey;
    }

    /**
     * 設定模型
     */
    setModels(storyModel, optionsModel, memoryModel) {
        this.models.story = storyModel;
        this.models.options = optionsModel;
        this.models.memory = memoryModel;

        localStorage.setItem('gemini_model_story', storyModel);
        localStorage.setItem('gemini_model_options', optionsModel);
        localStorage.setItem('gemini_model_memory', memoryModel);
    }

    /**
     * 獲取模型設定
     */
    getModels() {
        return { ...this.models };
    }

    /**
     * 生成文本（非串流）
     * @param {string} prompt - 提示文本
     * @param {object} options - 生成選項
     * @param {string} modelType - 模型類型：'story', 'options', 'memory'
     */
    async generateText(prompt, options = {}, modelType = 'story') {
        if (!this.hasApiKey()) {
            throw new Error('請先設定 Gemini API Key');
        }

        const model = this.models[modelType] || this.models.story;
        const url = `${this.baseUrl}/models/${model}:generateContent?key=${this.apiKey}`;

        console.log(`Calling Gemini API (non-stream) [${modelType}]:`, model);

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{ text: prompt }]
                }],
                generationConfig: {
                    temperature: options.temperature || 0.8,
                    topP: options.topP || 0.95,
                    topK: options.topK || 40,
                    maxOutputTokens: options.maxTokens || 8192
                }
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error('Gemini API error:', response.status, errorData);
            throw new Error(errorData.error?.message || `API 錯誤 (${response.status})`);
        }

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

        if (!text) {
            console.warn('Gemini API returned empty text. Full response:', data);
        }

        // 檢查是否被截斷
        const finishReason = data.candidates?.[0]?.finishReason;
        if (finishReason && finishReason !== 'STOP') {
            console.warn(`Response may be truncated. Finish reason: ${finishReason}`);
        }

        console.log(`API response [${modelType}]: ${text?.length} chars, finish: ${finishReason}`);

        return text;
    }

    /**
     * 生成文本（串流模式）
     * @param {string} prompt - 提示文本
     * @param {function} onChunk - 收到片段時的回調
     * @param {object} options - 生成選項
     * @returns {Promise<string>} - 完整生成的文本
     */
    async generateTextStream(prompt, onChunk, options = {}) {
        if (!this.hasApiKey()) {
            throw new Error('請先設定 Gemini API Key');
        }

        const model = this.models.story;
        const url = `${this.baseUrl}/models/${model}:streamGenerateContent?key=${this.apiKey}&alt=sse`;

        console.log('Calling Gemini API (stream) [story]:', model);

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{ text: prompt }]
                }],
                generationConfig: {
                    temperature: options.temperature || 0.8,
                    topP: options.topP || 0.95,
                    topK: options.topK || 40,
                    maxOutputTokens: options.maxTokens || 8192
                }
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || '生成失敗');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullText = '';
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const jsonStr = line.slice(6);
                    if (jsonStr.trim() === '[DONE]') continue;

                    try {
                        const data = JSON.parse(jsonStr);
                        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
                        if (text) {
                            fullText += text;
                            onChunk(text);
                        }
                    } catch (e) {
                        // 忽略解析錯誤
                    }
                }
            }
        }

        return fullText;
    }

    /**
     * 生成 Embedding 向量
     * @param {string} text - 要生成向量的文本
     * @returns {Promise<number[]>} - 向量陣列
     */
    async generateEmbedding(text) {
        if (!this.hasApiKey()) {
            throw new Error('請先設定 Gemini API Key');
        }

        // 限制文本長度
        const truncatedText = text.slice(0, 2000);

        const url = `${this.baseUrl}/models/${this.embeddingModel}:embedContent?key=${this.apiKey}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: `models/${this.embeddingModel}`,
                content: {
                    parts: [{ text: truncatedText }]
                }
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || '生成向量失敗');
        }

        const data = await response.json();
        return data.embedding?.values || [];
    }

    /**
     * 批量生成 Embedding
     * @param {string[]} texts - 文本陣列
     * @returns {Promise<number[][]>} - 向量陣列的陣列
     */
    async generateEmbeddings(texts) {
        const embeddings = [];
        for (const text of texts) {
            try {
                const embedding = await this.generateEmbedding(text);
                embeddings.push(embedding);
                // 避免過快請求
                await new Promise(resolve => setTimeout(resolve, 100));
            } catch (e) {
                console.error('Embedding error:', e);
                embeddings.push([]);
            }
        }
        return embeddings;
    }

    /**
     * 生成章節摘要
     * @param {string} content - 章節內容
     * @returns {Promise<string>} - 摘要文本
     */
    async generateSummary(content) {
        // 如果內容太長，取開頭和結尾部分
        let processedContent = content;
        const maxContentLength = 4000;

        if (content.length > maxContentLength) {
            const headLength = Math.floor(maxContentLength * 0.4);
            const tailLength = Math.floor(maxContentLength * 0.6);
            processedContent = content.slice(0, headLength) +
                '\n\n[...中間內容省略...]\n\n' +
                content.slice(-tailLength);
            console.log(`Content truncated for summary: ${content.length} -> ${processedContent.length}`);
        }

        const prompt = `請將以下章節內容濃縮成 200-300 字的摘要，保留：
1. 關鍵情節點
2. 角色互動
3. 重要伏筆
4. 情感轉折

只輸出摘要內容，不要有其他說明文字。

章節內容：
${processedContent}`;

        console.log('Generating summary, prompt length:', prompt.length);

        const summary = await this.generateText(prompt, { temperature: 0.3, maxTokens: 10000 }, 'memory');

        console.log('Summary generated, length:', summary?.length);

        return summary;
    }

    /**
     * 生成下一章劇情選項
     * @param {string} chapterContent - 當前章節內容
     * @param {string} worldSetting - 世界觀設定
     * @param {string} plotOutline - 主線劇情
     * @param {object[]} characters - 角色列表
     * @param {number} retryCount - 重試次數
     * @returns {Promise<string[]>} - 選項陣列
     */
    async generateStoryOptions(chapterContent, worldSetting, plotOutline, characters, retryCount = 0) {
        const characterNames = characters.map(c => c.name).join('、');

        const prompt = `根據以下小說章節的結尾，生成 4 個下一章劇情走向選項。

世界觀：${worldSetting || '無'}
主線：${plotOutline || '無'}
角色：${characterNames || '無'}

章節結尾：
${chapterContent.slice(-800)}

請生成 4 個簡短選項（每個 15-30 字）：
1. 主線推進
2. 角色互動
3. 意外轉折
4. 輕鬆日常

回覆格式必須是完整的 JSON 陣列：
["選項1內容", "選項2內容", "選項3內容", "選項4內容"]`;

        try {
            const response = await this.generateText(prompt, {
                temperature: 0.7,
                maxTokens: 10000
            }, 'options');

            console.log('Options API response:', response);

            // 嘗試多種方式解析 JSON
            let options = null;

            // 方法 1: 直接解析整個回應
            try {
                const parsed = JSON.parse(response.trim());
                if (Array.isArray(parsed)) {
                    options = parsed;
                }
            } catch (e) {
                // 繼續嘗試其他方法
            }

            // 方法 2: 用正則匹配 JSON 陣列
            if (!options) {
                const jsonMatch = response.match(/\[[\s\S]*?\]/);
                if (jsonMatch) {
                    try {
                        options = JSON.parse(jsonMatch[0]);
                    } catch (e) {
                        console.warn('JSON parse failed:', e);
                    }
                }
            }

            // 方法 3: 嘗試修復常見的 JSON 錯誤
            if (!options) {
                // 移除可能的 markdown 代碼塊
                let cleaned = response.replace(/```json\s*/g, '').replace(/```\s*/g, '');
                const match = cleaned.match(/\[[\s\S]*\]/);
                if (match) {
                    try {
                        options = JSON.parse(match[0]);
                    } catch (e) {
                        console.warn('Cleaned JSON parse failed:', e);
                    }
                }
            }

            // 驗證選項
            if (Array.isArray(options) && options.length > 0) {
                // 過濾掉空選項，確保至少有一個有效選項
                const validOptions = options.filter(opt => typeof opt === 'string' && opt.trim().length > 0);
                if (validOptions.length > 0) {
                    // 如果不足 4 個，補充預設選項
                    while (validOptions.length < 4) {
                        const defaults = this.getDefaultOptions();
                        validOptions.push(defaults[validOptions.length]);
                    }
                    console.log('Successfully parsed options:', validOptions.slice(0, 4));
                    return validOptions.slice(0, 4);
                }
            }

            // 如果解析失敗且還沒重試過，嘗試重試
            if (retryCount < 1) {
                console.log(`Options parse failed, retrying (${retryCount + 1}/1)...`);
                console.log('Failed to parse response:', response);
                await new Promise(resolve => setTimeout(resolve, 1500));
                return this.generateStoryOptions(chapterContent, worldSetting, plotOutline, characters, retryCount + 1);
            }

            // 如果解析失敗，返回預設選項
            console.warn('Options generation failed after retries, using defaults.');
            console.warn('Last response was:', response);
            return this.getDefaultOptions();
        } catch (e) {
            console.error('Generate options error:', e);

            // 如果是 API 錯誤且還沒重試過，嘗試重試
            if (retryCount < 1) {
                console.log(`API error, retrying (${retryCount + 1}/1)...`);
                await new Promise(resolve => setTimeout(resolve, 2000));
                return this.generateStoryOptions(chapterContent, worldSetting, plotOutline, characters, retryCount + 1);
            }

            return this.getDefaultOptions();
        }
    }

    /**
     * 獲取預設選項
     */
    getDefaultOptions() {
        return [
            '繼續推進主線劇情，揭開更多謎團',
            '深入描寫角色之間的互動與情感',
            '出現意外的敵人或危機',
            '輕鬆的日常場景，角色休息調整'
        ];
    }
}

// 導出單例
const geminiAPI = new GeminiAPI();
