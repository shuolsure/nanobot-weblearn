"""
MCP 客户端：连接 MCP 服务器并包装工具

这个模块实现了 MCP（Model Context Protocol）客户端，允许代理使用外部 MCP 服务器提供的工具。

设计思路：
- MCP 是一种标准协议，用于连接外部工具服务器
- 将 MCP 工具包装为 nanobot 原生工具
- 支持 stdio 和 HTTP 两种传输方式
- 自动发现和注册 MCP 服务器的工具

MCP 架构：
1. MCP 服务器：提供工具的外部进程或服务
2. MCP 客户端：连接服务器并调用工具
3. MCPToolWrapper：将 MCP 工具包装为 nanobot 工具

传输方式：
- stdio：通过标准输入/输出与本地进程通信
- HTTP：通过 HTTP 与远程服务通信

使用场景：
- 集成外部工具和服务
- 扩展代理能力
- 访问特定领域的工具
"""

# asyncio：Python 的异步 I/O 框架
import asyncio
# AsyncExitStack：异步上下文管理器栈
from contextlib import AsyncExitStack
# Any：类型注解
from typing import Any

# httpx：HTTP 客户端库
import httpx
# loguru：日志库
from loguru import logger

# Tool：工具基类
from nanobot.agent.tools.base import Tool
# ToolRegistry：工具注册表
from nanobot.agent.tools.registry import ToolRegistry


class MCPToolWrapper(Tool):
    """
    MCP 工具包装器
    
    将单个 MCP 服务器工具包装为 nanobot 原生工具。
    
    功能：
    - 包装 MCP 工具为 nanobot 工具格式
    - 转发工具调用到 MCP 服务器
    - 处理超时和错误
    
    命名规则：
    - 原始名称：MCP 服务器定义的工具名
    - 包装名称：mcp_{server_name}_{tool_name}
    """
    
    def __init__(self, session, server_name: str, tool_def, tool_timeout: int = 30):
        """
        初始化 MCP 工具包装器
        
        参数：
        - session: MCP 会话
        - server_name: MCP 服务器名称
        - tool_def: MCP 工具定义
        - tool_timeout: 工具调用超时时间（秒）
        """
        self._session = session
        # 保存原始工具名称
        self._original_name = tool_def.name
        # 生成包装后的名称
        self._name = f"mcp_{server_name}_{tool_def.name}"
        # 工具描述
        self._description = tool_def.description or tool_def.name
        # 参数 Schema
        self._parameters = tool_def.inputSchema or {"type": "object", "properties": {}}
        # 超时时间
        self._tool_timeout = tool_timeout

    @property
    def name(self) -> str:
        """工具名称（包装后的名称）"""
        return self._name

    @property
    def description(self) -> str:
        """工具描述"""
        return self._description

    @property
    def parameters(self) -> dict[str, Any]:
        """参数 Schema"""
        return self._parameters

    async def execute(self, **kwargs: Any) -> str:
        """
        执行 MCP 工具调用
        
        参数：
        - **kwargs: 工具参数
        
        返回：
        - 工具执行结果字符串
        """
        # 导入 MCP 类型定义
        from mcp import types
        
        try:
            # 调用 MCP 工具（带超时）
            result = await asyncio.wait_for(
                self._session.call_tool(self._original_name, arguments=kwargs),
                timeout=self._tool_timeout,
            )
        except asyncio.TimeoutError:
            # 超时处理
            logger.warning("MCP tool '{}' timed out after {}s", self._name, self._tool_timeout)
            return f"(MCP tool call timed out after {self._tool_timeout}s)"
        
        # 处理返回结果
        parts = []
        for block in result.content:
            # 处理文本内容
            if isinstance(block, types.TextContent):
                parts.append(block.text)
            else:
                # 其他类型转为字符串
                parts.append(str(block))
        
        return "\n".join(parts) or "(no output)"


async def connect_mcp_servers(
    mcp_servers: dict,       # MCP 服务器配置字典
    registry: ToolRegistry,  # 工具注册表
    stack: AsyncExitStack    # 异步上下文管理器栈
) -> None:
    """
    连接配置的 MCP 服务器并注册其工具
    
    处理流程：
    1. 遍历所有配置的 MCP 服务器
    2. 根据配置选择传输方式（stdio 或 HTTP）
    3. 建立连接并初始化会话
    4. 获取服务器提供的工具列表
    5. 包装并注册每个工具
    
    参数：
    - mcp_servers: MCP 服务器配置字典 {name: config}
    - registry: 工具注册表，用于注册包装后的工具
    - stack: 异步上下文管理器栈，用于管理连接生命周期
    """
    # 导入 MCP 客户端模块
    from mcp import ClientSession, StdioServerParameters
    from mcp.client.stdio import stdio_client

    # 遍历所有 MCP 服务器配置
    for name, cfg in mcp_servers.items():
        try:
            # 根据配置选择传输方式
            if cfg.command:
                # stdio 传输：启动本地进程
                params = StdioServerParameters(
                    command=cfg.command,   # 命令
                    args=cfg.args,         # 参数
                    env=cfg.env or None    # 环境变量
                )
                # 建立 stdio 连接
                read, write = await stack.enter_async_context(stdio_client(params))
                
            elif cfg.url:
                # HTTP 传输：连接远程服务
                from mcp.client.streamable_http import streamable_http_client
                
                # 创建 HTTP 客户端
                # 注意：设置 timeout=None 以避免 httpx 默认的 5 秒超时
                http_client = await stack.enter_async_context(
                    httpx.AsyncClient(
                        headers=cfg.headers or None,
                        follow_redirects=True,
                        timeout=None,  # 禁用超时，使用工具级别的超时
                    )
                )
                # 建立 HTTP 连接
                read, write, _ = await stack.enter_async_context(
                    streamable_http_client(cfg.url, http_client=http_client)
                )
            else:
                # 没有配置命令或 URL，跳过
                logger.warning("MCP server '{}': no command or url configured, skipping", name)
                continue

            # 创建 MCP 会话
            session = await stack.enter_async_context(ClientSession(read, write))
            
            # 初始化会话
            await session.initialize()

            # 获取服务器提供的工具列表
            tools = await session.list_tools()
            
            # 包装并注册每个工具
            for tool_def in tools.tools:
                wrapper = MCPToolWrapper(session, name, tool_def, tool_timeout=cfg.tool_timeout)
                registry.register(wrapper)
                logger.debug("MCP: registered tool '{}' from server '{}'", wrapper.name, name)

            logger.info("MCP server '{}': connected, {} tools registered", name, len(tools.tools))
            
        except Exception as e:
            # 连接失败，记录错误并继续处理其他服务器
            logger.error("MCP server '{}': failed to connect: {}", name, e)
