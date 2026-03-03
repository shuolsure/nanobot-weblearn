/**
 * 诊断脚本 - 检查方法介绍页面的所有功能
 */

function runDiagnostics() {
    console.log('=== 方法介绍页面诊断 ===\n');
    
    // 1. 检查 methodsData 是否加载
    console.log('1. methodsData 加载检查:');
    console.log('   - methodsData 定义:', typeof methodsData !== 'undefined' ? '✅ 已定义' : '❌ 未定义');
    
    if (typeof methodsData !== 'undefined') {
        console.log('   - 方法数量:', Object.keys(methodsData.methods).length);
        console.log('   - 金字塔层级:', Object.keys(methodsData.pyramid).length);
        console.log('   - 知识图谱节点:', methodsData.knowledgeGraph.nodes.length);
        console.log('   - 知识图谱边:', methodsData.knowledgeGraph.edges.length);
        
        // 检查第一个方法
        const firstMethod = Object.values(methodsData.methods)[0];
        console.log('   - 示例方法:', firstMethod.name, '- Category:', firstMethod.category);
    }
    
    // 2. 检查 DOM 元素
    console.log('\n2. DOM 元素检查:');
    console.log('   - methodGraph:', document.getElementById('methodGraph') ? '✅ 存在' : '❌ 不存在');
    console.log('   - methodsList:', document.getElementById('methodsList') ? '✅ 存在' : '❌ 不存在');
    console.log('   - method-pyramid:', document.querySelector('.method-pyramid') ? '✅ 存在' : '❌ 不存在');
    
    // 3. 检查方法列表渲染
    console.log('\n3. 方法列表渲染检查:');
    const methodsList = document.getElementById('methodsList');
    if (methodsList) {
        console.log('   - 方法列表子元素数量:', methodsList.children.length);
        if (methodsList.children.length > 0) {
            console.log('   - 第一个方法卡片:', methodsList.children[0].querySelector('.method-name')?.textContent || 'N/A');
        }
    }
    
    // 4. 检查知识图谱
    console.log('\n4. 知识图谱检查:');
    const graphContainer = document.getElementById('methodGraph');
    if (graphContainer) {
        const svg = graphContainer.querySelector('svg');
        console.log('   - SVG 元素:', svg ? '✅ 存在' : '❌ 不存在');
        if (svg) {
            const nodes = svg.querySelectorAll('circle');
            const edges = svg.querySelectorAll('line');
            console.log('   - 渲染的节点数:', nodes.length);
            console.log('   - 渲染的边数:', edges.length);
        }
    }
    
    // 5. 检查过滤器
    console.log('\n5. 过滤器检查:');
    const filterBtns = document.querySelectorAll('.method-filters .filter-btn');
    console.log('   - 过滤器按钮数量:', filterBtns.length);
    filterBtns.forEach(btn => {
        console.log(`   - ${btn.textContent}: ${btn.classList.contains('active') ? '✅ 激活' : '⭕ 未激活'}`);
    });
    
    console.log('\n=== 诊断完成 ===');
}

// 在页面加载完成后运行诊断
window.addEventListener('load', () => {
    setTimeout(runDiagnostics, 1000);
});

// 导出函数供控制台调用
window.runDiagnostics = runDiagnostics;
