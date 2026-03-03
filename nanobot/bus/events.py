"""
消息总线事件类型：定义消息数据结构

这个模块定义了消息总线使用的消息类型。

设计思路：
- 使用 dataclass 定义消息结构
- 区分入站消息（用户发送）和出站消息（代理回复）
- 支持多种渠道和媒体类型

消息流向：
用户 -> 渠道 -> InboundMessage -> 消息总线 -> 代理处理
代理处理 -> OutboundMessage -> 消息总线 -> 渠道 -> 用户
"""

# dataclass：数据类装饰器，自动生成 __init__ 等方法
# field：字段定义，支持默认工厂
from dataclasses import dataclass, field
# datetime：日期时间类型
from datetime import datetime
# Any：类型注解，表示任意类型
from typing import Any


@dataclass
class InboundMessage:
    """
    入站消息：从聊天渠道接收的消息
    
    这是用户发送给代理的消息格式。
    
    属性：
    - channel: 渠道名称（如 telegram, discord, slack, whatsapp）
    - sender_id: 发送者标识
    - chat_id: 聊天/频道标识
    - content: 消息文本内容
    - timestamp: 消息时间戳
    - media: 媒体文件 URL 列表（图片、文件等）
    - metadata: 渠道特定的元数据
    - session_key_override: 可选的会话键覆盖（用于线程级别的会话）
    
    会话键：
    - 默认为 "channel:chat_id" 格式
    - 用于标识唯一的会话
    - 可以通过 session_key_override 覆盖
    """
    
    # 渠道名称：telegram, discord, slack, whatsapp 等
    channel: str
    # 发送者标识：用户 ID
    sender_id: str
    # 聊天标识：聊天/频道 ID
    chat_id: str
    # 消息文本内容
    content: str
    # 时间戳：默认为当前时间
    timestamp: datetime = field(default_factory=datetime.now)
    # 媒体文件 URL 列表：图片、文件等
    media: list[str] = field(default_factory=list)
    # 渠道特定的元数据：如消息 ID、回复信息等
    metadata: dict[str, Any] = field(default_factory=dict)
    # 可选的会话键覆盖：用于线程级别的会话
    session_key_override: str | None = None

    @property
    def session_key(self) -> str:
        """
        会话键：唯一标识一个会话
        
        格式："{channel}:{chat_id}"
        
        用途：
        - 会话管理：根据会话键获取或创建会话
        - 消息路由：确保消息发送到正确的会话
        
        返回：
        - 会话键字符串
        """
        # 如果有覆盖值，使用覆盖值；否则使用默认格式
        return self.session_key_override or f"{self.channel}:{self.chat_id}"


@dataclass
class OutboundMessage:
    """
    出站消息：发送到聊天渠道的消息
    
    这是代理发送给用户的消息格式。
    
    属性：
    - channel: 目标渠道名称
    - chat_id: 目标聊天/频道标识
    - content: 消息文本内容
    - reply_to: 要回复的消息 ID（可选）
    - media: 媒体文件路径列表
    - metadata: 渠道特定的元数据
    
    使用场景：
    - 代理回复用户消息
    - 代理主动发送通知
    - 子代理报告结果
    """
    
    # 目标渠道名称
    channel: str
    # 目标聊天标识
    chat_id: str
    # 消息文本内容
    content: str
    # 要回复的消息 ID（可选，用于回复特定消息）
    reply_to: str | None = None
    # 媒体文件路径列表：图片、文件等
    media: list[str] = field(default_factory=list)
    # 渠道特定的元数据
    metadata: dict[str, Any] = field(default_factory=dict)
