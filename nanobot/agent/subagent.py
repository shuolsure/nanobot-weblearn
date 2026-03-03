"""
子代理管理模块：后台任务执行

这个模块实现了子代理系统，允许代理在后台执行长时间运行的任务。

设计思路：
- 子代理是独立的代理实例，可以并行处理任务
- 子代理完成后通过消息总线报告结果
- 子代理与主代理共享工作区和配置
- 支持取消和管理子代理

使用场景：
- 长时间运行的任务（如编译、测试）
- 需要独立处理的子任务
- 并行执行多个任务

工作流程：
1. 主代理通过 spawn 工具启动子代理
2. 子代理独立执行任务
3. 子代理完成后通过消息总线发送结果
4. 主代理接收结果并通知用户
"""

# asyncio：Python 的异步 I/O 框架，用于编写并发代码
import asyncio
# json：用于处理 JSON 数据的序列化和反序列化
import json
# uuid：用于生成唯一标识符
import uuid
# Path：面向对象的文件路径处理类
from pathlib import Path
# Any：类型注解，表示任意类型
from typing import Any

# loguru：第三方日志库，比标准库 logging 更易用
from loguru import logger

# 导入 nanobot 内部模块
# 文件系统工具：读取、写入、编辑、列出目录
from nanobot.agent.tools.filesystem import EditFileTool, ListDirTool, ReadFileTool, WriteFileTool
# ToolRegistry：工具注册表，管理所有可用工具
from nanobot.agent.tools.registry import ToolRegistry
# ExecTool：Shell 命令执行工具
from nanobot.agent.tools.shell import ExecTool
# WebFetchTool, WebSearchTool：网络工具
from nanobot.agent.tools.web import WebFetchTool, WebSearchTool
# InboundMessage：入站消息类型
from nanobot.bus.events import InboundMessage
# MessageBus：消息总线，负责消息路由
from nanobot.bus.queue import MessageBus
# ExecToolConfig：执行工具配置
from nanobot.config.schema import ExecToolConfig
# LLMProvider：大语言模型提供者的基类
from nanobot.providers.base import LLMProvider


