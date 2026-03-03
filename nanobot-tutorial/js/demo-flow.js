/**
 * 演示流程图渲染组件 - 优化版
 * 采用更合理的 UI 设计，支持点击节点切换
 */

class DemoFlowRenderer {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.svg = null;
    this.nodes = new Map();
    this.edges = new Map();
    this.currentNode = null;
    this.onNodeClick = null;
    
    // UI 配置
    this.config = {
      nodeWidth: 200,
      nodeHeight: 60,
      strokeWidth: 2,
      activeStrokeWidth: 4,
      fontSize: 13,
      labelFontSize: 15
    };
  }

  /**
   * 初始化流程图
   */
  init(scenario, onNodeClick) {
    this.container.innerHTML = '';
    this.nodes.clear();
    this.edges.clear();
    this.onNodeClick = onNodeClick;

    // 创建 SVG
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.setAttribute('width', '100%');
    this.svg.setAttribute('height', '480');
    this.svg.setAttribute('viewBox', '0 0 1100 480');
    this.svg.setAttribute('class', 'demo-flow-svg');
    this.svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    this.container.appendChild(this.svg);

    // 创建箭头和渐变
    this._createDefs();

    // 先绘制边（在节点下方）
    this._drawEdges(scenario.flowEdges);
    
    // 再绘制节点（在边上方）
    this._drawNodes(scenario.flowNodes);

    return this;
  }

  /**
   * 创建 SVG 定义（箭头、阴影）
   */
  _createDefs() {
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    
    // 标准箭头
    const markerNormal = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    markerNormal.setAttribute('id', 'arrowhead-normal');
    markerNormal.setAttribute('markerWidth', '10');
    markerNormal.setAttribute('markerHeight', '7');
    markerNormal.setAttribute('refX', '9');
    markerNormal.setAttribute('refY', '3.5');
    markerNormal.setAttribute('orient', 'auto');
    const polygonNormal = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    polygonNormal.setAttribute('points', '0 0, 10 3.5, 0 7');
    polygonNormal.setAttribute('fill', '#667eea');
    markerNormal.appendChild(polygonNormal);
    defs.appendChild(markerNormal);

    // 高亮箭头
    const markerActive = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    markerActive.setAttribute('id', 'arrowhead-active');
    markerActive.setAttribute('markerWidth', '10');
    markerActive.setAttribute('markerHeight', '7');
    markerActive.setAttribute('refX', '9');
    markerActive.setAttribute('refY', '3.5');
    markerActive.setAttribute('orient', 'auto');
    const polygonActive = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    polygonActive.setAttribute('points', '0 0, 10 3.5, 0 7');
    polygonActive.setAttribute('fill', '#f39c12');
    markerActive.appendChild(polygonActive);
    defs.appendChild(markerActive);

    // 节点阴影滤镜
    const filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
    filter.setAttribute('id', 'node-shadow');
    filter.setAttribute('x', '-20%');
    filter.setAttribute('y', '-20%');
    filter.setAttribute('width', '140%');
    filter.setAttribute('height', '140%');
    
    const feGaussianBlur = document.createElementNS('http://www.w3.org/2000/svg', 'feGaussianBlur');
    feGaussianBlur.setAttribute('in', 'SourceAlpha');
    feGaussianBlur.setAttribute('stdDeviation', '3');
    feGaussianBlur.setAttribute('result', 'blur');
    
    const feOffset = document.createElementNS('http://www.w3.org/2000/svg', 'feOffset');
    feOffset.setAttribute('in', 'blur');
    feOffset.setAttribute('dx', '0');
    feOffset.setAttribute('dy', '2');
    feOffset.setAttribute('result', 'offsetBlur');
    
    const feComponentTransfer = document.createElementNS('http://www.w3.org/2000/svg', 'feComponentTransfer');
    const feFuncA = document.createElementNS('http://www.w3.org/2000/svg', 'feFuncA');
    feFuncA.setAttribute('type', 'linear');
    feFuncA.setAttribute('slope', '0.3');
    feComponentTransfer.appendChild(feFuncA);
    
    const feMerge = document.createElementNS('http://www.w3.org/2000/svg', 'feMerge');
    const feMergeNode1 = document.createElementNS('http://www.w3.org/2000/svg', 'feMergeNode');
    feMergeNode1.setAttribute('in', 'offsetBlur');
    const feMergeNode2 = document.createElementNS('http://www.w3.org/2000/svg', 'feMergeNode');
    feMergeNode2.setAttribute('in', 'SourceGraphic');
    feMerge.appendChild(feMergeNode1);
    feMerge.appendChild(feMergeNode2);
    
    filter.appendChild(feGaussianBlur);
    filter.appendChild(feOffset);
    filter.appendChild(feComponentTransfer);
    filter.appendChild(feMerge);
    defs.appendChild(filter);

    this.svg.appendChild(defs);
  }

  /**
   * 绘制节点
   */
  _drawNodes(nodes) {
    nodes.forEach(nodeData => {
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('class', 'flow-node-group');
      g.setAttribute('transform', `translate(${nodeData.x}, ${nodeData.y})`);
      g.setAttribute('data-node-id', nodeData.id);
      g.style.cursor = 'pointer';

      // 节点背景（圆角矩形）- 白色背景
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('width', this.config.nodeWidth);
      rect.setAttribute('height', this.config.nodeHeight);
      rect.setAttribute('rx', '10');
      rect.setAttribute('ry', '10');
      rect.setAttribute('fill', '#ffffff');
      rect.setAttribute('stroke', '#667eea');
      rect.setAttribute('stroke-width', this.config.strokeWidth);
      rect.setAttribute('class', 'node-rect');

      // 节点标签（居中显示）- 深色文字
      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('x', this.config.nodeWidth / 2);
      label.setAttribute('y', this.config.nodeHeight / 2 + 2);
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('dominant-baseline', 'middle');
      label.setAttribute('fill', '#2c3e50');
      label.setAttribute('font-size', this.config.labelFontSize);
      label.setAttribute('font-weight', 'bold');
      label.setAttribute('class', 'node-label');
      label.textContent = nodeData.label;

      // 状态指示器（右上角小圆点）
      const statusIndicator = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      statusIndicator.setAttribute('cx', this.config.nodeWidth - 10);
      statusIndicator.setAttribute('cy', 10);
      statusIndicator.setAttribute('r', 6);
      statusIndicator.setAttribute('fill', '#667eea');
      statusIndicator.setAttribute('opacity', '0.3');
      statusIndicator.setAttribute('class', 'status-indicator');

      // 组装节点
      g.appendChild(rect);
      g.appendChild(label);
      g.appendChild(statusIndicator);

      // 添加点击事件
      g.addEventListener('click', () => {
        this._handleNodeClick(nodeData.id, g);
      });

      // 添加悬停效果
      g.addEventListener('mouseenter', () => {
        if (this.currentNode !== nodeData.id) {
          rect.setAttribute('filter', 'url(#node-shadow)');
        }
      });
      g.addEventListener('mouseleave', () => {
        if (this.currentNode !== nodeData.id) {
          rect.setAttribute('filter', 'none');
        }
      });

      this.svg.appendChild(g);
      this.nodes.set(nodeData.id, g);
    });
  }

  /**
   * 绘制边
   */
  _drawEdges(edges) {
    edges.forEach((edgeData, index) => {
      const fromNode = this.nodes.get(edgeData.from);
      const toNode = this.nodes.get(edgeData.to);

      if (!fromNode || !toNode) {
        console.warn(`Edge ${index}: nodes not found - from: ${edgeData.from}, to: ${edgeData.to}`);
        return;
      }

      // 计算连接点
      const fromX = parseFloat(fromNode.getAttribute('transform').split('(')[1].split(',')[0]);
      const fromY = parseFloat(fromNode.getAttribute('transform').split('(')[1].split(',')[1]);
      const toX = parseFloat(toNode.getAttribute('transform').split('(')[1].split(',')[0]);
      const toY = parseFloat(toNode.getAttribute('transform').split('(')[1].split(',')[1]);

      // 根据方向确定连接点
      const dx = toX - fromX;
      const dy = toY - fromY;
      
      let x1, y1, x2, y2;
      
      if (Math.abs(dx) > Math.abs(dy)) {
        // 水平方向为主
        if (dx > 0) {
          // 向右：从右侧出发，到左侧
          x1 = fromX + this.config.nodeWidth;
          y1 = fromY + this.config.nodeHeight / 2;
          x2 = toX;
          y2 = toY + this.config.nodeHeight / 2;
        } else {
          // 向左：从左侧出发，到右侧
          x1 = fromX;
          y1 = fromY + this.config.nodeHeight / 2;
          x2 = toX + this.config.nodeWidth;
          y2 = toY + this.config.nodeHeight / 2;
        }
      } else {
        // 垂直方向为主
        if (dy > 0) {
          // 向下：从底部出发，到顶部
          x1 = fromX + this.config.nodeWidth / 2;
          y1 = fromY + this.config.nodeHeight;
          x2 = toX + this.config.nodeWidth / 2;
          y2 = toY;
        } else {
          // 向上：从顶部出发，到底部
          x1 = fromX + this.config.nodeWidth / 2;
          y1 = fromY;
          x2 = toX + this.config.nodeWidth / 2;
          y2 = toY + this.config.nodeHeight;
        }
      }

      // 创建路径组
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('class', 'flow-edge-group');
      
      // 创建路径（使用贝塞尔曲线）
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      
      // 计算控制点
      const controlOffset = Math.max(Math.abs(dx), Math.abs(dy)) * 0.5;
      let d;
      
      if (Math.abs(dx) > Math.abs(dy)) {
        // 水平方向
        d = `M ${x1} ${y1} C ${x1 + controlOffset} ${y1}, ${x2 - controlOffset} ${y2}, ${x2} ${y2}`;
      } else {
        // 垂直方向
        d = `M ${x1} ${y1} C ${x1} ${y1 + controlOffset}, ${x2} ${y2 - controlOffset}, ${x2} ${y2}`;
      }
      
      path.setAttribute('d', d);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', '#667eea');
      path.setAttribute('stroke-width', '3');
      path.setAttribute('class', 'flow-edge');
      
      if (edgeData.style === 'dashed') {
        path.setAttribute('stroke-dasharray', '8,6');
      }

      path.setAttribute('marker-end', 'url(#arrowhead-active)');

      g.appendChild(path);
      this.svg.insertBefore(g, this.svg.firstChild);
      this.edges.set(index, path);
    });
  }

  /**
   * 获取 Font Awesome 图标 Unicode
   */
  _getIconUnicode(iconClass) {
    const iconMap = {
      'fa-comment-dots': '\uf4ad',
      'fa-bus': '\uf207',
      'fa-heartbeat': '\uf21e',
      'fa-random': '\uf074',
      'fa-magic': '\uf0d0',
      'fa-box-open': '\uf49c',
      'fa-brain': '\uf5dc',
      'fa-paper-plane': '\uf1d8'
    };
    return iconMap[iconClass] || '';
  }

  /**
   * 处理节点点击
   */
  _handleNodeClick(nodeId, nodeGroup) {
    // 如果点击的是当前节点，不做任何事
    if (this.currentNode === nodeId) return;

    // 重置之前的高亮
    this._resetAll();

    // 高亮当前节点
    this._highlightNode(nodeGroup, true);

    // 更新当前节点
    this.currentNode = nodeId;

    // 调用回调
    if (this.onNodeClick) {
      this.onNodeClick(nodeId);
    }
  }

  /**
   * 重置所有节点状态
   */
  _resetAll() {
    this.nodes.forEach((nodeGroup, nodeId) => {
      this._highlightNode(nodeGroup, false);
    });
  }

  /**
   * 高亮/取消高亮节点
   */
  _highlightNode(nodeGroup, isHighlighted) {
    const rect = nodeGroup.querySelector('.node-rect');
    const label = nodeGroup.querySelector('.node-label');
    const statusIndicator = nodeGroup.querySelector('.status-indicator');

    if (isHighlighted) {
      // 高亮状态 - 橙色边框 + 阴影
      rect.setAttribute('stroke', '#f39c12');
      rect.setAttribute('stroke-width', '4');
      rect.setAttribute('filter', 'url(#node-shadow)');
      label.setAttribute('fill', '#f39c12');
      statusIndicator.setAttribute('fill', '#f39c12');
      statusIndicator.setAttribute('opacity', '1');
    } else {
      // 正常状态 - 紫色边框
      rect.setAttribute('stroke', '#667eea');
      rect.setAttribute('stroke-width', '2');
      rect.setAttribute('filter', 'none');
      label.setAttribute('fill', '#2c3e50');
      statusIndicator.setAttribute('fill', '#667eea');
      statusIndicator.setAttribute('opacity', '0.3');
    }
  }

  /**
   * 显示指定节点（通过 ID）
   */
  showNode(nodeId) {
    const node = this.nodes.get(nodeId);
    if (node) {
      this._handleNodeClick(nodeId, node);
    }
  }
}

// 导出类
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DemoFlowRenderer;
}
