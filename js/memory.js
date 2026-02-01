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
        // 寫作模式說明
        this.writingModes = {
            "普通模式": `平衡推動劇情與角色發展。
- 合理分配敘事、對話、描寫的比例
- 適當交代場景與背景資訊
- 保持穩定的敘事節奏`,
            "重甜模式": `專注於戀愛氛圍與親密互動。
- 細膩描寫角色間的眼神交流、小動作、肢體接觸
- 營造心動、臉紅、心跳加速的氛圍
- 對話要有曖昧感和情愫暗流
- 善用內心獨白表現角色的悸動`,
            "熱血模式": `專注於戰鬥場景與緊張氛圍。
- 使用短句和快節奏描寫動作場面
- 詳細描繪招式、技能、戰鬥策略
- 營造緊迫感、壓迫感、腎上腺素飆升的氛圍
- 強調力量碰撞、速度感、戰鬥意志`,
            "催淚模式": `專注於情感渲染與悲傷氛圍。
- 深入描寫角色的內心痛苦與掙扎
- 善用回憶、對比手法加強情感衝擊
- 細膩描繪眼淚、哽咽、無力感等情緒表現
- 營造離別、失去、遺憾的氛圍`
        };
    }

    /**
     * 構建生成 Prompt
     * @param {string} projectId - 項目 ID
     * @param {string} userPrompt - 用戶提示
     * @param {number} nextChapterNumber - 下一章章節號
     * @param {string} writingMode - 寫作模式
     * @returns {Promise<string>} - 完整的 Prompt
     */
    async buildGenerationPrompt(projectId, userPrompt, nextChapterNumber, writingMode = '普通模式') {
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

        // 獲取寫作模式說明
        const modeDescription = this.writingModes[writingMode] || this.writingModes['普通模式'];

        // 組合完整 Prompt
        const prompt = `你是一位專業的網絡小說作家，擅長撰寫引人入勝的長篇故事。請根據以下設定和上下文，續寫故事的下一章。

## 故事設定
${coreSettings}

## 主要角色
${characterSection || '（尚未設定角色）'}

## 之前的情節摘要
${summarySection || '（這是第一章）'}
${retrievedSection ? `\n## 相關的歷史情節（可作為參考）\n${retrievedSection}` : ''}

## 最近的章節內容
${recentSection || '（這是第一章）'}

## 本章劇情方向
${userPrompt || '自由發揮，承接上文自然推進劇情'}

## 寫作模式：${writingMode}
${modeDescription}

---

請續寫第 ${nextChapterNumber} 章，要求如下：

【基本要求】
- 字數約 2000-3000 字
- 以繁體中文撰寫
- 直接輸出章節內容，不要加標題、說明或任何前後綴

【劇情要求】
- 保持角色性格與說話方式的一致性
- 承接前文的伏筆與情節線索
- 章節結尾自然收束，避免強行製造懸念或突發事件
- 劇情發展要合理，不要跳躍或遺漏重要過渡

【寫作技巧】
- 善用「展示而非告知」的手法，透過行動和對話呈現角色特質
- 對話要自然生動，符合角色身份與個性
- 場景描寫要有畫面感，但不過度冗長
- 按照「${writingMode}」的風格要求調整敘事重點與氛圍

第${nextChapterNumber}章正文：`;

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
            // 限制每章的長度，避免 prompt 過長（保留最後部分以維持連貫性）
            const content = ch.content.length > 3000
                ? '...' + ch.content.slice(-3000)
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
