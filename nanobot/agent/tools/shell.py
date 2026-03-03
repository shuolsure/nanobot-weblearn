"""
Shell 执行工具：安全执行系统命令

这个模块提供了 Shell 命令执行工具，允许代理在系统上执行命令。

设计思路：
- 异步执行命令，支持超时控制
- 内置安全防护，阻止危险命令
- 支持工作目录限制
- 支持命令白名单/黑名单

安全机制：
1. 危险命令黑名单：rm -rf, format, dd 等
2. 路径遍历检测：阻止 ..\ 和 ../
3. 工作目录限制：只允许操作指定目录
4. 命令白名单：只允许特定模式的命令

使用场景：
- 编译代码
- 运行测试
- 执行脚本
- 系统操作
"""

# asyncio：Python 的异步 I/O 框架，用于异步执行命令
import asyncio
# os：操作系统接口，用于获取环境变量和当前目录
import os
# re：正则表达式模块，用于命令模式匹配
import re
# Path：面向对象的文件路径处理类
from pathlib import Path
# Any：类型注解，表示任意类型
from typing import Any

# Tool：工具基类
from nanobot.agent.tools.base import Tool


class ExecTool(Tool):
    """
    Shell 命令执行工具
    
    允许代理在系统上执行 Shell 命令，并返回输出结果。
    
    功能：
    1. 执行任意 Shell 命令
    2. 支持超时控制
    3. 安全防护机制
    4. 工作目录限制
    
    安全设计：
    - 危险命令黑名单：阻止 rm -rf, format 等破坏性命令
    - 路径遍历检测：阻止访问工作目录外的文件
    - 命令白名单：可选，只允许特定模式的命令
    """
    
    def __init__(
        self,
        timeout: int = 60,                      # 命令超时时间（秒）
        working_dir: str | None = None,         # 默认工作目录
        deny_patterns: list[str] | None = None, # 危险命令黑名单
        allow_patterns: list[str] | None = None,# 命令白名单
        restrict_to_workspace: bool = False,    # 是否限制工作目录
        path_append: str = "",                  # 要追加到 PATH 的路径
    ):
        """
        初始化 Shell 执行工具
        
        参数：
        - timeout: 命令执行的超时时间，默认 60 秒
        - working_dir: 默认工作目录，None 表示使用当前目录
        - deny_patterns: 危险命令的正则表达式黑名单
        - allow_patterns: 允许命令的正则表达式白名单
        - restrict_to_workspace: 是否限制只能操作工作目录
        - path_append: 要追加到 PATH 环境变量的路径
        """
        self.timeout = timeout
        self.working_dir = working_dir
        
        # 危险命令黑名单
        # 这些正则表达式匹配已知的危险命令
        self.deny_patterns = deny_patterns or [
            r"\brm\s+-[rf]{1,2}\b",          # rm -r, rm -rf, rm -fr（递归删除）
            r"\bdel\s+/[fq]\b",              # del /f, del /q（Windows 强制删除）
            r"\brmdir\s+/s\b",               # rmdir /s（Windows 递归删除目录）
            r"(?:^|[;&|]\s*)format\b",       # format（格式化磁盘）
            r"\b(mkfs|diskpart)\b",          # mkfs, diskpart（磁盘操作）
            r"\bdd\s+if=",                   # dd if=（磁盘复制）
            r">\s*/dev/sd",                  # 写入磁盘设备
            r"\b(shutdown|reboot|poweroff)\b",  # 关机、重启命令
            r":\(\)\s*\{.*\};\s*:",          # fork bomb（ fork 炸弹）
        ]
        
        # 命令白名单（如果设置，只允许匹配的命令）
        self.allow_patterns = allow_patterns or []
        
        # 是否限制工作目录
        self.restrict_to_workspace = restrict_to_workspace
        
        # 要追加到 PATH 的路径
        self.path_append = path_append

    @property
    def name(self) -> str:
        """
        工具名称：exec
        
        返回：
        - "exec"
        """
        return "exec"

    @property
    def description(self) -> str:
        """
        工具描述
        
        返回：
        - 描述字符串，说明工具的功能
        """
        return "Execute a shell command and return its output. Use with caution."

    @property
    def parameters(self) -> dict[str, Any]:
        """
        参数 Schema
        
        定义工具接受的参数：
        - command: 要执行的命令（必需）
        - working_dir: 工作目录（可选）
        
        返回：
        - JSON Schema 字典
        """
        return {
            "type": "object",
            "properties": {
                "command": {
                    "type": "string",
                    "description": "The shell command to execute"
                },
                "working_dir": {
                    "type": "string",
                    "description": "Optional working directory for the command"
                }
            },
            "required": ["command"]
        }
    
    async def execute(self, command: str, working_dir: str | None = None, **kwargs: Any) -> str:
        """
        执行 Shell 命令
        
        执行流程：
        1. 确定工作目录
        2. 检查命令安全性
        3. 创建子进程执行命令
        4. 等待输出或超时
        5. 返回结果
        
        参数：
        - command: 要执行的 Shell 命令
        - working_dir: 可选的工作目录
        - **kwargs: 其他参数（忽略）
        
        返回：
        - 命令输出字符串，包括 stdout 和 stderr
        """
        # 确定工作目录
        cwd = working_dir or self.working_dir or os.getcwd()
        
        # 安全检查
        guard_error = self._guard_command(command, cwd)
        if guard_error:
            return guard_error
        
        # 准备环境变量
        env = os.environ.copy()
        if self.path_append:
            env["PATH"] = env.get("PATH", "") + os.pathsep + self.path_append

        try:
            # 创建子进程
            process = await asyncio.create_subprocess_shell(
                command,
                stdout=asyncio.subprocess.PIPE,  # 捕获标准输出
                stderr=asyncio.subprocess.PIPE,  # 捕获标准错误
                cwd=cwd,                          # 工作目录
                env=env,                          # 环境变量
            )
            
            try:
                # 等待命令完成（带超时）
                stdout, stderr = await asyncio.wait_for(
                    process.communicate(),
                    timeout=self.timeout
                )
            except asyncio.TimeoutError:
                # 超时，终止进程
                process.kill()
                # 等待进程完全终止，释放资源
                try:
                    await asyncio.wait_for(process.wait(), timeout=5.0)
                except asyncio.TimeoutError:
                    pass
                return f"Error: Command timed out after {self.timeout} seconds"
            
            # 构建输出
            output_parts = []
            
            # 添加标准输出
            if stdout:
                output_parts.append(stdout.decode("utf-8", errors="replace"))
            
            # 添加标准错误
            if stderr:
                stderr_text = stderr.decode("utf-8", errors="replace")
                if stderr_text.strip():
                    output_parts.append(f"STDERR:\n{stderr_text}")
            
            # 添加退出码（非零时）
            if process.returncode != 0:
                output_parts.append(f"\nExit code: {process.returncode}")
            
            # 合并输出
            result = "\n".join(output_parts) if output_parts else "(no output)"
            
            # 截断过长的输出
            max_len = 10000
            if len(result) > max_len:
                result = result[:max_len] + f"\n... (truncated, {len(result) - max_len} more chars)"
            
            return result
            
        except Exception as e:
            return f"Error executing command: {str(e)}"

    def _guard_command(self, command: str, cwd: str) -> str | None:
        """
        命令安全检查
        
        检查命令是否安全，返回错误信息或 None。
        
        检查项：
        1. 危险命令黑名单
        2. 命令白名单（如果设置）
        3. 路径遍历检测
        4. 工作目录限制
        
        参数：
        - command: 要检查的命令
        - cwd: 当前工作目录
        
        返回：
        - None 表示安全，字符串表示错误信息
        """
        cmd = command.strip()
        lower = cmd.lower()

        # 检查危险命令黑名单
        for pattern in self.deny_patterns:
            if re.search(pattern, lower):
                return "Error: Command blocked by safety guard (dangerous pattern detected)"

        # 检查命令白名单（如果设置）
        if self.allow_patterns:
            if not any(re.search(p, lower) for p in self.allow_patterns):
                return "Error: Command blocked by safety guard (not in allowlist)"

        # 工作目录限制检查
        if self.restrict_to_workspace:
            # 检查路径遍历
            if "..\\" in cmd or "../" in cmd:
                return "Error: Command blocked by safety guard (path traversal detected)"

            cwd_path = Path(cwd).resolve()

            # 检查命令中的绝对路径
            for raw in self._extract_absolute_paths(cmd):
                try:
                    p = Path(raw.strip()).resolve()
                except Exception:
                    continue
                # 检查路径是否在工作目录内
                if p.is_absolute() and cwd_path not in p.parents and p != cwd_path:
                    return "Error: Command blocked by safety guard (path outside working dir)"

        return None

    @staticmethod
    def _extract_absolute_paths(command: str) -> list[str]:
        """
        从命令中提取绝对路径
        
        支持 Windows 和 POSIX 路径格式。
        
        参数：
        - command: Shell 命令
        
        返回：
        - 绝对路径列表
        """
        # Windows 路径：C:\...
        win_paths = re.findall(r"[A-Za-z]:\\[^\s\"'|><;]+", command)
        # POSIX 路径：/absolute...
        posix_paths = re.findall(r"(?:^|[\s|>])(/[^\s\"'>]+)", command)
        return win_paths + posix_paths
