/**
 * IndexedDB 存儲層
 * 管理 projects, characters, chapters, embeddings 四個表
 */

const DB_NAME = 'StoryGeneratorDB';
const DB_VERSION = 1;

class Storage {
    constructor() {
        this.db = null;
    }

    /**
     * 初始化資料庫
     */
    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // 項目表
                if (!db.objectStoreNames.contains('projects')) {
                    const projectStore = db.createObjectStore('projects', { keyPath: 'id' });
                    projectStore.createIndex('updatedAt', 'updatedAt', { unique: false });
                }

                // 角色表
                if (!db.objectStoreNames.contains('characters')) {
                    const charStore = db.createObjectStore('characters', { keyPath: 'id' });
                    charStore.createIndex('projectId', 'projectId', { unique: false });
                }

                // 章節表
                if (!db.objectStoreNames.contains('chapters')) {
                    const chapterStore = db.createObjectStore('chapters', { keyPath: 'id' });
                    chapterStore.createIndex('projectId', 'projectId', { unique: false });
                    chapterStore.createIndex('projectId_chapterNumber', ['projectId', 'chapterNumber'], { unique: true });
                }

                // 向量表
                if (!db.objectStoreNames.contains('embeddings')) {
                    const embeddingStore = db.createObjectStore('embeddings', { keyPath: 'id' });
                    embeddingStore.createIndex('projectId', 'projectId', { unique: false });
                    embeddingStore.createIndex('chapterId', 'chapterId', { unique: false });
                }
            };
        });
    }

    /**
     * 生成 UUID
     */
    generateId() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    // ==================== 項目操作 ====================

    /**
     * 創建項目
     */
    async createProject(data) {
        const project = {
            id: this.generateId(),
            title: data.title || '未命名',
            genre: data.genre || '其他',
            worldSetting: data.worldSetting || '',
            plotOutline: data.plotOutline || '',
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('projects', 'readwrite');
            const store = tx.objectStore('projects');
            const request = store.add(project);
            request.onsuccess = () => resolve(project);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 更新項目
     */
    async updateProject(id, data) {
        const project = await this.getProject(id);
        if (!project) throw new Error('Project not found');

        const updated = {
            ...project,
            ...data,
            updatedAt: Date.now()
        };

        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('projects', 'readwrite');
            const store = tx.objectStore('projects');
            const request = store.put(updated);
            request.onsuccess = () => resolve(updated);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 獲取項目
     */
    async getProject(id) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('projects', 'readonly');
            const store = tx.objectStore('projects');
            const request = store.get(id);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 獲取所有項目
     */
    async getAllProjects() {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('projects', 'readonly');
            const store = tx.objectStore('projects');
            const index = store.index('updatedAt');
            const request = index.openCursor(null, 'prev');
            const projects = [];

            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    projects.push(cursor.value);
                    cursor.continue();
                } else {
                    resolve(projects);
                }
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 刪除項目（連同相關數據）
     */
    async deleteProject(id) {
        // 刪除相關角色
        const characters = await this.getCharactersByProject(id);
        for (const char of characters) {
            await this.deleteCharacter(char.id);
        }

        // 刪除相關章節
        const chapters = await this.getChaptersByProject(id);
        for (const chapter of chapters) {
            await this.deleteChapter(chapter.id);
        }

        // 刪除相關向量
        await this.deleteEmbeddingsByProject(id);

        // 刪除項目本身
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('projects', 'readwrite');
            const store = tx.objectStore('projects');
            const request = store.delete(id);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    // ==================== 角色操作 ====================

    /**
     * 創建角色
     */
    async createCharacter(projectId, data) {
        const character = {
            id: this.generateId(),
            projectId,
            name: data.name || '未命名角色',
            personality: data.personality || '',
            background: data.background || '',
            relationships: data.relationships || '',
            notes: data.notes || '',
            createdAt: Date.now()
        };

        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('characters', 'readwrite');
            const store = tx.objectStore('characters');
            const request = store.add(character);
            request.onsuccess = () => resolve(character);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 更新角色
     */
    async updateCharacter(id, data) {
        const character = await this.getCharacter(id);
        if (!character) throw new Error('Character not found');

        const updated = { ...character, ...data };

        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('characters', 'readwrite');
            const store = tx.objectStore('characters');
            const request = store.put(updated);
            request.onsuccess = () => resolve(updated);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 獲取角色
     */
    async getCharacter(id) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('characters', 'readonly');
            const store = tx.objectStore('characters');
            const request = store.get(id);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 獲取項目的所有角色
     */
    async getCharactersByProject(projectId) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('characters', 'readonly');
            const store = tx.objectStore('characters');
            const index = store.index('projectId');
            const request = index.getAll(projectId);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 刪除角色
     */
    async deleteCharacter(id) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('characters', 'readwrite');
            const store = tx.objectStore('characters');
            const request = store.delete(id);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    // ==================== 章節操作 ====================

    /**
     * 創建章節
     */
    async createChapter(projectId, data) {
        const chapters = await this.getChaptersByProject(projectId);
        const chapterNumber = data.chapterNumber || chapters.length + 1;

        const chapter = {
            id: this.generateId(),
            projectId,
            chapterNumber,
            title: data.title || `第${chapterNumber}章`,
            content: data.content || '',
            summary: data.summary || '',
            prompt: data.prompt || '',
            createdAt: Date.now()
        };

        // 更新項目時間
        await this.updateProject(projectId, {});

        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('chapters', 'readwrite');
            const store = tx.objectStore('chapters');
            const request = store.add(chapter);
            request.onsuccess = () => resolve(chapter);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 更新章節
     */
    async updateChapter(id, data) {
        const chapter = await this.getChapter(id);
        if (!chapter) throw new Error('Chapter not found');

        const updated = { ...chapter, ...data };

        // 更新項目時間
        await this.updateProject(chapter.projectId, {});

        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('chapters', 'readwrite');
            const store = tx.objectStore('chapters');
            const request = store.put(updated);
            request.onsuccess = () => resolve(updated);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 獲取章節
     */
    async getChapter(id) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('chapters', 'readonly');
            const store = tx.objectStore('chapters');
            const request = store.get(id);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 獲取項目的所有章節
     */
    async getChaptersByProject(projectId) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('chapters', 'readonly');
            const store = tx.objectStore('chapters');
            const index = store.index('projectId');
            const request = index.getAll(projectId);
            request.onsuccess = () => {
                const chapters = request.result;
                chapters.sort((a, b) => a.chapterNumber - b.chapterNumber);
                resolve(chapters);
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 刪除章節
     */
    async deleteChapter(id) {
        const chapter = await this.getChapter(id);
        if (chapter) {
            // 刪除相關向量
            await this.deleteEmbeddingsByChapter(id);
        }

        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('chapters', 'readwrite');
            const store = tx.objectStore('chapters');
            const request = store.delete(id);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    // ==================== 向量操作 ====================

    /**
     * 創建向量記錄
     */
    async createEmbedding(projectId, chapterId, data) {
        const embedding = {
            id: this.generateId(),
            projectId,
            chapterId,
            paragraphIndex: data.paragraphIndex || 0,
            text: data.text || '',
            vector: data.vector || [],
            createdAt: Date.now()
        };

        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('embeddings', 'readwrite');
            const store = tx.objectStore('embeddings');
            const request = store.add(embedding);
            request.onsuccess = () => resolve(embedding);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 獲取項目的所有向量
     */
    async getEmbeddingsByProject(projectId) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('embeddings', 'readonly');
            const store = tx.objectStore('embeddings');
            const index = store.index('projectId');
            const request = index.getAll(projectId);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 刪除章節的所有向量
     */
    async deleteEmbeddingsByChapter(chapterId) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('embeddings', 'readwrite');
            const store = tx.objectStore('embeddings');
            const index = store.index('chapterId');
            const request = index.openCursor(chapterId);

            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    cursor.delete();
                    cursor.continue();
                } else {
                    resolve();
                }
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 刪除項目的所有向量
     */
    async deleteEmbeddingsByProject(projectId) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('embeddings', 'readwrite');
            const store = tx.objectStore('embeddings');
            const index = store.index('projectId');
            const request = index.openCursor(projectId);

            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    cursor.delete();
                    cursor.continue();
                } else {
                    resolve();
                }
            };
            request.onerror = () => reject(request.error);
        });
    }

    // ==================== 統計操作 ====================

    /**
     * 獲取項目統計
     */
    async getProjectStats(projectId) {
        const chapters = await this.getChaptersByProject(projectId);
        const embeddings = await this.getEmbeddingsByProject(projectId);

        let totalWords = 0;
        for (const chapter of chapters) {
            totalWords += chapter.content.length;
        }

        return {
            chapterCount: chapters.length,
            embeddingCount: embeddings.length,
            totalWords
        };
    }

    // ==================== 數據備份 ====================

    /**
     * 匯出所有數據（包含設定）
     */
    async exportAllData() {
        const projects = await this.getAllProjects();
        const allData = {
            version: 2,  // 升級版本號
            exportedAt: Date.now(),
            // 匯出設定（API Key 可選，模型設定必須）
            settings: {
                gemini_api_key: localStorage.getItem('gemini_api_key') || '',
                gemini_model_story: localStorage.getItem('gemini_model_story') || 'gemini-2.5-flash-lite',
                gemini_model_options: localStorage.getItem('gemini_model_options') || 'gemini-2.5-flash-lite',
                gemini_model_memory: localStorage.getItem('gemini_model_memory') || 'gemini-2.5-flash-lite'
            },
            projects: []
        };

        for (const project of projects) {
            const characters = await this.getCharactersByProject(project.id);
            const chapters = await this.getChaptersByProject(project.id);
            const embeddings = await this.getEmbeddingsByProject(project.id);

            allData.projects.push({
                project,
                characters,
                chapters,
                embeddings
            });
        }

        return allData;
    }

    /**
     * 匯入數據
     * @param {object} data - 匯入的數據
     * @param {boolean} merge - 是否合併（true=合併，false=覆蓋）
     * @param {object} options - 匯入選項
     * @returns {object} - 匯入結果詳情
     */
    async importData(data, merge = false, options = {}) {
        if (!data || !data.projects) {
            throw new Error('無效的數據格式');
        }

        const result = {
            projectsImported: 0,
            projectsSkipped: 0,
            settingsImported: false,
            embeddingsImported: 0,
            embeddingsFailed: 0,
            errors: []
        };

        // 匯入設定（如果有且用戶同意）
        if (data.settings && options.importSettings !== false) {
            try {
                // 匯入 API Key（如果有且不為空）
                if (data.settings.gemini_api_key && options.importApiKey !== false) {
                    localStorage.setItem('gemini_api_key', data.settings.gemini_api_key);
                }
                // 匯入模型設定
                if (data.settings.gemini_model_story) {
                    localStorage.setItem('gemini_model_story', data.settings.gemini_model_story);
                }
                if (data.settings.gemini_model_options) {
                    localStorage.setItem('gemini_model_options', data.settings.gemini_model_options);
                }
                if (data.settings.gemini_model_memory) {
                    localStorage.setItem('gemini_model_memory', data.settings.gemini_model_memory);
                }
                result.settingsImported = true;
            } catch (e) {
                console.error('Settings import error:', e);
                result.errors.push('設定匯入失敗');
            }
        }

        // 如果不是合併模式，先清空所有數據
        if (!merge) {
            await this.clearAllData();
        }

        for (const item of data.projects) {
            try {
                // 檢查數據完整性
                if (!item.project || !item.project.id) {
                    console.warn('跳過無效項目');
                    result.errors.push('跳過無效項目');
                    continue;
                }

                // 檢查項目是否已存在
                let existing = null;
                try {
                    existing = await this.getProject(item.project.id);
                } catch (e) {
                    // 忽略錯誤
                }

                if (existing && merge) {
                    // 合併模式下跳過已存在的項目
                    result.projectsSkipped++;
                    continue;
                }

                // 使用單一事務匯入項目相關的所有數據
                const embeddingResult = await this.importProjectData(item);
                result.embeddingsImported += embeddingResult.embeddingsImported;
                result.embeddingsFailed += embeddingResult.embeddingsFailed;

                result.projectsImported++;
            } catch (e) {
                console.error('Import project error:', e);
                result.errors.push(`項目 "${item.project?.title || '未知'}" 匯入失敗`);
            }
        }

        return result;
    }

    /**
     * 匯入單個項目的數據
     * @returns {object} - 匯入結果
     */
    async importProjectData(item) {
        const result = {
            embeddingsImported: 0,
            embeddingsFailed: 0
        };

        // 匯入項目
        await new Promise((resolve, reject) => {
            const tx = this.db.transaction('projects', 'readwrite');
            const store = tx.objectStore('projects');
            const request = store.put(item.project);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });

        // 匯入角色
        if (item.characters && item.characters.length > 0) {
            await new Promise((resolve, reject) => {
                const tx = this.db.transaction('characters', 'readwrite');
                const store = tx.objectStore('characters');
                for (const char of item.characters) {
                    store.put(char);
                }
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
            });
        }

        // 匯入章節
        if (item.chapters && item.chapters.length > 0) {
            await new Promise((resolve, reject) => {
                const tx = this.db.transaction('chapters', 'readwrite');
                const store = tx.objectStore('chapters');
                for (const chapter of item.chapters) {
                    store.put(chapter);
                }
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
            });
        }

        // 匯入向量（記錄成功/失敗數量）
        if (item.embeddings && item.embeddings.length > 0) {
            try {
                await new Promise((resolve, reject) => {
                    const tx = this.db.transaction('embeddings', 'readwrite');
                    const store = tx.objectStore('embeddings');
                    for (const embedding of item.embeddings) {
                        store.put(embedding);
                    }
                    tx.oncomplete = () => resolve();
                    tx.onerror = () => reject(tx.error);
                });
                result.embeddingsImported = item.embeddings.length;
            } catch (e) {
                // 向量匯入失敗，記錄數量
                console.warn('向量匯入失敗，將在生成時重建', e);
                result.embeddingsFailed = item.embeddings.length;
            }
        }

        return result;
    }

    /**
     * 清空所有數據
     */
    async clearAllData() {
        const stores = ['projects', 'characters', 'chapters', 'embeddings'];

        for (const storeName of stores) {
            await new Promise((resolve, reject) => {
                const tx = this.db.transaction(storeName, 'readwrite');
                const store = tx.objectStore(storeName);
                const request = store.clear();
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        }
    }
}

// 導出單例
const storage = new Storage();
