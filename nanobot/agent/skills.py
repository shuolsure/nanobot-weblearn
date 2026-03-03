"""
技能加载模块：代理能力扩展

这个模块实现了代理的技能系统，包括：
1. 技能发现：自动发现工作区和内置技能
2. 技能加载：读取技能定义文件（SKILL.md）
3. 技能验证：检查技能依赖是否满足
4. 技能摘要：生成技能列表供代理参考

设计思路：
- 技能是 markdown 文件（SKILL.md），教代理如何使用特定工具或执行特定任务
- 支持两层技能：工作区技能（用户自定义）和内置技能（系统提供）
- 技能可以声明依赖（CLI 工具、环境变量），系统会检查是否满足
- 使用渐进式加载：先显示摘要，代理需要时再读取完整内容

技能文件结构：
```
skills/
├── weather/
│   └── SKILL.md      # 技能定义文件
├── github/
│   └── SKILL.md
└── ...
```

SKILL.md 格式：
```markdown
---
description: 天气查询技能
nanobot:
  always: true        # 是否始终加载
  requires:
    bins: [curl]      # 需要的 CLI 工具
    env: [API_KEY]    # 需要的环境变量
---

# Weather Skill
...技能内容...
```
"""

# json：用于处理 JSON 数据的序列化和反序列化
import json
# os：操作系统接口，用于访问环境变量
import os
# re：正则表达式模块，用于解析 frontmatter
import re
# shutil：高级文件操作，用于检查命令是否存在
import shutil
# Path：面向对象的文件路径处理类
from pathlib import Path

# 默认内置技能目录（相对于此文件的父目录）
# 即 nanobot/skills/ 目录
BUILTIN_SKILLS_DIR = Path(__file__).parent.parent / "skills"


