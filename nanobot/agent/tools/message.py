"""
消息工具：向用户发送消息

这个模块提供了消息发送工具，允许代理主动向用户发送消息。

设计思路：
- 支持向任意渠道发送消息
- 支持发送媒体附件
- 使用回调函数实际发送消息
- 跟踪当前回合是否已发送消息

使用场景：
- 主动通知用户
- 发送中间结果
- 发送媒体文件

消息流程：
1. 代理调用 message 工具
2. 工具创建 OutboundMessage
3. 调用 send_callback 发送消息
4. 消息总线将消息路由到对应渠道
"""

# Any：类型注解，表示任意类型
# Awaitable：表示可等待的对象（协程）
# Callable：表示可调用对象
from typing import Any, Awaitable, Callable

# Tool：工具基类
from nanobot.agent.tools.base import Tool
# OutboundMessage：出站消息类型
from nanobot.bus.events import OutboundMessage


class MessageTool(Tool):
    """
    消息发送工具
    
    允许代理向用户发送消息。
    
    功能：
    - 发送文本消息
    - 发送媒体附件（图片、音频、文档）
    - 支持指定目标渠道和聊天 ID
    
    设计模式：
    - 使用回调函数实际发送消息
    - 支持上下文设置（默认渠道、聊天 ID）
    - 跟踪当前回合是否已发送消息
    """
    
    def __init__(
        self,
        send_callback: Callable[[OutboundMessage], Awaitable[None]] | None = None,  # 发送回调
        default_channel: str = "",      # 默认渠道
        default_chat_id: str = "",      # 默认聊天 ID
        default_message_id: str | None = None,  # 默认消息 ID（用于回复）
    ):
        """
        初始化消息工具
        
        参数：
        - send_callback: 发送消息的回调函数（异步）
        - default_channel: 默认发送渠道（如 "telegram", "discord"）
        - default_chat_id: 默认聊天 ID
        - default_message_id: 默认消息 ID（用于回复特定消息）
        """
        self._send_callback = send_callback
        self._default_channel = default_channel
        self._default_chat_id = default_chat_id
        self._default_message_id = default_message_id
        # 跟踪当前回合是否已发送消息
        self._sent_in_turn: bool = False

    def set_context(self, channel: str, chat_id: str, message_id: str | None = None) -> None:
        """
        设置当前消息上下文
        
        当处理新消息时调用，设置默认的回复目标。
        
        参数：
        - channel: 渠道名称
        - chat_id: 聊天 ID
        - message_id: 消息 ID（可选）
        """
        self._default_channel = channel
        self._default_chat_id = chat_id
        self._default_message_id = message_id

    def set_send_callback(self, callback: Callable[[OutboundMessage], Awaitable[None]]) -> None:
        """
        设置发送回调函数
        
        参数：
        - callback: 异步回调函数，接收 OutboundMessage
        """
        self._send_callback = callback

    def start_turn(self) -> None:
        """
        开始新回合
        
        重置每回合的发送跟踪。
        在处理新消息时调用。
        """
        self._sent_in_turn = False

    @property
    def name(self) -> str:
        """工具名称：message"""
        return "message"

    @property
    def description(self) -> str:
        """工具描述"""
        return "Send a message to the user. Use this when you want to communicate something."

    @property
    def parameters(self) -> dict[str, Any]:
        """
        参数 Schema
        
        参数：
        - content: 消息内容（必需）
        - channel: 目标渠道（可选）
        - chat_id: 目标聊天 ID（可选）
        - media: 媒体附件路径列表（可选）
        """
        return {
            "type": "object",
            "properties": {
                "content": {
                    "type": "string",
                    "description": "The message content to send"
                },
                "channel": {
                    "type": "string",
                    "description": "Optional: target channel (telegram, discord, etc.)"
                },
                "chat_id": {
                    "type": "string",
                    "description": "Optional: target chat/user ID"
                },
                "media": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Optional: list of file paths to attach (images, audio, documents)"
                }
            },
            "required": ["content"]
        }

    async def execute(
        self,
        content: str,                   # 消息内容
        channel: str | None = None,     # 目标渠道
        chat_id: str | None = None,     # 目标聊天 ID
        message_id: str | None = None,  # 消息 ID（用于回复）
        media: list[str] | None = None, # 媒体附件
        **kwargs: Any
    ) -> str:
        """
        执行消息发送
        
        参数：
        - content: 消息内容
        - channel: 目标渠道（可选，使用默认值）
        - chat_id: 目标聊天 ID（可选，使用默认值）
        - message_id: 消息 ID（可选，用于回复）
        - media: 媒体附件路径列表（可选）
        - **kwargs: 其他参数（忽略）
        
        返回：
        - 发送结果消息，或错误信息
        """
        # 使用提供的值或默认值
        channel = channel or self._default_channel
        chat_id = chat_id or self._default_chat_id
        message_id = message_id or self._default_message_id

        # 检查必要参数
        if not channel or not chat_id:
            return "Error: No target channel/chat specified"

        if not self._send_callback:
            return "Error: Message sending not configured"

        # 创建出站消息
        msg = OutboundMessage(
            channel=channel,
            chat_id=chat_id,
            content=content,
            media=media or [],
            metadata={
                "message_id": message_id,  # 用于回复特定消息
            }
        )

        try:
            # 调用回调发送消息
            await self._send_callback(msg)
            
            # 如果发送到当前上下文，标记为已发送
            if channel == self._default_channel and chat_id == self._default_chat_id:
                self._sent_in_turn = True
            
            # 构建结果消息
            media_info = f" with {len(media)} attachments" if media else ""
            return f"Message sent to {channel}:{chat_id}{media_info}"
            
        except Exception as e:
            return f"Error sending message: {str(e)}"
