"""
代理循环模块：核心处理引擎

这是 nanobot 的"心脏"，负责：
1. 从消息总线接收用户消息
2. 构建上下文（历史对话、记忆、技能等）
3. 调用大语言模型（LLM）
4. 执行工具调用
5. 将响应发送回用户

设计思路：
- 采用异步架构，支持高并发处理
- 使用消息总线（bus）解耦消息接收和处理
- 支持多轮对话和工具调用循环
- 集成记忆系统实现长期记忆
"""

# from __future__ 是 Python 的特性导入，允许在当前版本使用未来版本的语法
# annotations 使得类型注解在运行时不会被实际求值，避免循环导入问题
from __future__ import annotations

# asyncio：Python 的异步 I/O 框架，用于编写并发代码
import asyncio
# json：用于处理 JSON 数据的序列化和反序列化
import json
# re：正则表达式模块，用于文本模式匹配
import re
# weakref：弱引用模块，用于创建不增加引用计数的引用，避免内存泄漏
import weakref
# AsyncExitStack：异步上下文管理器栈，用于管理多个异步资源的生命周期
from contextlib import AsyncExitStack
# Path：面向对象的文件路径处理类
from pathlib import Path
# TYPE_CHECKING：类型检查时的特殊常量，用于仅在类型检查时导入类型
# Any, Awaitable, Callable：类型注解工具
from typing import TYPE_CHECKING, Any, Awaitable, Callable

# loguru：第三方日志库，比标准库 logging 更易用
from loguru import logger

# 导入 nanobot 内部模块
# ContextBuilder：上下文构建器，负责组装发送给 LLM 的完整提示
from nanobot.agent.context import ContextBuilder
# MemoryStore：记忆存储，管理长期记忆和历史记录
from nanobot.agent.memory import MemoryStore
# SubagentManager：子代理管理器，用于后台任务执行
from nanobot.agent.subagent import SubagentManager
# CronTool：定时任务工具
from nanobot.agent.tools.cron import CronTool
# 文件系统工具：读取、写入、编辑、列出目录
from nanobot.agent.tools.filesystem import EditFileTool, ListDirTool, ReadFileTool, WriteFileTool
# MessageTool：消息发送工具
from nanobot.agent.tools.message import MessageTool
# ToolRegistry：工具注册表，管理所有可用工具
from nanobot.agent.tools.registry import ToolRegistry
# ExecTool：Shell 命令执行工具
from nanobot.agent.tools.shell import ExecTool
# SpawnTool：子代理启动工具
from nanobot.agent.tools.spawn import SpawnTool
# WebFetchTool, WebSearchTool：网络工具
from nanobot.agent.tools.web import WebFetchTool, WebSearchTool
# InboundMessage, OutboundMessage：消息事件类型
from nanobot.bus.events import InboundMessage, OutboundMessage
# MessageBus：消息总线，负责消息路由
from nanobot.bus.queue import MessageBus
# LLMProvider：大语言模型提供者的基类
from nanobot.providers.base import LLMProvider
# Session, SessionManager：会话管理
from nanobot.session.manager import Session, SessionManager

# TYPE_CHECKING 块内的导入仅在类型检查时执行，运行时不会导入
# 这避免了循环导入问题，同时提供了类型提示
if TYPE_CHECKING:
    from nanobot.config.schema import ChannelsConfig, ExecToolConfig
    from nanobot.cron.service import CronService


