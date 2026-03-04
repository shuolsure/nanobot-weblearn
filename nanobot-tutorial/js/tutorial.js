/**
 * Nanobot 教程 - 交互脚本
 * 处理导航、搜索、进度跟踪等交互功能
 */

// 全局状态
const state = {
    currentSection: 'overview',
    completedSections: new Set(),
    totalSections: 8
};

// DOM 元素
const elements = {
    sidebar: null,
    menuToggle: null,
    closeSidebar: null,
    searchInput: null,
    navItems: null,
    sections: null,
    progressBar: null,
    progressFill: null,
    circleProgress: null,
    progressText: null,
    backToTop: null,
    completionModal: null
};

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM Content Loaded');
    console.log('methodsData defined:', typeof methodsData !== 'undefined');
    if (typeof methodsData !== 'undefined') {
        console.log('methodsData.methods count:', Object.keys(methodsData.methods).length);
    }
    initElements();
    initEventListeners();
    loadProgress();
    updateProgress();
    initCodeHighlight();
    initMethodsPage();
});

// 初始化 DOM 元素引用
function initElements() {
    elements.sidebar = document.getElementById('sidebar');
    elements.menuToggle = document.getElementById('menuToggle');
    elements.closeSidebar = document.getElementById('closeSidebar');
    elements.searchInput = document.getElementById('searchInput');
    elements.navItems = document.querySelectorAll('.nav-item');
    elements.sections = document.querySelectorAll('.section');
    elements.progressBar = document.getElementById('progressBar');
    elements.progressFill = document.getElementById('progressFill');
    elements.circleProgress = document.getElementById('circleProgress');
    elements.progressText = document.getElementById('progressText');
    elements.backToTop = document.getElementById('backToTop');
    elements.completionModal = document.getElementById('completionModal');
}

// 初始化事件监听器
function initEventListeners() {
    // 移动端菜单切换
    elements.menuToggle?.addEventListener('click', () => {
        elements.sidebar.classList.add('active');
    });

    elements.closeSidebar?.addEventListener('click', () => {
        elements.sidebar.classList.remove('active');
    });

    // 导航项点击
    elements.navItems.forEach(item => {
        item.addEventListener('click', () => {
            const section = item.dataset.section;
            navigateTo(section);
        });
    });

    // 搜索功能
    elements.searchInput?.addEventListener('input', handleSearch);

    // 滚动事件
    window.addEventListener('scroll', handleScroll);

    // 点击外部关闭侧边栏
    document.addEventListener('click', (e) => {
        if (window.innerWidth <= 1024) {
            if (!elements.sidebar.contains(e.target) && 
                !elements.menuToggle.contains(e.target)) {
                elements.sidebar.classList.remove('active');
            }
        }
    });

    // 键盘导航
    document.addEventListener('keydown', handleKeyboard);
}

// 导航到指定章节
function navigateTo(sectionId) {
    // 更新状态
    state.currentSection = sectionId;
    
    // 更新导航项
    elements.navItems.forEach(item => {
        item.classList.remove('active');
        if (item.dataset.section === sectionId) {
            item.classList.add('active');
        }
    });

    // 更新章节显示
    elements.sections.forEach(section => {
        section.classList.remove('active');
        if (section.id === sectionId) {
            section.classList.add('active');
        }
    });

    // 标记为已完成
    markSectionCompleted(sectionId);

    // 关闭移动端侧边栏
    if (window.innerWidth <= 1024) {
        elements.sidebar.classList.remove('active');
    }

    // 滚动到顶部
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // 保存进度
    saveProgress();
}

// 标记章节为已完成
function markSectionCompleted(sectionId) {
    state.completedSections.add(sectionId);
    
    elements.navItems.forEach(item => {
        if (item.dataset.section === sectionId) {
            item.classList.add('completed');
        }
    });

    updateProgress();
}

