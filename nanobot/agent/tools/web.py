"""
网络工具：网页搜索和内容获取

这个模块提供了网络交互工具，允许代理搜索网络和获取网页内容。

设计思路：
- 使用 Brave Search API 进行网页搜索
- 使用 Readability 提取网页正文
- 支持 HTTP 代理
- 内置 URL 验证和安全限制

工具列表：
1. WebSearchTool：网页搜索工具
2. WebFetchTool：网页内容获取工具

安全机制：
- URL 验证：只允许 http/https 协议
- 重定向限制：防止无限重定向
- 输出截断：防止过大的响应
"""

# html：HTML 实体解码
import html
# json：JSON 处理
import json
# os：操作系统接口，用于读取环境变量
import os
# re：正则表达式模块
import re
# Any：类型注解
from typing import Any
# urlparse：URL 解析工具
from urllib.parse import urlparse

# httpx：现代 HTTP 客户端库，支持异步
import httpx
# loguru：日志库
from loguru import logger

# Tool：工具基类
from nanobot.agent.tools.base import Tool

# 共享常量
# User-Agent 字符串，模拟浏览器访问
USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7_2) AppleWebKit/537.36"
# 最大重定向次数，防止 DoS 攻击
MAX_REDIRECTS = 5


def _strip_tags(text: str) -> str:
    """
    移除 HTML 标签并解码实体
    
    处理流程：
    1. 移除 <script> 标签及其内容
    2. 移除 <style> 标签及其内容
    3. 移除所有 HTML 标签
    4. 解码 HTML 实体（如 &amp; -> &）
    
    参数：
    - text: 包含 HTML 的文本
    
    返回：
    - 纯文本
    """
    # 移除 script 标签及其内容（不区分大小写）
    text = re.sub(r'<script[\s\S]*?</script>', '', text, flags=re.I)
    # 移除 style 标签及其内容
    text = re.sub(r'<style[\s\S]*?</style>', '', text, flags=re.I)
    # 移除所有 HTML 标签
    text = re.sub(r'<[^>]+>', '', text)
    # 解码 HTML 实体并去除首尾空白
    return html.unescape(text).strip()


def _normalize(text: str) -> str:
    """
    规范化空白字符
    
    处理流程：
    1. 将多个空格/制表符压缩为单个空格
    2. 将 3 个及以上换行压缩为 2 个
    
    参数：
    - text: 要规范化的文本
    
    返回：
    - 规范化后的文本
    """
    # 压缩水平空白
    text = re.sub(r'[ \t]+', ' ', text)
    # 压缩垂直空白
    return re.sub(r'\n{3,}', '\n\n', text).strip()


def _validate_url(url: str) -> tuple[bool, str]:
    """
    验证 URL
    
    检查项：
    1. 必须是 http 或 https 协议
    2. 必须有有效的域名
    
    参数：
    - url: 要验证的 URL
    
    返回：
    - (是否有效, 错误信息)
    """
    try:
        p = urlparse(url)
        # 检查协议
        if p.scheme not in ('http', 'https'):
            return False, f"Only http/https allowed, got '{p.scheme or 'none'}'"
        # 检查域名
        if not p.netloc:
            return False, "Missing domain"
        return True, ""
    except Exception as e:
        return False, str(e)


