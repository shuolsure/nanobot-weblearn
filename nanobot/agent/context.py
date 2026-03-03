"""
上下文构建模块：组装代理提示

这个模块负责构建发送给 LLM 的完整上下文，包括：
1. 系统提示（身份、运行时信息、工作区信息）
2. 引导文件（AGENTS.md, SOUL.md, USER.md, TOOLS.md 等）
3. 记忆上下文（长期记忆）
4. 技能上下文（可用技能列表）
5. 对话历史
6. 当前用户消息

设计思路：
- 分层构建上下文，便于维护和扩展
- 支持多模态内容（图片）
- 自动注入运行时信息（时间、渠道等）
- 使用引导文件实现可定制的代理行为
"""

# base64：用于将图片编码为 base64 格式
import base64
# mimetypes：用于根据文件扩展名猜测 MIME 类型
import mimetypes
# platform：获取系统信息（操作系统、架构等）
import platform
# time：获取时间信息
import time
# datetime：处理日期和时间
from datetime import datetime
# Path：面向对象的文件路径处理类
from pathlib import Path
# Any：类型注解，表示任意类型
from typing import Any

# 导入 nanobot 内部模块
# MemoryStore：记忆存储，用于获取长期记忆
from nanobot.agent.memory import MemoryStore
# SkillsLoader：技能加载器，用于获取可用技能
from nanobot.agent.skills import SkillsLoader


