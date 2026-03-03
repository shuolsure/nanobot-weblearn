/**
 * 演示控制器 - 简化版
 */

class DemoController {
  constructor() {
    this.flowRenderer = null;
    this.currentScenario = null;
    this.currentNodeId = null;
    this.nodeToStepMap = new Map();
  }

  init() {
    console.log('DemoController init...');
    
    // 创建流程图渲染器
    this.flowRenderer = new DemoFlowRenderer('demo-flow-container');
    
    // 初始化场景选择器
    this._initScenarioSelector();
    
    // 加载默认场景
    this.loadScenario('scenario1');
  }

  _initScenarioSelector() {
    const select = document.getElementById('demo-scenario-select');
    if (!select) return;
    
    // 清空现有选项
    select.innerHTML = '';
    
    // 添加场景选项
    Object.keys(demoScenarios).forEach(scenarioId => {
      const scenario = demoScenarios[scenarioId];
      const option = document.createElement('option');
      option.value = scenarioId;
      option.textContent = scenario.title;
      select.appendChild(option);
    });
    
    // 绑定事件
    select.addEventListener('change', (e) => {
      this.loadScenario(e.target.value);
    });
  }

  loadScenario(scenarioId) {
    console.log('Loading:', scenarioId);
    
    const scenario = demoScenarios[scenarioId];
    if (!scenario) {
      console.error('Scenario not found:', scenarioId);
      return;
    }

    this.currentScenario = scenario;
    this.nodeToStepMap = new Map();
    
    // 构建节点映射
    scenario.steps.forEach((step, index) => {
      this.nodeToStepMap.set(step.node, index);
    });
    
    // 更新场景信息
    this._updateScenarioInfo();
    
    // 初始化流程图
    this.flowRenderer.init(scenario, (nodeId) => {
      this._onNodeClick(nodeId);
    });
    
    // 默认选择第一个节点
    setTimeout(() => {
      const firstNodeId = scenario.flowNodes[0].id;
      this._onNodeClick(firstNodeId);
    }, 100);
  }

  _updateScenarioInfo() {
    const info = document.getElementById('demo-scenario-info');
    if (!info) return;

    info.innerHTML = `
      <h3>${this.currentScenario.title}</h3>
      <p class="demo-subtitle">${this.currentScenario.subtitle}</p>
      <p class="demo-description">${this.currentScenario.description}</p>
      <div class="demo-meta">
        <span><i class="fas fa-sitemap"></i> ${this.currentScenario.steps.length} 个步骤</span>
        <span><i class="fas fa-mouse-pointer"></i> 点击流程图中的节点查看详情</span>
      </div>
    `;
  }

  _onNodeClick(nodeId) {
    const stepIndex = this.nodeToStepMap.get(nodeId);
    if (stepIndex === undefined) return;

    const step = this.currentScenario.steps[stepIndex];
    this._updateStepDetails(step, stepIndex);
  }

  _updateStepDetails(step, stepIndex) {
    // 更新标题
    const title = document.getElementById('demo-step-title');
    if (title) {
      title.innerHTML = `
        <i class="fas ${step.icon}" style="color: ${step.color}"></i> 
        ${step.title}
        <span class="step-index">步骤 ${stepIndex + 1}/${this.currentScenario.steps.length}</span>
      `;
    }

    // 更新描述
    const desc = document.getElementById('demo-step-description');
    if (desc) {
      desc.textContent = step.description;
    }

    // 更新代码
    this._updateCodeDisplay(step);
    
    // 更新数据流
    this._updateDataFlowDisplay(step, stepIndex);
    
    // 更新调用栈
    this._updateCallStack(step);
    
    // 更新提示
    this._updateTips(step);
  }

