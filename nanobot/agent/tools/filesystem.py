"""
文件系统工具：读取、写入、编辑、列出目录

这个模块提供了文件系统操作工具，允许代理与文件系统交互。

设计思路：
- 统一的路径解析和安全检查
- 支持工作目录限制
- 提供友好的错误信息
- 编辑工具提供差异对比

安全机制：
- 路径解析：将相对路径转换为绝对路径
- 目录限制：只允许操作指定目录内的文件
- 权限检查：捕获并报告权限错误

工具列表：
1. ReadFileTool：读取文件内容
2. WriteFileTool：写入文件内容
3. EditFileTool：编辑文件（替换文本）
4. ListDirTool：列出目录内容
"""

# difflib：Python 标准库，用于比较文本差异
import difflib
# Path：面向对象的文件路径处理类
from pathlib import Path
# Any：类型注解，表示任意类型
from typing import Any

# Tool：工具基类
from nanobot.agent.tools.base import Tool


def _resolve_path(
    path: str,                           # 输入路径
    workspace: Path | None = None,       # 工作目录
    allowed_dir: Path | None = None      # 允许的目录
) -> Path:
    """
    解析路径并执行安全检查
    
    处理流程：
    1. 展开 ~ 为用户目录
    2. 如果是相对路径，相对于工作目录解析
    3. 如果设置了 allowed_dir，检查路径是否在允许范围内
    
    参数：
    - path: 输入路径字符串
    - workspace: 工作目录，用于解析相对路径
    - allowed_dir: 允许访问的目录，用于安全检查
    
    返回：
    - 解析后的绝对路径
    
    异常：
    - PermissionError: 路径超出允许范围
    """
    # 创建 Path 对象并展开 ~ 
    p = Path(path).expanduser()
    
    # 如果是相对路径且有工作目录，相对于工作目录解析
    if not p.is_absolute() and workspace:
        p = workspace / p
    
    # 获取绝对路径
    resolved = p.resolve()
    
    # 安全检查：路径必须在允许的目录内
    if allowed_dir:
        try:
            # 尝试计算相对路径，如果失败说明不在允许范围内
            resolved.relative_to(allowed_dir.resolve())
        except ValueError:
            raise PermissionError(f"Path {path} is outside allowed directory {allowed_dir}")
    
    return resolved


class ReadFileTool(Tool):
    """
    文件读取工具
    
    读取指定路径的文件内容。
    
    功能：
    - 读取文本文件
    - 自动处理相对路径
    - 安全检查（目录限制）
    
    限制：
    - 只支持 UTF-8 编码
    - 不支持二进制文件
    """
    
    def __init__(self, workspace: Path | None = None, allowed_dir: Path | None = None):
        """
        初始化文件读取工具
        
        参数：
        - workspace: 工作目录，用于解析相对路径
        - allowed_dir: 允许访问的目录，用于安全检查
        """
        self._workspace = workspace
        self._allowed_dir = allowed_dir

    @property
    def name(self) -> str:
        """工具名称：read_file"""
        return "read_file"

    @property
    def description(self) -> str:
        """工具描述"""
        return "Read the contents of a file at the given path."

    @property
    def parameters(self) -> dict[str, Any]:
        """参数 Schema"""
        return {
            "type": "object",
            "properties": {"path": {"type": "string", "description": "The file path to read"}},
            "required": ["path"],
        }

    async def execute(self, path: str, **kwargs: Any) -> str:
        """
        执行文件读取
        
        参数：
        - path: 文件路径
        - **kwargs: 其他参数（忽略）
        
        返回：
        - 文件内容字符串，或错误信息
        """
        try:
            # 解析路径并检查权限
            file_path = _resolve_path(path, self._workspace, self._allowed_dir)
            
            # 检查文件是否存在
            if not file_path.exists():
                return f"Error: File not found: {path}"
            
            # 检查是否是文件
            if not file_path.is_file():
                return f"Error: Not a file: {path}"

            # 读取文件内容
            content = file_path.read_text(encoding="utf-8")
            return content
            
        except PermissionError as e:
            return f"Error: {e}"
        except Exception as e:
            return f"Error reading file: {str(e)}"


