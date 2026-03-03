"""
定时任务服务：管理和执行定时任务

这个模块提供了定时任务的核心服务。

设计思路：
- 使用异步定时器调度任务
- 支持多种调度方式：一次性、周期性、cron 表达式
- 持久化任务到磁盘
- 自动检测外部修改并重新加载

工作流程：
1. 启动时加载任务列表
2. 计算下次执行时间
3. 设置定时器等待执行
4. 执行到期任务
5. 更新任务状态
6. 重新设置定时器

存储格式：
- 位置：工作区/cron/jobs.json
- 格式：JSON 文件
- 自动重载：检测文件修改时间
"""

# asyncio：异步 IO 库
import asyncio
# json：JSON 解析库
import json
# time：时间处理
import time
# uuid：唯一标识生成
import uuid
# datetime：日期时间类型
from datetime import datetime
# Path：路径处理类
from pathlib import Path
# Any, Callable, Coroutine：类型注解
from typing import Any, Callable, Coroutine

# loguru：日志库
from loguru import logger

# 导入定时任务类型
from nanobot.cron.types import CronJob, CronJobState, CronPayload, CronSchedule, CronStore


def _now_ms() -> int:
    """
    获取当前时间的毫秒时间戳
    
    返回：
    - 当前时间的毫秒时间戳
    """
    return int(time.time() * 1000)


def _compute_next_run(schedule: CronSchedule, now_ms: int) -> int | None:
    """
    计算下次执行时间（毫秒）
    
    参数：
    - schedule: 调度定义
    - now_ms: 当前时间（毫秒）
    
    返回：
    - 下次执行时间（毫秒），如果无效则返回 None
    """
    # 一次性任务：返回指定时间（如果还未过期）
    if schedule.kind == "at":
        return schedule.at_ms if schedule.at_ms and schedule.at_ms > now_ms else None

    # 周期性任务：计算下一个间隔
    if schedule.kind == "every":
        if not schedule.every_ms or schedule.every_ms <= 0:
            return None
        # 从现在开始的下一个间隔
        return now_ms + schedule.every_ms

    # cron 表达式：解析并计算下次执行时间
    if schedule.kind == "cron" and schedule.expr:
        try:
            # 导入时区处理
            from zoneinfo import ZoneInfo
            # 导入 cron 表达式解析器
            from croniter import croniter
            
            # 使用调用者提供的参考时间进行确定性调度
            base_time = now_ms / 1000
            # 获取时区
            tz = ZoneInfo(schedule.tz) if schedule.tz else datetime.now().astimezone().tzinfo
            # 创建基准时间
            base_dt = datetime.fromtimestamp(base_time, tz=tz)
            # 解析 cron 表达式
            cron = croniter(schedule.expr, base_dt)
            # 获取下次执行时间
            next_dt = cron.get_next(datetime)
            return int(next_dt.timestamp() * 1000)
        except Exception:
            return None

    return None


def _validate_schedule_for_add(schedule: CronSchedule) -> None:
    """
    验证调度定义，防止创建无法运行的任务
    
    参数：
    - schedule: 调度定义
    
    异常：
    - ValueError: 如果调度定义无效
    """
    # 时区只能用于 cron 表达式
    if schedule.tz and schedule.kind != "cron":
        raise ValueError("tz can only be used with cron schedules")

    # 验证时区是否有效
    if schedule.kind == "cron" and schedule.tz:
        try:
            from zoneinfo import ZoneInfo
            ZoneInfo(schedule.tz)
        except Exception:
            raise ValueError(f"unknown timezone '{schedule.tz}'") from None


