"""
工具函数：提供 nanobot 的通用辅助函数

这个模块提供了各种通用辅助函数。

设计思路：
- 提供路径处理函数
- 提供文件名安全化函数
- 提供工作区模板同步函数

主要函数：
- ensure_dir: 确保目录存在
- get_data_path: 获取数据目录
- get_workspace_path: 获取工作区路径
- timestamp: 获取时间戳
- safe_filename: 安全化文件名
- sync_workspace_templates: 同步工作区模板
"""

# re：正则表达式
import re
# datetime：日期时间类型
from datetime import datetime
# Path：路径处理类
from pathlib import Path


def ensure_dir(path: Path) -> Path:
    """
    确保目录存在，返回目录路径
    
    参数：
    - path: 目录路径
    
    返回：
    - 目录路径
    """
    path.mkdir(parents=True, exist_ok=True)
    return path


def get_data_path() -> Path:
    """
    获取数据目录路径（~/.nanobot）
    
    返回：
    - 数据目录路径
    """
    return ensure_dir(Path.home() / ".nanobot")


def get_workspace_path(workspace: str | None = None) -> Path:
    """
    解析并确保工作区路径存在
    
    参数：
    - workspace: 工作区路径字符串，如果未提供则使用默认路径
    
    返回：
    - 工作区路径
    """
    # 如果提供了路径，展开用户目录；否则使用默认路径
    path = Path(workspace).expanduser() if workspace else Path.home() / ".nanobot" / "workspace"
    return ensure_dir(path)


def timestamp() -> str:
    """
    获取当前 ISO 格式时间戳
    
    返回：
    - ISO 格式时间戳字符串
    """
    return datetime.now().isoformat()


# 不安全字符的正则表达式（Windows 文件名限制）
_UNSAFE_CHARS = re.compile(r'[<>:"/\\|?*]')

def safe_filename(name: str) -> str:
    """
    替换不安全的路径字符为下划线
    
    参数：
    - name: 原始文件名
    
    返回：
    - 安全的文件名
    """
    return _UNSAFE_CHARS.sub("_", name).strip()


def sync_workspace_templates(workspace: Path, silent: bool = False) -> list[str]:
    """
    同步捆绑模板到工作区，只创建缺失的文件
    
    参数：
    - workspace: 工作区路径
    - silent: 是否静默模式（不打印信息）
    
    返回：
    - 新创建的文件列表
    """
    # 从包资源导入
    from importlib.resources import files as pkg_files
    try:
        # 获取模板目录
        tpl = pkg_files("nanobot") / "templates"
    except Exception:
        return []
    # 检查模板目录是否存在
    if not tpl.is_dir():
        return []

    added: list[str] = []

    def _write(src, dest: Path):
        """
        写入文件（如果不存在）
        
        参数：
        - src: 源文件（可以为 None）
        - dest: 目标文件路径
        """
        # 如果文件已存在，跳过
        if dest.exists():
            return
        # 确保父目录存在
        dest.parent.mkdir(parents=True, exist_ok=True)
        # 写入内容
        dest.write_text(src.read_text(encoding="utf-8") if src else "", encoding="utf-8")
        # 记录添加的文件
        added.append(str(dest.relative_to(workspace)))

    # 复制 Markdown 模板文件
    for item in tpl.iterdir():
        if item.name.endswith(".md"):
            _write(item, workspace / item.name)
    
    # 复制 MEMORY.md 模板
    _write(tpl / "memory" / "MEMORY.md", workspace / "memory" / "MEMORY.md")
    # 创建空的 HISTORY.md
    _write(None, workspace / "memory" / "HISTORY.md")
    # 创建 skills 目录
    (workspace / "skills").mkdir(exist_ok=True)

    # 打印创建的文件
    if added and not silent:
        from rich.console import Console
        for name in added:
            Console().print(f"  [dim]Created {name}[/dim]")
            
    return added
