"""
LLM 提供商基类接口：定义语言模型调用规范

这个模块定义了所有 LLM 提供商必须实现的基类接口。

设计思路：
- 使用抽象基类定义统一接口
- 支持多种 LLM 提供商（OpenAI, Anthropic, DeepSeek 等）
- 统一处理文本响应和工具调用

核心概念：
1. ToolCallRequest：LLM 请求调用的工具
2. LLMResponse：LLM 的响应，包含文本和/或工具调用
3. LLMProvider：提供商抽象基类

扩展新提供商：
1. 继承 LLMProvider 类
2. 实现所有抽象方法
3. 在 registry.py 中注册
"""

# ABC：抽象基类
# abstractmethod：抽象方法装饰器
from abc import ABC, abstractmethod
# dataclass：数据类装饰器
# field：字段定义
from dataclasses import dataclass, field
# Any：类型注解
from typing import Any


@dataclass
class ToolCallRequest:
    """
    工具调用请求：LLM 请求调用的工具
    
    当 LLM 决定使用工具时，会返回一个或多个工具调用请求。
    
    属性：
    - id: 工具调用的唯一标识符
    - name: 要调用的工具名称
    - arguments: 工具参数（字典格式）
    
    工作流程：
    1. LLM 返回工具调用请求
    2. 代理执行工具
    3. 将结果返回给 LLM
    """
    # 工具调用 ID（用于关联调用和结果）
    id: str
    # 工具名称
    name: str
    # 工具参数
    arguments: dict[str, Any]


@dataclass
class LLMResponse:
    """
    LLM 响应：语言模型的返回结果
    
    统一封装不同提供商的响应格式。
    
    属性：
    - content: 文本内容（可能为 None，如果只有工具调用）
    - tool_calls: 工具调用请求列表
    - finish_reason: 结束原因（stop, tool_calls, length 等）
    - usage: Token 使用统计
    - reasoning_content: 推理内容（Kimi, DeepSeek-R1 等）
    - thinking_blocks: 思考块（Anthropic 扩展思考）
    
    响应类型：
    1. 纯文本响应：只有 content
    2. 工具调用响应：只有 tool_calls
    3. 混合响应：同时有 content 和 tool_calls
    """
    # 文本内容
    content: str | None
    # 工具调用请求列表
    tool_calls: list[ToolCallRequest] = field(default_factory=list)
    # 结束原因
    finish_reason: str = "stop"
    # Token 使用统计
    usage: dict[str, int] = field(default_factory=dict)
    # 推理内容（用于 Kimi, DeepSeek-R1 等推理模型）
    reasoning_content: str | None = None
    # 思考块（用于 Anthropic 扩展思考）
    thinking_blocks: list[dict] | None = None

    @property
    def has_tool_calls(self) -> bool:
        """
        检查响应是否包含工具调用
        
        返回：
        - True 表示有工具调用
        """
        return len(self.tool_calls) > 0


class LLMProvider(ABC):
    """
    LLM 提供商抽象基类
    
    所有 LLM 提供商（OpenAI, Anthropic, DeepSeek 等）都应该实现这个接口。
    
    设计模式：
    - 策略模式：不同提供商有不同的实现策略
    - 模板方法模式：基类定义通用逻辑
    
    职责：
    1. 与 LLM API 通信
    2. 处理消息格式转换
    3. 解析响应
    4. 处理工具调用
    """
    
    def __init__(self, api_key: str | None = None, api_base: str | None = None):
        """
        初始化提供商
        
        参数：
        - api_key: API 密钥
        - api_base: API 基础 URL（可选，用于自定义端点）
        """
        self.api_key = api_key
        self.api_base = api_base

    @staticmethod
    def _sanitize_empty_content(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """
        清理空内容：替换会导致提供商 400 错误的空文本内容
        
        空内容可能出现在 MCP 工具返回空结果时。
        大多数提供商拒绝空字符串内容或空文本块。
        
        参数：
        - messages: 消息列表
        
        返回：
        - 清理后的消息列表
        """
        result: list[dict[str, Any]] = []
        
        for msg in messages:
            content = msg.get("content")

            # 处理空字符串内容
            if isinstance(content, str) and not content:
                clean = dict(msg)
                # 如果是助手消息且有工具调用，设为 None
                # 否则设为 "(empty)"
                clean["content"] = None if (msg.get("role") == "assistant" and msg.get("tool_calls")) else "(empty)"
                result.append(clean)
                continue

            # 处理列表格式的内容（多模态消息）
            if isinstance(content, list):
                # 过滤掉空的文本块
                filtered = [
                    item for item in content
                    if not (
                        isinstance(item, dict)
                        and item.get("type") in ("text", "input_text", "output_text")
                        and not item.get("text")
                    )
                ]
                
                # 如果过滤后内容有变化，需要清理
                if len(filtered) != len(content):
                    clean = dict(msg)
                    if filtered:
                        clean["content"] = filtered
                    elif msg.get("role") == "assistant" and msg.get("tool_calls"):
                        clean["content"] = None
                    else:
                        clean["content"] = "(empty)"
                    result.append(clean)
                    continue

            # 处理字典格式的内容（单块内容）
            if isinstance(content, dict):
                clean = dict(msg)
                clean["content"] = [content]
                result.append(clean)
                continue

            # 其他情况保持不变
            result.append(msg)
            
        return result

    @abstractmethod
    async def chat(
        self,
        messages: list[dict[str, Any]],      # 消息列表
        tools: list[dict[str, Any]] | None = None,  # 工具定义
        model: str | None = None,            # 模型名称
        max_tokens: int = 4096,              # 最大 Token 数
        temperature: float = 0.7,            # 温度参数
        reasoning_effort: str | None = None, # 推理努力程度
    ) -> LLMResponse:
        """
        发送聊天完成请求
        
        参数：
        - messages: 消息列表，每条消息有 'role' 和 'content'
        - tools: 工具定义列表（可选）
        - model: 模型标识符（提供商特定）
        - max_tokens: 响应中的最大 Token 数
        - temperature: 采样温度（0-2）
        - reasoning_effort: 推理努力程度（用于推理模型）
        
        返回：
        - LLMResponse：包含内容和/或工具调用的响应
        
        子类必须实现此方法。
        """
        pass

    @abstractmethod
    def get_default_model(self) -> str:
        """
        获取此提供商的默认模型
        
        返回：
        - 默认模型名称
        
        子类必须实现此方法。
        """
        pass
