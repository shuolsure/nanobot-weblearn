"""
定时任务类型：定义定时任务的数据结构

这个模块定义了定时任务系统所需的所有数据类型。

设计思路：
- 使用 dataclass 定义数据结构
- 支持多种调度方式：一次性、周期性、cron 表达式
- 支持多种任务类型：系统事件、代理对话
- 持久化存储任务状态

调度类型：
- at: 在指定时间执行一次
- every: 每隔指定时间执行
- cron: 使用 cron 表达式执行
"""

# dataclass：数据类装饰器
# field：字段定义
from dataclasses import dataclass, field
# Literal：字面量类型
from typing import Literal


@dataclass
class CronSchedule:
    """
    定时任务调度定义
    
    定义任务何时执行。
    
    属性：
    - kind: 调度类型（at, every, cron）
    - at_ms: 一次性任务的执行时间（毫秒时间戳）
    - every_ms: 周期性任务的间隔时间（毫秒）
    - expr: cron 表达式（如 "0 9 * * *" 表示每天9点）
    - tz: 时区（仅用于 cron 表达式）
    """
    
    # 调度类型：at（一次性）、every（周期性）、cron（表达式）
    kind: Literal["at", "every", "cron"]
    # 一次性任务：执行时间（毫秒时间戳）
    at_ms: int | None = None
    # 周期性任务：间隔时间（毫秒）
    every_ms: int | None = None
    # cron 任务：cron 表达式（如 "0 9 * * *"）
    expr: str | None = None
    # cron 任务：时区
    tz: str | None = None


@dataclass
class CronPayload:
    """
    定时任务负载：定义任务执行时要做什么
    
    属性：
    - kind: 任务类型（system_event, agent_turn）
    - message: 要发送的消息内容
    - deliver: 是否将响应发送到渠道
    - channel: 目标渠道（如 "whatsapp"）
    - to: 目标地址（如手机号）
    """
    
    # 任务类型：system_event（系统事件）或 agent_turn（代理对话）
    kind: Literal["system_event", "agent_turn"] = "agent_turn"
    # 要发送的消息内容
    message: str = ""
    # 是否将响应发送到渠道
    deliver: bool = False
    # 目标渠道（如 "whatsapp"）
    channel: str | None = None
    # 目标地址（如手机号）
    to: str | None = None


@dataclass
class CronJobState:
    """
    定时任务运行状态
    
    跟踪任务的执行历史和下次执行时间。
    
    属性：
    - next_run_at_ms: 下次执行时间（毫秒时间戳）
    - last_run_at_ms: 上次执行时间（毫秒时间戳）
    - last_status: 上次执行状态（ok, error, skipped）
    - last_error: 上次执行的错误信息
    """
    
    # 下次执行时间（毫秒时间戳）
    next_run_at_ms: int | None = None
    # 上次执行时间（毫秒时间戳）
    last_run_at_ms: int | None = None
    # 上次执行状态
    last_status: Literal["ok", "error", "skipped"] | None = None
    # 上次执行的错误信息
    last_error: str | None = None


@dataclass
class CronJob:
    """
    定时任务：一个完整的调度任务
    
    包含任务的所有信息：标识、调度、负载和状态。
    
    属性：
    - id: 任务唯一标识
    - name: 任务名称
    - enabled: 是否启用
    - schedule: 调度定义
    - payload: 任务负载
    - state: 运行状态
    - created_at_ms: 创建时间（毫秒）
    - updated_at_ms: 更新时间（毫秒）
    - delete_after_run: 执行后是否删除（用于一次性任务）
    """
    
    # 任务唯一标识
    id: str
    # 任务名称
    name: str
    # 是否启用
    enabled: bool = True
    # 调度定义
    schedule: CronSchedule = field(default_factory=lambda: CronSchedule(kind="every"))
    # 任务负载
    payload: CronPayload = field(default_factory=CronPayload)
    # 运行状态
    state: CronJobState = field(default_factory=CronJobState)
    # 创建时间（毫秒）
    created_at_ms: int = 0
    # 更新时间（毫秒）
    updated_at_ms: int = 0
    # 执行后是否删除
    delete_after_run: bool = False


@dataclass
class CronStore:
    """
    定时任务存储：持久化存储所有定时任务
    
    存储格式：
    - version: 存储版本号
    - jobs: 任务列表
    
    持久化位置：工作区/cron/jobs.json
    """
    
    # 存储版本号
    version: int = 1
    # 任务列表
    jobs: list[CronJob] = field(default_factory=list)
