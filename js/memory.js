/**
 * 記憶管理系統
 * 實現分層記憶架構和智能 Prompt 組合
 */

class MemoryManager {
    constructor() {
        // 最近章節數量（保留完整內容）
        this.recentChapterCount = 2;
        // 向量檢索數量
        this.retrievalCount = 5;
    }

    /**
     * 構建生成 Prompt
     * @param {string} projectId - 項目 ID
     * @param {string} userPrompt - 用戶提示
     * @param {number} nextChapterNumber - 下一章章節號
     * @returns {Promise<string>} - 完整的 Prompt
     */
    async buildGenerationPrompt(projectId, userPrompt, nextChapterNumber) {
        // 獲取項目信息
        const project = await storage.getProject(projectId);
        if (!project) {
            throw new Error('找不到項目');
        }

        // 獲取角色信息
        const characters = await storage.getCharactersByProject(projectId);

        // 獲取所有章節
        const chapters = await storage.getChaptersByProject(projectId);

        // 構建各部分
        const coreSettings = this.buildCoreSettings(project);
        const characterSection = this.buildCharacterSection(characters);
        const summarySection = this.buildSummarySection(chapters);
        const recentSection = this.buildRecentSection(chapters);

        // 向量檢索相關內容
        let retrievedSection = '';
        if (userPrompt && chapters.length > 0) {
            try {
                const relevant = await vectorSearch.searchRelevant(projectId, userPrompt, this.retrievalCount);
                if (relevant.length > 0) {
                    retrievedSection = this.buildRetrievedSection(relevant);
                }
            } catch (e) {
                console.error('Vector search error:', e);
            }
        }

        // 組合完整 Prompt
        const prompt = `你是一位專業的網絡小說作家。請根據以下設定和上下文，續寫故事的下一章。

## 故事設定
${coreSettings}

## 主要角色
${characterSection || '（尚未設定角色）'}

## 之前的情節摘要
${summarySection || '（這是第一章）'}

${retrievedSection ? `## 相關的歷史情節（可作為參考）\n${retrievedSection}\n` : ''}
## 最近的章節內容
${recentSection || '（這是第一章）'}

## 本章提示
${userPrompt || '自由發揮，承接上文繼續推進劇情'}

請續寫第 ${nextChapterNumber} 章（約 2000-3000 字），注意：
1. 保持人物性格一致
2. 劇情要與之前的伏筆呼應
3. 使用生動的描寫和對話
4. 章節結尾自然收束，不要強行添加意外事件或突發狀況
5. 以繁體中文撰寫
6. 直接輸出章節內容，不要加任何說明或標題

第${nextChapterNumber}章`;

        return prompt;
    }

    /**
     * 構建核心設定部分
     */
    buildCoreSettings(project) {
        const parts = [];
        parts.push(`標題：${project.title}`);
        parts.push(`類型：${project.genre}`);

        if (project.worldSetting) {
            parts.push(`\n世界觀：\n${project.worldSetting}`);
        }

        if (project.plotOutline) {
            parts.push(`\n主線劇情：\n${project.plotOutline}`);
        }

        return parts.join('\n');
    }

    /**
     * 構建角色部分
     */
    buildCharacterSection(characters) {
        if (!characters || characters.length === 0) {
            return '';
        }

        return characters.map(char => {
            const parts = [`【${char.name}】`];

            if (char.personality) {
                parts.push(`性格：${char.personality}`);
            }
            if (char.background) {
                parts.push(`背景：${char.background}`);
            }
            if (char.relationships) {
                parts.push(`關係：${char.relationships}`);
            }

            return parts.join('\n');
        }).join('\n\n');
    }

    /**
     * 構建摘要部分（除了最近幾章之外的所有章節）
     */
    buildSummarySection(chapters) {
        if (!chapters || chapters.length <= this.recentChapterCount) {
            return '';
        }

        // 排除最近的章節
        const summaryChapters = chapters.slice(0, -this.recentChapterCount);

        return summaryChapters.map(ch => {
            const summary = ch.summary || this.extractBrief(ch.content);
            return `第${ch.chapterNumber}章：${summary}`;
        }).join('\n\n');
    }

    /**
     * 構建最近章節部分（完整內容）
     */
    buildRecentSection(chapters) {
        if (!chapters || chapters.length === 0) {
            return '';
        }

        // 取最近的章節
        const recentChapters = chapters.slice(-this.recentChapterCount);

        return recentChapters.map(ch => {
            // 限制每章的長度，避免 prompt 過長
            const content = ch.content.length > 3000
                ? ch.content.slice(-3000) + '...'
                : ch.content;

            return `【第${ch.chapterNumber}章】\n${content}`;
        }).join('\n\n---\n\n');
    }

    /**
     * 構建向量檢索結果部分
     */
    buildRetrievedSection(relevant) {
        if (!relevant || relevant.length === 0) {
            return '';
        }

        return relevant.map((item, index) => {
            return `[相關片段 ${index + 1}] (相似度: ${(item.similarity * 100).toFixed(0)}%)\n${item.text}`;
        }).join('\n\n');
    }

    /**
     * 從內容中提取簡要描述（當沒有摘要時使用）
     */
    extractBrief(content) {
        if (!content) return '（無內容）';

        // 取前 200 字
        const brief = content.slice(0, 200);
        if (content.length > 200) {
            return brief + '...';
        }
        return brief;
    }

    /**
     * 處理章節生成完成後的操作
     * @param {string} projectId - 項目 ID
     * @param {object} chapter - 章節對象
     */
    async processNewChapter(projectId, chapter) {
        try {
            // 1. 生成章節摘要
            if (chapter.content.length > 300) {
                const summary = await geminiAPI.generateSummary(chapter.content);
                await storage.updateChapter(chapter.id, { summary });
            }

            // 2. 建立向量索引
            await vectorSearch.indexChapter(projectId, chapter.id, chapter.content);

        } catch (e) {
            console.error('Error processing new chapter:', e);
            // 不阻斷主流程，只記錄錯誤
        }
    }

    /**
     * 獲取記憶統計
     */
    async getMemoryStats(projectId) {
        const chapters = await storage.getChaptersByProject(projectId);
        const embeddings = await storage.getEmbeddingsByProject(projectId);

        let totalWords = 0;
        let summaryCount = 0;

        for (const ch of chapters) {
            totalWords += ch.content.length;
            if (ch.summary) summaryCount++;
        }

        return {
            chapterCount: chapters.length,
            embeddingCount: embeddings.length,
            totalWords,
            summaryCount
        };
    }
}

// 導出單例
const memoryManager = new MemoryManager();
