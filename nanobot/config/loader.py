"""
配置加载工具：加载和管理配置文件

这个模块提供了配置文件的加载和保存功能。

设计思路：
- 使用 JSON 格式存储配置
- 支持配置迁移（旧格式到新格式）
- 默认配置路径在用户主目录下

配置文件位置：
- 默认：~/.nanobot/config.json
- 可通过参数指定其他路径

配置迁移：
- 自动迁移旧版本配置格式
- 保持向后兼容性
"""

# json：JSON 解析库
import json
# Path：路径处理类
from pathlib import Path

# Config：配置模型
from nanobot.config.schema import Config


def get_config_path() -> Path:
    """
    获取默认配置文件路径
    
    返回：
    - 配置文件路径：~/.nanobot/config.json
    """
    return Path.home() / ".nanobot" / "config.json"


def get_data_dir() -> Path:
    """
    获取 nanobot 数据目录
    
    返回：
    - 数据目录路径
    """
    from nanobot.utils.helpers import get_data_path
    return get_data_path()


def load_config(config_path: Path | None = None) -> Config:
    """
    从文件加载配置或创建默认配置
    
    参数：
    - config_path: 可选的配置文件路径。如果未提供，使用默认路径。
    
    返回：
    - 加载的配置对象
    
    处理流程：
    1. 确定配置文件路径
    2. 如果文件存在，读取并解析
    3. 迁移旧格式配置
    4. 验证并返回配置对象
    5. 如果失败，返回默认配置
    """
    # 确定配置文件路径
    path = config_path or get_config_path()

    if path.exists():
        try:
            # 读取 JSON 文件
            with open(path, encoding="utf-8") as f:
                data = json.load(f)
            # 迁移旧格式配置
            data = _migrate_config(data)
            # 验证并返回配置对象
            return Config.model_validate(data)
        except (json.JSONDecodeError, ValueError) as e:
            # 解析或验证失败，使用默认配置
            print(f"Warning: Failed to load config from {path}: {e}")
            print("Using default configuration.")

    # 文件不存在，返回默认配置
    return Config()


def save_config(config: Config, config_path: Path | None = None) -> None:
    """
    保存配置到文件
    
    参数：
    - config: 要保存的配置对象
    - config_path: 可选的保存路径。如果未提供，使用默认路径。
    
    处理流程：
    1. 确定保存路径
    2. 创建父目录（如果不存在）
    3. 将配置序列化为 JSON
    4. 写入文件
    """
    # 确定保存路径
    path = config_path or get_config_path()
    # 创建父目录
    path.parent.mkdir(parents=True, exist_ok=True)

    # 序列化配置（使用别名输出 camelCase 格式）
    data = config.model_dump(by_alias=True)

    # 写入文件
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def _migrate_config(data: dict) -> dict:
    """
    迁移旧配置格式到当前格式
    
    参数：
    - data: 原始配置字典
    
    返回：
    - 迁移后的配置字典
    
    迁移规则：
    - tools.exec.restrictToWorkspace → tools.restrictToWorkspace
    """
    # 移动 tools.exec.restrictToWorkspace → tools.restrictToWorkspace
    tools = data.get("tools", {})
    exec_cfg = tools.get("exec", {})
    if "restrictToWorkspace" in exec_cfg and "restrictToWorkspace" not in tools:
        tools["restrictToWorkspace"] = exec_cfg.pop("restrictToWorkspace")
    
    return data
