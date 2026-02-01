/**
 * 向量搜索邏輯
 * 實現餘弦相似度計算和 top-k 檢索
 */

class VectorSearch {
    constructor() {
        // 向量快取（減少重複計算）
        this.cache = new Map();
    }

    /**
     * 計算餘弦相似度
     * @param {number[]} a - 向量 A
     * @param {number[]} b - 向量 B
     * @returns {number} - 相似度（-1 到 1）
     */
    cosineSimilarity(a, b) {
        if (!a || !b || a.length !== b.length || a.length === 0) {
            return 0;
        }

        let dotProduct = 0;
        let normA = 0;
        let normB = 0;

        for (let i = 0; i < a.length; i++) {
            dotProduct += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }

        normA = Math.sqrt(normA);
        normB = Math.sqrt(normB);

        if (normA === 0 || normB === 0) {
            return 0;
        }

        return dotProduct / (normA * normB);
    }

    /**
     * 搜索最相似的項目
     * @param {number[]} queryVector - 查詢向量
     * @param {object[]} embeddings - 向量記錄陣列 [{id, vector, text, ...}]
     * @param {number} topK - 返回前 K 個結果
     * @param {number} threshold - 相似度閾值（低於此值不返回）
     * @returns {object[]} - 排序後的結果 [{id, text, similarity, ...}]
     */
    search(queryVector, embeddings, topK = 5, threshold = 0.3) {
        if (!queryVector || queryVector.length === 0 || !embeddings || embeddings.length === 0) {
            return [];
        }

        // 計算所有向量的相似度
        const results = embeddings
            .filter(emb => emb.vector && emb.vector.length > 0)
            .map(emb => ({
                ...emb,
                similarity: this.cosineSimilarity(queryVector, emb.vector)
            }))
            .filter(result => result.similarity >= threshold)
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, topK);

        return results;
    }

    /**
     * 將文本分割成段落
     * @param {string} text - 原始文本
     * @param {number} maxLength - 每段最大長度
     * @param {number} overlap - 重疊字數
     * @returns {string[]} - 段落陣列
     */
    splitIntoParagraphs(text, maxLength = 500, overlap = 50) {
        if (!text) return [];

        // 先按自然段落分割
        const naturalParagraphs = text.split(/\n\n+/).filter(p => p.trim());
        const result = [];

        for (const para of naturalParagraphs) {
            if (para.length <= maxLength) {
                result.push(para.trim());
            } else {
                // 長段落需要進一步分割
                let start = 0;
                while (start < para.length) {
                    let end = start + maxLength;

                    // 嘗試在句號處斷開
                    if (end < para.length) {
                        const lastPeriod = para.lastIndexOf('。', end);
                        const lastQuestion = para.lastIndexOf('？', end);
                        const lastExclaim = para.lastIndexOf('！', end);
                        const breakPoint = Math.max(lastPeriod, lastQuestion, lastExclaim);

                        if (breakPoint > start + maxLength / 2) {
                            end = breakPoint + 1;
                        }
                    }

                    result.push(para.slice(start, end).trim());
                    start = end - overlap;
                    if (start < 0) start = 0;
                }
            }
        }

        return result.filter(p => p.length > 20); // 過濾太短的段落
    }

    /**
     * 為章節建立向量索引
     * @param {string} projectId - 項目 ID
     * @param {string} chapterId - 章節 ID
     * @param {string} content - 章節內容
     */
    async indexChapter(projectId, chapterId, content) {
        // 分割成段落
        const paragraphs = this.splitIntoParagraphs(content);

        // 刪除舊的向量
        await storage.deleteEmbeddingsByChapter(chapterId);

        // 為每個段落生成向量並存儲
        for (let i = 0; i < paragraphs.length; i++) {
            try {
                const text = paragraphs[i];
                const vector = await geminiAPI.generateEmbedding(text);

                if (vector && vector.length > 0) {
                    await storage.createEmbedding(projectId, chapterId, {
                        paragraphIndex: i,
                        text,
                        vector
                    });
                }

                // 避免 API 限制
                await new Promise(resolve => setTimeout(resolve, 200));
            } catch (e) {
                console.error(`Error indexing paragraph ${i}:`, e);
            }
        }
    }

    /**
     * 搜索相關段落
     * @param {string} projectId - 項目 ID
     * @param {string} query - 查詢文本
     * @param {number} topK - 返回前 K 個結果
     * @returns {object[]} - 相關段落
     */
    async searchRelevant(projectId, query, topK = 5) {
        // 生成查詢向量
        const queryVector = await geminiAPI.generateEmbedding(query);
        if (!queryVector || queryVector.length === 0) {
            return [];
        }

        // 獲取項目的所有向量
        const embeddings = await storage.getEmbeddingsByProject(projectId);

        // 執行搜索
        return this.search(queryVector, embeddings, topK);
    }

    /**
     * 清除快取
     */
    clearCache() {
        this.cache.clear();
    }
}

// 導出單例
const vectorSearch = new VectorSearch();
