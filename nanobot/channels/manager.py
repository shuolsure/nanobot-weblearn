"""
渠道管理器：协调聊天渠道

这个模块管理所有聊天渠道并协调消息路由。

设计思路：
- 统一管理所有渠道的生命周期
- 根据配置动态加载渠道
- 路由出站消息到正确的渠道

职责：
1. 初始化已启用的渠道
2. 启动/停止渠道
3. 分发出站消息

支持的渠道：
- Telegram
- WhatsApp
- Discord
- Feishu（飞书）
- Mochat
- DingTalk（钉钉）
- Email
- Slack
- QQ
- Matrix
"""

# __future__：启用未来版本的特性
from __future__ import annotations

# asyncio：Python 的异步 I/O 框架
import asyncio
# Any：类型注解
from typing import Any

# loguru：日志库
from loguru import logger

# OutboundMessage：出站消息类型
from nanobot.bus.events import OutboundMessage
# MessageBus：消息总线
from nanobot.bus.queue import MessageBus
# BaseChannel：渠道基类
from nanobot.channels.base import BaseChannel
# Config：配置类型
from nanobot.config.schema import Config


class ChannelManager:
    """
    渠道管理器：管理聊天渠道并协调消息路由
    
    职责：
    - 初始化已启用的渠道（Telegram, WhatsApp 等）
    - 启动/停止渠道
    - 路由出站消息
    
    工作流程：
    1. 根据配置初始化渠道
    2. 启动所有渠道和出站分发器
    3. 出站分发器持续监听消息总线
    4. 将出站消息路由到正确的渠道
    """
    
    def __init__(self, config: Config, bus: MessageBus):
        """
        初始化渠道管理器
        
        参数：
        - config: 全局配置
        - bus: 消息总线
        """
        self.config = config
        self.bus = bus
        # 渠道字典：{渠道名称: 渠道实例}
        self.channels: dict[str, BaseChannel] = {}
        # 出站分发任务
        self._dispatch_task: asyncio.Task | None = None

        # 初始化渠道
        self._init_channels()

    def _init_channels(self) -> None:
        """
        根据配置初始化渠道
        
        遍历配置中的渠道设置，加载已启用的渠道。
        使用延迟导入避免加载未使用的依赖。
        """
        # Telegram 渠道
        if self.config.channels.telegram.enabled:
            try:
                from nanobot.channels.telegram import TelegramChannel
                self.channels["telegram"] = TelegramChannel(
                    self.config.channels.telegram,
                    self.bus,
                    groq_api_key=self.config.providers.groq.api_key,
                )
                logger.info("Telegram channel enabled")
            except ImportError as e:
                logger.warning("Telegram channel not available: {}", e)

        # WhatsApp 渠道
        if self.config.channels.whatsapp.enabled:
            try:
                from nanobot.channels.whatsapp import WhatsAppChannel
                self.channels["whatsapp"] = WhatsAppChannel(
                    self.config.channels.whatsapp, self.bus
                )
                logger.info("WhatsApp channel enabled")
            except ImportError as e:
                logger.warning("WhatsApp channel not available: {}", e)

        # Discord 渠道
        if self.config.channels.discord.enabled:
            try:
                from nanobot.channels.discord import DiscordChannel
                self.channels["discord"] = DiscordChannel(
                    self.config.channels.discord, self.bus
                )
                logger.info("Discord channel enabled")
            except ImportError as e:
                logger.warning("Discord channel not available: {}", e)

        # Feishu（飞书）渠道
        if self.config.channels.feishu.enabled:
            try:
                from nanobot.channels.feishu import FeishuChannel
                self.channels["feishu"] = FeishuChannel(
                    self.config.channels.feishu, self.bus
                )
                logger.info("Feishu channel enabled")
            except ImportError as e:
                logger.warning("Feishu channel not available: {}", e)

        # Mochat 渠道
        if self.config.channels.mochat.enabled:
            try:
                from nanobot.channels.mochat import MochatChannel
                self.channels["mochat"] = MochatChannel(
                    self.config.channels.mochat, self.bus
                )
                logger.info("Mochat channel enabled")
            except ImportError as e:
                logger.warning("Mochat channel not available: {}", e)

        # DingTalk（钉钉）渠道
        if self.config.channels.dingtalk.enabled:
            try:
                from nanobot.channels.dingtalk import DingTalkChannel
                self.channels["dingtalk"] = DingTalkChannel(
                    self.config.channels.dingtalk, self.bus
                )
                logger.info("DingTalk channel enabled")
            except ImportError as e:
                logger.warning("DingTalk channel not available: {}", e)

        # Email 渠道
        if self.config.channels.email.enabled:
            try:
                from nanobot.channels.email import EmailChannel
                self.channels["email"] = EmailChannel(
                    self.config.channels.email, self.bus
                )
                logger.info("Email channel enabled")
            except ImportError as e:
                logger.warning("Email channel not available: {}", e)

        # Slack 渠道
        if self.config.channels.slack.enabled:
            try:
                from nanobot.channels.slack import SlackChannel
                self.channels["slack"] = SlackChannel(
                    self.config.channels.slack, self.bus
                )
                logger.info("Slack channel enabled")
            except ImportError as e:
                logger.warning("Slack channel not available: {}", e)

        # QQ 渠道
        if self.config.channels.qq.enabled:
            try:
                from nanobot.channels.qq import QQChannel
                self.channels["qq"] = QQChannel(
                    self.config.channels.qq,
                    self.bus,
                )
                logger.info("QQ channel enabled")
            except ImportError as e:
                logger.warning("QQ channel not available: {}", e)

        # Matrix 渠道
        if self.config.channels.matrix.enabled:
            try:
                from nanobot.channels.matrix import MatrixChannel
                self.channels["matrix"] = MatrixChannel(
                    self.config.channels.matrix,
                    self.bus,
                )
                logger.info("Matrix channel enabled")
            except ImportError as e:
                logger.warning("Matrix channel not available: {}", e)

        # 验证 allow_from 配置
        self._validate_allow_from()

    def _validate_allow_from(self) -> None:
        """
        验证 allow_from 配置
        
        确保没有渠道配置了空的 allow_from 列表，
        因为空列表会拒绝所有用户。
        """
        for name, ch in self.channels.items():
            if getattr(ch.config, "allow_from", None) == []:
                raise SystemExit(
                    f'Error: "{name}" has empty allowFrom (denies all). '
                    f'Set ["*"] to allow everyone, or add specific user IDs.'
                )

    async def _start_channel(self, name: str, channel: BaseChannel) -> None:
        """
        启动单个渠道并记录异常
        
        参数：
        - name: 渠道名称
        - channel: 渠道实例
        """
        try:
            await channel.start()
        except Exception as e:
            logger.error("Failed to start channel {}: {}", name, e)

    async def start_all(self) -> None:
        """
        启动所有渠道和出站分发器
        
        流程：
        1. 启动出站分发器（监听消息总线）
        2. 启动所有渠道（并发启动）
        3. 等待所有渠道运行（它们应该永远运行）
        """
        if not self.channels:
            logger.warning("No channels enabled")
            return

        # 启动出站分发器
        self._dispatch_task = asyncio.create_task(self._dispatch_outbound())

        # 启动所有渠道
        tasks = []
        for name, channel in self.channels.items():
            logger.info("Starting {} channel...", name)
            tasks.append(asyncio.create_task(self._start_channel(name, channel)))

        # 等待所有渠道完成（它们应该永远运行）
        await asyncio.gather(*tasks, return_exceptions=True)

    async def stop_all(self) -> None:
        """
        停止所有渠道和分发器
        
        流程：
        1. 取消出站分发器
        2. 停止所有渠道
        """
        logger.info("Stopping all channels...")

        # 停止分发器
        if self._dispatch_task:
            self._dispatch_task.cancel()
            try:
                await self._dispatch_task
            except asyncio.CancelledError:
                pass

        # 停止所有渠道
        for name, channel in self.channels.items():
            try:
                await channel.stop()
                logger.info("Stopped {} channel", name)
            except Exception as e:
                logger.error("Error stopping {}: {}", name, e)

    async def _dispatch_outbound(self) -> None:
        """
        分发出站消息到正确的渠道
        
        这是一个持续运行的任务：
        1. 从消息总线消费出站消息
        2. 根据消息的渠道字段路由到正确的渠道
        3. 调用渠道的 send 方法发送消息
        
        进度消息处理：
        - 检查配置决定是否发送进度消息
        - 检查配置决定是否发送工具提示
        """
        logger.info("Outbound dispatcher started")

        while True:
            try:
                # 等待出站消息（带超时）
                msg = await asyncio.wait_for(
                    self.bus.consume_outbound(),
                    timeout=1.0
                )

                # 处理进度消息
                if msg.metadata.get("_progress"):
                    # 检查是否发送工具提示
                    if msg.metadata.get("_tool_hint") and not self.config.channels.send_tool_hints:
                        continue
                    # 检查是否发送进度消息
                    if not msg.metadata.get("_tool_hint") and not self.config.channels.send_progress:
                        continue

                # 获取目标渠道
                channel = self.channels.get(msg.channel)
                if channel:
                    try:
                        # 发送消息
                        await channel.send(msg)
                    except Exception as e:
                        logger.error("Error sending to {}: {}", msg.channel, e)
                else:
                    logger.warning("Unknown channel: {}", msg.channel)

            except asyncio.TimeoutError:
                # 超时继续等待
                continue
            except asyncio.CancelledError:
                # 被取消时退出
                break

    def get_channel(self, name: str) -> BaseChannel | None:
        """
        按名称获取渠道
        
        参数：
        - name: 渠道名称
        
        返回：
        - 渠道实例，如果不存在则返回 None
        """
        return self.channels.get(name)

    def get_status(self) -> dict[str, Any]:
        """
        获取所有渠道的状态
        
        返回：
        - 渠道状态字典 {渠道名称: {enabled, running}}
        """
        return {
            name: {
                "enabled": True,
                "running": channel.is_running
            }
            for name, channel in self.channels.items()
        }