class WebSearchTool(Tool):
    """
    网页搜索工具
    
    使用 Brave Search API 搜索网络内容。
    
    功能：
    - 返回搜索结果的标题、URL 和摘要
    - 支持自定义结果数量
    - 支持 HTTP 代理
    
    配置：
    - API 密钥：通过构造函数或 BRAVE_API_KEY 环境变量设置
    """
    
    # 工具名称
    name = "web_search"
    # 工具描述
    description = "Search the web. Returns titles, URLs, and snippets."
    # 参数 Schema
    parameters = {
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "Search query"},
            "count": {"type": "integer", "description": "Results (1-10)", "minimum": 1, "maximum": 10}
        },
        "required": ["query"]
    }

    def __init__(self, api_key: str | None = None, max_results: int = 5, proxy: str | None = None):
        """
        初始化网页搜索工具
        
        参数：
        - api_key: Brave Search API 密钥（可选，也可通过环境变量设置）
        - max_results: 默认返回结果数量
        - proxy: HTTP 代理地址
        """
        self._init_api_key = api_key
        self.max_results = max_results
        self.proxy = proxy

    @property
    def api_key(self) -> str:
        """
        获取 API 密钥
        
        在调用时解析，以便获取最新的环境变量或配置值。
        
        返回：
        - API 密钥字符串
        """
        return self._init_api_key or os.environ.get("BRAVE_API_KEY", "")

    async def execute(self, query: str, count: int | None = None, **kwargs: Any) -> str:
        """
        执行网页搜索
        
        参数：
        - query: 搜索查询
        - count: 返回结果数量（1-10）
        - **kwargs: 其他参数（忽略）
        
        返回：
        - 搜索结果字符串，或错误信息
        """
        # 检查 API 密钥
        if not self.api_key:
            return (
                "Error: Brave Search API key not configured. Set it in "
                "~/.nanobot/config.json under tools.web.search.apiKey "
                "(or export BRAVE_API_KEY), then restart the gateway."
            )

        try:
            # 确定结果数量（限制在 1-10 之间）
            n = min(max(count or self.max_results, 1), 10)
            
            logger.debug("WebSearch: {}", "proxy enabled" if self.proxy else "direct connection")
            
            # 发送搜索请求
            async with httpx.AsyncClient(proxy=self.proxy) as client:
                r = await client.get(
                    "https://api.search.brave.com/res/v1/web/search",
                    params={"q": query, "count": n},
                    headers={
                        "Accept": "application/json",
                        "X-Subscription-Token": self.api_key
                    },
                    timeout=10.0
                )
                r.raise_for_status()

            # 解析结果
            results = r.json().get("web", {}).get("results", [])[:n]
            
            if not results:
                return f"No results for: {query}"

            # 格式化输出
            lines = [f"Results for: {query}\n"]
            for i, item in enumerate(results, 1):
                lines.append(f"{i}. {item.get('title', '')}\n   {item.get('url', '')}")
                if desc := item.get("description"):
                    lines.append(f"   {desc}")
            
            return "\n".join(lines)
            
        except httpx.ProxyError as e:
            logger.error("WebSearch proxy error: {}", e)
            return f"Proxy error: {e}"
        except Exception as e:
            logger.error("WebSearch error: {}", e)
            return f"Error: {e}"


