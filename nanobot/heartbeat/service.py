"""
心跳服务：定期唤醒代理检查任务

这个模块提供了心跳服务，用于定期唤醒代理检查是否有待处理的任务。

设计思路：
- 使用两阶段处理：决策阶段和执行阶段
- 决策阶段：读取 HEARTBEAT.md，通过虚拟工具调用询问 LLM 是否有任务
- 执行阶段：只有决策阶段返回 "run" 时才执行，避免不必要的处理

工作流程：
1. 定期唤醒（默认 30 分钟）
2. 读取 HEARTBEAT.md 文件
3. 通过虚拟工具调用询问 LLM 是否有任务
4. 如果有任务，执行任务并返回结果
5. 如果没有任务，跳过执行

优势：
- 使用虚拟工具调用代替自由文本解析
- 避免不可靠的 HEARTBEAT_OK 标记
- 只在需要时执行完整代理循环
"""

# annotations：延迟类型注解求值
from __future__ import annotations

# asyncio：异步 IO 库
import asyncio
# Path：路径处理类
from pathlib import Path
# TYPE_CHECKING, Any, Callable, Coroutine：类型注解
from typing import TYPE_CHECKING, Any, Callable, Coroutine

# loguru：日志库
from loguru import logger

# 类型检查时导入（避免循环依赖）
if TYPE_CHECKING:
    from nanobot.providers.base import LLMProvider

# 心跳工具定义：虚拟工具，用于 LLM 决策
_HEARTBEAT_TOOL = [
    {
        "type": "function",
        "function": {
            "name": "heartbeat",
            "description": "Report heartbeat decision after reviewing tasks.",
            "parameters": {
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "enum": ["skip", "run"],
                        "description": "skip = nothing to do, run = has active tasks",
                    },
                    "tasks": {
                        "type": "string",
                        "description": "Natural-language summary of active tasks (required for run)",
                    },
                },
                "required": ["action"],
            },
        },
    }
]


class HeartbeatService:
    """
    心跳服务：定期唤醒代理检查任务
    
    两阶段处理：
    - 第一阶段（决策）：读取 HEARTBEAT.md 并通过虚拟工具调用询问 LLM 是否有活动任务
    - 第二阶段（执行）：只有第一阶段返回 "run" 时才触发，执行完整代理循环
    
    这种设计避免了自由文本解析和不可靠的 HEARTBEAT_OK 标记。
    """

    def __init__(
        self,
        workspace: Path,
        provider: LLMProvider,
        model: str,
        on_execute: Callable[[str], Coroutine[Any, Any, str]] | None = None,
        on_notify: Callable[[str], Coroutine[Any, Any, None]] | None = None,
        interval_s: int = 30 * 60,
        enabled: bool = True,
    ):
        """
        初始化心跳服务
        
        参数：
        - workspace: 工作区路径
        - provider: LLM 提供商
        - model: 模型名称
        - on_execute: 执行回调函数（接收任务描述，返回响应）
        - on_notify: 通知回调函数（发送响应到渠道）
        - interval_s: 心跳间隔（秒），默认 30 分钟
        - enabled: 是否启用
        """
        self.workspace = workspace
        self.provider = provider
        self.model = model
        self.on_execute = on_execute
        self.on_notify = on_notify
        self.interval_s = interval_s
        self.enabled = enabled
        # 运行状态
        self._running = False
        # 异步任务
        self._task: asyncio.Task | None = None

    @property
    def heartbeat_file(self) -> Path:
        """
        获取心跳文件路径
        
        返回：
        - HEARTBEAT.md 文件路径
        """
        return self.workspace / "HEARTBEAT.md"

    def _read_heartbeat_file(self) -> str | None:
        """
        读取心跳文件内容
        
        返回：
        - 文件内容，如果不存在或读取失败则返回 None
        """
        if self.heartbeat_file.exists():
            try:
                return self.heartbeat_file.read_text(encoding="utf-8")
            except Exception:
                return None
        return None

    async def _decide(self, content: str) -> tuple[str, str]:
        """
        第一阶段：通过虚拟工具调用询问 LLM 决定跳过还是运行
        
        参数：
        - content: HEARTBEAT.md 文件内容
        
        返回：
        - (action, tasks) 元组，其中 action 是 'skip' 或 'run'
        """
        # 调用 LLM 进行决策
        response = await self.provider.chat(
            messages=[
                {"role": "system", "content": "You are a heartbeat agent. Call the heartbeat tool to report your decision."},
                {"role": "user", "content": (
                    "Review the following HEARTBEAT.md and decide whether there are active tasks.\n\n"
                    f"{content}"
                )},
            ],
            tools=_HEARTBEAT_TOOL,
            model=self.model,
        )

        # 如果没有工具调用，默认跳过
        if not response.has_tool_calls:
            return "skip", ""

        # 解析工具调用参数
        args = response.tool_calls[0].arguments
        return args.get("action", "skip"), args.get("tasks", "")

    async def start(self) -> None:
        """
        启动心跳服务
        """
        # 检查是否启用
        if not self.enabled:
            logger.info("Heartbeat disabled")
            return
        # 检查是否已在运行
        if self._running:
            logger.warning("Heartbeat already running")
            return

        # 设置运行状态
        self._running = True
        # 创建异步任务
        self._task = asyncio.create_task(self._run_loop())
        logger.info("Heartbeat started (every {}s)", self.interval_s)

    def stop(self) -> None:
        """
        停止心跳服务
        """
        self._running = False
        # 取消异步任务
        if self._task:
            self._task.cancel()
            self._task = None

    async def _run_loop(self) -> None:
        """
        主心跳循环
        """
        while self._running:
            try:
                # 等待间隔时间
                await asyncio.sleep(self.interval_s)
                # 如果仍在运行，执行心跳
                if self._running:
                    await self._tick()
            except asyncio.CancelledError:
                # 任务被取消，退出循环
                break
            except Exception as e:
                # 记录错误但继续运行
                logger.error("Heartbeat error: {}", e)

    async def _tick(self) -> None:
        """
        执行单次心跳
        """
        # 读取心跳文件
        content = self._read_heartbeat_file()
        if not content:
            logger.debug("Heartbeat: HEARTBEAT.md missing or empty")
            return

        logger.info("Heartbeat: checking for tasks...")

        try:
            # 第一阶段：决策
            action, tasks = await self._decide(content)

            # 如果不需要运行，跳过
            if action != "run":
                logger.info("Heartbeat: OK (nothing to report)")
                return

            # 第二阶段：执行
            logger.info("Heartbeat: tasks found, executing...")
            if self.on_execute:
                # 执行任务
                response = await self.on_execute(tasks)
                # 如果有响应且需要通知，发送通知
                if response and self.on_notify:
                    logger.info("Heartbeat: completed, delivering response")
                    await self.on_notify(response)
        except Exception:
            logger.exception("Heartbeat execution failed")

    async def trigger_now(self) -> str | None:
        """
        手动触发心跳
        
        返回：
        - 执行结果，如果没有任务或未配置执行回调则返回 None
        """
        # 读取心跳文件
        content = self._read_heartbeat_file()
        if not content:
            return None
        # 决策
        action, tasks = await self._decide(content)
        # 如果不需要运行或没有执行回调，返回 None
        if action != "run" or not self.on_execute:
            return None
        # 执行并返回结果
        return await self.on_execute(tasks)
