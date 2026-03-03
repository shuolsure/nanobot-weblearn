"""
子代理启动工具：后台任务执行

这个模块提供了子代理启动工具，允许代理在后台执行长时间运行的任务。

设计思路：
- 子代理是独立的代理实例
- 在后台异步执行任务
- 完成后通过消息系统报告结果
- 支持取消和管理

使用场景：
- 长时间运行的任务（如编译、测试）
- 需要独立处理的子任务
- 并行执行多个任务

工作流程：
1. 主代理调用 spawn 工具
2. 创建子代理并开始执行
3. 子代理独立运行
4. 完成后发送结果通知
"""

# TYPE_CHECKING：类型检查时的特殊常量
# Any：类型注解，表示任意类型
from typing import TYPE_CHECKING, Any

# Tool：工具基类
from nanobot.agent.tools.base import Tool

# TYPE_CHECKING 块内的导入仅在类型检查时执行
if TYPE_CHECKING:
    from nanobot.agent.subagent import SubagentManager


class SpawnTool(Tool):
    """
    子代理启动工具
    
    允许代理启动后台子代理执行任务。
    
    功能：
    - 启动后台子代理
    - 子代理独立执行任务
    - 完成后自动报告结果
    
    设计模式：
    - 使用 SubagentManager 管理子代理
    - 子代理与主代理共享工作区和配置
    - 子代理不包含 spawn 工具（避免递归）
    """
    
    def __init__(self, manager: "SubagentManager"):
        """
        初始化子代理启动工具
        
        参数：
        - manager: 子代理管理器实例
        """
        self._manager = manager
        # 来源上下文（用于结果通知）
        self._origin_channel = "cli"
        self._origin_chat_id = "direct"
        self._session_key = "cli:direct"

    def set_context(self, channel: str, chat_id: str) -> None:
        """
        设置来源上下文
        
        子代理完成后会向这个渠道和聊天 ID 发送结果。
        
        参数：
        - channel: 渠道名称
        - chat_id: 聊天 ID
        """
        self._origin_channel = channel
        self._origin_chat_id = chat_id
        # 会话键用于取消时识别
        self._session_key = f"{channel}:{chat_id}"

    @property
    def name(self) -> str:
        """工具名称：spawn"""
        return "spawn"

    @property
    def description(self) -> str:
        """工具描述"""
        return (
            "Spawn a subagent to handle a task in the background. "
            "Use this for complex or time-consuming tasks that can run independently. "
            "The subagent will complete the task and report back when done."
        )

    @property
    def parameters(self) -> dict[str, Any]:
        """
        参数 Schema
        
        参数：
        - task: 任务描述（必需）
        - label: 任务标签（可选，用于显示）
        """
        return {
            "type": "object",
            "properties": {
                "task": {
                    "type": "string",
                    "description": "The task for the subagent to complete",
                },
                "label": {
                    "type": "string",
                    "description": "Optional short label for the task (for display)",
                },
            },
            "required": ["task"],
        }

    async def execute(self, task: str, label: str | None = None, **kwargs: Any) -> str:
        """
        执行子代理启动
        
        参数：
        - task: 任务描述，告诉子代理要做什么
        - label: 任务标签，用于显示给用户
        - **kwargs: 其他参数（忽略）
        
        返回：
        - 启动结果字符串
        """
        # 调用子代理管理器启动子代理
        return await self._manager.spawn(
            task=task,
            label=label,
            origin_channel=self._origin_channel,
            origin_chat_id=self._origin_chat_id,
            session_key=self._session_key,
        )
