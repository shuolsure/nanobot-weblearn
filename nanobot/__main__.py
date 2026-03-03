"""
入口点：作为模块运行 nanobot

这个文件允许使用 `python -m nanobot` 命令运行 nanobot。

使用方式：
    python -m nanobot [命令] [选项]

示例：
    python -m nanobot --help
    python -m nanobot onboard
    python -m nanobot agent -m "你好"
    python -m nanobot gateway
"""

# 导入命令行应用
from nanobot.cli.commands import app

# 作为模块运行时，启动命令行应用
if __name__ == "__main__":
    app()
