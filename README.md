# Nanobot - 异步多通道 AI 机器人框架

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Python 3.10+](https://img.shields.io/badge/python-3.10+-blue.svg)](https://www.python.org/downloads/)
[![Code style: black](https://img.shields.io/badge/code%20style-black-000000.svg)](https://github.com/psf/black)

一个现代化、可扩展的异步 AI 机器人框架，支持多通道消息处理和智能对话管理。

## 🌟 特性亮点

- **🚀 异步架构** - 基于 asyncio 的高性能异步消息处理
- **📱 多通道支持** - 统一管理不同平台的消息来源（CLI、Web、Discord 等）
- **🧠 智能对话** - 支持上下文感知的多轮对话和会话管理
- **🔧 工具集成** - 灵活的工具调用机制，轻松扩展 AI 能力
- **🎯 类型安全** - 完整的类型注解和 Pydantic 数据验证
- **📦 模块化设计** - 清晰的架构，易于理解和扩展

## 📚 在线教程

我们提供了一个**完整的交互式在线教程**，帮助您快速上手：

👉 **[访问在线教程](https://your-username.github.io/nanobot-tutorial/)**

教程包含：
- 项目概述与核心价值
- 核心功能详解
- 系统架构可视化
- 文件夹结构说明
- 代码逐行解析
- 方法介绍与关系图
- 运行演示与流程追踪

## 🏗️ 系统架构

```
┌─────────────┐      ┌──────────────┐      ┌─────────────┐
│  用户输入   │ ───> │  消息总线    │ ───> │  Agent 循环  │
│  (多通道)   │      │  (异步队列)  │      │  (处理核心)  │
└─────────────┘      └──────────────┘      └─────────────┘
                                                 │
                    ┌────────────────────────────┼────────────────────────────┐
                    │                            │                            │
                    v                            v                            v
            ┌───────────────┐           ┌───────────────┐           ┌───────────────┐
            │  会话管理器   │           │  工具分发器   │           │  LLM 生成器   │
            │ (上下文构建)  │           │ (工具调用)    │           │ (AI 回复)     │
            └───────────────┘           └───────────────┘           └───────────────┘
```

## 📦 快速开始

### 安装依赖

```bash
# 克隆项目
git clone https://github.com/your-username/nanobot.git
cd nanobot

# 安装依赖
pip install -r requirements.txt
```

### 运行示例

```python
from nanobot import NanoBot

# 创建机器人实例
bot = NanoBot(
    system_prompt="你是一个有帮助的 AI 助手",
    max_history_length=10
)

# 运行（CLI 模式）
bot.run()
```

### 处理消息

```python
# 发布消息到队列
await bot.message_bus.publish_inbound(
    content="你好，请介绍一下你自己",
    channel="cli",
    chat_id="user123"
)

# 消息会自动经过处理并返回 AI 回复
```

## 📁 项目结构

```
nanobot/
├── agent/              # AI Agent 核心
│   ├── loop.py        # Agent 处理循环
│   └── config.py      # Agent 配置
├── bus/               # 消息总线
│   ├── queue.py       # 异步队列管理
│   └── events.py      # 事件定义
├── session/           # 会话管理
│   ├── manager.py     # 会话管理器
│   └── storage.py     # 会话存储
├── tools/             # 工具系统
│   ├── dispatcher.py  # 工具分发器
│   └── registry.py    # 工具注册表
├── llm/               # LLM 接口
│   └── generator.py   # 文本生成器
└── utils/             # 工具函数
    └── logger.py      # 日志系统
```

## 🔍 核心概念

### 1. 消息总线 (Message Bus)
- 统一处理所有入站和出站消息
- 使用异步队列实现解耦
- 支持多个通道同时运行

### 2. Agent 循环 (Agent Loop)
- 系统的核心处理引擎
- 自动管理会话上下文
- 协调工具调用和 LLM 生成

### 3. 会话管理 (Session Management)
- 维护对话历史
- 自动构建 LLM 上下文
- 支持多个独立会话

### 4. 工具系统 (Tool System)
- 可扩展的工具注册机制
- 自动参数验证
- 支持同步和异步工具

## 📖 文档

详细文档请访问：
- [在线教程](https://your-username.github.io/nanobot-tutorial/)
- [API 文档](docs/api.md)
- [使用指南](docs/guide.md)

## 🛠️ 开发

### 代码格式化

```bash
# 使用 black 格式化代码
black nanobot/

# 使用 flake8 检查代码
flake8 nanobot/
```

### 运行测试

```bash
# 运行单元测试
pytest tests/

# 运行测试覆盖率
pytest --cov=nanobot tests/
```

## 🤝 贡献

欢迎贡献代码！请遵循以下步骤：

1. Fork 本项目
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

## 📝 更新日志

### v1.0.0 (2024-01-01)
- ✨ 初始版本发布
- 🎉 支持异步消息处理
- 🔧 支持工具调用
- 📱 支持多通道

## 👨‍💻 作者

**Your Name**
- GitHub: [@your-username](https://github.com/your-username)
- Email: your.email@example.com

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 🙏 致谢

感谢以下开源项目：
- [Asyncio](https://docs.python.org/3/library/asyncio.html) - Python 异步支持
- [Pydantic](https://docs.pydantic.dev/) - 数据验证
- [Prism.js](https://prismjs.com/) - 代码高亮（教程使用）
- [Font Awesome](https://fontawesome.com/) - 图标库（教程使用）

---

<div align="center">

**⭐ 如果这个项目对你有帮助，请给一个 Star 支持！⭐**

[📚 访问在线教程](https://your-username.github.io/nanobot-tutorial/) | [📖 查看文档](docs/) | [🐛 报告问题](issues)

</div>
