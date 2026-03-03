"""
渠道基类接口：定义聊天平台集成规范

这个模块定义了所有聊天渠道必须实现的基类接口。

设计思路：
- 使用抽象基类（ABC）定义统一接口
- 每个渠道（Telegram, Discord 等）实现这个接口
- 通过消息总线与代理核心通信

渠道职责：
1. 连接到聊天平台
2. 接收用户消息并转发到消息总线
3. 从消息总线接收响应并发送给用户

扩展新渠道：
1. 继承 BaseChannel 类
2. 实现所有抽象方法
3. 在 ChannelManager 中注册
"""

# ABC：抽象基类
# abstractmethod：抽象方法装饰器
from abc import ABC, abstractmethod
# Any：类型注解
from typing import Any

# loguru：日志库
from loguru import logger

# InboundMessage, OutboundMessage：消息类型
from nanobot.bus.events import InboundMessage, OutboundMessage
# MessageBus：消息总线
from nanobot.bus.queue import MessageBus


class BaseChannel(ABC):
    """
    聊天渠道抽象基类
    
    所有聊天渠道（Telegram, Discord, WhatsApp 等）都应该实现这个接口。
    
    设计模式：
    - 模板方法模式：基类定义流程，子类实现细节
    - 策略模式：不同渠道有不同的实现策略
    
    生命周期：
    1. 初始化：设置配置和消息总线
    2. 启动：连接平台，开始监听
    3. 运行：处理消息收发
    4. 停止：断开连接，清理资源
    """
    
    # 渠道名称，子类应该覆盖
    name: str = "base"

    def __init__(self, config: Any, bus: MessageBus):
        """
        初始化渠道
        
        参数：
        - config: 渠道特定的配置（如 API 密钥、令牌等）
        - bus: 消息总线，用于与代理核心通信
        """
        self.config = config
        self.bus = bus
        # 运行状态标志
        self._running = False

    @abstractmethod
    async def start(self) -> None:
        """
        启动渠道并开始监听消息
        
        这应该是一个长时间运行的异步任务：
        1. 连接到聊天平台
        2. 监听传入的消息
        3. 通过 _handle_message() 转发消息到消息总线
        
        子类必须实现此方法。
        """
        pass

    @abstractmethod
    async def stop(self) -> None:
        """
        停止渠道并清理资源
        
        子类必须实现此方法。
        """
        pass

    @abstractmethod
    async def send(self, msg: OutboundMessage) -> None:
        """
        通过此渠道发送消息
        
        参数：
        - msg: 要发送的消息
        
        子类必须实现此方法。
        """
        pass

    def is_allowed(self, sender_id: str) -> bool:
        """
        检查发送者是否有权限
        
        权限控制逻辑：
        - 空列表：拒绝所有
        - 包含 "*"：允许所有
        - 包含具体 ID：只允许列表中的用户
        
        参数：
        - sender_id: 发送者标识
        
        返回：
        - True 表示允许，False 表示拒绝
        """
        # 获取允许列表
        allow_list = getattr(self.config, "allow_from", [])
        
        # 空列表拒绝所有
        if not allow_list:
            logger.warning("{}: allow_from is empty — all access denied", self.name)
            return False
        
        # "*" 允许所有
        if "*" in allow_list:
            return True
        
        # 检查发送者 ID 是否在允许列表中
        sender_str = str(sender_id)
        return sender_str in allow_list or any(
            p in allow_list for p in sender_str.split("|") if p
        )

    async def _handle_message(
        self,
        sender_id: str,                      # 发送者标识
        chat_id: str,                        # 聊天标识
        content: str,                        # 消息内容
        media: list[str] | None = None,      # 媒体文件 URL
        metadata: dict[str, Any] | None = None,  # 元数据
        session_key: str | None = None,      # 会话键覆盖
    ) -> None:
        """
        处理来自聊天平台的传入消息
        
        这个方法检查权限并将消息转发到消息总线。
        
        参数：
        - sender_id: 发送者标识
        - chat_id: 聊天/频道标识
        - content: 消息文本内容
        - media: 媒体文件 URL 列表（可选）
        - metadata: 渠道特定的元数据（可选）
        - session_key: 会话键覆盖（可选，用于线程级别的会话）
        """
        # 检查权限
        if not self.is_allowed(sender_id):
            logger.warning(
                "Access denied for sender {} on channel {}. "
                "Add them to allowFrom list in config to grant access.",
                sender_id, self.name,
            )
            return

        # 创建入站消息
        msg = InboundMessage(
            channel=self.name,
            sender_id=str(sender_id),
            chat_id=str(chat_id),
            content=content,
            media=media or [],
            metadata=metadata or {},
            session_key_override=session_key,
        )

        # 发布到消息总线
        await self.bus.publish_inbound(msg)

    @property
    def is_running(self) -> bool:
        """
        检查渠道是否正在运行
        
        返回：
        - True 表示正在运行
        """
        return self._running