class WriteFileTool(Tool):
    """
    文件写入工具
    
    将内容写入指定路径的文件。
    
    功能：
    - 写入文本文件
    - 自动创建父目录
    - 覆盖现有文件
    
    限制：
    - 只支持 UTF-8 编码
    - 不支持追加模式
    """
    
    def __init__(self, workspace: Path | None = None, allowed_dir: Path | None = None):
        """
        初始化文件写入工具
        
        参数：
        - workspace: 工作目录，用于解析相对路径
        - allowed_dir: 允许访问的目录，用于安全检查
        """
        self._workspace = workspace
        self._allowed_dir = allowed_dir

    @property
    def name(self) -> str:
        """工具名称：write_file"""
        return "write_file"

    @property
    def description(self) -> str:
        """工具描述"""
        return "Write content to a file at the given path. Creates parent directories if needed."

    @property
    def parameters(self) -> dict[str, Any]:
        """参数 Schema"""
        return {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "The file path to write to"},
                "content": {"type": "string", "description": "The content to write"},
            },
            "required": ["path", "content"],
        }

    async def execute(self, path: str, content: str, **kwargs: Any) -> str:
        """
        执行文件写入
        
        参数：
        - path: 文件路径
        - content: 要写入的内容
        - **kwargs: 其他参数（忽略）
        
        返回：
        - 成功消息，或错误信息
        """
        try:
            # 解析路径并检查权限
            file_path = _resolve_path(path, self._workspace, self._allowed_dir)
            
            # 创建父目录（如果不存在）
            file_path.parent.mkdir(parents=True, exist_ok=True)
            
            # 写入文件
            file_path.write_text(content, encoding="utf-8")
            
            return f"Successfully wrote {len(content)} bytes to {file_path}"
            
        except PermissionError as e:
            return f"Error: {e}"
        except Exception as e:
            return f"Error writing file: {str(e)}"


class EditFileTool(Tool):
    """
    文件编辑工具
    
    通过查找和替换文本编辑文件。
    
    功能：
    - 精确查找和替换
    - 检测多次出现
    - 提供差异对比帮助定位
    
    设计思路：
    - 要求 old_text 必须精确匹配
    - 如果有多次出现，提示用户提供更多上下文
    - 如果找不到，提供最相似的文本对比
    """
    
    def __init__(self, workspace: Path | None = None, allowed_dir: Path | None = None):
        """
        初始化文件编辑工具
        
        参数：
        - workspace: 工作目录，用于解析相对路径
        - allowed_dir: 允许访问的目录，用于安全检查
        """
        self._workspace = workspace
        self._allowed_dir = allowed_dir

    @property
    def name(self) -> str:
        """工具名称：edit_file"""
        return "edit_file"

    @property
    def description(self) -> str:
        """工具描述"""
        return "Edit a file by replacing old_text with new_text. The old_text must exist exactly in the file."

    @property
    def parameters(self) -> dict[str, Any]:
        """参数 Schema"""
        return {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "The file path to edit"},
                "old_text": {"type": "string", "description": "The exact text to find and replace"},
                "new_text": {"type": "string", "description": "The text to replace with"},
            },
            "required": ["path", "old_text", "new_text"],
        }

    async def execute(self, path: str, old_text: str, new_text: str, **kwargs: Any) -> str:
        """
        执行文件编辑
        
        参数：
        - path: 文件路径
        - old_text: 要查找的文本
        - new_text: 替换后的文本
        - **kwargs: 其他参数（忽略）
        
        返回：
        - 成功消息，或错误信息
        """
        try:
            # 解析路径并检查权限
            file_path = _resolve_path(path, self._workspace, self._allowed_dir)
            
            # 检查文件是否存在
            if not file_path.exists():
                return f"Error: File not found: {path}"

            # 读取文件内容
            content = file_path.read_text(encoding="utf-8")

            # 检查 old_text 是否存在
            if old_text not in content:
                return self._not_found_message(old_text, content, path)

            # 统计出现次数
            count = content.count(old_text)
            if count > 1:
                return f"Warning: old_text appears {count} times. Please provide more context to make it unique."

            # 执行替换
            new_content = content.replace(old_text, new_text, 1)
            
            # 写入文件
            file_path.write_text(new_content, encoding="utf-8")

            return f"Successfully edited {file_path}"
            
        except PermissionError as e:
            return f"Error: {e}"
        except Exception as e:
            return f"Error editing file: {str(e)}"

    @staticmethod
    def _not_found_message(old_text: str, content: str, path: str) -> str:
        """
        构建"未找到"错误消息
        
        当 old_text 不在文件中时，尝试找到最相似的文本并提供差异对比。
        
        参数：
        - old_text: 要查找的文本
        - content: 文件内容
        - path: 文件路径
        
        返回：
        - 友好的错误消息，包含差异对比
        """
        # 将内容分割成行
        lines = content.splitlines(keepends=True)
        old_lines = old_text.splitlines(keepends=True)
        window = len(old_lines)

        # 寻找最相似的文本块
        best_ratio, best_start = 0.0, 0
        for i in range(max(1, len(lines) - window + 1)):
            # 计算相似度
            ratio = difflib.SequenceMatcher(None, old_lines, lines[i : i + window]).ratio()
            if ratio > best_ratio:
                best_ratio, best_start = ratio, i

        # 如果找到相似度超过 50% 的文本，提供差异对比
        if best_ratio > 0.5:
            diff = "\n".join(
                difflib.unified_diff(
                    old_lines,
                    lines[best_start : best_start + window],
                    fromfile="old_text (provided)",
                    tofile=f"{path} (actual, line {best_start + 1})",
                    lineterm="",
                )
            )
            return f"Error: old_text not found in {path}.\nBest match ({best_ratio:.0%} similar) at line {best_start + 1}:\n{diff}"
        
        # 没有找到相似文本
        return (
            f"Error: old_text not found in {path}. No similar text found. Verify the file content."
        )


