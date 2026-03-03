"""
会话管理：管理对话历史

这个模块提供了会话管理功能，用于存储和管理对话历史。

设计思路：
- 使用 JSONL 格式存储消息（每行一条消息）
- 支持内存缓存提高性能
- 支持会话持久化到磁盘
- 支持从旧位置迁移会话

会话存储：
- 位置：工作区/sessions/目录
- 格式：JSONL 文件（每行一条消息）
- 命名：{channel}_{chat_id}.jsonl

消息追加原则：
- 消息只追加，不修改
- 这是为了 LLM 缓存效率
- 整合过程写入摘要到 MEMORY.md/HISTORY.md
- 但不修改消息列表或 get_history() 输出
"""

# json：JSON 解析库
import json
# shutil：文件操作库
import shutil
# dataclass：数据类装饰器
# field：字段定义
from dataclasses import dataclass, field
# datetime：日期时间类型
from datetime import datetime
# Path：路径处理类
from pathlib import Path
# Any：类型注解
from typing import Any

# loguru：日志库
from loguru import logger

# ensure_dir, safe_filename：辅助函数
from nanobot.utils.helpers import ensure_dir, safe_filename


@dataclass
class Session:
    """
    会话：存储对话历史
    
    以 JSONL 格式存储消息，便于阅读和持久化。
    
    重要：消息只追加，不修改，这是为了 LLM 缓存效率。
    整合过程写入摘要到 MEMORY.md/HISTORY.md，
    但不修改消息列表或 get_history() 输出。
    
    属性：
    - key: 会话键（格式：channel:chat_id）
    - messages: 消息列表
    - created_at: 创建时间
    - updated_at: 更新时间
    - metadata: 元数据
    - last_consolidated: 已整合到文件的消息数量
    """
    
    # 会话键：格式为 channel:chat_id
    key: str
    # 消息列表：存储所有消息
    messages: list[dict[str, Any]] = field(default_factory=list)
    # 创建时间
    created_at: datetime = field(default_factory=datetime.now)
    # 更新时间
    updated_at: datetime = field(default_factory=datetime.now)
    # 元数据：存储额外信息
    metadata: dict[str, Any] = field(default_factory=dict)
    # 已整合到文件的消息数量
    last_consolidated: int = 0

    def add_message(self, role: str, content: str, **kwargs: Any) -> None:
        """
        添加消息到会话
        
        参数：
        - role: 角色（user, assistant, system, tool）
        - content: 消息内容
        - **kwargs: 其他字段（如 tool_calls, tool_call_id）
        """
        # 构建消息字典
        msg = {
            "role": role,
            "content": content,
            "timestamp": datetime.now().isoformat(),
            **kwargs
        }
        # 追加到消息列表
        self.messages.append(msg)
        # 更新时间戳
        self.updated_at = datetime.now()

    def get_history(self, max_messages: int = 500) -> list[dict[str, Any]]:
        """
        获取未整合的消息历史，用于 LLM 输入
        
        对齐到用户回合，避免孤立 tool_result 块。
        
        参数：
        - max_messages: 最大消息数量
        
        返回：
        - 格式化的消息列表
        """
        # 获取未整合的消息
        unconsolidated = self.messages[self.last_consolidated:]
        # 截取最近的消息
        sliced = unconsolidated[-max_messages:]

        # 丢弃开头的非用户消息，避免孤立的 tool_result 块
        for i, m in enumerate(sliced):
            if m.get("role") == "user":
                sliced = sliced[i:]
                break

        # 格式化输出
        out: list[dict[str, Any]] = []
        for m in sliced:
            # 构建条目
            entry: dict[str, Any] = {"role": m["role"], "content": m.get("content", "")}
            # 复制工具相关字段
            for k in ("tool_calls", "tool_call_id", "name"):
                if k in m:
                    entry[k] = m[k]
            out.append(entry)
            
        return out

    def clear(self) -> None:
        """
        清除所有消息并重置会话到初始状态
        """
        self.messages = []
        self.last_consolidated = 0
        self.updated_at = datetime.now()