class WebFetchTool(Tool):
    """
    网页内容获取工具
    
    获取 URL 内容并提取可读文本。
    
    功能：
    - 使用 Readability 提取网页正文
    - 支持 JSON 响应
    - 支持转换为 Markdown 或纯文本
    - 支持 HTTP 代理
    
    提取模式：
    - markdown：转换为 Markdown 格式
    - text：提取纯文本
    """
    
    # 工具名称
    name = "web_fetch"
    # 工具描述
    description = "Fetch URL and extract readable content (HTML → markdown/text)."
    # 参数 Schema
    parameters = {
        "type": "object",
        "properties": {
            "url": {"type": "string", "description": "URL to fetch"},
            "extractMode": {"type": "string", "enum": ["markdown", "text"], "default": "markdown"},
            "maxChars": {"type": "integer", "minimum": 100}
        },
        "required": ["url"]
    }

    def __init__(self, max_chars: int = 50000, proxy: str | None = None):
        """
        初始化网页获取工具
        
        参数：
        - max_chars: 最大字符数
        - proxy: HTTP 代理地址
        """
        self.max_chars = max_chars
        self.proxy = proxy

    async def execute(self, url: str, extractMode: str = "markdown", maxChars: int | None = None, **kwargs: Any) -> str:
        """
        执行网页获取
        
        参数：
        - url: 要获取的 URL
        - extractMode: 提取模式（"markdown" 或 "text"）
        - maxChars: 最大字符数
        - **kwargs: 其他参数（忽略）
        
        返回：
        - JSON 格式的结果，包含提取的文本和元数据
        """
        # 延迟导入 readability（可选依赖）
        from readability import Document

        # 确定最大字符数
        max_chars = maxChars or self.max_chars
        
        # 验证 URL
        is_valid, error_msg = _validate_url(url)
        if not is_valid:
            return json.dumps({"error": f"URL validation failed: {error_msg}", "url": url}, ensure_ascii=False)

        try:
            logger.debug("WebFetch: {}", "proxy enabled" if self.proxy else "direct connection")
            
            # 发送 HTTP 请求
            async with httpx.AsyncClient(
                follow_redirects=True,      # 跟随重定向
                max_redirects=MAX_REDIRECTS, # 限制重定向次数
                timeout=30.0,                # 超时时间
                proxy=self.proxy,            # 代理
            ) as client:
                r = await client.get(url, headers={"User-Agent": USER_AGENT})
                r.raise_for_status()

            # 获取内容类型
            ctype = r.headers.get("content-type", "")

            # 根据内容类型处理响应
            if "application/json" in ctype:
                # JSON 响应：直接返回格式化的 JSON
                text, extractor = json.dumps(r.json(), indent=2, ensure_ascii=False), "json"
            elif "text/html" in ctype or r.text[:256].lower().startswith(("<!doctype", "<html")):
                # HTML 响应：使用 Readability 提取正文
                doc = Document(r.text)
                # 根据提取模式处理
                content = self._to_markdown(doc.summary()) if extractMode == "markdown" else _strip_tags(doc.summary())
                # 添加标题
                text = f"# {doc.title()}\n\n{content}" if doc.title() else content
                extractor = "readability"
            else:
                # 其他类型：返回原始文本
                text, extractor = r.text, "raw"

            # 检查是否需要截断
            truncated = len(text) > max_chars
            if truncated:
                text = text[:max_chars]

            # 返回 JSON 格式的结果
            return json.dumps({
                "url": url,
                "finalUrl": str(r.url),      # 最终 URL（可能经过重定向）
                "status": r.status_code,     # HTTP 状态码
                "extractor": extractor,       # 使用的提取器
                "truncated": truncated,       # 是否被截断
                "length": len(text),          # 文本长度
                "text": text                  # 提取的文本
            }, ensure_ascii=False)
            
        except httpx.ProxyError as e:
            logger.error("WebFetch proxy error for {}: {}", url, e)
            return json.dumps({"error": f"Proxy error: {e}", "url": url}, ensure_ascii=False)
        except Exception as e:
            logger.error("WebFetch error for {}: {}", url, e)
            return json.dumps({"error": str(e), "url": url}, ensure_ascii=False)

    def _to_markdown(self, html: str) -> str:
        """
        将 HTML 转换为 Markdown
        
        处理流程：
        1. 转换链接
        2. 转换标题
        3. 转换列表
        4. 转换段落和换行
        5. 移除标签并规范化
        
        参数：
        - html: HTML 内容
        
        返回：
        - Markdown 格式的文本
        """
        # 转换链接：<a href="url">text</a> -> [text](url)
        text = re.sub(r'<a\s+[^>]*href=["\']([^"\']+)["\'][^>]*>([\s\S]*?)</a>',
                      lambda m: f'[{_strip_tags(m[2])}]({m[1]})', html, flags=re.I)
        
        # 转换标题：<h1>text</h1> -> # text
        text = re.sub(r'<h([1-6])[^>]*>([\s\S]*?)</h\1>',
                      lambda m: f'\n{"#" * int(m[1])} {_strip_tags(m[2])}\n', text, flags=re.I)
        
        # 转换列表项：<li>text</li> -> - text
        text = re.sub(r'<li[^>]*>([\s\S]*?)</li>', lambda m: f'\n- {_strip_tags(m[1])}', text, flags=re.I)
        
        # 转换段落和块级元素
        text = re.sub(r'</(p|div|section|article)>', '\n\n', text, flags=re.I)
        
        # 转换换行
        text = re.sub(r'<(br|hr)\s*/?>', '\n', text, flags=re.I)
        
        # 移除标签并规范化
        return _normalize(_strip_tags(text))