// 更新进度显示
function updateProgress() {
    const completed = state.completedSections.size;
    const percentage = Math.round((completed / state.totalSections) * 100);

    // 更新顶部进度条
    if (elements.progressFill) {
        elements.progressFill.style.width = `${percentage}%`;
    }

    // 更新圆形进度
    if (elements.circleProgress) {
        elements.circleProgress.setAttribute('stroke-dasharray', `${percentage}, 100`);
    }

    // 更新进度文本
    if (elements.progressText) {
        elements.progressText.textContent = `${percentage}%`;
    }
}

// 搜索功能
function handleSearch(e) {
    const query = e.target.value.toLowerCase().trim();
    
    if (!query) {
        // 显示所有导航项
        elements.navItems.forEach(item => {
            item.style.display = 'flex';
        });
        return;
    }

    // 搜索内容
    const searchableContent = {
        'overview': ['项目概述', 'nanobot', 'ai', '代理', '助手', '价值', '新手'],
        'features': ['核心功能', '工具', '渠道', '记忆', '定时', 'telegram', 'whatsapp'],
        'architecture': ['系统架构', '数据流', '模块', '关系', '组件'],
        'folder-structure': ['文件夹', '目录', '结构', '文件', 'agent', 'tools'],
        'code-analysis': ['代码', '解析', 'loop', '工具', '消息', '总线'],
        'quick-start': ['快速开始', '安装', '配置', 'api', 'key', '学习路径']
    };

    elements.navItems.forEach(item => {
        const section = item.dataset.section;
        const keywords = searchableContent[section] || [];
        const text = item.textContent.toLowerCase();
        
        const matches = keywords.some(kw => kw.includes(query)) || text.includes(query);
        item.style.display = matches ? 'flex' : 'none';
    });
}

// 滚动处理
function handleScroll() {
    const scrollY = window.scrollY;

    // 返回顶部按钮
    if (elements.backToTop) {
        if (scrollY > 300) {
            elements.backToTop.classList.add('visible');
        } else {
            elements.backToTop.classList.remove('visible');
        }
    }
}

// 键盘导航
function handleKeyboard(e) {
    const sections = ['overview', 'features', 'architecture', 'folder-structure', 'code-analysis', 'methods', 'demo', 'quick-start'];
    const currentIndex = sections.indexOf(state.currentSection);

    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        if (currentIndex < sections.length - 1) {
            navigateTo(sections[currentIndex + 1]);
        }
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        if (currentIndex > 0) {
            navigateTo(sections[currentIndex - 1]);
        }
    } else if (e.key === 'Escape') {
        if (elements.completionModal?.classList.contains('active')) {
            closeModal();
        }
    }
}

// 手风琴切换
function toggleAccordion(header) {
    const item = header.parentElement;
    const wasActive = item.classList.contains('active');
    
    // 关闭所有其他项
    document.querySelectorAll('.accordion-item').forEach(i => {
        i.classList.remove('active');
    });
    
    // 切换当前项
    if (!wasActive) {
        item.classList.add('active');
    }
}

// 文件夹切换
function toggleFolder(folderItem) {
    folderItem.classList.toggle('expanded');
    event.stopPropagation();
}

// FAQ 切换
function toggleFaq(question) {
    const item = question.parentElement;
    item.classList.toggle('active');
}

// 复制代码
function copyCode(button) {
    const codeBlock = button.closest('.code-block');
    const code = codeBlock.querySelector('code').textContent;
    
    navigator.clipboard.writeText(code).then(() => {
        const originalText = button.innerHTML;
        button.innerHTML = '<i class="fas fa-check"></i> 已复制';
        setTimeout(() => {
            button.innerHTML = originalText;
        }, 2000);
    });
}

// 复制文本
function copyText(text) {
    navigator.clipboard.writeText(text).then(() => {
        showToast('已复制到剪贴板');
    });
}