class SkillsLoader:
    """
    技能加载器：发现和加载代理技能
    
    技能是 markdown 文件（SKILL.md），教代理如何使用特定工具或执行特定任务。
    
    功能：
    1. 发现技能：扫描工作区和内置技能目录
    2. 加载技能：读取技能内容
    3. 验证技能：检查依赖是否满足
    4. 生成摘要：创建技能列表供代理参考
    
    设计模式：
    - 使用优先级：工作区技能 > 内置技能
    - 支持渐进式加载：先摘要，后完整内容
    - 自动过滤不可用的技能
    """
    
    def __init__(self, workspace: Path, builtin_skills_dir: Path | None = None):
        """
        初始化技能加载器
        
        参数：
        - workspace: 工作目录路径
        - builtin_skills_dir: 内置技能目录路径（可选，默认使用默认路径）
        """
        self.workspace = workspace                              # 工作目录
        self.workspace_skills = workspace / "skills"            # 工作区技能目录
        self.builtin_skills = builtin_skills_dir or BUILTIN_SKILLS_DIR  # 内置技能目录

    def list_skills(self, filter_unavailable: bool = True) -> list[dict[str, str]]:
        """
        列出所有可用技能
        
        扫描工作区和内置技能目录，返回所有技能的信息。
        
        技能优先级：
        - 工作区技能优先于内置技能
        - 同名技能只保留工作区版本
        
        参数：
        - filter_unavailable: 是否过滤掉依赖不满足的技能
        
        返回：
        - 技能信息列表，每个元素包含：
          - name: 技能名称（目录名）
          - path: SKILL.md 文件路径
          - source: 来源（"workspace" 或 "builtin"）
        """
        skills = []

        # 扫描工作区技能（最高优先级）
        if self.workspace_skills.exists():
            for skill_dir in self.workspace_skills.iterdir():
                # 只处理目录
                if skill_dir.is_dir():
                    skill_file = skill_dir / "SKILL.md"
                    # 检查 SKILL.md 是否存在
                    if skill_file.exists():
                        skills.append({
                            "name": skill_dir.name,       # 技能名称
                            "path": str(skill_file),      # 文件路径
                            "source": "workspace"         # 来源：工作区
                        })

        # 扫描内置技能
        if self.builtin_skills and self.builtin_skills.exists():
            for skill_dir in self.builtin_skills.iterdir():
                if skill_dir.is_dir():
                    skill_file = skill_dir / "SKILL.md"
                    if skill_file.exists():
                        # 检查是否已被工作区技能覆盖
                        if not any(s["name"] == skill_dir.name for s in skills):
                            skills.append({
                                "name": skill_dir.name,
                                "path": str(skill_file),
                                "source": "builtin"        # 来源：内置
                            })

        # 根据依赖过滤技能
        if filter_unavailable:
            return [s for s in skills if self._check_requirements(self._get_skill_meta(s["name"]))]
        
        return skills

    def load_skill(self, name: str) -> str | None:
        """
        加载指定技能的内容
        
        按优先级查找技能：工作区 > 内置
        
        参数：
        - name: 技能名称（目录名）
        
        返回：
        - 技能内容字符串，如果不存在则返回 None
        """
        # 首先检查工作区
        workspace_skill = self.workspace_skills / name / "SKILL.md"
        if workspace_skill.exists():
            return workspace_skill.read_text(encoding="utf-8")

        # 然后检查内置
        if self.builtin_skills:
            builtin_skill = self.builtin_skills / name / "SKILL.md"
            if builtin_skill.exists():
                return builtin_skill.read_text(encoding="utf-8")

        return None

    def load_skills_for_context(self, skill_names: list[str]) -> str:
        """
        加载指定技能用于包含在代理上下文中
        
        将多个技能的内容合并为一个格式化的字符串。
        
        参数：
        - skill_names: 要加载的技能名称列表
        
        返回：
        - 格式化的技能内容字符串
        """
        parts = []
        for name in skill_names:
            content = self.load_skill(name)
            if content:
                # 移除 frontmatter，只保留内容
                content = self._strip_frontmatter(content)
                parts.append(f"### Skill: {name}\n\n{content}")

        # 使用分隔符连接各技能
        return "\n\n---\n\n".join(parts) if parts else ""

    def build_skills_summary(self) -> str:
        """
        构建技能摘要
        
        生成所有技能的 XML 格式摘要，用于渐进式加载。
        代理可以先看到摘要，需要时再读取完整技能内容。
        
        摘要包含：
        - 技能名称
        - 技能描述
        - 技能路径
        - 可用状态
        - 缺失的依赖（如果不可用）
        
        返回：
        - XML 格式的技能摘要字符串
        """
        # 获取所有技能（不过滤）
        all_skills = self.list_skills(filter_unavailable=False)
        if not all_skills:
            return ""

        def escape_xml(s: str) -> str:
            """转义 XML 特殊字符"""
            return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

        # 构建 XML 格式的摘要
        lines = ["<skills>"]
        for s in all_skills:
            name = escape_xml(s["name"])
            path = s["path"]
            desc = escape_xml(self._get_skill_description(s["name"]))
            skill_meta = self._get_skill_meta(s["name"])
            available = self._check_requirements(skill_meta)

            # 开始技能标签
            lines.append(f'  <skill available="{str(available).lower()}">')
            lines.append(f"    <name>{name}</name>")
            lines.append(f"    <description>{desc}</description>")
            lines.append(f"    <location>{path}</location>")

            # 如果技能不可用，显示缺失的依赖
            if not available:
                missing = self._get_missing_requirements(skill_meta)
                if missing:
                    lines.append(f"    <requires>{escape_xml(missing)}</requires>")

            lines.append("  </skill>")
        
        lines.append("</skills>")

        return "\n".join(lines)

    def _get_missing_requirements(self, skill_meta: dict) -> str:
        """
        获取技能缺失的依赖描述
        
        检查技能声明的依赖，返回缺失的部分。
        
        参数：
        - skill_meta: 技能元数据
        
        返回：
        - 缺失依赖的描述字符串
        """
        missing = []
        requires = skill_meta.get("requires", {})
        
        # 检查 CLI 工具依赖
        for b in requires.get("bins", []):
            if not shutil.which(b):
                missing.append(f"CLI: {b}")
        
        # 检查环境变量依赖
        for env in requires.get("env", []):
            if not os.environ.get(env):
                missing.append(f"ENV: {env}")
        
        return ", ".join(missing)

    def _get_skill_description(self, name: str) -> str:
        """
        获取技能的描述
        
        从技能的 frontmatter 中提取描述。
        
        参数：
        - name: 技能名称
        
        返回：
        - 技能描述字符串，如果没有描述则返回技能名称
        """
        meta = self.get_skill_metadata(name)
        if meta and meta.get("description"):
            return meta["description"]
        return name  # 默认返回技能名称

    def _strip_frontmatter(self, content: str) -> str:
        """
        移除 markdown 文件的 YAML frontmatter
        
        Frontmatter 是 markdown 文件开头的 YAML 元数据块，
        格式为：
        ```
        ---
        key: value
        ---
        ```
        
        参数：
        - content: 原始内容
        
        返回：
        - 移除 frontmatter 后的内容
        """
        # 检查是否以 --- 开头
        if content.startswith("---"):
            # 使用正则匹配 frontmatter 块
            match = re.match(r"^---\n.*?\n---\n", content, re.DOTALL)
            if match:
                # 返回 frontmatter 之后的内容
                return content[match.end():].strip()
        return content

    def _parse_nanobot_metadata(self, raw: str) -> dict:
        """
        解析技能的 nanobot 元数据
        
        从 frontmatter 的 metadata 字段解析 JSON 格式的元数据。
        支持两种键名：nanobot 和 openclaw（向后兼容）。
        
        参数：
        - raw: 元数据 JSON 字符串
        
        返回：
        - 解析后的元数据字典
        """
        try:
            data = json.loads(raw)
            # 优先使用 nanobot 键，其次使用 openclaw 键
            return data.get("nanobot", data.get("openclaw", {})) if isinstance(data, dict) else {}
        except (json.JSONDecodeError, TypeError):
            return {}

    def _check_requirements(self, skill_meta: dict) -> bool:
        """
        检查技能的依赖是否满足
        
        检查：
        1. CLI 工具：使用 shutil.which 检查命令是否存在
        2. 环境变量：检查是否已设置
        
        参数：
        - skill_meta: 技能元数据
        
        返回：
        - True 表示所有依赖都满足，False 表示有缺失
        """
        requires = skill_meta.get("requires", {})
        
        # 检查 CLI 工具
        for b in requires.get("bins", []):
            if not shutil.which(b):
                return False
        
        # 检查环境变量
        for env in requires.get("env", []):
            if not os.environ.get(env):
                return False
        
        return True

    def _get_skill_meta(self, name: str) -> dict:
        """
        获取技能的 nanobot 元数据
        
        从技能的 frontmatter 中提取并解析元数据。
        
        参数：
        - name: 技能名称
        
        返回：
        - 元数据字典
        """
        meta = self.get_skill_metadata(name) or {}
        return self._parse_nanobot_metadata(meta.get("metadata", ""))

    def get_always_skills(self) -> list[str]:
        """
        获取标记为"始终加载"的技能
        
        某些技能需要在每次对话中都加载，通过 always=true 标记。
        
        返回：
        - 始终加载的技能名称列表
        """
        result = []
        for s in self.list_skills(filter_unavailable=True):
            meta = self.get_skill_metadata(s["name"]) or {}
            skill_meta = self._parse_nanobot_metadata(meta.get("metadata", ""))
            # 检查 always 标记（支持两种位置）
            if skill_meta.get("always") or meta.get("always"):
                result.append(s["name"])
        return result

    def get_skill_metadata(self, name: str) -> dict | None:
        """
        获取技能的 frontmatter 元数据
        
        解析 SKILL.md 文件开头的 YAML frontmatter。
        
        参数：
        - name: 技能名称
        
        返回：
        - 元数据字典，如果解析失败则返回 None
        """
        content = self.load_skill(name)
        if not content:
            return None

        # 检查是否以 --- 开头
        if content.startswith("---"):
            # 使用正则匹配 frontmatter 块
            match = re.match(r"^---\n(.*?)\n---", content, re.DOTALL)
            if match:
                # 简单的 YAML 解析
                # 注意：这里使用简化的解析，不支持复杂的 YAML 结构
                metadata = {}
                for line in match.group(1).split("\n"):
                    if ":" in line:
                        key, value = line.split(":", 1)
                        # 移除引号
                        metadata[key.strip()] = value.strip().strip('"\'')
                return metadata

        return None