class SessionManager:
    """
    会话管理器：管理对话会话
    
    会话以 JSONL 文件格式存储在 sessions 目录中。
    
    功能：
    - 创建和获取会话
    - 加载和保存会话
    - 列出所有会话
    - 从旧位置迁移会话
    
    缓存策略：
    - 使用内存缓存提高性能
    - 首次访问时从磁盘加载
    - 保存时更新缓存
    """
    
    def __init__(self, workspace: Path):
        """
        初始化会话管理器
        
        参数：
        - workspace: 工作区路径
        """
        self.workspace = workspace
        # 会话存储目录
        self.sessions_dir = ensure_dir(self.workspace / "sessions")
        # 旧版会话目录（用于迁移）
        self.legacy_sessions_dir = Path.home() / ".nanobot" / "sessions"
        # 内存缓存
        self._cache: dict[str, Session] = {}

    def _get_session_path(self, key: str) -> Path:
        """
        获取会话文件路径
        
        参数：
        - key: 会话键
        
        返回：
        - 会话文件路径
        """
        # 安全化文件名
        safe_key = safe_filename(key.replace(":", "_"))
        return self.sessions_dir / f"{safe_key}.jsonl"

    def _get_legacy_session_path(self, key: str) -> Path:
        """
        获取旧版会话路径（~/.nanobot/sessions/）
        
        参数：
        - key: 会话键
        
        返回：
        - 旧版会话文件路径
        """
        safe_key = safe_filename(key.replace(":", "_"))
        return self.legacy_sessions_dir / f"{safe_key}.jsonl"

    def get_or_create(self, key: str) -> Session:
        """
        获取现有会话或创建新会话
        
        参数：
        - key: 会话键（通常是 channel:chat_id）
        
        返回：
        - 会话对象
        """
        # 检查缓存
        if key in self._cache:
            return self._cache[key]

        # 尝试从磁盘加载
        session = self._load(key)
        if session is None:
            # 创建新会话
            session = Session(key=key)

        # 更新缓存
        self._cache[key] = session
        return session

    def _load(self, key: str) -> Session | None:
        """
        从磁盘加载会话
        
        参数：
        - key: 会话键
        
        返回：
        - 会话对象，如果不存在则返回 None
        """
        # 获取会话路径
        path = self._get_session_path(key)
        
        # 如果新位置不存在，尝试从旧位置迁移
        if not path.exists():
            legacy_path = self._get_legacy_session_path(key)
            if legacy_path.exists():
                try:
                    shutil.move(str(legacy_path), str(path))
                    logger.info("Migrated session {} from legacy path", key)
                except Exception:
                    logger.exception("Failed to migrate session {}", key)

        # 如果仍然不存在，返回 None
        if not path.exists():
            return None

        try:
            messages = []
            metadata = {}
            created_at = None
            last_consolidated = 0

            # 读取 JSONL 文件
            with open(path, encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue

                    data = json.loads(line)

                    # 处理元数据行
                    if data.get("_type") == "metadata":
                        metadata = data.get("metadata", {})
                        created_at = datetime.fromisoformat(data["created_at"]) if data.get("created_at") else None
                        last_consolidated = data.get("last_consolidated", 0)
                    else:
                        # 处理消息行
                        messages.append(data)

            # 返回会话对象
            return Session(
                key=key,
                messages=messages,
                created_at=created_at or datetime.now(),
                metadata=metadata,
                last_consolidated=last_consolidated
            )
        except Exception as e:
            logger.warning("Failed to load session {}: {}", key, e)
            return None

    def save(self, session: Session) -> None:
        """
        保存会话到磁盘
        
        参数：
        - session: 要保存的会话对象
        """
        # 获取会话路径
        path = self._get_session_path(session.key)

        # 写入 JSONL 文件
        with open(path, "w", encoding="utf-8") as f:
            # 写入元数据行
            metadata_line = {
                "_type": "metadata",
                "key": session.key,
                "created_at": session.created_at.isoformat(),
                "updated_at": session.updated_at.isoformat(),
                "metadata": session.metadata,
                "last_consolidated": session.last_consolidated
            }
            f.write(json.dumps(metadata_line, ensure_ascii=False) + "\n")
            
            # 写入消息行
            for msg in session.messages:
                f.write(json.dumps(msg, ensure_ascii=False) + "\n")

        # 更新缓存
        self._cache[session.key] = session

    def invalidate(self, key: str) -> None:
        """
        从内存缓存中移除会话
        
        参数：
        - key: 会话键
        """
        self._cache.pop(key, None)

    def list_sessions(self) -> list[dict[str, Any]]:
        """
        列出所有会话
        
        返回：
        - 会话信息字典列表
        """
        sessions = []

        # 遍历会话目录
        for path in self.sessions_dir.glob("*.jsonl"):
            try:
                # 只读取元数据行
                with open(path, encoding="utf-8") as f:
                    first_line = f.readline().strip()
                    if first_line:
                        data = json.loads(first_line)
                        if data.get("_type") == "metadata":
                            key = data.get("key") or path.stem.replace("_", ":", 1)
                            sessions.append({
                                "key": key,
                                "created_at": data.get("created_at"),
                                "updated_at": data.get("updated_at"),
                                "path": str(path)
                            })
            except Exception:
                continue

        # 按更新时间降序排序
        return sorted(sessions, key=lambda x: x.get("updated_at", ""), reverse=True)
