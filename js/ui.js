/**
 * UI 組件與交互
 * 提供通用的 UI 組件函數
 */

class UI {
    constructor() {
        this.toastContainer = null;
    }

    /**
     * 初始化
     */
    init() {
        this.toastContainer = document.getElementById('toast-container');
    }

    /**
     * 顯示 Toast 通知
     * @param {string} message - 訊息內容
     * @param {string} type - 類型：success, error, warning, info
     * @param {number} duration - 持續時間（毫秒）
     */
    toast(message, type = 'info', duration = 3000) {
        const colors = {
            success: 'bg-green-600',
            error: 'bg-red-600',
            warning: 'bg-yellow-600',
            info: 'bg-blue-600'
        };

        const icons = {
            success: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>',
            error: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>',
            warning: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>',
            info: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>'
        };

        const toast = document.createElement('div');
        toast.className = `toast ${colors[type]} px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 text-white max-w-sm`;
        toast.innerHTML = `
            ${icons[type]}
            <span class="flex-1">${message}</span>
            <button class="opacity-70 hover:opacity-100" onclick="this.parentElement.remove()">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                </svg>
            </button>
        `;

        this.toastContainer.appendChild(toast);

        // 自動移除
        setTimeout(() => {
            toast.classList.add('hiding');
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }

    /**
     * 顯示確認對話框
     * @param {string} title - 標題
     * @param {string} message - 訊息
     * @returns {Promise<boolean>} - 用戶選擇
     */
    confirm(title, message) {
        return new Promise((resolve) => {
            const modal = document.getElementById('modal-confirm');
            const titleEl = document.getElementById('confirm-title');
            const messageEl = document.getElementById('confirm-message');
            const cancelBtn = document.getElementById('btn-confirm-cancel');
            const okBtn = document.getElementById('btn-confirm-ok');

            titleEl.textContent = title;
            messageEl.textContent = message;

            const cleanup = () => {
                modal.classList.add('hidden');
                modal.classList.remove('flex');
                cancelBtn.removeEventListener('click', handleCancel);
                okBtn.removeEventListener('click', handleOk);
            };

            const handleCancel = () => {
                cleanup();
                resolve(false);
            };

            const handleOk = () => {
                cleanup();
                resolve(true);
            };

            cancelBtn.addEventListener('click', handleCancel);
            okBtn.addEventListener('click', handleOk);

            modal.classList.remove('hidden');
            modal.classList.add('flex');
        });
    }

    /**
     * 顯示 API Key 設定對話框
     * @returns {Promise<string|null>} - API Key 或 null
     */
    showApiKeyModal() {
        return new Promise((resolve) => {
            const modal = document.getElementById('modal-apikey');
            const input = document.getElementById('input-apikey');
            const cancelBtn = document.getElementById('btn-cancel-apikey');
            const saveBtn = document.getElementById('btn-save-apikey');

            input.value = geminiAPI.getApiKey() || '';

            const cleanup = () => {
                modal.classList.add('hidden');
                modal.classList.remove('flex');
                cancelBtn.removeEventListener('click', handleCancel);
                saveBtn.removeEventListener('click', handleSave);
            };

            const handleCancel = () => {
                cleanup();
                resolve(null);
            };

            const handleSave = () => {
                const key = input.value.trim();
                if (key) {
                    cleanup();
                    resolve(key);
                } else {
                    ui.toast('請輸入 API Key', 'warning');
                }
            };

            cancelBtn.addEventListener('click', handleCancel);
            saveBtn.addEventListener('click', handleSave);

            modal.classList.remove('hidden');
            modal.classList.add('flex');
            input.focus();
        });
    }

    /**
     * 渲染項目卡片
     * @param {object} project - 項目對象
     * @returns {HTMLElement} - 卡片元素
     */
    createProjectCard(project) {
        const card = document.createElement('div');
        card.className = 'project-card bg-gray-800 rounded-xl p-5 cursor-pointer hover:bg-gray-750 border border-gray-700';
        card.dataset.projectId = project.id;

        const genreColors = {
            '玄幻': 'text-purple-400',
            '都市': 'text-blue-400',
            '仙俠': 'text-cyan-400',
            '科幻': 'text-green-400',
            '歷史': 'text-yellow-400',
            '懸疑': 'text-red-400',
            '言情': 'text-pink-400',
            '奇幻': 'text-indigo-400',
            '其他': 'text-gray-400'
        };

        card.innerHTML = `
            <div class="flex items-start justify-between mb-3">
                <h3 class="font-bold text-lg truncate flex-1">${project.title}</h3>
                <button class="btn-delete-project text-gray-500 hover:text-red-400 p-1" data-id="${project.id}">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                    </svg>
                </button>
            </div>
            <span class="inline-block px-2 py-0.5 rounded text-xs ${genreColors[project.genre] || 'text-gray-400'} bg-gray-700 mb-3">${project.genre}</span>
            <div class="text-sm text-gray-400 chapter-count">載入中...</div>
        `;

        return card;
    }

    /**
     * 渲染角色卡片
     * @param {object} character - 角色對象
     * @returns {HTMLElement} - 卡片元素
     */
    createCharacterCard(character) {
        const card = document.createElement('div');
        card.className = 'character-card bg-gray-700 rounded-lg p-4';
        card.dataset.characterId = character.id;

        // 計算有多少項已填寫
        const hasPersonality = !!character.personality;
        const hasBackground = !!character.background;
        const hasRelationships = !!character.relationships;
        const filledCount = [hasPersonality, hasBackground, hasRelationships].filter(x => x).length;

        card.innerHTML = `
            <div class="flex items-start gap-4 mb-3">
                <div class="w-12 h-12 rounded-full bg-gray-600 flex items-center justify-center text-xl font-bold flex-shrink-0">
                    ${character.name.charAt(0)}
                </div>
                <div class="flex-1 min-w-0">
                    <h4 class="font-semibold mb-1">${character.name}</h4>
                    <div class="flex gap-2 text-xs">
                        <span class="${hasPersonality ? 'text-green-400' : 'text-gray-500'}">性格${hasPersonality ? '✓' : '✗'}</span>
                        <span class="${hasBackground ? 'text-green-400' : 'text-gray-500'}">背景${hasBackground ? '✓' : '✗'}</span>
                        <span class="${hasRelationships ? 'text-green-400' : 'text-gray-500'}">關係${hasRelationships ? '✓' : '✗'}</span>
                    </div>
                </div>
                <div class="flex gap-2">
                    <button type="button" class="btn-edit-character text-gray-400 hover:text-primary p-1" data-id="${character.id}">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                        </svg>
                    </button>
                    <button type="button" class="btn-delete-character text-gray-400 hover:text-red-400 p-1" data-id="${character.id}">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                        </svg>
                    </button>
                </div>
            </div>
            ${character.personality ? `<p class="text-sm text-gray-400 line-clamp-2">${character.personality}</p>` : ''}
        `;

        return card;
    }

    /**
     * 渲染章節項目
     * @param {object} chapter - 章節對象
     * @param {boolean} isActive - 是否為當前選中
     * @returns {HTMLElement} - 項目元素
     */
    createChapterItem(chapter, isActive = false) {
        const item = document.createElement('div');
        item.className = `chapter-item px-3 py-2 rounded-lg cursor-pointer text-sm ${isActive ? 'active' : ''}`;
        item.dataset.chapterId = chapter.id;

        item.innerHTML = `
            <div class="flex items-center justify-between gap-2">
                <span class="truncate flex-1">${chapter.title || `第${chapter.chapterNumber}章`}</span>
                <span class="text-xs text-gray-500">${Math.floor(chapter.content.length / 1000)}k</span>
                <div class="chapter-actions hidden flex gap-1">
                    <button type="button" class="btn-rewrite-chapter p-1 text-gray-400 hover:text-yellow-400" data-id="${chapter.id}" title="重寫">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                        </svg>
                    </button>
                    <button type="button" class="btn-delete-chapter p-1 text-gray-400 hover:text-red-400" data-id="${chapter.id}" title="刪除">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                        </svg>
                    </button>
                </div>
            </div>
        `;

        return item;
    }

    /**
     * 格式化章節內容為 HTML
     * @param {string} content - 原始內容
     * @returns {string} - HTML 字符串
     */
    formatContent(content) {
        if (!content) return '';

        // 將換行轉換為段落
        const paragraphs = content.split(/\n+/).filter(p => p.trim());
        return paragraphs.map(p => `<p>${this.escapeHtml(p.trim())}</p>`).join('');
    }

    /**
     * HTML 轉義
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * 更新狀態欄
     * @param {object} stats - 統計數據
     */
    updateStats(stats) {
        document.getElementById('stat-chapters').textContent = `已寫 ${stats.chapterCount} 章`;
        document.getElementById('stat-memory').textContent = `記憶：${stats.embeddingCount} 段落`;
        document.getElementById('stat-words').textContent = `約 ${Math.floor(stats.totalWords / 1000)}k 字`;
    }

    /**
     * 顯示/隱藏生成狀態
     * @param {boolean} show - 是否顯示
     */
    setGenerating(show) {
        const status = document.getElementById('generation-status');
        const btn = document.getElementById('btn-generate');

        if (show) {
            status.classList.remove('hidden');
            status.classList.add('flex');
            btn.disabled = true;
        } else {
            status.classList.add('hidden');
            status.classList.remove('flex');
            btn.disabled = false;
        }
    }

    /**
     * 匯出小說
     * @param {string} projectId - 項目 ID
     * @param {string} format - 格式：txt 或 md
     */
    async exportNovel(projectId, format = 'txt') {
        const project = await storage.getProject(projectId);
        const chapters = await storage.getChaptersByProject(projectId);

        if (!project || chapters.length === 0) {
            this.toast('沒有可匯出的內容', 'warning');
            return;
        }

        let content = '';

        if (format === 'md') {
            content = `# ${project.title}\n\n`;
            content += `> 類型：${project.genre}\n\n`;

            for (const ch of chapters) {
                content += `## ${ch.title || `第${ch.chapterNumber}章`}\n\n`;
                content += ch.content + '\n\n---\n\n';
            }
        } else {
            content = `${project.title}\n`;
            content += `${'='.repeat(project.title.length * 2)}\n\n`;

            for (const ch of chapters) {
                content += `${ch.title || `第${ch.chapterNumber}章`}\n\n`;
                content += ch.content + '\n\n';
                content += '-'.repeat(40) + '\n\n';
            }
        }

        // 創建下載
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${project.title}.${format}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        this.toast('匯出成功', 'success');
    }
}

// 導出單例
const ui = new UI();