// 显示提示
function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        bottom: 100px;
        left: 50%;
        transform: translateX(-50%);
        background: #2D3436;
        color: white;
        padding: 12px 24px;
        border-radius: 8px;
        z-index: 3000;
        animation: fadeIn 0.3s ease;
    `;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 2000);
}

// 返回顶部
function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// 完成教程
function completeTutorial() {
    // 标记所有章节为已完成
    const sections = ['overview', 'features', 'architecture', 'folder-structure', 'code-analysis', 'methods', 'demo', 'quick-start'];
    sections.forEach(section => markSectionCompleted(section));
    
    // 显示完成模态框
    elements.completionModal?.classList.add('active');
    
    // 保存进度
    saveProgress();
}

// 关闭模态框
function closeModal() {
    elements.completionModal?.classList.remove('active');
}

// 保存进度到本地存储
function saveProgress() {
    const data = {
        currentSection: state.currentSection,
        completedSections: Array.from(state.completedSections)
    };
    localStorage.setItem('nanobot-tutorial-progress', JSON.stringify(data));
}

// 从本地存储加载进度
function loadProgress() {
    const saved = localStorage.getItem('nanobot-tutorial-progress');
    if (saved) {
        try {
            const data = JSON.parse(saved);
            state.currentSection = data.currentSection || 'overview';
            state.completedSections = new Set(data.completedSections || []);
            
            // 恢复导航状态
            state.completedSections.forEach(section => {
                elements.navItems.forEach(item => {
                    if (item.dataset.section === section) {
                        item.classList.add('completed');
                    }
                });
            });
        } catch (e) {
            console.error('Failed to load progress:', e);
        }
    }
}

// 初始化代码高亮
function initCodeHighlight() {
    // Prism.js 会自动处理，这里可以添加自定义配置
    if (typeof Prism !== 'undefined') {
        Prism.highlightAll();
    }
}

// 添加 CSS 动画
const style = document.createElement('style');
style.textContent = `
    @keyframes fadeIn {
        from { opacity: 0; transform: translateY(-10px); }
        to { opacity: 1; transform: translateY(0); }
    }
    
    @keyframes fadeOut {
        from { opacity: 1; transform: translateY(0); }
        to { opacity: 0; transform: translateY(-10px); }
    }