class SubagentManager:
    """
    子代理管理器：管理后台子代理的执行
    
    子代理是独立的代理实例，可以在后台执行任务。
    
    功能：
    1. 启动子代理：创建并启动后台任务
    2. 管理子代理：跟踪运行中的子代理
    3. 取消子代理：支持取消指定会话的所有子代理
    4. 结果通知：子代理完成后通知主代理
    
    设计模式：
    - 使用 asyncio.Task 管理后台任务
    - 通过消息总线与主代理通信
    - 子代理不包含消息工具和子代理工具（避免递归）
    """
    
    def __init__(
        self,
        provider: LLMProvider,              # LLM 提供者
        workspace: Path,                    # 工作目录
        bus: MessageBus,                    # 消息总线
        model: str | None = None,           # 使用的模型
        temperature: float = 0.7,           # 温度参数（子代理使用更高的温度）
        max_tokens: int = 4096,             # 最大输出 token 数
        reasoning_effort: str | None = None,# 推理努力程度
        brave_api_key: str | None = None,   # Brave 搜索 API 密钥
        web_proxy: str | None = None,       # 网络代理
        exec_config: "ExecToolConfig | None" = None,  # 执行工具配置
        restrict_to_workspace: bool = False,  # 是否限制工作区
    ):
        """
        初始化子代理管理器
        
        参数说明：
        - provider: LLM 提供者，用于调用大语言模型
        - workspace: 工作目录，子代理在此目录下操作
        - bus: 消息总线，用于与主代理通信
        - model: 使用的模型名称
        - temperature: 温度参数，子代理通常使用更高的值（0.7）以增加创造性
        - max_tokens: 最大输出 token 数
        - reasoning_effort: 推理努力程度（某些模型支持）
        - brave_api_key: Brave 搜索 API 密钥
        - web_proxy: 网络代理地址
        - exec_config: Shell 执行工具的配置
        - restrict_to_workspace: 是否限制子代理只能操作工作目录
        """
        # 导入配置模式（用于创建默认配置）
        from nanobot.config.schema import ExecToolConfig
        
        # 存储配置
        self.provider = provider                                # LLM 提供者
        self.workspace = workspace                              # 工作目录
        self.bus = bus                                          # 消息总线
        self.model = model or provider.get_default_model()      # 使用的模型
        self.temperature = temperature                          # 温度参数
        self.max_tokens = max_tokens                            # 最大输出 token 数
        self.reasoning_effort = reasoning_effort                # 推理努力程度
        self.brave_api_key = brave_api_key                      # Brave API 密钥
        self.web_proxy = web_proxy                              # 网络代理
        self.exec_config = exec_config or ExecToolConfig()      # 执行工具配置
        self.restrict_to_workspace = restrict_to_workspace      # 是否限制工作区
        
        # 运行中的任务映射：task_id -> Task
        self._running_tasks: dict[str, asyncio.Task[None]] = {}
        
        # 会话任务映射：session_key -> {task_id, ...}
        # 用于跟踪每个会话启动的子代理
        self._session_tasks: dict[str, set[str]] = {}

    async def spawn(
        self,
        task: str,                              # 任务描述
        label: str | None = None,               # 任务标签（用于显示）
        origin_channel: str = "cli",            # 来源渠道
        origin_chat_id: str = "direct",         # 来源聊天 ID
        session_key: str | None = None,         # 会话键
    ) -> str:
        """
        启动一个子代理执行后台任务
        
        创建一个异步任务来运行子代理，子代理完成后会通过消息总线报告结果。
        
        参数：
        - task: 任务描述，告诉子代理要做什么
        - label: 任务标签，用于显示给用户
        - origin_channel: 来源渠道，子代理完成后往这里发送结果
        - origin_chat_id: 来源聊天 ID
        - session_key: 会话键，用于取消时识别
        
        返回：
        - 启动成功的消息字符串
        """
        # 生成唯一的任务 ID（取前 8 位）
        task_id = str(uuid.uuid4())[:8]
        
        # 生成显示标签（如果未提供，使用任务描述的前 30 个字符）
        display_label = label or task[:30] + ("..." if len(task) > 30 else "")
        
        # 记录来源信息，用于完成后发送结果
        origin = {"channel": origin_channel, "chat_id": origin_chat_id}

        # 创建异步任务
        bg_task = asyncio.create_task(
            self._run_subagent(task_id, task, display_label, origin)
        )
        
        # 记录运行中的任务
        self._running_tasks[task_id] = bg_task
        
        # 如果有会话键，记录会话与任务的关联
        if session_key:
            self._session_tasks.setdefault(session_key, set()).add(task_id)

        # 定义清理回调函数
        def _cleanup(_: asyncio.Task) -> None:
            """任务完成后清理记录"""
            # 从运行中任务列表移除
            self._running_tasks.pop(task_id, None)
            # 从会话任务列表移除
            if session_key and (ids := self._session_tasks.get(session_key)):
                ids.discard(task_id)
                # 如果会话没有其他任务，移除会话记录
                if not ids:
                    del self._session_tasks[session_key]

        # 添加清理回调
        bg_task.add_done_callback(_cleanup)

        logger.info("Spawned subagent [{}]: {}", task_id, display_label)
        return f"Subagent [{display_label}] started (id: {task_id}). I'll notify you when it completes."

    async def _run_subagent(
        self,
        task_id: str,               # 任务 ID
        task: str,                  # 任务描述
        label: str,                 # 任务标签
        origin: dict[str, str],     # 来源信息
    ) -> None:
        """
        执行子代理任务
        
        这是子代理的主循环，与主代理类似但有以下区别：
        1. 不包含消息工具（不能主动发送消息）
        2. 不包含子代理工具（不能启动更多子代理）
        3. 有最大迭代次数限制（15 次）
        4. 完成后通过消息总线报告结果
        
        参数：
        - task_id: 任务唯一标识
        - task: 任务描述
        - label: 任务标签
        - origin: 来源信息（channel, chat_id）
        """
        logger.info("Subagent [{}] starting task: {}", task_id, label)

        try:
            # 构建子代理工具集
            # 注意：子代理不包含 message 和 spawn 工具
            tools = ToolRegistry()
            
            # 设置允许访问的目录
            allowed_dir = self.workspace if self.restrict_to_workspace else None
            
            # 注册文件系统工具
            tools.register(ReadFileTool(workspace=self.workspace, allowed_dir=allowed_dir))
            tools.register(WriteFileTool(workspace=self.workspace, allowed_dir=allowed_dir))
            tools.register(EditFileTool(workspace=self.workspace, allowed_dir=allowed_dir))
            tools.register(ListDirTool(workspace=self.workspace, allowed_dir=allowed_dir))
            
            # 注册 Shell 执行工具
            tools.register(ExecTool(
                working_dir=str(self.workspace),
                timeout=self.exec_config.timeout,
                restrict_to_workspace=self.restrict_to_workspace,
                path_append=self.exec_config.path_append,
            ))
            
            # 注册网络工具
            tools.register(WebSearchTool(api_key=self.brave_api_key, proxy=self.web_proxy))
            tools.register(WebFetchTool(proxy=self.web_proxy))
            
            # 构建子代理系统提示
            system_prompt = self._build_subagent_prompt()
            
            # 初始化消息列表
            messages: list[dict[str, Any]] = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": task},
            ]

            # 运行代理循环（限制迭代次数）
            max_iterations = 15  # 子代理的最大迭代次数较少
            iteration = 0
            final_result: str | None = None

            # 开始迭代循环
            while iteration < max_iterations:
                iteration += 1

                # 调用 LLM
                response = await self.provider.chat(
                    messages=messages,
                    tools=tools.get_definitions(),
                    model=self.model,
                    temperature=self.temperature,
                    max_tokens=self.max_tokens,
                    reasoning_effort=self.reasoning_effort,
                )

                # 检查是否有工具调用
                if response.has_tool_calls:
                    # 构建工具调用消息
                    tool_call_dicts = [
                        {
                            "id": tc.id,
                            "type": "function",
                            "function": {
                                "name": tc.name,
                                "arguments": json.dumps(tc.arguments, ensure_ascii=False),
                            },
                        }
                        for tc in response.tool_calls
                    ]
                    
                    # 添加助手消息
                    messages.append({
                        "role": "assistant",
                        "content": response.content or "",
                        "tool_calls": tool_call_dicts,
                    })

                    # 执行每个工具调用
                    for tool_call in response.tool_calls:
                        args_str = json.dumps(tool_call.arguments, ensure_ascii=False)
                        logger.debug("Subagent [{}] executing: {} with arguments: {}", task_id, tool_call.name, args_str)
                        
                        # 执行工具
                        result = await tools.execute(tool_call.name, tool_call.arguments)
                        
                        # 添加工具结果消息
                        messages.append({
                            "role": "tool",
                            "tool_call_id": tool_call.id,
                            "name": tool_call.name,
                            "content": result,
                        })
                else:
                    # 没有工具调用，获取最终结果
                    final_result = response.content
                    break

            # 如果达到最大迭代次数仍未完成
            if final_result is None:
                final_result = "Task completed but no final response was generated."

            logger.info("Subagent [{}] completed successfully", task_id)
            
            # 宣布结果
            await self._announce_result(task_id, label, task, final_result, origin, "ok")

        except Exception as e:
            # 处理异常
            error_msg = f"Error: {str(e)}"
            logger.error("Subagent [{}] failed: {}", task_id, e)
            await self._announce_result(task_id, label, task, error_msg, origin, "error")

    async def _announce_result(
        self,
        task_id: str,               # 任务 ID
        label: str,                 # 任务标签
        task: str,                  # 任务描述
        result: str,                # 执行结果
        origin: dict[str, str],     # 来源信息
        status: str,                # 状态（"ok" 或 "error"）
    ) -> None:
        """
        宣布子代理结果
        
        通过消息总线将子代理的结果发送给主代理。
        使用系统消息类型，主代理会特殊处理。
        
        参数：
        - task_id: 任务唯一标识
        - label: 任务标签
        - task: 任务描述
        - result: 执行结果
        - origin: 来源信息（channel, chat_id）
        - status: 状态（"ok" 表示成功，"error" 表示失败）
        """
        # 根据状态生成状态文本
        status_text = "completed successfully" if status == "ok" else "failed"

        # 构建通知内容
        # 这个内容会被主代理接收并处理
        announce_content = f"""[Subagent '{label}' {status_text}]

Task: {task}

Result:
{result}

Summarize this naturally for the user. Keep it brief (1-2 sentences). Do not mention technical details like "subagent" or task IDs."""

        # 创建入站消息
        # 使用 "system" 渠道，主代理会特殊处理
        msg = InboundMessage(
            channel="system",
            sender_id="subagent",
            # chat_id 格式为 "channel:chat_id"，主代理会解析
            chat_id=f"{origin['channel']}:{origin['chat_id']}",
            content=announce_content,
        )

        # 发布到消息总线
        await self.bus.publish_inbound(msg)
        
        logger.debug("Subagent [{}] announced result to {}:{}", task_id, origin['channel'], origin['chat_id'])
    
    def _build_subagent_prompt(self) -> str:
        """
        构建子代理的系统提示
        
        子代理的系统提示比主代理简单，主要包含：
        1. 运行时上下文（时间）
        2. 身份定义（子代理）
        3. 工作区信息
        4. 可用技能摘要
        
        返回：
        - 系统提示字符串
        """
        # 导入需要的模块
        from nanobot.agent.context import ContextBuilder
        from nanobot.agent.skills import SkillsLoader

        # 获取运行时上下文（时间）
        time_ctx = ContextBuilder._build_runtime_context(None, None)
        
        # 构建提示部分
        parts = [f"""# Subagent

{time_ctx}

You are a subagent spawned by the main agent to complete a specific task.
Stay focused on the assigned task. Your final response will be reported back to the main agent.

## Workspace
{self.workspace}"""]

        # 添加技能摘要
        skills_summary = SkillsLoader(self.workspace).build_skills_summary()
        if skills_summary:
            parts.append(f"## Skills\n\nRead SKILL.md with read_file to use a skill.\n\n{skills_summary}")

        return "\n\n".join(parts)
    
    async def cancel_by_session(self, session_key: str) -> int:
        """
        取消指定会话的所有子代理
        
        当用户发送 /stop 命令时，会调用此方法取消该会话的所有子代理。
        
        参数：
        - session_key: 会话键
        
        返回：
        - 被取消的子代理数量
        """
        # 获取该会话的所有运行中任务
        tasks = [
            self._running_tasks[tid] 
            for tid in self._session_tasks.get(session_key, [])
            if tid in self._running_tasks and not self._running_tasks[tid].done()
        ]
        
        # 取消所有任务
        for t in tasks:
            t.cancel()
        
        # 等待所有任务完成
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
        
        return len(tasks)

    def get_running_count(self) -> int:
        """
        获取当前运行中的子代理数量
        
        返回：
        - 运行中的子代理数量
        """
        return len(self._running_tasks)