  _updateCodeDisplay(step) {
    const container = document.getElementById('demo-code-container');
    if (!container || !step.code) return;

    const code = step.code;
    container.innerHTML = `
      <div class="code-header">
        <div class="code-file">
          <i class="fas fa-file-code"></i>
          <span>${code.file}</span>
        </div>
        <div class="code-function">
          <span class="function-name">${code.functionName}</span>
          <span class="line-number">Line ${code.line}</span>
        </div>
      </div>
      <div class="code-signature">
        <code>${this._escapeHtml(code.signature || '')}</code>
      </div>
      <div class="code-content-wrapper">
        <pre class="code-content"><code class="language-python">${this._escapeHtml(code.snippet || '')}</code></pre>
      </div>
      <div class="code-explanation">
        <h4><i class="fas fa-lightbulb"></i> 代码解析</h4>
        <div class="explanation-content">${code.explanation || ''}</div>
      </div>
    `;

    if (window.Prism) {
      setTimeout(() => Prism.highlightAllUnder(container), 0);
    }
  }

  _updateDataFlowDisplay(step, stepIndex) {
    const container = document.getElementById('demo-dataflow-container');
    if (!container || !step.dataFlow) return;

    const dataFlow = step.dataFlow;
    const totalSteps = this.currentScenario.steps.length;
    const hasPrevious = stepIndex > 0;
    const hasNext = stepIndex < totalSteps - 1;

    let previousOutput = '';
    if (hasPrevious) {
      const prev = this.currentScenario.steps[stepIndex - 1].dataFlow.output;
      previousOutput = JSON.stringify(prev, null, 2);
    }

    container.innerHTML = `
      ${hasPrevious ? `
        <div class="dataflow-section previous-output">
          <div class="dataflow-label">
            <i class="fas fa-arrow-circle-down"></i> 上一轮输出（本轮输入）
          </div>
          <pre>${this._escapeHtml(previousOutput)}</pre>
        </div>
      ` : ''}
      
      <div class="dataflow-section current-input">
        <div class="dataflow-label">
          <i class="fas fa-sign-in-alt"></i> 本轮输入
        </div>
        <pre>${this._escapeHtml(JSON.stringify(dataFlow.input, null, 2))}</pre>
      </div>
      
      <div class="dataflow-transformation">
        <div class="transform-arrow">
          <i class="fas fa-cog"></i>
          <span>${dataFlow.transformation}</span>
        </div>
      </div>
      
      <div class="dataflow-section current-output">
        <div class="dataflow-label">
          <i class="fas fa-sign-out-alt"></i> 本轮输出
        </div>
        <pre>${this._escapeHtml(JSON.stringify(dataFlow.output, null, 2))}</pre>
      </div>
      
      ${hasNext ? `
        <div class="dataflow-arrow-to-next">
          <i class="fas fa-arrow-circle-right"></i>
          <span>传递给下一步</span>
        </div>
      ` : ''}
    `;
  }

  _updateCallStack(step) {
    const container = document.getElementById('demo-callstack-container');
    if (!container || !step.callStack) return;

    let html = '<div class="callstack-title"><i class="fas fa-layer-group"></i> 调用栈</div>';
    html += '<div class="callstack-list">';
    
    step.callStack.forEach(item => {
      html += `
        <div class="callstack-item level-${item.level}">
          <span class="callstack-level">L${item.level}</span>
          <span class="callstack-method">${item.method}</span>
          <span class="callstack-file">${item.file}</span>
        </div>
      `;
    });
    
    html += '</div>';
    container.innerHTML = html;
  }

  _updateTips(step) {
    const container = document.getElementById('demo-tips-container');
    if (!container || !step.tips) return;

    let html = '<div class="tips-title"><i class="fas fa-lightbulb"></i> 学习提示</div>';
    html += '<ul class="tips-list">';
    
    step.tips.forEach(tip => {
      html += `<li>${tip}</li>`;
    });
    
    html += '</ul>';
    container.innerHTML = html;
  }

  _escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// 初始化
const demoController = new DemoController();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => demoController.init());
} else {
  demoController.init();
}