`;
document.head.appendChild(style);

// 导出全局函数（供 HTML onclick 使用）
window.navigateTo = navigateTo;
window.toggleAccordion = toggleAccordion;
window.toggleFolder = toggleFolder;
window.toggleFaq = toggleFaq;
window.copyCode = copyCode;
window.copyText = copyText;
window.scrollToTop = scrollToTop;
window.completeTutorial = completeTutorial;
window.closeModal = closeModal;

// ==================== 源码查看功能 ====================

// 当前活动的源码标签索引
let currentSourceTabIndex = 0;

// 格式化苏格拉底式提问
function formatSocraticQuestions(text) {
    // 检查是否包含苏格拉底式提问
    if (!text.includes('**苏格拉底式提问**')) {
        return `<p>${text}</p>`;
    }
    
    // 分割文本
    const parts = text.split('\n\n');
    let html = '<div class="socratic-container">';
    
    parts.forEach(part => {
        if (part.includes('**苏格拉底式提问**')) {
            // 提取标题
            html += '<div class="socratic-header">';
            html += '<i class="fas fa-question-circle"></i>';
            html += '<h4>苏格拉底式提问</h4>';
            html += '</div>';
            html += '<div class="socratic-questions">';
            
            // 提取问题
            const lines = part.split('\n');
            let questionNum = 0;
            let currentQuestion = null;
            
            lines.forEach(line => {
                // 匹配问题编号
                const questionMatch = line.match(/^(\d+)\.\s*(.+)/);
                if (questionMatch) {
                    questionNum = questionMatch[1];
                    const questionText = questionMatch[2];
                    
                    // 检查是否有emoji
                    const emojiMatch = questionText.match(/^([\u{1F300}-\u{1F9FF}])\s*\*\*(.+?)\*\*\s*$/u);
                    if (emojiMatch) {
                        // 带emoji的问题标题
                        if (currentQuestion) {
                            html += currentQuestion;
                        }
                        currentQuestion = `
                            <div class="socratic-question">
                                <div class="question-title">
                                    <span class="question-number">${questionNum}</span>
                                    <span class="question-emoji">${emojiMatch[1]}</span>
                                    <span class="question-text">${emojiMatch[2]}</span>
                                </div>
                        `;
                    } else {
                        // 普通问题
                        if (currentQuestion) {
                            html += currentQuestion;
                        }
                        currentQuestion = `
                            <div class="socratic-question">
                                <div class="question-title">
                                    <span class="question-number">${questionNum}</span>
                                    <span class="question-text">${questionText}</span>
                                </div>
                        `;
                    }
                } else if (line.trim().startsWith('→')) {
                    // 答案
                    const answerText = line.trim().substring(1).trim();
                    if (currentQuestion) {
                        currentQuestion += `
                            <div class="question-answer">
                                <i class="fas fa-arrow-right"></i>
                                <span>${answerText}</span>
                            </div>
                        `;
                    }
                }
            });
            
            // 添加最后一个问题
            if (currentQuestion) {
                html += currentQuestion;
            }
            
            html += '</div></div>';
        } else if (part.trim()) {
            // 普通文本
            html += `<p class="socratic-note">${part}</p>`;
        }
    });
    
    html += '</div>';
    return html;
}

// 显示源码模态框
function showSourceCode(codeId) {
    const data = codeData[codeId];
    if (!data) {
        console.error('Source code data not found:', codeId);
        return;
    }

    // 设置标题和文件路径
    document.getElementById('sourceCodeTitle').innerHTML = `<i class="fas fa-code"></i> ${data.title}`;
    document.getElementById('sourceCodeFile').textContent = data.file;
    document.getElementById('sourceCodeDesc').textContent = data.description;

    // 生成标签
    const tabsHeader = document.getElementById('sourceCodeTabsHeader');
    const tabsContent = document.getElementById('sourceCodeTabsContent');
    
    tabsHeader.innerHTML = '';
    tabsContent.innerHTML = '';

    data.sections.forEach((section, index) => {
        // 创建标签按钮
        const tabBtn = document.createElement('button');
        tabBtn.className = `tab-btn ${index === 0 ? 'active' : ''}`;
        tabBtn.textContent = section.name;
        tabBtn.onclick = () => switchSourceTab(index);
        tabsHeader.appendChild(tabBtn);

        // 创建标签内容
        const tabContent = document.createElement('div');
        tabContent.className = `tab-pane ${index === 0 ? 'active' : ''}`;
        tabContent.innerHTML = `
            <div class="code-section">
                <div class="code-explanation">
                    ${formatSocraticQuestions(section.explanation)}
                </div>
                <div class="code-block">
                    <div class="code-header">
                        <span class="code-lang">Python</span>
                        <button class="copy-btn" onclick="copyCode(this)">
                            <i class="fas fa-copy"></i> 复制
                        </button>
                    </div>
                    <pre><code class="language-python">${escapeHtml(section.code)}</code></pre>
                </div>
            </div>
        `;
        tabsContent.appendChild(tabContent);
    });

    // 生成相关文件
    const relatedFiles = document.getElementById('relatedFiles');
    relatedFiles.innerHTML = '';
    if (data.relatedFiles && data.relatedFiles.length > 0) {
        data.relatedFiles.forEach(file => {
            const fileItem = document.createElement('span');
            fileItem.className = 'related-file';
            fileItem.innerHTML = `<i class="fas fa-file-code"></i> ${file}`;
            relatedFiles.appendChild(fileItem);
        });
    }

    // 生成学习提示
    const tipsList = document.getElementById('tipsList');
    tipsList.innerHTML = '';
    if (data.tips && data.tips.length > 0) {
        data.tips.forEach(tip => {
            const li = document.createElement('li');
            li.textContent = tip;
            tipsList.appendChild(li);
        });
    }

    // 显示模态框
    const modal = document.getElementById('sourceCodeModal');
    modal.classList.add('active');
    
    // 禁止背景滚动
    document.body.style.overflow = 'hidden';

    // 重新高亮代码
    if (typeof Prism !== 'undefined') {
        Prism.highlightAll();
    }
}

// 切换源码标签
function switchSourceTab(index) {
    currentSourceTabIndex = index;

    // 更新标签按钮状态
    const tabBtns = document.querySelectorAll('#sourceCodeTabsHeader .tab-btn');
    tabBtns.forEach((btn, i) => {
        btn.classList.toggle('active', i === index);
    });

    // 更新标签内容状态
    const tabPanes = document.querySelectorAll('#sourceCodeTabsContent .tab-pane');
    tabPanes.forEach((pane, i) => {
        pane.classList.toggle('active', i === index);
    });
}

// 关闭源码模态框
function closeSourceCodeModal() {
    const modal = document.getElementById('sourceCodeModal');
    modal.classList.remove('active');
    
    // 恢复背景滚动
    document.body.style.overflow = '';
}

// 跳转到代码解析页面
function navigateToCodeAnalysis() {
    closeSourceCodeModal();
    navigateTo('code-analysis');
}

// HTML 转义函数
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 点击模态框外部关闭
document.addEventListener('click', (e) => {
    const sourceCodeModal = document.getElementById('sourceCodeModal');
    if (e.target === sourceCodeModal) {
        closeSourceCodeModal();
    }
});

// ESC 键关闭源码模态框
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const sourceCodeModal = document.getElementById('sourceCodeModal');
        if (sourceCodeModal && sourceCodeModal.classList.contains('active')) {
            closeSourceCodeModal();
        }
    }
});

// ==================== 方法介绍页面功能 ====================

let currentMethodFilter = 'all';

// 初始化方法介绍页面
function initMethodsPage() {
    console.log('Initializing methods page...');
    if (typeof methodsData === 'undefined') {
        console.error('methodsData is not defined! Make sure methods-data.js is loaded before tutorial.js');
        return;
    }
    console.log('methodsData loaded with', Object.keys(methodsData.methods).length, 'methods');
    renderMethodsList();
    initMethodFilters();
    initKnowledgeGraph();
    console.log('Methods page initialization complete');
}

// 渲染方法列表
function renderMethodsList() {
    const methodsList = document.getElementById('methodsList');
    if (!methodsList || typeof methodsData === 'undefined') {
        console.log('Render methods failed:', { 
            hasMethodsList: !!methodsList, 
            hasMethodsData: typeof methodsData !== 'undefined',
            methodsCount: typeof methodsData !== 'undefined' ? Object.keys(methodsData.methods).length : 0
        });
        return;
    }

    console.log('Rendering methods list with', Object.keys(methodsData.methods).length, 'methods');

    methodsList.innerHTML = '';

    const methods = Object.entries(methodsData.methods);
    
    methods.forEach(([key, method]) => {
        // 根据过滤器筛选
        if (currentMethodFilter !== 'all') {
            const categoryMap = {
                'entry': '系统入口',
                'core': '核心处理',
                'manage': '组件管理',
                'basic': '基础操作'
            };
            if (method.category !== categoryMap[currentMethodFilter]) {
                return;
            }
        }

        const methodCard = document.createElement('div');
        methodCard.className = 'method-card';
        methodCard.onclick = () => showMethodDetail(key);

        const categoryClass = getCategoryClass(method.category);

        methodCard.innerHTML = `
            <div class="method-header">
                <div class="method-title">
                    <span class="method-name">${method.name}</span>
                    <span class="method-category ${categoryClass}">${method.category}</span>
                </div>
            </div>
            <div class="method-signature">${method.signature}</div>
            <div class="method-description">${method.description}</div>
            <div class="method-meta">
                <span><i class="fas fa-file-code"></i> ${method.location}</span>
                <span><i class="fas fa-layer-group"></i> ${method.level}</span>
            </div>
            <div class="method-arrow"><i class="fas fa-chevron-right"></i></div>
        `;

        methodsList.appendChild(methodCard);
    });
    
    console.log('Rendered', methodsList.children.length, 'method cards');
}

// 获取分类样式类
function getCategoryClass(category) {
    const map = {
        '系统入口': 'entry',
        '核心处理': 'core',
        '组件管理': 'manage',
        '基础操作': 'basic'
    };
    return map[category] || '';
}

// 初始化方法过滤器
function initMethodFilters() {
    const filterBtns = document.querySelectorAll('.method-filters .filter-btn');
    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentMethodFilter = btn.dataset.filter;
            renderMethodsList();
        });
    });
}

// 显示方法详情
function showMethodDetail(methodKey) {
    if (typeof methodsData === 'undefined') return;
    
    const method = methodsData.methods[methodKey];
    if (!method) return;

    const modal = document.getElementById('methodModal');
    const title = document.getElementById('methodModalTitle');
    const body = document.getElementById('methodModalBody');

    title.innerHTML = `<i class="fas fa-cube"></i> ${method.name}`;

    // 构建关系部分
    let relationsHtml = '';
    if (method.relations) {
        relationsHtml = `
            <div class="socratic-section">
                <h4><i class="fas fa-project-diagram"></i> 方法关系</h4>
                <div class="method-relations">
                    ${method.relations.calls ? `
                        <div class="relation-item">
                            <h5><i class="fas fa-arrow-right"></i> 调用方法</h5>
                            <ul>${method.relations.calls.map(m => `<li>${m}</li>`).join('')}</ul>
                        </div>
                    ` : ''}
                    ${method.relations.calledBy ? `
                        <div class="relation-item">
                            <h5><i class="fas fa-arrow-left"></i> 被调用</h5>
                            <ul>${method.relations.calledBy.map(m => `<li>${m}</li>`).join('')}</ul>
                        </div>
                    ` : ''}
                    ${method.relations.uses ? `
                        <div class="relation-item">
                            <h5><i class="fas fa-plug"></i> 使用</h5>
                            <ul>${method.relations.uses.map(m => `<li>${m}</li>`).join('')}</ul>
                        </div>
                    ` : ''}
                    ${method.relations.related ? `
                        <div class="relation-item">
                            <h5><i class="fas fa-link"></i> 相关方法</h5>
                            <ul>${method.relations.related.map(m => `<li>${m}</li>`).join('')}</ul>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }

    // 构建步骤部分
    let stepsHtml = '';
    if (method.steps) {
        stepsHtml = `
            <div class="socratic-section">
                <h4><i class="fas fa-list-ol"></i> 执行步骤</h4>
                <ol>
                    ${method.steps.map(step => `<li>${step}</li>`).join('')}
                </ol>
            </div>
        `;
    }

    // 构建类比部分
    let analogyHtml = '';
    if (method.analogy) {
        analogyHtml = `
            <div class="method-analogy">
                <h4><i class="fas fa-lightbulb"></i> 生活类比</h4>
                <p><strong>${method.analogy.title}</strong></p>
                <p>${method.analogy.description}</p>
            </div>
        `;
    }

    // 构建代码示例
    let codeHtml = '';
    if (method.codeExample) {
        codeHtml = `
            <div class="method-code-example">
                <h4><i class="fas fa-code"></i> 代码示例</h4>
                <div class="code-block">
                    <div class="code-header">
                        <span class="code-lang">Python</span>
                        <button class="copy-btn" onclick="copyCode(this)">
                            <i class="fas fa-copy"></i> 复制
                        </button>
                    </div>
                    <pre><code class="language-python">${escapeHtml(method.codeExample)}</code></pre>
                </div>
            </div>
        `;
    }

    // 构建提示部分
    let tipsHtml = '';
    if (method.tips) {
        tipsHtml = `
            <div class="method-tips">
                <h4><i class="fas fa-star"></i> 学习提示</h4>
                <ul>
                    ${method.tips.map(tip => `<li>${tip}</li>`).join('')}
                </ul>
            </div>
        `;
    }

    body.innerHTML = `
        <div class="method-detail">
            <div class="method-detail-header">
                <h3>${method.name}</h3>
                <span class="signature">${method.signature}</span>
            </div>
            
            <div class="socratic-section">
                <h4><i class="fas fa-question-circle"></i> 为什么要定义这个方法？</h4>
                <div class="socratic-question">${method.why.question}</div>
                <div class="socratic-answer">
                    ${method.why.answer.map(ans => `<p>${ans}</p>`).join('')}
                </div>
            </div>

            <div class="socratic-section">
                <h4><i class="fas fa-info-circle"></i> 这个方法的作用是什么？</h4>
                <div class="socratic-answer">
                    ${method.what.description.map(desc => `<p>${desc}</p>`).join('')}
                </div>
            </div>

            ${stepsHtml}
            ${relationsHtml}
            ${analogyHtml}
            ${codeHtml}
            ${tipsHtml}
        </div>
    `;

    modal.classList.add('active');
    document.body.style.overflow = 'hidden';

    // 重新高亮代码
    if (typeof Prism !== 'undefined') {
        Prism.highlightAll();
    }
}

// 关闭方法详情模态框
function closeMethodModal() {
    const modal = document.getElementById('methodModal');
    modal.classList.remove('active');
    document.body.style.overflow = '';
}

// 按层级显示方法
function showMethodsByLevel(level) {
    console.log('showMethodsByLevel called with:', level);
    
    const levelMap = {
        'level1': 'entry',
        'level2': 'core',
        'level3': 'manage',
        'level4': 'basic'
    };
    
    // 更新过滤器
    const filter = levelMap[level];
    if (!filter) {
        console.error('Invalid level:', level);
        return;
    }
    
    currentMethodFilter = filter;
    
    // 更新按钮状态
    const filterBtns = document.querySelectorAll('.method-filters .filter-btn');
    filterBtns.forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.filter === filter) {
            btn.classList.add('active');
            console.log('Activated filter button:', filter);
        }
    });
    
    // 滚动到方法列表
    const methodsList = document.getElementById('methodsList');
    if (methodsList) {
        methodsList.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    
    // 重新渲染列表
    renderMethodsList();
}

// 初始化知识图谱（简化版）
function initKnowledgeGraph() {
    const graphContainer = document.getElementById('methodGraph');
    if (!graphContainer || typeof methodsData === 'undefined') {
        console.log('Knowledge graph init failed:', { graphContainer: !!graphContainer, hasMethodsData: typeof methodsData !== 'undefined' });
        return;
    }

    // 创建 SVG 图谱
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.style.position = 'absolute';
    svg.style.top = '0';
    svg.style.left = '0';

    const width = graphContainer.clientWidth || 800;
    const height = graphContainer.clientHeight || 500;

    // 简化的节点布局
    const nodes = [
        { id: 'run', x: width * 0.5, y: height * 0.1, label: 'run()', color: '#FF6B6B' },
        { id: '_process_event', x: width * 0.3, y: height * 0.35, label: '_process_event()', color: '#4ECDC4' },
        { id: '_build_context', x: width * 0.7, y: height * 0.35, label: '_build_context()', color: '#4ECDC4' },
        { id: 'generate', x: width * 0.5, y: height * 0.6, label: 'generate()', color: '#4ECDC4' },
        { id: 'register', x: width * 0.2, y: height * 0.75, label: 'register()', color: '#667eea' },
        { id: 'get', x: width * 0.4, y: height * 0.75, label: 'get()', color: '#667eea' },
        { id: 'save', x: width * 0.6, y: height * 0.75, label: 'save()', color: '#667eea' },
        { id: 'load', x: width * 0.8, y: height * 0.75, label: 'load()', color: '#667eea' },
        { id: 'put', x: width * 0.3, y: height * 0.9, label: 'put()', color: '#f093fb' },
        { id: 'append', x: width * 0.7, y: height * 0.9, label: 'append()', color: '#f093fb' }
    ];

    // 绘制连接线
    const edges = [
        { from: 'run', to: '_process_event', color: '#4A90E2' },
        { from: '_process_event', to: '_build_context', color: '#4A90E2' },
        { from: '_build_context', to: 'generate', color: '#4A90E2' },
        { from: '_process_event', to: 'register', color: '#F5A623' },
        { from: '_process_event', to: 'get', color: '#F5A623' },
        { from: 'generate', to: 'save', color: '#F5A623' },
        { from: 'save', to: 'load', color: '#7ED321', dashed: true },
        { from: 'register', to: 'put', color: '#F5A623' },
        { from: 'save', to: 'append', color: '#F5A623' }
    ];

    // 绘制边
    edges.forEach(edge => {
        const fromNode = nodes.find(n => n.id === edge.from);
        const toNode = nodes.find(n => n.id === edge.to);
        
        if (fromNode && toNode) {
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', fromNode.x);
            line.setAttribute('y1', fromNode.y + 20);
            line.setAttribute('x2', toNode.x);
            line.setAttribute('y2', toNode.y - 20);
            line.setAttribute('stroke', edge.color);
            line.setAttribute('stroke-width', '2');
            if (edge.dashed) {
                line.setAttribute('stroke-dasharray', '5,5');
            }
            svg.appendChild(line);

            // 箭头
            const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
            const angle = Math.atan2(toNode.y - fromNode.y, toNode.x - fromNode.x);
            const arrowSize = 8;
            const arrowX = toNode.x - Math.cos(angle) * 25;
            const arrowY = toNode.y - Math.sin(angle) * 25;
            
            arrow.setAttribute('points', `
                ${arrowX},${arrowY}
                ${arrowX - arrowSize * Math.cos(angle - Math.PI/6)},${arrowY - arrowSize * Math.sin(angle - Math.PI/6)}
                ${arrowX - arrowSize * Math.cos(angle + Math.PI/6)},${arrowY - arrowSize * Math.sin(angle + Math.PI/6)}
            `);
            arrow.setAttribute('fill', edge.color);
            svg.appendChild(arrow);
        }
    });

    // 绘制节点
    nodes.forEach(node => {
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.style.cursor = 'pointer';
        g.onclick = () => {
            const methodKey = Object.keys(methodsData.methods).find(k => 
                methodsData.methods[k].name === node.label.replace('()', '')
            );
            if (methodKey) showMethodDetail(methodKey);
        };

        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', node.x);
        circle.setAttribute('cy', node.y);
        circle.setAttribute('r', '20');
        circle.setAttribute('fill', node.color);
        circle.setAttribute('filter', 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))');
        g.appendChild(circle);

        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', node.x);
        text.setAttribute('y', node.y + 5);
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('fill', 'white');
        text.setAttribute('font-size', '11');
        text.setAttribute('font-weight', 'bold');
        text.textContent = node.label;
        g.appendChild(text);

        svg.appendChild(g);
    });

    graphContainer.innerHTML = '';
    graphContainer.appendChild(svg);
    
    console.log('Knowledge graph initialized with', nodes.length, 'nodes and', edges.length, 'edges');
}

// 点击模态框外部关闭方法模态框
document.addEventListener('click', (e) => {
    const methodModal = document.getElementById('methodModal');
    if (e.target === methodModal) {
        closeMethodModal();
    }
});

// ESC 键关闭方法模态框
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const methodModal = document.getElementById('methodModal');
        if (methodModal && methodModal.classList.contains('active')) {
            closeMethodModal();
        }
    }
});

// 导出方法相关函数
window.showMethodsByLevel = showMethodsByLevel;
window.showMethodDetail = showMethodDetail;
window.closeMethodModal = closeMethodModal;

// 导出源码相关函数
window.showSourceCode = showSourceCode;
window.switchSourceTab = switchSourceTab;
window.closeSourceCodeModal = closeSourceCodeModal;
window.navigateToCodeAnalysis = navigateToCodeAnalysis;