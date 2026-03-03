"""
记忆系统模块：持久化代理记忆

这个模块实现了代理的记忆系统，包括：
1. 长期记忆（MEMORY.md）：存储重要的事实和信息
2. 历史记录（HISTORY.md）：存储事件摘要，便于搜索

设计思路：
- 双层记忆架构：长期记忆 + 历史记录
- 使用 LLM 进行智能摘要和整合
- 支持自动和手动触发记忆整合
- 记忆整合将短期对话转化为长期记忆

记忆整合流程：
1. 收集未整合的对话消息
2. 调用 LLM 进行摘要和提取
3. 更新长期记忆和历史记录
4. 标记已整合的消息
"""

# from __future__ 是 Python 的特性导入，允许在当前版本使用未来版本的语法
# annotations 使得类型注解在运行时不会被实际求值，避免循环导入问题
from __future__ import annotations

# json：用于处理 JSON 数据的序列化和反序列化
import json
# Path：面向对象的文件路径处理类
from pathlib import Path
# TYPE_CHECKING：类型检查时的特殊常量，用于仅在类型检查时导入类型
from typing import TYPE_CHECKING

# loguru：第三方日志库，比标准库 logging 更易用
from loguru import logger

# ensure_dir：工具函数，确保目录存在
from nanobot.utils.helpers import ensure_dir

# TYPE_CHECKING 块内的导入仅在类型检查时执行，运行时不会导入
# 这避免了循环导入问题，同时提供了类型提示
if TYPE_CHECKING:
    from nanobot.providers.base import LLMProvider
    from nanobot.session.manager import Session


# 记忆保存工具的定义
# 这是一个 LLM 工具定义，用于让 LLM 调用以保存记忆整合结果
_SAVE_MEMORY_TOOL = [
    {
        "type": "function",  # 工具类型为函数
        "function": {
            "name": "save_memory",  # 工具名称
            "description": "Save the memory consolidation result to persistent storage.",  # 工具描述
            "parameters": {
                "type": "object",
                "properties": {
                    # 历史条目：简短的事件摘要
                    "history_entry": {
                        "type": "string",
                        "description": "A paragraph (2-5 sentences) summarizing key events/decisions/topics. "
                        "Start with [YYYY-MM-DD HH:MM]. Include detail useful for grep search.",
                    },
                    # 记忆更新：完整的长期记忆
                    "memory_update": {
                        "type": "string",
                        "description": "Full updated long-term memory as markdown. Include all existing "
                        "facts plus new ones. Return unchanged if nothing new.",
                    },
                },
                "required": ["history_entry", "memory_update"],  # 必需参数
            },
        },
    }
]