class ListDirTool(Tool):
    """
    目录列表工具
    
    列出指定目录的内容。
    
    功能：
    - 列出文件和子目录
    - 使用图标区分类型
    - 按名称排序
    
    输出格式：
    - 📁 表示目录
    - 📄 表示文件
    """
    
    def __init__(self, workspace: Path | None = None, allowed_dir: Path | None = None):
        """
        初始化目录列表工具
        
        参数：
        - workspace: 工作目录，用于解析相对路径
        - allowed_dir: 允许访问的目录，用于安全检查
        """
        self._workspace = workspace
        self._allowed_dir = allowed_dir

    @property
    def name(self) -> str:
        """工具名称：list_dir"""
        return "list_dir"

    @property
    def description(self) -> str:
        """工具描述"""
        return "List the contents of a directory."

    @property
    def parameters(self) -> dict[str, Any]:
        """参数 Schema"""
        return {
            "type": "object",
            "properties": {"path": {"type": "string", "description": "The directory path to list"}},
            "required": ["path"],
        }

    async def execute(self, path: str, **kwargs: Any) -> str:
        """
        执行目录列表
        
        参数：
        - path: 目录路径
        - **kwargs: 其他参数（忽略）
        
        返回：
        - 目录内容列表，或错误信息
        """
        try:
            # 解析路径并检查权限
            dir_path = _resolve_path(path, self._workspace, self._allowed_dir)
            
            # 检查目录是否存在
            if not dir_path.exists():
                return f"Error: Directory not found: {path}"
            
            # 检查是否是目录
            if not dir_path.is_dir():
                return f"Error: Not a directory: {path}"

            # 列出目录内容
            items = []
            for item in sorted(dir_path.iterdir()):
                # 使用图标区分类型
                prefix = "📁 " if item.is_dir() else "📄 "
                items.append(f"{prefix}{item.name}")

            # 处理空目录
            if not items:
                return f"Directory {path} is empty"

            return "\n".join(items)
            
        except PermissionError as e:
            return f"Error: {e}"
        except Exception as e:
            return f"Error listing directory: {str(e)}"
