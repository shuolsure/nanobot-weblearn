"""
异步消息队列：解耦渠道与代理核心

这个模块实现了消息总线，用于解耦聊天渠道和代理核心。

设计思路：
- 使用异步队列实现消息传递
- 双向通信：入站（用户 -> 代理）和出站（代理 -> 用户）
- 非阻塞操作：支持并发处理

消息流向：
1. 入站消息：渠道 -> inbound 队列 -> 代理
2. 出站消息：代理 -> outbound 队列 -> 渠道

架构优势：
- 解耦：渠道和代理独立运行
- 异步：支持高并发处理
- 可扩展：易于添加新渠道
"""

# asyncio：Python 的异步 I/O 框架
import asyncio

# InboundMessage, OutboundMessage：消息类型
from nanobot.bus.events import InboundMessage, OutboundMessage


class MessageBus:
    """
    异步消息总线：解耦聊天渠道与代理核心
    
    消息总线是整个系统的通信枢纽，负责：
    1. 接收来自各渠道的用户消息（入站）
    2. 将消息传递给代理处理
    3. 接收代理的响应（出站）
    4. 将响应路由到正确的渠道
    
    架构设计：
    - 使用两个异步队列：inbound 和 outbound
    - 渠道向 inbound 发布消息
    - 代理从 inbound 消费消息
    - 代理向 outbound 发布响应
    - 渠道从 outbound 消费响应
    
    并发处理：
    - 多个渠道可以同时发布消息
    - 代理可以并发处理多个消息
    - 队列自动处理并发访问
    """
    
    def __init__(self):
        """
        初始化消息总线
        
        创建两个异步队列：
        - inbound: 入站消息队列（用户 -> 代理）
        - outbound: 出站消息队列（代理 -> 用户）
        """
        # 入站消息队列：存储来自用户的消息
        self.inbound: asyncio.Queue[InboundMessage] = asyncio.Queue()
        # 出站消息队列：存储代理的响应
        self.outbound: asyncio.Queue[OutboundMessage] = asyncio.Queue()

    async def publish_inbound(self, msg: InboundMessage) -> None:
        """
        发布入站消息
        
        渠道调用此方法将用户消息放入队列。
        代理会从队列中取出并处理这些消息。
        
        参数：
        - msg: 入站消息对象
        """
        await self.inbound.put(msg)

    async def consume_inbound(self) -> InboundMessage:
        """
        消费入站消息
        
        代理调用此方法获取下一个待处理的消息。
        如果队列为空，会阻塞直到有消息可用。
        
        返回：
        - 下一个入站消息
        """
        return await self.inbound.get()

    async def publish_outbound(self, msg: OutboundMessage) -> None:
        """
        发布出站消息
        
        代理调用此方法将响应放入队列。
        渠道会从队列中取出并发送给用户。
        
        参数：
        - msg: 出站消息对象
        """
        await self.outbound.put(msg)

    async def consume_outbound(self) -> OutboundMessage:
        """
        消费出站消息
        
        渠道调用此方法获取下一个待发送的响应。
        如果队列为空，会阻塞直到有消息可用。
        
        返回：
        - 下一个出站消息
        """
        return await self.outbound.get()

    @property
    def inbound_size(self) -> int:
        """
        入站队列大小
        
        返回：
        - 待处理的入站消息数量
        """
        return self.inbound.qsize()

    @property
    def outbound_size(self) -> int:
        """
        出站队列大小
        
        返回：
        - 待发送的出站消息数量
        """
        return self.outbound.qsize()