class CronService:
    """
    定时任务服务：管理和执行定时任务
    
    功能：
    - 添加、删除、启用、禁用任务
    - 手动运行任务
    - 自动调度和执行
    - 持久化存储
    
    调度策略：
    - 计算所有任务的下次执行时间
    - 设置定时器等待最早的执行时间
    - 执行到期任务后重新计算
    """

    def __init__(
        self,
        store_path: Path,
        on_job: Callable[[CronJob], Coroutine[Any, Any, str | None]] | None = None
    ):
        """
        初始化定时任务服务
        
        参数：
        - store_path: 任务存储文件路径
        - on_job: 任务执行回调函数
        """
        self.store_path = store_path
        self.on_job = on_job
        # 任务存储
        self._store: CronStore | None = None
        # 文件最后修改时间（用于检测外部修改）
        self._last_mtime: float = 0.0
        # 定时器任务
        self._timer_task: asyncio.Task | None = None
        # 运行状态
        self._running = False

    def _load_store(self) -> CronStore:
        """
        从磁盘加载任务，如果文件被外部修改则自动重新加载
        
        返回：
        - 任务存储对象
        """
        # 检查文件是否被外部修改
        if self._store and self.store_path.exists():
            mtime = self.store_path.stat().st_mtime
            if mtime != self._last_mtime:
                logger.info("Cron: jobs.json modified externally, reloading")
                self._store = None
                
        # 如果已有缓存，直接返回
        if self._store:
            return self._store

        # 从文件加载
        if self.store_path.exists():
            try:
                data = json.loads(self.store_path.read_text(encoding="utf-8"))
                jobs = []
                # 解析每个任务
                for j in data.get("jobs", []):
                    jobs.append(CronJob(
                        id=j["id"],
                        name=j["name"],
                        enabled=j.get("enabled", True),
                        schedule=CronSchedule(
                            kind=j["schedule"]["kind"],
                            at_ms=j["schedule"].get("atMs"),
                            every_ms=j["schedule"].get("everyMs"),
                            expr=j["schedule"].get("expr"),
                            tz=j["schedule"].get("tz"),
                        ),
                        payload=CronPayload(
                            kind=j["payload"].get("kind", "agent_turn"),
                            message=j["payload"].get("message", ""),
                            deliver=j["payload"].get("deliver", False),
                            channel=j["payload"].get("channel"),
                            to=j["payload"].get("to"),
                        ),
                        state=CronJobState(
                            next_run_at_ms=j.get("state", {}).get("nextRunAtMs"),
                            last_run_at_ms=j.get("state", {}).get("lastRunAtMs"),
                            last_status=j.get("state", {}).get("lastStatus"),
                            last_error=j.get("state", {}).get("lastError"),
                        ),
                        created_at_ms=j.get("createdAtMs", 0),
                        updated_at_ms=j.get("updatedAtMs", 0),
                        delete_after_run=j.get("deleteAfterRun", False),
                    ))
                self._store = CronStore(jobs=jobs)
            except Exception as e:
                logger.warning("Failed to load cron store: {}", e)
                self._store = CronStore()
        else:
            self._store = CronStore()

        return self._store

    def _save_store(self) -> None:
        """
        保存任务到磁盘
        """
        if not self._store:
            return

        # 确保目录存在
        self.store_path.parent.mkdir(parents=True, exist_ok=True)

        # 构建保存数据
        data = {
            "version": self._store.version,
            "jobs": [
                {
                    "id": j.id,
                    "name": j.name,
                    "enabled": j.enabled,
                    "schedule": {
                        "kind": j.schedule.kind,
                        "atMs": j.schedule.at_ms,
                        "everyMs": j.schedule.every_ms,
                        "expr": j.schedule.expr,
                        "tz": j.schedule.tz,
                    },
                    "payload": {
                        "kind": j.payload.kind,
                        "message": j.payload.message,
                        "deliver": j.payload.deliver,
                        "channel": j.payload.channel,
                        "to": j.payload.to,
                    },
                    "state": {
                        "nextRunAtMs": j.state.next_run_at_ms,
                        "lastRunAtMs": j.state.last_run_at_ms,
                        "lastStatus": j.state.last_status,
                        "lastError": j.state.last_error,
                    },
                    "createdAtMs": j.created_at_ms,
                    "updatedAtMs": j.updated_at_ms,
                    "deleteAfterRun": j.delete_after_run,
                }
                for j in self._store.jobs
            ]
        }

        # 写入文件
        self.store_path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
        # 记录修改时间
        self._last_mtime = self.store_path.stat().st_mtime
    
    async def start(self) -> None:
        """
        启动定时任务服务
        """
        self._running = True
        # 加载任务
        self._load_store()
        # 重新计算下次执行时间
        self._recompute_next_runs()
        # 保存状态
        self._save_store()
        # 设置定时器
        self._arm_timer()
        logger.info("Cron service started with {} jobs", len(self._store.jobs if self._store else []))

    def stop(self) -> None:
        """
        停止定时任务服务
        """
        self._running = False
        # 取消定时器
        if self._timer_task:
            self._timer_task.cancel()
            self._timer_task = None

    def _recompute_next_runs(self) -> None:
        """
        重新计算所有启用任务的下次执行时间
        """
        if not self._store:
            return
        now = _now_ms()
        for job in self._store.jobs:
            if job.enabled:
                job.state.next_run_at_ms = _compute_next_run(job.schedule, now)

    def _get_next_wake_ms(self) -> int | None:
        """
        获取所有任务中最早的下次执行时间
        
        返回：
        - 最早的执行时间（毫秒），如果没有任务则返回 None
        """
        if not self._store:
            return None
        # 收集所有启用任务的下次执行时间
        times = [j.state.next_run_at_ms for j in self._store.jobs
                 if j.enabled and j.state.next_run_at_ms]
        return min(times) if times else None

    def _arm_timer(self) -> None:
        """
        设置下一个定时器
        """
        # 取消现有定时器
        if self._timer_task:
            self._timer_task.cancel()

        # 获取下次唤醒时间
        next_wake = self._get_next_wake_ms()
        if not next_wake or not self._running:
            return

        # 计算延迟时间
        delay_ms = max(0, next_wake - _now_ms())
        delay_s = delay_ms / 1000

        # 创建定时器任务
        async def tick():
            await asyncio.sleep(delay_s)
            if self._running:
                await self._on_timer()

        self._timer_task = asyncio.create_task(tick())

    async def _on_timer(self) -> None:
        """
        处理定时器触发 - 执行到期任务
        """
        # 重新加载任务（可能有外部修改）
        self._load_store()
        if not self._store:
            return

        # 找出到期任务
        now = _now_ms()
        due_jobs = [
            j for j in self._store.jobs
            if j.enabled and j.state.next_run_at_ms and now >= j.state.next_run_at_ms
        ]

        # 执行每个到期任务
        for job in due_jobs:
            await self._execute_job(job)

        # 保存状态
        self._save_store()
        # 重新设置定时器
        self._arm_timer()

    async def _execute_job(self, job: CronJob) -> None:
        """
        执行单个任务
        
        参数：
        - job: 要执行的任务
        """
        start_ms = _now_ms()
        logger.info("Cron: executing job '{}' ({})", job.name, job.id)

        try:
            response = None
            # 调用任务回调
            if self.on_job:
                response = await self.on_job(job)

            # 更新状态为成功
            job.state.last_status = "ok"
            job.state.last_error = None
            logger.info("Cron: job '{}' completed", job.name)

        except Exception as e:
            # 更新状态为失败
            job.state.last_status = "error"
            job.state.last_error = str(e)
            logger.error("Cron: job '{}' failed: {}", job.name, e)

        # 更新执行时间
        job.state.last_run_at_ms = start_ms
        job.updated_at_ms = _now_ms()

        # 处理一次性任务
        if job.schedule.kind == "at":
            if job.delete_after_run:
                # 删除任务
                self._store.jobs = [j for j in self._store.jobs if j.id != job.id]
            else:
                # 禁用任务
                job.enabled = False
                job.state.next_run_at_ms = None
        else:
            # 计算下次执行时间
            job.state.next_run_at_ms = _compute_next_run(job.schedule, _now_ms())

    # ========== 公共 API ==========

    def list_jobs(self, include_disabled: bool = False) -> list[CronJob]:
        """
        列出所有任务
        
        参数：
        - include_disabled: 是否包含禁用的任务
        
        返回：
        - 任务列表（按下次执行时间排序）
        """
        store = self._load_store()
        jobs = store.jobs if include_disabled else [j for j in store.jobs if j.enabled]
        return sorted(jobs, key=lambda j: j.state.next_run_at_ms or float('inf'))

    def add_job(
        self,
        name: str,
        schedule: CronSchedule,
        message: str,
        deliver: bool = False,
        channel: str | None = None,
        to: str | None = None,
        delete_after_run: bool = False,
    ) -> CronJob:
        """
        添加新任务
        
        参数：
        - name: 任务名称
        - schedule: 调度定义
        - message: 消息内容
        - deliver: 是否发送响应到渠道
        - channel: 目标渠道
        - to: 目标地址
        - delete_after_run: 执行后是否删除
        
        返回：
        - 创建的任务对象
        """
        store = self._load_store()
        # 验证调度定义
        _validate_schedule_for_add(schedule)
        now = _now_ms()

        # 创建任务
        job = CronJob(
            id=str(uuid.uuid4())[:8],
            name=name,
            enabled=True,
            schedule=schedule,
            payload=CronPayload(
                kind="agent_turn",
                message=message,
                deliver=deliver,
                channel=channel,
                to=to,
            ),
            state=CronJobState(next_run_at_ms=_compute_next_run(schedule, now)),
            created_at_ms=now,
            updated_at_ms=now,
            delete_after_run=delete_after_run,
        )

        # 添加到存储
        store.jobs.append(job)
        self._save_store()
        # 重新设置定时器
        self._arm_timer()

        logger.info("Cron: added job '{}' ({})", name, job.id)
        return job

    def remove_job(self, job_id: str) -> bool:
        """
        删除任务
        
        参数：
        - job_id: 任务 ID
        
        返回：
        - 是否成功删除
        """
        store = self._load_store()
        before = len(store.jobs)
        # 过滤掉要删除的任务
        store.jobs = [j for j in store.jobs if j.id != job_id]
        removed = len(store.jobs) < before

        if removed:
            self._save_store()
            self._arm_timer()
            logger.info("Cron: removed job {}", job_id)

        return removed

    def enable_job(self, job_id: str, enabled: bool = True) -> CronJob | None:
        """
        启用或禁用任务
        
        参数：
        - job_id: 任务 ID
        - enabled: 是否启用
        
        返回：
        - 更新后的任务对象，如果未找到则返回 None
        """
        store = self._load_store()
        for job in store.jobs:
            if job.id == job_id:
                job.enabled = enabled
                job.updated_at_ms = _now_ms()
                if enabled:
                    # 启用时重新计算下次执行时间
                    job.state.next_run_at_ms = _compute_next_run(job.schedule, _now_ms())
                else:
                    # 禁用时清除下次执行时间
                    job.state.next_run_at_ms = None
                self._save_store()
                self._arm_timer()
                return job
        return None

    async def run_job(self, job_id: str, force: bool = False) -> bool:
        """
        手动运行任务
        
        参数：
        - job_id: 任务 ID
        - force: 是否强制运行（即使任务已禁用）
        
        返回：
        - 是否成功运行
        """
        store = self._load_store()
        for job in store.jobs:
            if job.id == job_id:
                if not force and not job.enabled:
                    return False
                # 执行任务
                await self._execute_job(job)
                self._save_store()
                self._arm_timer()
                return True
        return False

    def status(self) -> dict:
        """
        获取服务状态
        
        返回：
        - 状态字典
        """
        store = self._load_store()
        return {
            "enabled": self._running,
            "jobs": len(store.jobs),
            "next_wake_at_ms": self._get_next_wake_ms(),
        }
