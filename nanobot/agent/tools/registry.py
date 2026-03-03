"""
工具注册表模块：动态工具管理

这个模块提供了工具注册表，用于动态注册、管理和执行工具。

设计思路：
- 使用注册表模式集中管理所有工具
- 支持动态注册和注销工具
- 提供统一的工具执行入口
- 自动参数验证和错误处理

工具注册流程：
1. 创建 ToolRegistry 实例
2. 创建工具实例（继承 Tool 的类）
3. 调用 register() 注册工具
4. 通过 execute() 执行工具

错误处理：
- 工具不存在时返回友好错误
- 参数验证失败时返回详细错误
- 执行异常时捕获并返回错误信息
- 所有错误都附带提示，帮助 LLM 纠正
"""

# Any：类型注解，表示任意类型
from typing import Any

# Tool：工具基类
from nanobot.agent.tools.base import Tool


class ToolRegistry:
    """
    工具注册表：集中管理代理工具
    
    功能：
    1. 注册工具：将工具添加到注册表
    2. 注销工具：从注册表移除工具
    3. 获取工具：按名称获取工具实例
    4. 执行工具：验证参数并执行工具
    5. 获取定义：返回所有工具的 Schema
    
    设计模式：
    - 注册表模式：集中管理工具实例
    - 外观模式：提供统一的工具执行接口
    """
    
    def __init__(self):
        """
        初始化工具注册表
        
        创建一个空的工具字典来存储注册的工具。
        """
        # 工具字典：名称 -> 工具实例
        self._tools: dict[str, Tool] = {}

    def register(self, tool: Tool) -> None:
        """
        注册工具
        
        将工具实例添加到注册表。如果同名工具已存在，会被覆盖。
        
        参数：
        - tool: 要注册的工具实例（必须继承 Tool）
        """
        self._tools[tool.name] = tool

    def unregister(self, name: str) -> None:
        """
        注销工具
        
        从注册表移除指定名称的工具。如果工具不存在，静默忽略。
        
        参数：
        - name: 要注销的工具名称
        """
        self._tools.pop(name, None)

    def get(self, name: str) -> Tool | None:
        """
        获取工具
        
        按名称获取工具实例。
        
        参数：
        - name: 工具名称
        
        返回：
        - 工具实例，如果不存在则返回 None
        """
        return self._tools.get(name)

    def has(self, name: str) -> bool:
        """
        检查工具是否存在
        
        参数：
        - name: 工具名称
        
        返回：
        - True 表示工具已注册，False 表示未注册
        """
        return name in self._tools

    def get_definitions(self) -> list[dict[str, Any]]:
        """
        获取所有工具定义
        
        返回所有注册工具的 OpenAI 函数 Schema 列表。
        这个列表会被发送给 LLM，让 LLM 知道有哪些工具可用。
        
        返回：
        - OpenAI 函数 Schema 列表
        """
        return [tool.to_schema() for tool in self._tools.values()]

    async def execute(self, name: str, params: dict[str, Any]) -> str:
        """
        执行工具
        
        这是工具执行的主入口，负责：
        1. 查找工具
        2. 验证参数
        3. 执行工具
        4. 处理错误
        
        参数：
        - name: 工具名称
        - params: 工具参数字典
        
        返回：
        - 执行结果字符串
        
        错误处理：
        - 工具不存在：返回可用工具列表
        - 参数无效：返回详细错误信息
        - 执行异常：捕获并返回错误信息
        - 所有错误都附带提示，帮助 LLM 纠正
        """
        # 错误提示后缀：引导 LLM 分析错误并尝试其他方法
        _HINT = "\n\n[Analyze the error above and try a different approach.]"

        # 查找工具
        tool = self._tools.get(name)
        if not tool:
            # 工具不存在，返回可用工具列表
            return f"Error: Tool '{name}' not found. Available: {', '.join(self.tool_names)}"

        try:
            # 验证参数
            errors = tool.validate_params(params)
            if errors:
                # 参数无效，返回详细错误信息
                return f"Error: Invalid parameters for tool '{name}': " + "; ".join(errors) + _HINT
            
            # 执行工具
            result = await tool.execute(**params)
            
            # 检查结果是否以 "Error" 开头
            # 某些工具会返回错误字符串而不是抛出异常
            if isinstance(result, str) and result.startswith("Error"):
                return result + _HINT
            
            return result
            
        except Exception as e:
            # 捕获执行异常并返回错误信息
            return f"Error executing {name}: {str(e)}" + _HINT

    @property
    def tool_names(self) -> list[str]:
        """
        获取所有注册工具的名称列表
        
        返回：
        - 工具名称列表
        """
        return list(self._tools.keys())

    def __len__(self) -> int:
        """
        返回注册工具的数量
        
        返回：
        - 工具数量
        """
        return len(self._tools)

    def __contains__(self, name: str) -> bool:
        """
        支持使用 `in` 操作符检查工具是否存在
        
        参数：
        - name: 工具名称
        
        返回：
        - True 表示工具已注册
        """
        return name in self._tools
