"""
工具基类模块：定义所有工具的抽象基类

这个模块提供了工具系统的核心抽象，所有代理工具都必须继承 Tool 基类。

设计思路：
- 使用抽象基类（ABC）定义工具接口
- 统一的工具定义格式（名称、描述、参数模式）
- 内置参数验证功能
- 支持转换为 OpenAI 函数调用格式

工具的生命周期：
1. 定义工具类（继承 Tool）
2. 实现抽象方法（name, description, parameters, execute）
3. 注册到工具注册表
4. LLM 调用工具时，验证参数并执行

参数验证：
- 支持 JSON Schema 类型验证
- 支持枚举、范围、长度等约束
- 返回详细的错误信息
"""

# ABC：抽象基类模块，用于定义抽象接口
# abstractmethod：装饰器，标记抽象方法
from abc import ABC, abstractmethod
# Any：类型注解，表示任意类型
from typing import Any


class Tool(ABC):
    """
    工具抽象基类：所有代理工具的父类
    
    工具是代理与环境交互的能力，例如：
    - 读取文件
    - 执行命令
    - 搜索网络
    - 发送消息
    
    子类必须实现以下抽象方法：
    - name: 工具名称
    - description: 工具描述
    - parameters: 参数的 JSON Schema
    - execute: 执行逻辑
    
    设计模式：
    - 模板方法模式：基类定义流程，子类实现细节
    - 策略模式：不同工具有不同的执行策略
    """
    
    # JSON Schema 类型到 Python 类型的映射
    # 用于参数验证时的类型检查
    _TYPE_MAP = {
        "string": str,              # 字符串类型
        "integer": int,             # 整数类型
        "number": (int, float),     # 数字类型（整数或浮点数）
        "boolean": bool,            # 布尔类型
        "array": list,              # 数组类型
        "object": dict,             # 对象类型
    }

    @property
    @abstractmethod
    def name(self) -> str:
        """
        工具名称
        
        用于 LLM 调用时的函数名标识。
        应该使用 snake_case 命名风格，如：read_file, exec_command
        
        返回：
        - 工具名称字符串
        """
        pass

    @property
    @abstractmethod
    def description(self) -> str:
        """
        工具描述
        
        描述工具的功能和用途，LLM 会根据描述决定是否使用此工具。
        应该清晰、简洁地说明工具的作用。
        
        返回：
        - 工具描述字符串
        """
        pass

    @property
    @abstractmethod
    def parameters(self) -> dict[str, Any]:
        """
        参数的 JSON Schema
        
        定义工具接受的参数结构，包括：
        - 参数名称
        - 参数类型
        - 是否必需
        - 约束条件（枚举、范围等）
        
        格式示例：
        {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "文件路径"
                }
            },
            "required": ["path"]
        }
        
        返回：
        - JSON Schema 字典
        """
        pass

    @abstractmethod
    async def execute(self, **kwargs: Any) -> str:
        """
        执行工具
        
        工具的核心执行逻辑，接收参数并返回结果。
        
        参数：
        - **kwargs: 工具特定的参数，与 parameters 定义的 Schema 对应
        
        返回：
        - 执行结果字符串，LLM 会看到这个结果
        
        异常处理：
        - 应该捕获异常并返回错误信息字符串
        - 不要抛出未捕获的异常
        """
        pass

    def validate_params(self, params: dict[str, Any]) -> list[str]:
        """
        验证工具参数
        
        根据 JSON Schema 验证参数是否有效。
        
        参数：
        - params: 要验证的参数字典
        
        返回：
        - 错误信息列表，空列表表示验证通过
        """
        # 获取参数 Schema
        schema = self.parameters or {}
        
        # 确保 Schema 类型为 object
        if schema.get("type", "object") != "object":
            raise ValueError(f"Schema must be object type, got {schema.get('type')!r}")
        
        # 调用内部验证方法
        return self._validate(params, {**schema, "type": "object"}, "")

    def _validate(self, val: Any, schema: dict[str, Any], path: str) -> list[str]:
        """
        内部验证方法：递归验证参数
        
        根据 JSON Schema 规则验证值：
        1. 类型检查
        2. 枚举检查
        3. 数值范围检查
        4. 字符串长度检查
        5. 对象属性检查
        6. 数组元素检查
        
        参数：
        - val: 要验证的值
        - schema: JSON Schema
        - path: 当前验证路径（用于错误信息）
        
        返回：
        - 错误信息列表
        """
        # 获取类型和标签
        t, label = schema.get("type"), path or "parameter"
        
        # 类型检查
        if t in self._TYPE_MAP and not isinstance(val, self._TYPE_MAP[t]):
            return [f"{label} should be {t}"]

        errors = []
        
        # 枚举检查：值必须在枚举列表中
        if "enum" in schema and val not in schema["enum"]:
            errors.append(f"{label} must be one of {schema['enum']}")
        
        # 数值范围检查
        if t in ("integer", "number"):
            # 最小值检查
            if "minimum" in schema and val < schema["minimum"]:
                errors.append(f"{label} must be >= {schema['minimum']}")
            # 最大值检查
            if "maximum" in schema and val > schema["maximum"]:
                errors.append(f"{label} must be <= {schema['maximum']}")
        
        # 字符串长度检查
        if t == "string":
            # 最小长度检查
            if "minLength" in schema and len(val) < schema["minLength"]:
                errors.append(f"{label} must be at least {schema['minLength']} chars")
            # 最大长度检查
            if "maxLength" in schema and len(val) > schema["maxLength"]:
                errors.append(f"{label} must be at most {schema['maxLength']} chars")
        
        # 对象属性检查
        if t == "object":
            props = schema.get("properties", {})
            # 必需属性检查
            for k in schema.get("required", []):
                if k not in val:
                    errors.append(f"missing required {path + '.' + k if path else k}")
            # 递归验证每个属性
            for k, v in val.items():
                if k in props:
                    errors.extend(self._validate(v, props[k], path + "." + k if path else k))
        
        # 数组元素检查
        if t == "array" and "items" in schema:
            # 递归验证每个元素
            for i, item in enumerate(val):
                errors.extend(
                    self._validate(item, schema["items"], f"{path}[{i}]" if path else f"[{i}]")
                )
        
        return errors

    def to_schema(self) -> dict[str, Any]:
        """
        转换为 OpenAI 函数调用格式
        
        将工具定义转换为 OpenAI API 兼容的函数 Schema 格式。
        这个格式会被发送给 LLM，让 LLM 知道有哪些工具可用。
        
        返回：
        - OpenAI 函数 Schema 字典
        """
        return {
            "type": "function",
            "function": {
                "name": self.name,           # 函数名称
                "description": self.description,  # 函数描述
                "parameters": self.parameters,    # 参数 Schema
            },
        }