class MemoryStore:
    """
    记忆存储类：双层记忆系统
    
    实现了两层记忆架构：
    1. MEMORY.md（长期记忆）：存储重要的事实和信息
    2. HISTORY.md（历史记录）：存储事件摘要，便于 grep 搜索
    
    设计思路：
    - 长期记忆存储"是什么"（事实、偏好、重要信息）
    - 历史记录存储"发生了什么"（事件、决策、话题）
    - 通过 LLM 进行智能整合，保留重要信息
    """
    
    def __init__(self, workspace: Path):
        """
        初始化记忆存储
        
        参数：
        - workspace: 工作目录路径，记忆文件将存储在 workspace/memory/ 目录下
        """
        # 创建记忆目录（如果不存在）
        self.memory_dir = ensure_dir(workspace / "memory")
        # 长期记忆文件路径
        self.memory_file = self.memory_dir / "MEMORY.md"
        # 历史记录文件路径
        self.history_file = self.memory_dir / "HISTORY.md"

    def read_long_term(self) -> str:
        """
        读取长期记忆
        
        从 MEMORY.md 文件读取长期记忆内容。
        
        返回：
        - 长期记忆内容字符串，如果文件不存在则返回空字符串
        """
        if self.memory_file.exists():
            return self.memory_file.read_text(encoding="utf-8")
        return ""

    def write_long_term(self, content: str) -> None:
        """
        写入长期记忆
        
        将内容写入 MEMORY.md 文件，覆盖现有内容。
        
        参数：
        - content: 要写入的内容字符串
        """
        self.memory_file.write_text(content, encoding="utf-8")

    def append_history(self, entry: str) -> None:
        """
        追加历史条目
        
        将新的历史条目追加到 HISTORY.md 文件末尾。
        
        参数：
        - entry: 历史条目字符串
        """
        # 以追加模式打开文件，写入条目并添加换行
        with open(self.history_file, "a", encoding="utf-8") as f:
            f.write(entry.rstrip() + "\n\n")

    def get_memory_context(self) -> str:
        """
        获取记忆上下文
        
        构建用于添加到系统提示的记忆上下文。
        
        返回：
        - 格式化的记忆上下文字符串，如果没有长期记忆则返回空字符串
        """
        long_term = self.read_long_term()
        if long_term:
            return f"## Long-term Memory\n{long_term}"
        return ""

    async def consolidate(
        self,
        session: Session,              # 会话对象
        provider: LLMProvider,          # LLM 提供者
        model: str,                     # 使用的模型
        *,
        archive_all: bool = False,      # 是否归档所有消息
        memory_window: int = 50,        # 记忆窗口大小
    ) -> bool:
        """
        整合记忆：将短期记忆转化为长期记忆
        
        这是记忆管理的核心方法，通过 LLM 将对话历史压缩为：
        1. 历史记录条目（HISTORY.md）：简短的事件摘要，便于搜索
        2. 长期记忆（MEMORY.md）：重要的事实和信息
        
        整合流程：
        1. 确定要整合的消息范围
        2. 格式化消息为文本
        3. 调用 LLM 进行摘要和提取
        4. 解析 LLM 的工具调用结果
        5. 更新历史记录和长期记忆
        6. 更新会话的整合标记
        
        参数：
        - session: 会话对象，包含对话历史
        - provider: LLM 提供者，用于调用大语言模型
        - model: 使用的模型名称
        - archive_all: 是否归档所有消息（用于 /new 命令）
        - memory_window: 记忆窗口大小，保留最近的 N 条消息
        
        返回：
        - True 表示成功（包括无需整合的情况）
        - False 表示失败
        """
        # 根据模式确定要整合的消息
        if archive_all:
            # 归档所有模式：整合所有消息
            old_messages = session.messages
            keep_count = 0
            logger.info("Memory consolidation (archive_all): {} messages", len(session.messages))
        else:
            # 部分整合模式：保留最近的消息
            keep_count = memory_window // 2  # 保留一半的消息
            
            # 检查是否有足够多的消息需要整合
            if len(session.messages) <= keep_count:
                return True  # 消息太少，无需整合
            
            # 检查是否有新的未整合消息
            if len(session.messages) - session.last_consolidated <= 0:
                return True  # 没有新消息，无需整合
            
            # 获取要整合的消息（从上次整合点到保留点）
            old_messages = session.messages[session.last_consolidated:-keep_count]
            
            if not old_messages:
                return True  # 没有消息需要整合
            
            logger.info("Memory consolidation: {} to consolidate, {} keep", len(old_messages), keep_count)

        # 格式化消息为文本
        lines = []
        for m in old_messages:
            # 跳过没有内容的消息
            if not m.get("content"):
                continue
            
            # 添加工具使用标记（如果有）
            tools = f" [tools: {', '.join(m['tools_used'])}]" if m.get("tools_used") else ""
            
            # 格式化消息行
            # 格式：[时间] 角色 [工具]: 内容
            lines.append(f"[{m.get('timestamp', '?')[:16]}] {m['role'].upper()}{tools}: {m['content']}")

        # 获取当前长期记忆
        current_memory = self.read_long_term()
        
        # 构建提示词
        prompt = f"""Process this conversation and call the save_memory tool with your consolidation.

## Current Long-term Memory
{current_memory or "(empty)"}

## Conversation to Process
{chr(10).join(lines)}"""

        try:
            # 调用 LLM 进行记忆整合
            response = await provider.chat(
                messages=[
                    # 系统消息：定义 LLM 的角色
                    {"role": "system", "content": "You are a memory consolidation agent. Call the save_memory tool with your consolidation of the conversation."},
                    # 用户消息：要整合的对话
                    {"role": "user", "content": prompt},
                ],
                tools=_SAVE_MEMORY_TOOL,  # 提供记忆保存工具
                model=model,
            )

            # 检查 LLM 是否调用了工具
            if not response.has_tool_calls:
                logger.warning("Memory consolidation: LLM did not call save_memory, skipping")
                return False

            # 获取工具调用参数
            args = response.tool_calls[0].arguments
            
            # 某些提供者返回 JSON 字符串而不是字典，需要解析
            if isinstance(args, str):
                args = json.loads(args)
            
            # 验证参数类型
            if not isinstance(args, dict):
                logger.warning("Memory consolidation: unexpected arguments type {}", type(args).__name__)
                return False

            # 处理历史条目
            if entry := args.get("history_entry"):
                # 确保条目是字符串
                if not isinstance(entry, str):
                    entry = json.dumps(entry, ensure_ascii=False)
                self.append_history(entry)
            
            # 处理记忆更新
            if update := args.get("memory_update"):
                # 确保更新是字符串
                if not isinstance(update, str):
                    update = json.dumps(update, ensure_ascii=False)
                
                # 只有内容变化时才写入
                if update != current_memory:
                    self.write_long_term(update)

            # 更新会话的整合标记
            # archive_all 模式下重置为 0，否则设置为保留点
            session.last_consolidated = 0 if archive_all else len(session.messages) - keep_count
            
            logger.info("Memory consolidation done: {} messages, last_consolidated={}", len(session.messages), session.last_consolidated)
            return True
            
        except Exception:
            # 记录异常并返回失败
            logger.exception("Memory consolidation failed")
            return False