class AgentLoop:
    """
    代理循环类：nanobot 的核心处理引擎
    
    这是整个系统的"大脑"，负责协调各个组件完成用户请求的处理。
    
    工作流程：
    1. 接收消息：从消息总线获取用户输入
    2. 构建上下文：组装系统提示、历史对话、记忆、技能等
    3. 调用 LLM：将上下文发送给大语言模型
    4. 处理响应：
       - 如果 LLM 返回文本，直接回复用户
       - 如果 LLM 请求工具调用，执行工具并将结果返回给 LLM
    5. 循环处理：如果需要，继续调用 LLM 直到获得最终响应
    6. 发送响应：将结果发送回用户
    
    设计模式：
    - 使用依赖注入接收外部组件（bus, provider 等）
    - 采用异步架构支持并发处理
    - 使用锁机制保证线程安全
    """
    
    # 工具结果的最大字符数限制，防止过长的工具输出占用过多上下文
    _TOOL_RESULT_MAX_CHARS = 500

    def __init__(
        self,
        bus: MessageBus,                    # 消息总线，用于接收和发送消息
        provider: LLMProvider,              # LLM 提供者，用于调用大语言模型
        workspace: Path,                    # 工作目录，存储会话、记忆等数据
        model: str | None = None,           # 使用的模型名称，如 "gpt-4"
        max_iterations: int = 40,           # 最大工具调用迭代次数，防止无限循环
        temperature: float = 0.1,           # LLM 温度参数，控制输出的随机性
        max_tokens: int = 4096,             # 最大输出 token 数
        memory_window: int = 100,           # 记忆窗口大小，保留的最近消息数
        reasoning_effort: str | None = None,# 推理努力程度（某些模型支持）
        brave_api_key: str | None = None,   # Brave 搜索 API 密钥
        web_proxy: str | None = None,       # 网络代理地址
        exec_config: ExecToolConfig | None = None,  # Shell 执行工具配置
        cron_service: CronService | None = None,    # 定时任务服务
        restrict_to_workspace: bool = False,        # 是否限制只能访问工作目录
        session_manager: SessionManager | None = None,  # 会话管理器
        mcp_servers: dict | None = None,    # MCP 服务器配置
        channels_config: ChannelsConfig | None = None,  # 渠道配置
    ):
        """
        初始化代理循环
        
        参数说明：
        - bus: 消息总线是代理与外部世界通信的桥梁
        - provider: LLM 提供者封装了与不同 AI 模型的交互逻辑
        - workspace: 工作目录用于存储会话历史、记忆、技能等持久化数据
        - model: 指定使用的具体模型，不指定则使用提供者的默认模型
        - max_iterations: 防止 LLM 陷入工具调用死循环的安全限制
        - temperature: 较低的值（如 0.1）使输出更确定，较高的值使输出更随机
        - restrict_to_workspace: 安全特性，限制代理只能操作工作目录内的文件
        """
        # 导入配置模式，用于创建默认配置
        from nanobot.config.schema import ExecToolConfig
        
        # 存储基本配置
        self.bus = bus                                          # 消息总线实例
        self.channels_config = channels_config                  # 渠道配置
        self.provider = provider                                # LLM 提供者实例
        self.workspace = workspace                              # 工作目录路径
        self.model = model or provider.get_default_model()      # 使用的模型（默认使用提供者的默认模型）
        self.max_iterations = max_iterations                    # 最大迭代次数
        self.temperature = temperature                          # 温度参数
        self.max_tokens = max_tokens                            # 最大输出 token 数
        self.memory_window = memory_window                      # 记忆窗口大小
        self.reasoning_effort = reasoning_effort                # 推理努力程度
        self.brave_api_key = brave_api_key                      # Brave API 密钥
        self.web_proxy = web_proxy                              # 网络代理
        self.exec_config = exec_config or ExecToolConfig()      # 执行工具配置（使用默认值）
        self.cron_service = cron_service                        # 定时任务服务
        self.restrict_to_workspace = restrict_to_workspace      # 是否限制工作区

        # 初始化核心组件
        # ContextBuilder: 负责构建发送给 LLM 的完整上下文
        self.context = ContextBuilder(workspace)
        
        # SessionManager: 管理用户会话，存储对话历史
        self.sessions = session_manager or SessionManager(workspace)
        
        # ToolRegistry: 工具注册表，管理所有可用工具
        self.tools = ToolRegistry()
        
        # SubagentManager: 子代理管理器，用于后台任务执行
        # 子代理是独立的代理实例，可以并行处理任务
        self.subagents = SubagentManager(
            provider=provider,
            workspace=workspace,
            bus=bus,
            model=self.model,
            temperature=self.temperature,
            max_tokens=self.max_tokens,
            reasoning_effort=reasoning_effort,
            brave_api_key=brave_api_key,
            web_proxy=web_proxy,
            exec_config=self.exec_config,
            restrict_to_workspace=restrict_to_workspace,
        )

        # 运行状态标志
        self._running = False
        
        # MCP (Model Context Protocol) 相关属性
        # MCP 是一种协议，允许代理连接外部工具服务器
        self._mcp_servers = mcp_servers or {}       # MCP 服务器配置
        self._mcp_stack: AsyncExitStack | None = None  # 异步资源管理栈
        self._mcp_connected = False                 # MCP 连接状态
        self._mcp_connecting = False                # 是否正在连接中

        # 记忆整合（Consolidation）相关属性
        # 整合是将短期记忆转化为长期记忆的过程
        self._consolidating: set[str] = set()       # 正在整合的会话集合
        self._consolidation_tasks: set[asyncio.Task] = set()  # 整合任务集合（强引用防止被垃圾回收）
        # 使用弱引用字典存储锁，避免内存泄漏
        self._consolidation_locks: weakref.WeakValueDictionary[str, asyncio.Lock] = weakref.WeakValueDictionary()
        
        # 活动任务管理
        # session_key -> 任务列表的映射
        self._active_tasks: dict[str, list[asyncio.Task]] = {}
        
        # 处理锁，确保同一时间只有一个消息在处理
        self._processing_lock = asyncio.Lock()
        
        # 注册默认工具
        self._register_default_tools()

    def _register_default_tools(self) -> None:
        """
        注册默认工具集
        
        工具是代理与外部世界交互的能力，包括：
        - 文件操作：读取、写入、编辑、列出目录
        - Shell 执行：运行命令行命令
        - 网络工具：搜索和获取网页内容
        - 消息工具：发送消息给用户
        - 子代理工具：启动后台任务
        - 定时任务：管理计划任务
        
        设计思路：
        - 工具是可插拔的，可以轻松添加或移除
        - 每个工具都是一个独立的类，封装了特定功能
        - 工具注册表统一管理所有工具
        """
        # 如果启用了工作区限制，则设置允许访问的目录
        allowed_dir = self.workspace if self.restrict_to_workspace else None
        
        # 注册文件系统工具
        # 遍历文件工具类列表，创建实例并注册
        for cls in (ReadFileTool, WriteFileTool, EditFileTool, ListDirTool):
            self.tools.register(cls(workspace=self.workspace, allowed_dir=allowed_dir))
        
        # 注册 Shell 执行工具
        self.tools.register(ExecTool(
            working_dir=str(self.workspace),                    # 工作目录
            timeout=self.exec_config.timeout,                   # 超时时间
            restrict_to_workspace=self.restrict_to_workspace,   # 是否限制工作区
            path_append=self.exec_config.path_append,           # 额外的 PATH 路径
        ))
        
        # 注册网络搜索工具（需要 Brave API 密钥）
        self.tools.register(WebSearchTool(api_key=self.brave_api_key, proxy=self.web_proxy))
        
        # 注册网页获取工具
        self.tools.register(WebFetchTool(proxy=self.web_proxy))
        
        # 注册消息发送工具
        # send_callback 是发送消息的回调函数，通过消息总线发送
        self.tools.register(MessageTool(send_callback=self.bus.publish_outbound))
        
        # 注册子代理启动工具
        self.tools.register(SpawnTool(manager=self.subagents))
        
        # 如果配置了定时任务服务，注册定时任务工具
        if self.cron_service:
            self.tools.register(CronTool(self.cron_service))

    async def _connect_mcp(self) -> None:
        """
        连接到配置的 MCP 服务器（懒加载，只执行一次）
        
        MCP (Model Context Protocol) 是一种协议，允许代理连接外部工具服务器。
        例如，可以连接一个文件系统 MCP 服务器来扩展文件操作能力。
        
        设计思路：
        - 使用懒加载，只在需要时才连接
        - 使用 AsyncExitStack 管理异步资源的生命周期
        - 连接失败时记录错误，不影响主流程
        """
        # 如果已连接或正在连接或没有配置 MCP 服务器，直接返回
        if self._mcp_connected or self._mcp_connecting or not self._mcp_servers:
            return
        
        # 标记正在连接中
        self._mcp_connecting = True
        
        # 导入 MCP 连接函数
        from nanobot.agent.tools.mcp import connect_mcp_servers
        
        try:
            # 创建异步资源管理栈
            self._mcp_stack = AsyncExitStack()
            # 进入上下文管理器
            await self._mcp_stack.__aenter__()
            # 连接 MCP 服务器并注册工具
            await connect_mcp_servers(self._mcp_servers, self.tools, self._mcp_stack)
            # 标记已连接
            self._mcp_connected = True
        except Exception as e:
            # 连接失败，记录错误
            logger.error("Failed to connect MCP servers (will retry next message): {}", e)
            # 清理资源
            if self._mcp_stack:
                try:
                    await self._mcp_stack.aclose()
                except Exception:
                    pass
                self._mcp_stack = None
        finally:
            # 无论成功失败，都标记连接过程结束
            self._mcp_connecting = False

    def _set_tool_context(self, channel: str, chat_id: str, message_id: str | None = None) -> None:
        """
        设置工具的上下文信息
        
        某些工具需要知道当前的消息上下文，例如：
        - message 工具需要知道往哪个渠道发送消息
        - spawn 工具需要知道子代理完成后往哪里报告结果
        - cron 工具需要知道定时任务触发时往哪里发送消息
        
        参数：
        - channel: 渠道名称（如 "telegram", "discord"）
        - chat_id: 聊天 ID（用户或群组的唯一标识）
        - message_id: 消息 ID（可选，用于回复特定消息）
        """
        # 遍历需要上下文的工具
        for name in ("message", "spawn", "cron"):
            # 获取工具实例
            if tool := self.tools.get(name):
                # 如果工具有 set_context 方法，调用它
                if hasattr(tool, "set_context"):
                    # message 工具需要额外的 message_id 参数
                    tool.set_context(channel, chat_id, *([message_id] if name == "message" else []))

    @staticmethod
    def _strip_think(text: str | None) -> str | None:
        """
        移除某些模型在内容中嵌入的 <think…> 标签
        
        某些 AI 模型（如 DeepSeek）会在响应中包含 <think...</think 标签，
        用于展示模型的思考过程。这个方法用于清理这些标签，
        只保留最终的用户可见内容。
        
        参数：
        - text: 原始文本
        
        返回：
        - 清理后的文本，如果清理后为空则返回 None
        """
        if not text:
            return None
        # 使用正则表达式移除 <think...</think 标签
        # [\s\S]*? 匹配任意字符（包括换行），非贪婪模式
        return re.sub(r"_INITIALIZING_TAG[\s\S]*?_CLOSING_TAG", "", text).strip() or None

    @staticmethod
    def _tool_hint(tool_calls: list) -> str:
        """
        将工具调用格式化为简洁的提示信息
        
        用于在工具执行过程中向用户显示进度，
        例如：'web_search("query")'
        
        参数：
        - tool_calls: 工具调用列表
        
        返回：
        - 格式化后的提示字符串
        """
        def _fmt(tc):
            # 获取工具调用的参数
            # 某些模型返回列表形式的参数，需要处理
            args = (tc.arguments[0] if isinstance(tc.arguments, list) else tc.arguments) or {}
            # 获取第一个参数值（通常是主要参数）
            val = next(iter(args.values()), None) if isinstance(args, dict) else None
            # 如果值不是字符串，只返回工具名
            if not isinstance(val, str):
                return tc.name
            # 如果值太长，截断并添加省略号
            return f'{tc.name}("{val[:40]}…")' if len(val) > 40 else f'{tc.name}("{val}")'
        
        # 将所有工具调用用逗号连接
        return ", ".join(_fmt(tc) for tc in tool_calls)

    async def _run_agent_loop(
        self,
        initial_messages: list[dict],              # 初始消息列表
        on_progress: Callable[..., Awaitable[None]] | None = None,  # 进度回调函数
    ) -> tuple[str | None, list[str], list[dict]]:
        """
        运行代理迭代循环
        
        这是核心的 LLM 交互循环：
        1. 将消息发送给 LLM
        2. 如果 LLM 请求工具调用，执行工具并将结果返回给 LLM
        3. 重复直到 LLM 返回最终响应或达到最大迭代次数
        
        参数：
        - initial_messages: 初始消息列表（包含系统提示、历史对话、当前用户消息）
        - on_progress: 进度回调函数，用于向用户显示处理进度
        
        返回：
        - final_content: 最终的响应内容
        - tools_used: 使用的工具列表
        - messages: 完整的消息历史
        """
        messages = initial_messages    # 当前消息列表
        iteration = 0                  # 当前迭代次数
        final_content = None           # 最终响应内容
        tools_used: list[str] = []     # 使用的工具列表

        # 开始迭代循环
        while iteration < self.max_iterations:
            iteration += 1

            # 调用 LLM
            # messages: 对话历史
            # tools: 可用工具定义
            # model: 使用的模型
            # temperature: 温度参数
            # max_tokens: 最大输出 token 数
            # reasoning_effort: 推理努力程度（某些模型支持）
            response = await self.provider.chat(
                messages=messages,
                tools=self.tools.get_definitions(),
                model=self.model,
                temperature=self.temperature,
                max_tokens=self.max_tokens,
                reasoning_effort=self.reasoning_effort,
            )

            # 检查响应是否包含工具调用
            if response.has_tool_calls:
                # 如果有进度回调，通知用户
                if on_progress:
                    # 清理思考标签
                    clean = self._strip_think(response.content)
                    if clean:
                        await on_progress(clean)
                    # 显示工具调用提示
                    await on_progress(self._tool_hint(response.tool_calls), tool_hint=True)

                # 将工具调用转换为标准格式
                # 这是 OpenAI API 的标准格式
                tool_call_dicts = [
                    {
                        "id": tc.id,           # 工具调用 ID
                        "type": "function",    # 类型固定为 function
                        "function": {
                            "name": tc.name,   # 工具名称
                            "arguments": json.dumps(tc.arguments, ensure_ascii=False)  # 参数 JSON 字符串
                        }
                    }
                    for tc in response.tool_calls
                ]
                
                # 将助手消息（包含工具调用）添加到消息历史
                messages = self.context.add_assistant_message(
                    messages, response.content, tool_call_dicts,
                    reasoning_content=response.reasoning_content,    # 推理内容（某些模型支持）
                    thinking_blocks=response.thinking_blocks,        # 思考块（某些模型支持）
                )

                # 执行每个工具调用
                for tool_call in response.tool_calls:
                    tools_used.append(tool_call.name)  # 记录使用的工具
                    args_str = json.dumps(tool_call.arguments, ensure_ascii=False)
                    logger.info("Tool call: {}({})", tool_call.name, args_str[:200])
                    
                    # 执行工具
                    result = await self.tools.execute(tool_call.name, tool_call.arguments)
                    
                    # 将工具结果添加到消息历史
                    messages = self.context.add_tool_result(
                        messages, tool_call.id, tool_call.name, result
                    )
            else:
                # 没有工具调用，处理最终响应
                clean = self._strip_think(response.content)
                
                # 如果响应是错误，不保存到会话历史
                # 错误响应可能会污染上下文，导致持续的 400 错误循环
                if response.finish_reason == "error":
                    logger.error("LLM returned error: {}", (clean or "")[:200])
                    final_content = clean or "Sorry, I encountered an error calling the AI model."
                    break
                
                # 将助手消息添加到消息历史
                messages = self.context.add_assistant_message(
                    messages, clean, 
                    reasoning_content=response.reasoning_content,
                    thinking_blocks=response.thinking_blocks,
                )
                final_content = clean
                break

        # 如果达到最大迭代次数仍未完成
        if final_content is None and iteration >= self.max_iterations:
            logger.warning("Max iterations ({}) reached", self.max_iterations)
            final_content = (
                f"I reached the maximum number of tool call iterations ({self.max_iterations}) "
                "without completing the task. You can try breaking the task into smaller steps."
            )

        return final_content, tools_used, messages

    async def run(self) -> None:
        """
        运行代理循环的主入口
        
        这是代理的"主循环"，持续监听消息总线上的新消息，
        并为每个消息创建处理任务。
        
        设计思路：
        - 使用异步架构，支持并发处理多个消息
        - 支持通过 /stop 命令取消正在执行的任务
        - 使用任务列表跟踪活动任务，便于取消
        """
        # 标记运行状态
        self._running = True
        
        # 连接 MCP 服务器（如果配置了）
        await self._connect_mcp()
        
        logger.info("Agent loop started")

        # 主循环
        while self._running:
            try:
                # 从消息总线获取入站消息
                # 使用 wait_for 设置超时，避免永久阻塞
                msg = await asyncio.wait_for(self.bus.consume_inbound(), timeout=1.0)
            except asyncio.TimeoutError:
                # 超时后继续循环，检查 _running 状态
                continue

            # 处理 /stop 命令
            if msg.content.strip().lower() == "/stop":
                await self._handle_stop(msg)
            else:
                # 为普通消息创建处理任务
                task = asyncio.create_task(self._dispatch(msg))
                
                # 将任务添加到活动任务列表
                self._active_tasks.setdefault(msg.session_key, []).append(task)
                
                # 添加完成回调，任务完成后从列表中移除
                task.add_done_callback(
                    lambda t, k=msg.session_key: 
                    self._active_tasks.get(k, []) and 
                    self._active_tasks[k].remove(t) 
                    if t in self._active_tasks.get(k, []) 
                    else None
                )

    async def _handle_stop(self, msg: InboundMessage) -> None:
        """
        处理 /stop 命令
        
        取消指定会话的所有活动任务和子代理。
        
        参数：
        - msg: 入站消息
        """
        # 获取该会话的所有活动任务
        tasks = self._active_tasks.pop(msg.session_key, [])
        
        # 取消未完成的任务
        cancelled = sum(1 for t in tasks if not t.done() and t.cancel())
        
        # 等待所有任务完成
        for t in tasks:
            try:
                await t
            except (asyncio.CancelledError, Exception):
                pass
        
        # 取消该会话的所有子代理
        sub_cancelled = await self.subagents.cancel_by_session(msg.session_key)
        
        # 计算总取消数
        total = cancelled + sub_cancelled
        
        # 发送响应
        content = f"⏹ Stopped {total} task(s)." if total else "No active task to stop."
        await self.bus.publish_outbound(OutboundMessage(
            channel=msg.channel, chat_id=msg.chat_id, content=content,
        ))

    async def _dispatch(self, msg: InboundMessage) -> None:
        """
        分发消息到处理器
        
        在全局锁的保护下处理消息，确保同一时间只有一个消息在处理。
        
        参数：
        - msg: 入站消息
        """
        # 使用全局锁确保消息处理的顺序性
        async with self._processing_lock:
            try:
                # 处理消息
                response = await self._process_message(msg)
                
                # 如果有响应，发送出去
                if response is not None:
                    await self.bus.publish_outbound(response)
                elif msg.channel == "cli":
                    # CLI 模式下，即使没有响应也要发送空消息
                    await self.bus.publish_outbound(OutboundMessage(
                        channel=msg.channel, chat_id=msg.chat_id,
                        content="", metadata=msg.metadata or {},
                    ))
            except asyncio.CancelledError:
                # 任务被取消
                logger.info("Task cancelled for session {}", msg.session_key)
                raise
            except Exception:
                # 处理异常
                logger.exception("Error processing message for session {}", msg.session_key)
                await self.bus.publish_outbound(OutboundMessage(
                    channel=msg.channel, chat_id=msg.chat_id,
                    content="Sorry, I encountered an error.",
                ))

    async def close_mcp(self) -> None:
        """
        关闭 MCP 连接
        
        在代理停止时调用，清理 MCP 资源。
        """
        if self._mcp_stack:
            try:
                await self._mcp_stack.aclose()
            except (RuntimeError, BaseExceptionGroup):
                # MCP SDK 的取消作用域清理可能会产生噪音，但无害
                pass
            self._mcp_stack = None

    def stop(self) -> None:
        """
        停止代理循环
        
        设置 _running 标志为 False，主循环将在下一次检查时退出。
        """
        self._running = False
        logger.info("Agent loop stopping")

    async def _process_message(
        self,
        msg: InboundMessage,          # 入站消息
        session_key: str | None = None,  # 可选的会话键
        on_progress: Callable[[str], Awaitable[None]] | None = None,  # 进度回调
    ) -> OutboundMessage | None:
        """
        处理单条入站消息
        
        这是消息处理的核心逻辑：
        1. 处理系统消息（来自子代理等）
        2. 处理斜杠命令（/new, /help 等）
        3. 检查是否需要记忆整合
        4. 构建上下文并调用 LLM
        5. 保存会话历史
        
        参数：
        - msg: 入站消息
        - session_key: 可选的会话键（用于子代理）
        - on_progress: 进度回调函数
        
        返回：
        - 出站消息或 None
        """
        # 处理系统消息
        # 系统消息来自内部组件（如子代理），chat_id 格式为 "channel:chat_id"
        if msg.channel == "system":
            # 解析来源渠道和聊天 ID
            channel, chat_id = (msg.chat_id.split(":", 1) if ":" in msg.chat_id
                                else ("cli", msg.chat_id))
            logger.info("Processing system message from {}", msg.sender_id)
            
            # 获取或创建会话
            key = f"{channel}:{chat_id}"
            session = self.sessions.get_or_create(key)
            
            # 设置工具上下文
            self._set_tool_context(channel, chat_id, msg.metadata.get("message_id"))
            
            # 获取历史消息
            history = session.get_history(max_messages=self.memory_window)
            
            # 构建消息列表
            messages = self.context.build_messages(
                history=history,
                current_message=msg.content, channel=channel, chat_id=chat_id,
            )
            
            # 运行代理循环
            final_content, _, all_msgs = await self._run_agent_loop(messages)
            
            # 保存会话
            self._save_turn(session, all_msgs, 1 + len(history))
            self.sessions.save(session)
            
            return OutboundMessage(channel=channel, chat_id=chat_id,
                                  content=final_content or "Background task completed.")

        # 记录用户消息（截断过长的消息）
        preview = msg.content[:80] + "..." if len(msg.content) > 80 else msg.content
        logger.info("Processing message from {}:{}: {}", msg.channel, msg.sender_id, preview)

        # 获取或创建会话
        key = session_key or msg.session_key
        session = self.sessions.get_or_create(key)

        # 处理斜杠命令
        cmd = msg.content.strip().lower()
        
        # /new 命令：开始新会话
        if cmd == "/new":
            # 获取整合锁，防止并发整合
            lock = self._consolidation_locks.setdefault(session.key, asyncio.Lock())
            self._consolidating.add(session.key)
            
            try:
                async with lock:
                    # 获取未整合的消息
                    snapshot = session.messages[session.last_consolidated:]
                    if snapshot:
                        # 创建临时会话用于整合
                        temp = Session(key=session.key)
                        temp.messages = list(snapshot)
                        # 执行记忆整合
                        if not await self._consolidate_memory(temp, archive_all=True):
                            return OutboundMessage(
                                channel=msg.channel, chat_id=msg.chat_id,
                                content="Memory archival failed, session not cleared. Please try again.",
                            )
            except Exception:
                logger.exception("/new archival failed for {}", session.key)
                return OutboundMessage(
                    channel=msg.channel, chat_id=msg.chat_id,
                    content="Memory archival failed, session not cleared. Please try again.",
                )
            finally:
                self._consolidating.discard(session.key)

            # 清除会话
            session.clear()
            self.sessions.save(session)
            self.sessions.invalidate(session.key)
            return OutboundMessage(channel=msg.channel, chat_id=msg.chat_id,
                                  content="New session started.")
        
        # /help 命令：显示帮助信息
        if cmd == "/help":
            return OutboundMessage(channel=msg.channel, chat_id=msg.chat_id,
                                  content="🐈 nanobot commands:\n/new — Start a new conversation\n/stop — Stop the current task\n/help — Show available commands")

        # 检查是否需要记忆整合
        # 当未整合的消息数超过记忆窗口时，触发后台整合
        unconsolidated = len(session.messages) - session.last_consolidated
        if (unconsolidated >= self.memory_window and session.key not in self._consolidating):
            self._consolidating.add(session.key)
            lock = self._consolidation_locks.setdefault(session.key, asyncio.Lock())

            # 定义后台整合任务
            async def _consolidate_and_unlock():
                try:
                    async with lock:
                        await self._consolidate_memory(session)
                finally:
                    self._consolidating.discard(session.key)
                    _task = asyncio.current_task()
                    if _task is not None:
                        self._consolidation_tasks.discard(_task)

            # 创建后台任务
            _task = asyncio.create_task(_consolidate_and_unlock())
            self._consolidation_tasks.add(_task)

        # 设置工具上下文
        self._set_tool_context(msg.channel, msg.chat_id, msg.metadata.get("message_id"))
        
        # 如果有消息工具，开始新轮次
        if message_tool := self.tools.get("message"):
            if isinstance(message_tool, MessageTool):
                message_tool.start_turn()

        # 获取历史消息
        history = session.get_history(max_messages=self.memory_window)
        
        # 构建消息列表
        initial_messages = self.context.build_messages(
            history=history,
            current_message=msg.content,
            media=msg.media if msg.media else None,
            channel=msg.channel, chat_id=msg.chat_id,
        )

        # 定义进度回调函数
        async def _bus_progress(content: str, *, tool_hint: bool = False) -> None:
            meta = dict(msg.metadata or {})
            meta["_progress"] = True
            meta["_tool_hint"] = tool_hint
            await self.bus.publish_outbound(OutboundMessage(
                channel=msg.channel, chat_id=msg.chat_id, content=content, metadata=meta,
            ))

        # 运行代理循环
        final_content, _, all_msgs = await self._run_agent_loop(
            initial_messages, on_progress=on_progress or _bus_progress,
        )

        # 如果没有响应内容
        if final_content is None:
            final_content = "I've completed processing but have no response to give."

        # 保存会话
        self._save_turn(session, all_msgs, 1 + len(history))
        self.sessions.save(session)

        # 如果消息工具在本轮发送了消息，不发送默认响应
        if (mt := self.tools.get("message")) and isinstance(mt, MessageTool) and mt._sent_in_turn:
            return None

        # 记录响应
        preview = final_content[:120] + "..." if len(final_content) > 120 else final_content
        logger.info("Response to {}:{}: {}", msg.channel, msg.sender_id, preview)
        
        return OutboundMessage(
            channel=msg.channel, chat_id=msg.chat_id, content=final_content,
            metadata=msg.metadata or {},
        )

    def _save_turn(self, session: Session, messages: list[dict], skip: int) -> None:
        """
        保存新轮次的消息到会话
        
        将消息列表中的新消息保存到会话历史，同时截断过长的工具结果。
        
        设计思路：
        - 跳过空的助手消息，避免污染会话上下文
        - 截断过长的工具结果，防止上下文过大
        - 过滤运行时上下文标签，避免重复存储
        - 将图片转换为占位符，减少存储空间
        
        参数：
        - session: 会话对象
        - messages: 消息列表
        - skip: 跳过的消息数（已保存的消息）
        """
        from datetime import datetime
        
        # 遍历新消息（跳过已保存的消息）
        for m in messages[skip:]:
            # 创建消息的副本，避免修改原始消息
            entry = dict(m)
            
            # 获取角色和内容
            role, content = entry.get("role"), entry.get("content")
            
            # 跳过空的助手消息
            # 空的助手消息会污染会话上下文，导致 LLM 行为异常
            if role == "assistant" and not content and not entry.get("tool_calls"):
                continue
            
            # 截断过长的工具结果
            # 工具结果可能非常大（如读取大文件），需要截断
            if role == "tool" and isinstance(content, str) and len(content) > self._TOOL_RESULT_MAX_CHARS:
                entry["content"] = content[:self._TOOL_RESULT_MAX_CHARS] + "\n... (truncated)"
            
            # 处理用户消息
            elif role == "user":
                # 跳过运行时上下文标签
                # 运行时上下文（如当前时间）每次都会重新生成，不需要存储
                if isinstance(content, str) and content.startswith(ContextBuilder._RUNTIME_CONTEXT_TAG):
                    continue
                
                # 处理多模态内容（图片）
                # 将 base64 编码的图片替换为占位符，减少存储空间
                if isinstance(content, list):
                    entry["content"] = [
                        # 将图片替换为 [image] 占位符
                        {"type": "text", "text": "[image]"} if (
                            c.get("type") == "image_url"
                            and c.get("image_url", {}).get("url", "").startswith("data:image/")
                        ) else c for c in content
                    ]
            
            # 设置时间戳（如果不存在）
            entry.setdefault("timestamp", datetime.now().isoformat())
            
            # 将消息添加到会话历史
            session.messages.append(entry)
        
        # 更新会话的最后更新时间
        session.updated_at = datetime.now()

    async def _consolidate_memory(self, session, archive_all: bool = False) -> bool:
        """
        整合记忆：将短期记忆转化为长期记忆
        
        这是记忆管理的核心方法，通过 LLM 将对话历史压缩为：
        1. 历史记录条目（HISTORY.md）：简短的事件摘要，便于搜索
        2. 长期记忆（MEMORY.md）：重要的事实和信息
        
        设计思路：
        - 使用 LLM 进行智能摘要，保留重要信息
        - 支持两种模式：部分整合和完全归档
        - 返回布尔值表示成功或失败
        
        参数：
        - session: 会话对象
        - archive_all: 是否归档所有消息（用于 /new 命令）
        
        返回：
        - True 表示成功，False 表示失败
        """
        # 委托给 MemoryStore.consolidate() 方法
        return await MemoryStore(self.workspace).consolidate(
            session, self.provider, self.model,
            archive_all=archive_all, memory_window=self.memory_window,
        )

    async def process_direct(
        self,
        content: str,                              # 消息内容
        session_key: str = "cli:direct",           # 会话键
        channel: str = "cli",                      # 渠道名称
        chat_id: str = "direct",                   # 聊天 ID
        on_progress: Callable[[str], Awaitable[None]] | None = None,  # 进度回调
    ) -> str:
        """
        直接处理消息（用于 CLI 或定时任务）
        
        这是一个便捷方法，允许直接传入消息内容并获取响应，
        而不需要通过消息总线。主要用于：
        - 命令行交互
        - 定时任务执行
        - 测试和调试
        
        设计思路：
        - 封装了消息创建和处理流程
        - 自动连接 MCP 服务器
        - 返回响应内容字符串
        
        参数：
        - content: 消息内容
        - session_key: 会话键（用于区分不同的对话）
        - channel: 渠道名称
        - chat_id: 聊天 ID
        - on_progress: 进度回调函数
        
        返回：
        - 响应内容字符串
        """
        # 连接 MCP 服务器（如果尚未连接）
        await self._connect_mcp()
        
        # 创建入站消息
        msg = InboundMessage(channel=channel, sender_id="user", chat_id=chat_id, content=content)
        
        # 处理消息
        response = await self._process_message(msg, session_key=session_key, on_progress=on_progress)
        
        # 返回响应内容（如果没有响应则返回空字符串）
        return response.content if response else ""
