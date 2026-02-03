/**
 * 主應用邏輯
 * 管理路由、頁面切換和事件綁定
 */

class App {
    constructor() {
        // 當前狀態
        this.currentPage = 'home';
        this.currentProject = null;
        this.currentChapter = null;
        this.isGenerating = false;

        // 臨時角色列表（用於設定頁）
        this.tempCharacters = [];
        this.editingProjectId = null;
    }

    /**
     * 初始化應用
     */
    async init() {
        try {
            // 初始化存儲
            await storage.init();
            ui.init();

            // 綁定事件
            this.bindEvents();

            // 檢查 API Key
            if (!geminiAPI.hasApiKey()) {
                setTimeout(() => {
                    ui.toast('請先設定 Gemini API Key', 'warning');
                }, 500);
            }

            // 顯示首頁
            await this.showHome();

        } catch (e) {
            console.error('App init error:', e);
            ui.toast('應用初始化失敗', 'error');
        }
    }

    /**
     * 綁定全局事件
     */
    bindEvents() {
        // 導航按鈕
        document.getElementById('nav-back').addEventListener('click', () => this.handleBack());
        document.getElementById('btn-settings').addEventListener('click', () => this.handleSettingsClick());
        document.getElementById('btn-export').addEventListener('click', () => this.handleExport());

        // 首頁
        document.getElementById('btn-new-project').addEventListener('click', () => this.showSettings(null));
        document.getElementById('btn-export-data').addEventListener('click', () => this.handleExportAllData());
        document.getElementById('import-file-input').addEventListener('change', (e) => this.handleImportData(e));

        // 設定頁
        document.getElementById('project-form').addEventListener('submit', (e) => this.handleSaveProject(e));
        document.getElementById('btn-cancel-settings').addEventListener('click', () => this.handleBack());
        document.getElementById('btn-add-character').addEventListener('click', () => this.showCharacterModal(null));
        document.getElementById('btn-regenerate-memory').addEventListener('click', () => this.handleRegenerateMemory());

        // 角色模態框
        document.getElementById('character-form').addEventListener('submit', (e) => this.handleSaveCharacter(e));
        document.getElementById('btn-cancel-character').addEventListener('click', () => this.hideCharacterModal());

        // 創作頁
        document.getElementById('btn-new-chapter').addEventListener('click', () => this.handleNewChapter());
        document.getElementById('btn-generate').addEventListener('click', () => this.handleGenerate());

        // Enter 鍵生成
        document.getElementById('input-prompt').addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.handleGenerate();
            }
        });

        // 項目網格事件委託
        document.getElementById('project-grid').addEventListener('click', (e) => {
            const card = e.target.closest('.project-card');
            const deleteBtn = e.target.closest('.btn-delete-project');

            if (deleteBtn) {
                e.stopPropagation();
                this.handleDeleteProject(deleteBtn.dataset.id);
            } else if (card) {
                this.openProject(card.dataset.projectId);
            }
        });

        // 角色列表事件委託
        document.getElementById('character-list').addEventListener('click', (e) => {
            const editBtn = e.target.closest('.btn-edit-character');
            const deleteBtn = e.target.closest('.btn-delete-character');

            if (editBtn) {
                e.preventDefault();
                e.stopPropagation();
                this.showCharacterModal(editBtn.dataset.id);
            } else if (deleteBtn) {
                e.preventDefault();
                e.stopPropagation();
                this.handleDeleteCharacter(deleteBtn.dataset.id);
            }
        });

        // 章節列表事件委託
        document.getElementById('chapter-list').addEventListener('click', (e) => {
            const rewriteBtn = e.target.closest('.btn-rewrite-chapter');
            const deleteBtn = e.target.closest('.btn-delete-chapter');
            const item = e.target.closest('.chapter-item');

            if (rewriteBtn) {
                e.preventDefault();
                e.stopPropagation();
                this.handleRewriteChapter(rewriteBtn.dataset.id);
            } else if (deleteBtn) {
                e.preventDefault();
                e.stopPropagation();
                this.handleDeleteChapter(deleteBtn.dataset.id);
            } else if (item) {
                this.selectChapter(item.dataset.chapterId);
            }
        });

        // 劇情選項事件
        document.getElementById('btn-refresh-options').addEventListener('click', () => this.refreshStoryOptions());
        document.getElementById('options-container').addEventListener('click', (e) => {
            const optionBtn = e.target.closest('.story-option');
            if (optionBtn) {
                this.selectStoryOption(optionBtn.dataset.option);
            }
        });
    }

    // ==================== 頁面導航 ====================

    /**
     * 切換頁面
     */
    showPage(pageName) {
        // 隱藏所有頁面
        document.querySelectorAll('.page').forEach(page => {
            page.classList.add('hidden');
        });

        // 顯示目標頁面
        const targetPage = document.getElementById(`page-${pageName}`);
        if (targetPage) {
            targetPage.classList.remove('hidden');
        }

        this.currentPage = pageName;
        this.updateNav();
    }

    /**
     * 更新導航欄
     */
    updateNav() {
        const backBtn = document.getElementById('nav-back');
        const title = document.getElementById('nav-title');
        const exportBtn = document.getElementById('btn-export');

        switch (this.currentPage) {
            case 'home':
                backBtn.classList.add('hidden');
                title.textContent = '小說生成器';
                exportBtn.classList.add('hidden');
                break;
            case 'settings':
                backBtn.classList.remove('hidden');
                title.textContent = this.editingProjectId ? '編輯設定' : '新建作品';
                exportBtn.classList.add('hidden');
                break;
            case 'write':
                backBtn.classList.remove('hidden');
                title.textContent = this.currentProject?.title || '創作';
                exportBtn.classList.remove('hidden');
                break;
            case 'read':
                backBtn.classList.remove('hidden');
                title.textContent = '閱讀模式';
                exportBtn.classList.remove('hidden');
                break;
        }
    }

    /**
     * 返回上一頁
     */
    handleBack() {
        switch (this.currentPage) {
            case 'settings':
            case 'write':
            case 'read':
                this.showHome();
                break;
        }
    }

    // ==================== 首頁 ====================

    /**
     * 顯示首頁
     */
    async showHome() {
        this.currentProject = null;
        this.currentChapter = null;
        this.showPage('home');
        await this.loadProjects();
    }

    /**
     * 載入項目列表
     */
    async loadProjects() {
        const grid = document.getElementById('project-grid');
        const newBtn = document.getElementById('btn-new-project');

        // 清除舊項目（保留新建按鈕）
        const cards = grid.querySelectorAll('.project-card');
        cards.forEach(card => card.remove());

        // 獲取所有項目
        const projects = await storage.getAllProjects();

        // 渲染項目卡片
        for (const project of projects) {
            const card = ui.createProjectCard(project);
            grid.insertBefore(card, newBtn);

            // 異步載入章節數
            storage.getChaptersByProject(project.id).then(chapters => {
                const countEl = card.querySelector('.chapter-count');
                if (countEl) {
                    countEl.textContent = `${chapters.length} 章`;
                }
            });
        }
    }

    /**
     * 打開項目（進入創作頁）
     */
    async openProject(projectId) {
        const project = await storage.getProject(projectId);
        if (!project) {
            ui.toast('找不到項目', 'error');
            return;
        }

        this.currentProject = project;
        this.showPage('write');
        await this.loadWritePage();
    }

    /**
     * 刪除項目
     */
    async handleDeleteProject(projectId) {
        const confirmed = await ui.confirm('確認刪除', '確定要刪除這個作品嗎？所有章節和設定都會被刪除，此操作無法復原。');
        if (!confirmed) return;

        await storage.deleteProject(projectId);
        ui.toast('已刪除', 'success');
        await this.loadProjects();
    }

    // ==================== 設定頁 ====================

    /**
     * 顯示設定頁
     */
    async showSettings(projectId) {
        this.editingProjectId = projectId;
        this.showPage('settings');

        // 清空表單
        document.getElementById('input-title').value = '';
        document.getElementById('input-genre').value = '玄幻';
        document.getElementById('input-world').value = '';
        document.getElementById('input-plot').value = '';

        // 載入角色
        this.tempCharacters = [];

        // 隱藏記憶區塊（新建時）
        document.getElementById('memory-section').classList.add('hidden');

        if (projectId) {
            // 編輯現有項目
            const project = await storage.getProject(projectId);
            if (project) {
                document.getElementById('input-title').value = project.title;
                document.getElementById('input-genre').value = project.genre;
                document.getElementById('input-world').value = project.worldSetting;
                document.getElementById('input-plot').value = project.plotOutline;
            }

            // 載入角色
            this.tempCharacters = await storage.getCharactersByProject(projectId);

            // 載入並顯示記憶（章節摘要）
            await this.loadMemorySection(projectId);
        }

        this.renderCharacterList();
    }

    /**
     * 載入記憶區塊（章節摘要）
     */
    async loadMemorySection(projectId) {
        const memorySection = document.getElementById('memory-section');
        const memoryList = document.getElementById('memory-list');
        const memoryCount = document.getElementById('memory-count');

        // 獲取章節
        const chapters = await storage.getChaptersByProject(projectId);

        if (chapters.length === 0) {
            memorySection.classList.add('hidden');
            return;
        }

        // 顯示記憶區塊
        memorySection.classList.remove('hidden');

        // 統計有摘要的章節數
        const chaptersWithSummary = chapters.filter(ch => ch.summary);
        memoryCount.textContent = `${chaptersWithSummary.length}/${chapters.length} 章有摘要`;

        // 渲染記憶列表
        memoryList.innerHTML = '';

        for (const chapter of chapters) {
            const item = document.createElement('div');
            item.className = 'bg-gray-700 rounded-lg p-3';

            const summary = chapter.summary || '（尚未生成摘要）';
            const hasSummary = !!chapter.summary;

            item.innerHTML = `
                <div class="flex items-center justify-between mb-1">
                    <span class="font-medium text-sm">${chapter.title || '第' + chapter.chapterNumber + '章'}</span>
                    <span class="text-xs ${hasSummary ? 'text-green-400' : 'text-gray-500'}">${hasSummary ? '已記憶' : '未記憶'}</span>
                </div>
                <p class="text-xs text-gray-400 line-clamp-3">${ui.escapeHtml(summary)}</p>
            `;

            memoryList.appendChild(item);
        }
    }

    /**
     * 重新生成所有章節的記憶（摘要）
     */
    async handleRegenerateMemory() {
        if (!this.editingProjectId) {
            ui.toast('找不到項目', 'error');
            return;
        }

        // 檢查 API Key
        if (!geminiAPI.hasApiKey()) {
            const key = await ui.showApiKeyModal();
            if (key) {
                geminiAPI.setApiKey(key);
            } else {
                return;
            }
        }

        const confirmed = await ui.confirm(
            '重新生成記憶',
            '將為所有章節重新生成摘要，這可能需要一些時間。\n\n確定要繼續嗎？'
        );
        if (!confirmed) return;

        const chapters = await storage.getChaptersByProject(this.editingProjectId);
        if (chapters.length === 0) {
            ui.toast('沒有章節需要處理', 'warning');
            return;
        }

        const btn = document.getElementById('btn-regenerate-memory');
        const originalText = btn.innerHTML;
        btn.disabled = true;

        let successCount = 0;
        let errorCount = 0;

        for (let i = 0; i < chapters.length; i++) {
            const chapter = chapters[i];

            // 更新按鈕顯示進度
            btn.innerHTML = `
                <div class="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                處理中 ${i + 1}/${chapters.length}
            `;

            try {
                // 生成摘要
                if (chapter.content && chapter.content.length > 100) {
                    const summary = await geminiAPI.generateSummary(chapter.content);
                    if (summary) {
                        await storage.updateChapter(chapter.id, { summary });
                        successCount++;
                    }
                }

                // 建立向量索引
                await vectorSearch.indexChapter(this.editingProjectId, chapter.id, chapter.content);

                // 避免 API 限制
                await new Promise(resolve => setTimeout(resolve, 1000));

            } catch (e) {
                console.error(`Error processing chapter ${chapter.chapterNumber}:`, e);
                errorCount++;
            }
        }

        // 恢復按鈕
        btn.disabled = false;
        btn.innerHTML = originalText;

        // 重新載入記憶區塊
        await this.loadMemorySection(this.editingProjectId);

        if (errorCount > 0) {
            ui.toast(`完成！成功 ${successCount} 章，失敗 ${errorCount} 章`, 'warning');
        } else {
            ui.toast(`已成功生成 ${successCount} 章的記憶`, 'success');
        }
    }

    /**
     * 渲染角色列表
     */
    renderCharacterList() {
        const list = document.getElementById('character-list');
        list.innerHTML = '';

        if (this.tempCharacters.length === 0) {
            list.innerHTML = '<p class="text-gray-500 text-sm text-center py-4">尚未添加角色</p>';
            return;
        }

        for (const char of this.tempCharacters) {
            const card = ui.createCharacterCard(char);
            list.appendChild(card);
        }
    }

    /**
     * 儲存項目
     */
    async handleSaveProject(e) {
        e.preventDefault();

        const title = document.getElementById('input-title').value.trim();
        const genre = document.getElementById('input-genre').value;
        const worldSetting = document.getElementById('input-world').value.trim();
        const plotOutline = document.getElementById('input-plot').value.trim();

        if (!title) {
            ui.toast('請輸入小說標題', 'warning');
            return;
        }

        try {
            let project;

            if (this.editingProjectId) {
                // 更新現有項目
                project = await storage.updateProject(this.editingProjectId, {
                    title, genre, worldSetting, plotOutline
                });

                // 更新角色（先刪除再新增）
                const oldChars = await storage.getCharactersByProject(this.editingProjectId);
                for (const char of oldChars) {
                    await storage.deleteCharacter(char.id);
                }
                for (const char of this.tempCharacters) {
                    await storage.createCharacter(this.editingProjectId, char);
                }

            } else {
                // 創建新項目
                project = await storage.createProject({
                    title, genre, worldSetting, plotOutline
                });

                // 創建角色
                for (const char of this.tempCharacters) {
                    await storage.createCharacter(project.id, char);
                }
            }

            ui.toast('儲存成功', 'success');
            this.openProject(project.id);

        } catch (e) {
            console.error('Save project error:', e);
            ui.toast('儲存失敗', 'error');
        }
    }

    // ==================== 角色模態框 ====================

    /**
     * 顯示角色編輯模態框
     */
    showCharacterModal(characterId) {
        const modal = document.getElementById('modal-character');
        const title = document.getElementById('character-modal-title');
        const form = document.getElementById('character-form');

        // 重置表單
        form.reset();
        document.getElementById('character-id').value = '';

        if (characterId) {
            // 編輯現有角色
            const char = this.tempCharacters.find(c => c.id === characterId);
            if (char) {
                title.textContent = '編輯角色';
                document.getElementById('character-id').value = char.id;
                document.getElementById('char-name').value = char.name;
                document.getElementById('char-personality').value = char.personality || '';
                document.getElementById('char-background').value = char.background || '';
                document.getElementById('char-relationships').value = char.relationships || '';
            }
        } else {
            title.textContent = '新增角色';
        }

        modal.classList.remove('hidden');
        modal.classList.add('flex');
        document.getElementById('char-name').focus();
    }

    /**
     * 隱藏角色模態框
     */
    hideCharacterModal() {
        const modal = document.getElementById('modal-character');
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }

    /**
     * 儲存角色
     */
    handleSaveCharacter(e) {
        e.preventDefault();

        const id = document.getElementById('character-id').value;
        const name = document.getElementById('char-name').value.trim();
        const personality = document.getElementById('char-personality').value.trim();
        const background = document.getElementById('char-background').value.trim();
        const relationships = document.getElementById('char-relationships').value.trim();

        if (!name) {
            ui.toast('請輸入角色名稱', 'warning');
            return;
        }

        if (id) {
            // 更新現有角色
            const index = this.tempCharacters.findIndex(c => c.id === id);
            if (index !== -1) {
                this.tempCharacters[index] = {
                    ...this.tempCharacters[index],
                    name, personality, background, relationships
                };
            }
        } else {
            // 新增角色
            this.tempCharacters.push({
                id: 'temp-' + Date.now(),
                name, personality, background, relationships
            });
        }

        this.hideCharacterModal();
        this.renderCharacterList();
    }

    /**
     * 刪除角色
     */
    async handleDeleteCharacter(characterId) {
        const confirmed = await ui.confirm('確認刪除', '確定要刪除這個角色嗎？');
        if (!confirmed) return;

        this.tempCharacters = this.tempCharacters.filter(c => c.id !== characterId);
        this.renderCharacterList();
    }

    // ==================== 創作頁 ====================

    /**
     * 載入創作頁
     */
    async loadWritePage() {
        if (!this.currentProject) return;

        // 載入章節列表
        await this.loadChapterList();

        // 更新統計
        await this.updateStats();

        // 清空內容區
        document.getElementById('chapter-content').innerHTML =
            '<p class="text-gray-500 text-center py-12">選擇一個章節查看內容，或生成新章節</p>';
        document.getElementById('input-prompt').value = '';

        // 隱藏選項區域
        document.getElementById('story-options').classList.add('hidden');
    }

    /**
     * 載入章節列表
     */
    async loadChapterList() {
        const list = document.getElementById('chapter-list');
        list.innerHTML = '';

        const chapters = await storage.getChaptersByProject(this.currentProject.id);

        if (chapters.length === 0) {
            list.innerHTML = '<p class="text-gray-500 text-sm text-center py-4">尚無章節</p>';
            return;
        }

        for (const chapter of chapters) {
            const item = ui.createChapterItem(chapter, chapter.id === this.currentChapter?.id);
            list.appendChild(item);
        }
    }

    /**
     * 選擇章節
     */
    async selectChapter(chapterId) {
        const chapter = await storage.getChapter(chapterId);
        if (!chapter) return;

        this.currentChapter = chapter;

        // 更新列表高亮和顯示操作按鈕
        document.querySelectorAll('.chapter-item').forEach(item => {
            const isActive = item.dataset.chapterId === chapterId;
            item.classList.toggle('active', isActive);
            // 顯示/隱藏操作按鈕
            const actions = item.querySelector('.chapter-actions');
            if (actions) {
                actions.classList.toggle('hidden', !isActive);
                actions.classList.toggle('flex', isActive);
            }
        });

        // 顯示內容
        const contentEl = document.getElementById('chapter-content');
        contentEl.innerHTML = `
            <h2 class="text-xl font-bold mb-4">${chapter.title || `第${chapter.chapterNumber}章`}</h2>
            ${ui.formatContent(chapter.content)}
        `;

        // 隱藏選項區域（查看舊章節時）
        document.getElementById('story-options').classList.add('hidden');
    }

    /**
     * 刪除章節
     */
    async handleDeleteChapter(chapterId) {
        const chapter = await storage.getChapter(chapterId);
        if (!chapter) return;

        const confirmed = await ui.confirm(
            '確認刪除',
            `確定要刪除「${chapter.title || '第' + chapter.chapterNumber + '章'}」嗎？\n\n⚠️ 章節內容將被刪除\n⚠️ 該章節的記憶也會被清除\n⚠️ 此操作無法復原\n\n💡 提示：如果只是不喜歡內容，建議使用「重寫」功能`
        );
        if (!confirmed) return;

        try {
            await storage.deleteChapter(chapterId);
            ui.toast('章節已刪除', 'success');

            // 如果刪除的是當前章節，清空顯示
            if (this.currentChapter?.id === chapterId) {
                this.currentChapter = null;
                document.getElementById('chapter-content').innerHTML =
                    '<p class="text-gray-500 text-center py-12">選擇一個章節查看內容，或生成新章節</p>';
            }

            // 重新載入章節列表
            await this.loadChapterList();
            await this.updateStats();
        } catch (e) {
            console.error('Delete chapter error:', e);
            ui.toast('刪除失敗', 'error');
        }
    }

    /**
     * 重寫章節
     */
    async handleRewriteChapter(chapterId) {
        const chapter = await storage.getChapter(chapterId);
        if (!chapter) return;

        const confirmed = await ui.confirm(
            '確認重寫',
            `確定要重寫「${chapter.title || '第' + chapter.chapterNumber + '章'}」嗎？\n\n⚠️ 原內容將被覆蓋\n✓ 章節編號保持不變\n✓ 記憶會重新建立（不會遺失整體劇情脈絡）`
        );
        if (!confirmed) return;

        // 設置為當前章節並準備重寫
        this.currentChapter = chapter;
        this.rewritingChapter = chapter;

        // 用原來的提示填充輸入框
        const promptInput = document.getElementById('input-prompt');
        promptInput.value = chapter.prompt || '';
        promptInput.placeholder = '輸入新的章節提示，或留空使用原提示...';
        promptInput.focus();

        // 更新生成按鈕文字
        const generateBtn = document.getElementById('btn-generate');
        generateBtn.innerHTML = `
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
            </svg>
            重寫章節
        `;

        // 顯示提示
        document.getElementById('chapter-content').innerHTML = `
            <div class="text-center py-12">
                <div class="text-yellow-400 mb-4">
                    <svg class="w-12 h-12 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                    </svg>
                    準備重寫：${chapter.title || '第' + chapter.chapterNumber + '章'}
                </div>
                <p class="text-gray-400 mb-2">輸入新的章節提示後點擊「重寫章節」</p>
                <p class="text-gray-500 text-sm">原提示：${chapter.prompt || '（無）'}</p>
            </div>
        `;

        ui.toast('請輸入新的章節提示', 'info');
    }

    /**
     * 新增章節
     */
    handleNewChapter() {
        this.currentChapter = null;
        this.rewritingChapter = null;

        // 取消選中
        document.querySelectorAll('.chapter-item').forEach(item => {
            item.classList.remove('active');
            // 隱藏操作按鈕
            const actions = item.querySelector('.chapter-actions');
            if (actions) {
                actions.classList.add('hidden');
                actions.classList.remove('flex');
            }
        });

        // 清空內容區，顯示提示
        document.getElementById('chapter-content').innerHTML =
            '<p class="text-gray-500 text-center py-12">輸入本章提示，然後點擊「生成章節」</p>';

        // 隱藏選項區域
        document.getElementById('story-options').classList.add('hidden');

        // 重置輸入框和按鈕
        document.getElementById('input-prompt').value = '';
        document.getElementById('input-prompt').placeholder = '例：主角在森林中遇到神秘老人，獲得傳承...';
        this.resetGenerateButton();

        // 聚焦輸入框
        document.getElementById('input-prompt').focus();
    }

    /**
     * 生成章節
     */
    async handleGenerate() {
        if (this.isGenerating) return;

        // 檢查 API Key
        if (!geminiAPI.hasApiKey()) {
            const key = await ui.showApiKeyModal();
            if (key) {
                geminiAPI.setApiKey(key);
                ui.toast('API Key 已儲存', 'success');
            } else {
                return;
            }
        }

        const isRewriting = !!this.rewritingChapter;
        const prompt = document.getElementById('input-prompt').value.trim() ||
                       (isRewriting ? this.rewritingChapter.prompt : '');

        const chapters = await storage.getChaptersByProject(this.currentProject.id);
        const chapterNumber = isRewriting ? this.rewritingChapter.chapterNumber : chapters.length + 1;

        this.isGenerating = true;
        ui.setGenerating(true);

        // 清空內容區
        const contentEl = document.getElementById('chapter-content');
        const statusText = isRewriting ? '重寫中' : '生成中';
        contentEl.innerHTML = `<h2 class="text-xl font-bold mb-4">第${chapterNumber}章 <span class="text-sm text-yellow-400">(${statusText}...)</span></h2><div id="streaming-content" class="typing-cursor"></div>`;
        const streamingEl = document.getElementById('streaming-content');

        try {
            // 獲取寫作模式
            const writingMode = document.getElementById('select-writing-mode').value;

            // 構建 Prompt
            const fullPrompt = await memoryManager.buildGenerationPrompt(
                this.currentProject.id,
                prompt,
                chapterNumber,
                writingMode
            );

            // 串流生成
            let generatedContent = '';
            await geminiAPI.generateTextStream(fullPrompt, (chunk) => {
                generatedContent += chunk;
                streamingEl.innerHTML = ui.formatContent(generatedContent);
                // 滾動到底部
                document.getElementById('content-area').scrollTop =
                    document.getElementById('content-area').scrollHeight;
            });

            // 移除打字游標
            streamingEl.classList.remove('typing-cursor');

            let chapter;
            if (isRewriting) {
                // 更新現有章節
                chapter = await storage.updateChapter(this.rewritingChapter.id, {
                    content: generatedContent,
                    prompt: prompt,
                    summary: '' // 清空摘要，稍後重新生成
                });
                ui.toast('章節重寫完成', 'success');
            } else {
                // 創建新章節
                chapter = await storage.createChapter(this.currentProject.id, {
                    chapterNumber: chapterNumber,
                    title: `第${chapterNumber}章`,
                    content: generatedContent,
                    prompt: prompt
                });
                ui.toast('章節生成完成', 'success');
            }

            this.currentChapter = chapter;
            this.rewritingChapter = null;

            // 恢復生成按鈕文字
            this.resetGenerateButton();

            // 後台處理（生成摘要和向量）
            memoryManager.processNewChapter(this.currentProject.id, chapter)
                .then(() => this.updateStats())
                .catch(e => console.error('Process chapter error:', e));

            // 更新章節列表
            await this.loadChapterList();
            await this.updateStats();

            // 清空輸入框
            document.getElementById('input-prompt').value = '';
            document.getElementById('input-prompt').placeholder = '例：主角在森林中遇到神秘老人，獲得傳承...';

            // 更新內容顯示（移除狀態文字）
            contentEl.innerHTML = `
                <h2 class="text-xl font-bold mb-4">${chapter.title || '第' + chapter.chapterNumber + '章'}</h2>
                ${ui.formatContent(chapter.content)}
            `;

            // 生成下一章劇情選項
            this.generateStoryOptions(generatedContent);

        } catch (e) {
            console.error('Generate error:', e);
            ui.toast('生成失敗：' + e.message, 'error');
            contentEl.innerHTML = '<p class="text-red-400 text-center py-12">生成失敗，請重試</p>';
            this.rewritingChapter = null;
            this.resetGenerateButton();
        } finally {
            this.isGenerating = false;
            ui.setGenerating(false);
        }
    }

    /**
     * 重置生成按鈕
     */
    resetGenerateButton() {
        const generateBtn = document.getElementById('btn-generate');
        generateBtn.innerHTML = `
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
            </svg>
            生成章節
        `;
    }

    /**
     * 生成劇情選項
     */
    async generateStoryOptions(chapterContent) {
        const optionsContainer = document.getElementById('options-container');
        const optionsLoading = document.getElementById('options-loading');
        const storyOptions = document.getElementById('story-options');

        // 顯示選項區域和載入狀態
        storyOptions.classList.remove('hidden');
        optionsContainer.innerHTML = '';
        optionsLoading.classList.remove('hidden');
        optionsLoading.innerHTML = `
            <div class="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin mr-2"></div>
            正在生成選項...
        `;

        try {
            // 獲取角色
            const characters = await storage.getCharactersByProject(this.currentProject.id);

            console.log('Generating story options...');

            // 生成選項
            const options = await geminiAPI.generateStoryOptions(
                chapterContent,
                this.currentProject.worldSetting,
                this.currentProject.plotOutline,
                characters
            );

            console.log('Generated options:', options);

            // 渲染選項按鈕
            optionsLoading.classList.add('hidden');

            // 檢查是否為預設選項
            const defaultOptions = geminiAPI.getDefaultOptions();
            const isDefault = options.length === defaultOptions.length &&
                options.every((opt, i) => opt === defaultOptions[i]);

            if (isDefault) {
                ui.toast('選項生成失敗，顯示預設選項（查看 Console 了解詳情）', 'warning');
            }

            this.renderStoryOptions(options);

        } catch (e) {
            console.error('Generate options error:', e);
            optionsLoading.classList.add('hidden');

            // 顯示錯誤訊息在選項區域
            optionsContainer.innerHTML = `
                <div class="col-span-2 text-center py-4 text-red-400">
                    <p class="mb-2">選項生成失敗：${e.message}</p>
                    <button onclick="app.generateStoryOptions(app.currentChapter.content)" class="text-sm text-primary hover:underline">點擊重試</button>
                </div>
            `;

            ui.toast('選項生成失敗：' + e.message, 'error');
        }
    }

    /**
     * 渲染劇情選項按鈕
     */
    renderStoryOptions(options) {
        const container = document.getElementById('options-container');
        container.innerHTML = '';

        options.forEach((option, index) => {
            const btn = document.createElement('button');
            btn.className = 'story-option bg-gray-700 hover:bg-gray-600 border border-gray-600 hover:border-primary rounded-lg px-4 py-3 text-left text-sm transition-all';
            btn.dataset.option = option;
            btn.innerHTML = `
                <span class="inline-block w-6 h-6 rounded-full bg-primary/20 text-primary text-xs font-bold mr-2 text-center leading-6">${index + 1}</span>
                ${option}
            `;
            container.appendChild(btn);
        });

        // 添加「自己輸入」選項
        const customBtn = document.createElement('button');
        customBtn.className = 'story-option bg-gray-800 hover:bg-gray-700 border border-dashed border-gray-600 hover:border-primary rounded-lg px-4 py-3 text-left text-sm transition-all text-gray-400';
        customBtn.dataset.option = '__custom__';
        customBtn.innerHTML = `
            <span class="inline-block w-6 h-6 rounded-full bg-gray-700 text-gray-400 text-xs mr-2 text-center leading-6">?</span>
            自己輸入其他劇情...
        `;
        container.appendChild(customBtn);
    }

    /**
     * 選擇劇情選項
     */
    selectStoryOption(option) {
        const inputPrompt = document.getElementById('input-prompt');

        if (option === '__custom__') {
            // 自己輸入，聚焦輸入框
            inputPrompt.value = '';
            inputPrompt.focus();
        } else {
            // 填入選項並自動開始生成
            inputPrompt.value = option;
            this.handleGenerate();
        }
    }

    /**
     * 重新生成選項
     */
    async refreshStoryOptions() {
        if (!this.currentChapter) {
            ui.toast('請先生成一個章節', 'warning');
            return;
        }

        await this.generateStoryOptions(this.currentChapter.content);
    }

    /**
     * 更新統計
     */
    async updateStats() {
        if (!this.currentProject) return;
        const stats = await memoryManager.getMemoryStats(this.currentProject.id);
        ui.updateStats(stats);
    }

    // ==================== 其他功能 ====================

    /**
     * 處理設定按鈕點擊
     */
    async handleSettingsClick() {
        if (this.currentPage === 'write' && this.currentProject) {
            // 在創作頁時，進入項目設定
            this.showSettings(this.currentProject.id);
        } else {
            // 在首頁時，顯示 API Key 設定
            const key = await ui.showApiKeyModal();
            if (key) {
                geminiAPI.setApiKey(key);
                ui.toast('API Key 已儲存', 'success');
            }
        }
    }

    /**
     * 處理匯出
     */
    async handleExport() {
        if (!this.currentProject) return;

        const format = await this.showExportOptions();
        if (format) {
            await ui.exportNovel(this.currentProject.id, format);
        }
    }

    /**
     * 顯示匯出選項
     */
    showExportOptions() {
        return new Promise((resolve) => {
            const options = ['txt', 'md'];
            const selected = window.confirm('匯出為 Markdown 格式？\n\n確定 = Markdown (.md)\n取消 = 純文字 (.txt)');
            resolve(selected ? 'md' : 'txt');
        });
    }

    // ==================== 數據備份 ====================

    /**
     * 匯出所有數據
     */
    async handleExportAllData() {
        try {
            ui.toast('正在匯出數據...', 'info');

            const data = await storage.exportAllData();

            if (data.projects.length === 0) {
                ui.toast('沒有可匯出的數據', 'warning');
                return;
            }

            // 創建下載
            const json = JSON.stringify(data, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `story-generator-backup-${new Date().toISOString().slice(0, 10)}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            ui.toast(`已匯出 ${data.projects.length} 個作品`, 'success');
        } catch (e) {
            console.error('Export error:', e);
            ui.toast('匯出失敗', 'error');
        }
    }

    /**
     * 匯入數據
     */
    async handleImportData(e) {
        const file = e.target.files[0];
        if (!file) return;

        // 重置 input 以便可以重複選擇同一文件
        e.target.value = '';

        try {
            // 使用 FileReader 讀取文件（手機兼容性更好）
            const text = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = () => reject(new Error('無法讀取文件'));
                reader.readAsText(file);
            });

            let data;
            try {
                data = JSON.parse(text);
            } catch (parseError) {
                ui.toast('文件格式錯誤，不是有效的 JSON', 'error');
                return;
            }

            if (!data.projects || !Array.isArray(data.projects)) {
                ui.toast('無效的備份文件格式', 'error');
                return;
            }

            if (data.projects.length === 0) {
                ui.toast('備份文件中沒有作品', 'warning');
                return;
            }

            // 詢問匯入模式
            const merge = await ui.confirm(
                '選擇匯入模式',
                `檔案包含 ${data.projects.length} 個作品。\n\n點擊「確認」= 合併（保留現有數據）\n點擊「取消」= 覆蓋（清空現有數據）`
            );

            ui.toast('正在匯入數據...', 'info');

            const count = await storage.importData(data, merge);

            ui.toast(`已匯入 ${count} 個作品`, 'success');

            // 重新載入首頁
            await this.loadProjects();

        } catch (e) {
            console.error('Import error:', e);
            ui.toast('匯入失敗：' + e.message, 'error');
        }
    }
}

// 初始化應用
const app = new App();
document.addEventListener('DOMContentLoaded', () => app.init());
