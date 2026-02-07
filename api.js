/**
 * Gemini API 封裝
 * 提供文本生成（含串流）和 Embedding 功能
 */

class GeminiAPI {
    constructor() {
        this.apiKey = localStorage.getItem('gemini_api_key') || '';
        this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
        this.generationModel = 'gemini-3-pro-preview';
        this.embeddingModel = 'text-embedding-004';
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
     * 生成文本（非串流）
     */
    async generateText(prompt, options = {}) {
        if (!this.hasApiKey()) {
            throw new Error('請先設定 Gemini API Key');
        }

        const url = `${this.baseUrl}/models/${this.generationModel}:generateContent?key=${this.apiKey}`;

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

        const data = await response.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
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

        const url = `${this.baseUrl}/models/${this.generationModel}:streamGenerateContent?key=${this.apiKey}&alt=sse`;

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
        const prompt = `請將以下章節內容濃縮成 200-300 字的摘要，保留：
1. 關鍵情節點
2. 角色互動
3. 重要伏筆
4. 情感轉折

只輸出摘要內容，不要有其他說明文字。

章節內容：
${content}`;

        return this.generateText(prompt, { temperature: 0.3, maxTokens: 500 });
    }

    /**
     * 生成下一章劇情選項
     * @param {string} chapterContent - 當前章節內容
     * @param {string} worldSetting - 世界觀設定
     * @param {string} plotOutline - 主線劇情
     * @param {object[]} characters - 角色列表
     * @returns {Promise<string[]>} - 選項陣列
     */
    async generateStoryOptions(chapterContent, worldSetting, plotOutline, characters) {
        const characterNames = characters.map(c => c.name).join('、');

        const prompt = `根據以下小說章節的結尾，請生成 4 個可能的下一章劇情走向選項。

## 世界觀設定
${worldSetting || '（無特定設定）'}

## 主線劇情
${plotOutline || '（無特定主線）'}

## 主要角色
${characterNames || '（無特定角色）'}

## 當前章節結尾（最後 1500 字）
${chapterContent.slice(-1500)}

## 要求
請生成 4 個不同方向的劇情選項，每個選項用一句話描述（20-40字），要有：
1. 一個主線推進的選項
2. 一個角色發展/互動的選項
3. 一個意外/轉折的選項
4. 一個輕鬆/日常的選項

請用以下 JSON 格式回覆，不要有其他文字：
["選項1", "選項2", "選項3", "選項4"]`;

        try {
            const response = await this.generateText(prompt, {
                temperature: 0.9,
                maxTokens: 500
            });

            // 解析 JSON
            const jsonMatch = response.match(/\[[\s\S]*?\]/);
            if (jsonMatch) {
                const options = JSON.parse(jsonMatch[0]);
                if (Array.isArray(options) && options.length > 0) {
                    return options;
                }
            }

            // 如果解析失敗，返回預設選項
            return this.getDefaultOptions();
        } catch (e) {
            console.error('Generate options error:', e);
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
