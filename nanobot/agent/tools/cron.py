"""
定时任务工具：调度提醒和周期性任务

这个模块提供了定时任务工具，允许代理创建和管理定时任务。

设计思路：
- 支持三种调度方式：间隔执行、Cron 表达式、一次性执行
- 任务到期后通过消息系统通知用户
- 支持列出和删除任务

调度方式：
1. every_seconds：每隔 N 秒执行一次
2. cron_expr：使用 Cron 表达式（如 "0 9 * * *" 表示每天 9 点）
3. at：指定具体时间执行一次

使用场景：
- 定时提醒
- 周期性任务
- 一次性定时任务
"""

# Any：类型注解，表示任意类型
from typing import Any

# Tool：工具基类
from nanobot.agent.tools.base import Tool
# CronService：定时任务服务
from nanobot.cron.service import CronService
# CronSchedule：定时任务调度定义
from nanobot.cron.types import CronSchedule


class CronTool(Tool):
    """
    定时任务工具
    
    允许代理创建、列出和删除定时任务。
    
    功能：
    - 添加定时任务（间隔、Cron、一次性）
    - 列出所有任务
    - 删除任务
    
    设计模式：
    - 使用 CronService 管理任务
    - 任务到期后通过消息系统发送通知
    """
    
    def __init__(self, cron_service: CronService):
        """
        初始化定时任务工具
        
        参数：
        - cron_service: 定时任务服务实例
        """
        self._cron = cron_service
        # 当前会话上下文（用于发送通知）
        self._channel = ""
        self._chat_id = ""

    def set_context(self, channel: str, chat_id: str) -> None:
        """
        设置当前会话上下文
        
        任务到期后会向这个渠道和聊天 ID 发送通知。
        
        参数：
        - channel: 渠道名称
        - chat_id: 聊天 ID
        """
        self._channel = channel
        self._chat_id = chat_id

    @property
    def name(self) -> str:
        """工具名称：cron"""
        return "cron"

    @property
    def description(self) -> str:
        """工具描述"""
        return "Schedule reminders and recurring tasks. Actions: add, list, remove."

    @property
    def parameters(self) -> dict[str, Any]:
        """
        参数 Schema
        
        参数：
        - action: 操作类型（add, list, remove）
        - message: 提醒消息（添加时使用）
        - every_seconds: 间隔秒数（周期任务）
        - cron_expr: Cron 表达式（定时任务）
        - tz: 时区（配合 cron_expr 使用）
        - at: 执行时间（一次性任务）
        - job_id: 任务 ID（删除时使用）
        """
        return {
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["add", "list", "remove"],
                    "description": "Action to perform",
                },
                "message": {"type": "string", "description": "Reminder message (for add)"},
                "every_seconds": {
                    "type": "integer",
                    "description": "Interval in seconds (for recurring tasks)",
                },
                "cron_expr": {
                    "type": "string",
                    "description": "Cron expression like '0 9 * * *' (for scheduled tasks)",
                },
                "tz": {
                    "type": "string",
                    "description": "IANA timezone for cron expressions (e.g. 'America/Vancouver')",
                },
                "at": {
                    "type": "string",
                    "description": "ISO datetime for one-time execution (e.g. '2026-02-12T10:30:00')",
                },
                "job_id": {"type": "string", "description": "Job ID (for remove)"},
            },
            "required": ["action"],
        }

    async def execute(
        self,
        action: str,                       # 操作类型
        message: str = "",                 # 提醒消息
        every_seconds: int | None = None,  # 间隔秒数
        cron_expr: str | None = None,      # Cron 表达式
        tz: str | None = None,             # 时区
        at: str | None = None,             # 执行时间
        job_id: str | None = None,         # 任务 ID
        **kwargs: Any,
    ) -> str:
        """
        执行定时任务操作
        
        参数：
        - action: 操作类型（add, list, remove）
        - message: 提醒消息（添加时使用）
        - every_seconds: 间隔秒数（周期任务）
        - cron_expr: Cron 表达式（定时任务）
        - tz: 时区（配合 cron_expr 使用）
        - at: 执行时间（一次性任务）
        - job_id: 任务 ID（删除时使用）
        - **kwargs: 其他参数（忽略）
        
        返回：
        - 操作结果字符串
        """
        if action == "add":
            return self._add_job(message, every_seconds, cron_expr, tz, at)
        elif action == "list":
            return self._list_jobs()
        elif action == "remove":
            return self._remove_job(job_id)
        return f"Unknown action: {action}"

    def _add_job(
        self,
        message: str,                 # 提醒消息
        every_seconds: int | None,    # 间隔秒数
        cron_expr: str | None,        # Cron 表达式
        tz: str | None,               # 时区
        at: str | None,               # 执行时间
    ) -> str:
        """
        添加定时任务
        
        参数：
        - message: 提醒消息
        - every_seconds: 间隔秒数（周期任务）
        - cron_expr: Cron 表达式（定时任务）
        - tz: 时区（配合 cron_expr 使用）
        - at: 执行时间（一次性任务）
        
        返回：
        - 创建结果字符串
        """
        # 验证必需参数
        if not message:
            return "Error: message is required for add"
        if not self._channel or not self._chat_id:
            return "Error: no session context (channel/chat_id)"
        
        # 时区只能配合 cron_expr 使用
        if tz and not cron_expr:
            return "Error: tz can only be used with cron_expr"
        
        # 验证时区
        if tz:
            from zoneinfo import ZoneInfo
            try:
                ZoneInfo(tz)
            except (KeyError, Exception):
                return f"Error: unknown timezone '{tz}'"

        # 构建调度配置
        delete_after = False  # 是否在执行后删除
        
        if every_seconds:
            # 间隔执行：每隔 N 秒执行一次
            schedule = CronSchedule(kind="every", every_ms=every_seconds * 1000)
        elif cron_expr:
            # Cron 表达式：按时间表执行
            schedule = CronSchedule(kind="cron", expr=cron_expr, tz=tz)
        elif at:
            # 一次性执行：在指定时间执行
            from datetime import datetime
            dt = datetime.fromisoformat(at)
            at_ms = int(dt.timestamp() * 1000)
            schedule = CronSchedule(kind="at", at_ms=at_ms)
            delete_after = True  # 一次性任务执行后删除
        else:
            return "Error: either every_seconds, cron_expr, or at is required"

        # 添加任务
        job = self._cron.add_job(
            name=message[:30],           # 任务名称（截取前 30 个字符）
            schedule=schedule,           # 调度配置
            message=message,             # 提醒消息
            deliver=True,                # 是否发送通知
            channel=self._channel,       # 目标渠道
            to=self._chat_id,            # 目标聊天 ID
            delete_after_run=delete_after,  # 执行后是否删除
        )
        
        return f"Created job '{job.name}' (id: {job.id})"

    def _list_jobs(self) -> str:
        """
        列出所有定时任务
        
        返回：
        - 任务列表字符串
        """
        jobs = self._cron.list_jobs()
        if not jobs:
            return "No scheduled jobs."
        
        # 格式化任务列表
        lines = [f"- {j.name} (id: {j.id}, {j.schedule.kind})" for j in jobs]
        return "Scheduled jobs:\n" + "\n".join(lines)

    def _remove_job(self, job_id: str | None) -> str:
        """
        删除定时任务
        
        参数：
        - job_id: 任务 ID
        
        返回：
        - 删除结果字符串
        """
        if not job_id:
            return "Error: job_id is required for remove"
        
        if self._cron.remove_job(job_id):
            return f"Removed job {job_id}"
        return f"Job {job_id} not found"