class ContextBuilder:
    """
    上下文构建器：构建发送给 LLM 的完整提示
    
    这是代理的"记忆组装器"，负责将各种信息组装成 LLM 可以理解的格式。
    
    工作流程：
    1. 构建系统提示（身份 + 引导文件 + 记忆 + 技能）
    2. 添加对话历史
    3. 添加运行时上下文（时间、渠道等）
    4. 添加当前用户消息
    
    设计模式：
    - 使用模板方法模式，分层构建上下文
    - 支持可配置的引导文件
    - 自动处理多模态内容
    """
    
    # 引导文件列表：这些文件会被自动加载到系统提示中
    # 用于定制代理的行为和能力
    BOOTSTRAP_FILES = ["AGENTS.md", "SOUL.md", "USER.md", "TOOLS.md", "IDENTITY.md"]
    
    # 运行时上下文标签：用于标识运行时注入的元数据
    # 这些内容不会被保存到会话历史中
    _RUNTIME_CONTEXT_TAG = "[Runtime Context — metadata only, not instructions]"

    def __init__(self, workspace: Path):
        """
        初始化上下文构建器
        
        参数：
        - workspace: 工作目录路径，用于读取引导文件和记忆
        """
        self.workspace = workspace                    # 工作目录
        self.memory = MemoryStore(workspace)          # 记忆存储实例
        self.skills = SkillsLoader(workspace)         # 技能加载器实例

    def build_system_prompt(self, skill_names: list[str] | None = None) -> str:
        """
        构建系统提示
        
        系统提示是发送给 LLM 的第一条消息，定义了代理的身份、能力和行为准则。
        
        组成部分：
        1. 身份信息：代理的基本身份和运行时环境
        2. 引导文件：用户自定义的配置和指令
        3. 记忆上下文：长期记忆中的信息
        4. 技能上下文：可用技能的列表和描述
        
        参数：
        - skill_names: 可选的技能名称列表（用于加载特定技能）
        
        返回：
        - 完整的系统提示字符串
        """
        # 从身份信息开始构建
        parts = [self._get_identity()]

        # 加载引导文件
        bootstrap = self._load_bootstrap_files()
        if bootstrap:
            parts.append(bootstrap)

        # 添加记忆上下文
        memory = self.memory.get_memory_context()
        if memory:
            parts.append(f"# Memory\n\n{memory}")

        # 添加"始终激活"的技能
        # 这些技能会在每次对话中自动加载
        always_skills = self.skills.get_always_skills()
        if always_skills:
            always_content = self.skills.load_skills_for_context(always_skills)
            if always_content:
                parts.append(f"# Active Skills\n\n{always_content}")

        # 添加技能摘要
        # 技能摘要让代理知道有哪些技能可用
        skills_summary = self.skills.build_skills_summary()
        if skills_summary:
            parts.append(f"""# Skills

The following skills extend your capabilities. To use a skill, read its SKILL.md file using the read_file tool.
Skills with available="false" need dependencies installed first - you can try installing them with apt/brew.

{skills_summary}""")

        # 使用分隔符连接各部分
        return "\n\n---\n\n".join(parts)

    def _get_identity(self) -> str:
        """
        获取身份信息部分
        
        这是系统提示的核心部分，定义了代理的基本身份和行为准则。
        
        包含：
        - 代理名称和基本描述
        - 运行时环境（操作系统、Python 版本）
        - 工作区路径
        - 记忆文件位置
        - 基本行为准则
        
        返回：
        - 身份信息字符串
        """
        # 获取工作区的绝对路径
        workspace_path = str(self.workspace.expanduser().resolve())
        
        # 获取系统信息
        system = platform.system()
        # 将 Darwin（macOS 的内核名）转换为更友好的名称
        runtime = f"{'macOS' if system == 'Darwin' else system} {platform.machine()}, Python {platform.python_version()}"

        return f"""# nanobot 🐈

You are nanobot, a helpful AI assistant.

## Runtime
{runtime}

## Workspace
Your workspace is at: {workspace_path}
- Long-term memory: {workspace_path}/memory/MEMORY.md (write important facts here)
- History log: {workspace_path}/memory/HISTORY.md (grep-searchable). Each entry starts with [YYYY-MM-DD HH:MM].
- Custom skills: {workspace_path}/skills/{{skill-name}}/SKILL.md

## nanobot Guidelines
- State intent before tool calls, but NEVER predict or claim results before receiving them.
- Before modifying a file, read it first. Do not assume files or directories exist.
- After writing or editing a file, re-read it if accuracy matters.
- If a tool call fails, analyze the error before retrying with a different approach.
- Ask for clarification when the request is ambiguous.

Reply directly with text for conversations. Only use the 'message' tool to send to a specific chat channel."""

    @staticmethod
    def _build_runtime_context(channel: str | None, chat_id: str | None) -> str:
        """
        构建运行时上下文块
        
        运行时上下文包含当前的时间、渠道等信息，
        这些信息每次对话都会更新，不会被保存到会话历史中。
        
        设计思路：
        - 使用特殊标签标识，便于过滤
        - 提供时间信息，让代理知道当前时间
        - 提供渠道信息，让代理知道消息来源
        
        参数：
        - channel: 渠道名称（如 "telegram", "discord"）
        - chat_id: 聊天 ID
        
        返回：
        - 运行时上下文字符串
        """
        # 获取当前时间，格式为 "2024-01-15 14:30 (Monday)"
        now = datetime.now().strftime("%Y-%m-%d %H:%M (%A)")
        # 获取时区
        tz = time.strftime("%Z") or "UTC"
        
        # 构建上下文行
        lines = [f"Current Time: {now} ({tz})"]
        
        # 如果有渠道信息，添加到上下文
        if channel and chat_id:
            lines += [f"Channel: {channel}", f"Chat ID: {chat_id}"]
        
        # 添加运行时上下文标签
        return ContextBuilder._RUNTIME_CONTEXT_TAG + "\n" + "\n".join(lines)

    def _load_bootstrap_files(self) -> str:
        """
        加载所有引导文件
        
        引导文件是用户自定义的配置文件，用于定制代理的行为。
        
        支持的文件：
        - AGENTS.md: 代理配置
        - SOUL.md: 代理"灵魂"（核心价值观）
        - USER.md: 用户信息
        - TOOLS.md: 工具使用指南
        - IDENTITY.md: 身份定义
        
        设计思路：
        - 文件不存在时静默跳过
        - 每个文件作为独立的部分添加
        - 使用文件名作为标题
        
        返回：
        - 引导文件内容字符串，如果没有文件则返回空字符串
        """
        parts = []

        # 遍历引导文件列表
        for filename in self.BOOTSTRAP_FILES:
            # 构建文件路径
            file_path = self.workspace / filename
            
            # 如果文件存在，读取并添加到结果
            if file_path.exists():
                content = file_path.read_text(encoding="utf-8")
                parts.append(f"## {filename}\n\n{content}")

        # 使用双换行连接各部分
        return "\n\n".join(parts) if parts else ""

    def build_messages(
        self,
        history: list[dict[str, Any]],           # 对话历史
        current_message: str,                     # 当前用户消息
        skill_names: list[str] | None = None,    # 可选的技能名称列表
        media: list[str] | None = None,          # 可选的媒体文件路径列表
        channel: str | None = None,              # 可选的渠道名称
        chat_id: str | None = None,              # 可选的聊天 ID
    ) -> list[dict[str, Any]]:
        """
        构建完整的消息列表
        
        这是构建 LLM 输入的主入口，将所有部分组装成消息列表。
        
        消息列表结构：
        1. 系统消息：包含系统提示
        2. 历史消息：之前的对话
        3. 运行时上下文：当前时间和渠道信息
        4. 用户消息：当前的用户输入
        
        参数：
        - history: 对话历史列表
        - current_message: 当前用户消息内容
        - skill_names: 可选的技能名称列表
        - media: 可选的媒体文件路径列表（图片）
        - channel: 可选的渠道名称
        - chat_id: 可选的聊天 ID
        
        返回：
        - 完整的消息列表，可直接发送给 LLM
        """
        return [
            # 系统消息：定义代理的身份和能力
            {"role": "system", "content": self.build_system_prompt(skill_names)},
            # 历史消息：之前的对话
            *history,
            # 运行时上下文：当前时间和渠道信息
            {"role": "user", "content": self._build_runtime_context(channel, chat_id)},
            # 用户消息：当前的用户输入（可能包含图片）
            {"role": "user", "content": self._build_user_content(current_message, media)},
        ]

    def _build_user_content(self, text: str, media: list[str] | None) -> str | list[dict[str, Any]]:
        """
        构建用户消息内容
        
        支持纯文本和多模态内容（文本 + 图片）。
        
        多模态格式：
        - 图片使用 base64 编码
        - 遵循 OpenAI 的多模态消息格式
        
        参数：
        - text: 用户消息文本
        - media: 可选的媒体文件路径列表
        
        返回：
        - 纯文本字符串或多模态内容列表
        """
        # 如果没有媒体文件，直接返回文本
        if not media:
            return text

        images = []
        # 遍历媒体文件
        for path in media:
            p = Path(path)
            # 猜测 MIME 类型
            mime, _ = mimetypes.guess_type(path)
            
            # 检查文件是否存在且是图片
            if not p.is_file() or not mime or not mime.startswith("image/"):
                continue
            
            # 读取文件并编码为 base64
            b64 = base64.b64encode(p.read_bytes()).decode()
            
            # 添加到图片列表
            # 格式遵循 OpenAI 的多模态消息格式
            images.append({"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}"}})

        # 如果没有有效的图片，返回纯文本
        if not images:
            return text
        
        # 返回多模态内容：图片 + 文本
        return images + [{"type": "text", "text": text}]

    def add_tool_result(
        self, messages: list[dict[str, Any]],      # 消息列表
        tool_call_id: str,                          # 工具调用 ID
        tool_name: str,                             # 工具名称
        result: str,                                # 工具执行结果
    ) -> list[dict[str, Any]]:
        """
        添加工具结果到消息列表
        
        当 LLM 调用工具后，需要将工具的执行结果返回给 LLM。
        
        消息格式遵循 OpenAI 的工具调用格式：
        - role: "tool"
        - tool_call_id: 对应的工具调用 ID
        - name: 工具名称
        - content: 工具执行结果
        
        参数：
        - messages: 当前消息列表
        - tool_call_id: 工具调用的唯一标识
        - tool_name: 工具的名称
        - result: 工具执行的结果字符串
        
        返回：
        - 更新后的消息列表
        """
        # 创建工具结果消息并添加到列表
        messages.append({"role": "tool", "tool_call_id": tool_call_id, "name": tool_name, "content": result})
        return messages

    def add_assistant_message(
        self, messages: list[dict[str, Any]],      # 消息列表
        content: str | None,                        # 助手消息内容
        tool_calls: list[dict[str, Any]] | None = None,  # 可选的工具调用列表
        reasoning_content: str | None = None,      # 可选的推理内容
        thinking_blocks: list[dict] | None = None, # 可选的思考块
    ) -> list[dict[str, Any]]:
        """
        添加助手消息到消息列表
        
        助手消息可能是：
        1. 纯文本响应
        2. 工具调用请求
        3. 包含推理过程的响应
        
        参数：
        - messages: 当前消息列表
        - content: 助手的文本内容
        - tool_calls: 可选的工具调用列表
        - reasoning_content: 可选的推理内容（某些模型支持）
        - thinking_blocks: 可选的思考块（某些模型支持）
        
        返回：
        - 更新后的消息列表
        """
        # 创建助手消息
        msg: dict[str, Any] = {"role": "assistant", "content": content}
        
        # 如果有工具调用，添加到消息
        if tool_calls:
            msg["tool_calls"] = tool_calls
        
        # 如果有推理内容，添加到消息
        # 某些模型（如 DeepSeek）会返回推理过程
        if reasoning_content is not None:
            msg["reasoning_content"] = reasoning_content
        
        # 如果有思考块，添加到消息
        # 某些模型（如 Claude）会返回思考过程
        if thinking_blocks:
            msg["thinking_blocks"] = thinking_blocks
        
        # 添加到消息列表
        messages.append(msg)
        return messages
