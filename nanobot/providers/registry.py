"""
提供商注册表：LLM 提供商元数据的唯一真实来源

这个模块定义了所有支持的 LLM 提供商及其配置。

设计思路：
- 集中管理所有提供商的元数据
- 支持自动检测和匹配提供商
- 支持网关和本地部署

添加新提供商：
1. 在下面的 PROVIDERS 中添加 ProviderSpec
2. 在 config/schema.py 的 ProvidersConfig 中添加字段
完成！环境变量、前缀、配置匹配、状态显示都从这里派生。

顺序很重要：它控制匹配优先级和回退。网关优先。
每个条目都写出所有字段，以便你可以复制粘贴作为模板。
"""

# __future__：启用未来版本的特性
from __future__ import annotations

# dataclass：数据类装饰器
from dataclasses import dataclass
# Any：类型注解
from typing import Any


@dataclass(frozen=True)
class ProviderSpec:
    """
    提供商规格：单个 LLM 提供商的元数据
    
    参见下面的 PROVIDERS 获取真实示例。
    
    env_extras 值中的占位符：
      {api_key}  — 用户的 API 密钥
      {api_base} — 配置中的 api_base，或此规格的 default_api_base
    
    属性：
    - name: 配置字段名称（如 "dashscope"）
    - keywords: 模型名称关键词（小写，用于匹配）
    - env_key: LiteLLM 环境变量名（如 "DASHSCOPE_API_KEY"）
    - display_name: 显示名称（在 `nanobot status` 中显示）
    - litellm_prefix: LiteLLM 前缀（如 "dashscope" → 模型变为 "dashscope/{model}"）
    - skip_prefixes: 跳过前缀（如果模型已以这些开头）
    - env_extras: 额外环境变量
    - is_gateway: 是否为网关（可路由任何模型）
    - is_local: 是否为本地部署
    - detect_by_key_prefix: 通过 API 密钥前缀检测
    - detect_by_base_keyword: 通过 api_base URL 关键字检测
    - default_api_base: 默认基础 URL
    - strip_model_prefix: 是否在重新前缀前剥离模型前缀
    - model_overrides: 每个模型的参数覆盖
    - is_oauth: 是否使用 OAuth 流程（而非 API 密钥）
    - is_direct: 是否绕过 LiteLLM 直接调用
    - supports_prompt_caching: 是否支持提示缓存
    """
    
    # === 标识 ===
    # 配置字段名称，如 "dashscope"
    name: str
    # 模型名称关键词（小写），用于匹配
    keywords: tuple[str, ...]
    # LiteLLM 环境变量，如 "DASHSCOPE_API_KEY"
    env_key: str
    # 显示名称（在 `nanobot status` 中显示）
    display_name: str = ""

    # === 模型前缀 ===
    # LiteLLM 前缀，如 "dashscope" → 模型变为 "dashscope/{model}"
    litellm_prefix: str = ""
    # 如果模型已以这些开头，不添加前缀
    skip_prefixes: tuple[str, ...] = ()

    # === 额外环境变量 ===
    # 如 (("ZHIPUAI_API_KEY", "{api_key}"),)
    env_extras: tuple[tuple[str, str], ...] = ()

    # === 网关/本地检测 ===
    # 是否为网关（可路由任何模型，如 OpenRouter, AiHubMix）
    is_gateway: bool = False
    # 是否为本地部署（如 vLLM, Ollama）
    is_local: bool = False
    # 通过 API 密钥前缀匹配，如 "sk-or-"
    detect_by_key_prefix: str = ""
    # 通过 api_base URL 子字符串匹配
    detect_by_base_keyword: str = ""
    # 默认基础 URL
    default_api_base: str = ""

    # === 网关行为 ===
    # 在重新前缀前剥离 "provider/"
    strip_model_prefix: bool = False

    # === 每个模型的参数覆盖 ===
    # 如 (("kimi-k2.5", {"temperature": 1.0}),)
    model_overrides: tuple[tuple[str, dict[str, Any]], ...] = ()

    # === OAuth 认证 ===
    # 是否使用 OAuth 流程（如 OpenAI Codex），而非 API 密钥
    is_oauth: bool = False

    # === 直接调用 ===
    # 是否绕过 LiteLLM 直接调用（如 CustomProvider）
    is_direct: bool = False

    # === 提示缓存 ===
    # 是否支持内容块上的 cache_control（如 Anthropic 提示缓存）
    supports_prompt_caching: bool = False

    @property
    def label(self) -> str:
        """
        获取显示标签
        
        返回：
        - 显示名称或首字母大写的名称
        """
        return self.display_name or self.name.title()


# ---------------------------------------------------------------------------
# PROVIDERS — 注册表。顺序 = 优先级。复制任何条目作为模板。
# ---------------------------------------------------------------------------

PROVIDERS: tuple[ProviderSpec, ...] = (

    # === Custom（直接 OpenAI 兼容端点，绕过 LiteLLM）=====
    ProviderSpec(
        name="custom",
        keywords=(),
        env_key="",
        display_name="Custom",
        litellm_prefix="",
        is_direct=True,
    ),

    # === 网关（通过 api_key / api_base 检测，而非模型名）=========
    # 网关可以路由任何模型，所以在回退中优先。

    # OpenRouter：全球网关，密钥以 "sk-or-" 开头
    ProviderSpec(
        name="openrouter",
        keywords=("openrouter",),
        env_key="OPENROUTER_API_KEY",
        display_name="OpenRouter",
        litellm_prefix="openrouter",        # claude-3 → openrouter/claude-3
        skip_prefixes=(),
        env_extras=(),
        is_gateway=True,
        is_local=False,
        detect_by_key_prefix="sk-or-",
        detect_by_base_keyword="openrouter",
        default_api_base="https://openrouter.ai/api/v1",
        strip_model_prefix=False,
        model_overrides=(),
        supports_prompt_caching=True,
    ),

    # AiHubMix：全球网关，OpenAI 兼容接口
    # strip_model_prefix=True：它不理解 "anthropic/claude-3"，
    # 所以我们剥离为裸 "claude-3" 然后重新前缀为 "openai/claude-3"
    ProviderSpec(
        name="aihubmix",
        keywords=("aihubmix",),
        env_key="OPENAI_API_KEY",           # OpenAI 兼容
        display_name="AiHubMix",
        litellm_prefix="openai",            # → openai/{model}
        skip_prefixes=(),
        env_extras=(),
        is_gateway=True,
        is_local=False,
        detect_by_key_prefix="",
        detect_by_base_keyword="aihubmix",
        default_api_base="https://aihubmix.com/v1",
        strip_model_prefix=True,            # anthropic/claude-3 → claude-3 → openai/claude-3
        model_overrides=(),
    ),

    # SiliconFlow（硅基流动）：OpenAI 兼容网关，模型名保留组织前缀
    ProviderSpec(
        name="siliconflow",
        keywords=("siliconflow",),
        env_key="OPENAI_API_KEY",
        display_name="SiliconFlow",
        litellm_prefix="openai",
        skip_prefixes=(),
        env_extras=(),
        is_gateway=True,
        is_local=False,
        detect_by_key_prefix="",
        detect_by_base_keyword="siliconflow",
        default_api_base="https://api.siliconflow.cn/v1",
        strip_model_prefix=False,
        model_overrides=(),
    ),

    # VolcEngine（火山引擎）：OpenAI 兼容网关
    ProviderSpec(
        name="volcengine",
        keywords=("volcengine", "volces", "ark"),
        env_key="OPENAI_API_KEY",
        display_name="VolcEngine",
        litellm_prefix="volcengine",
        skip_prefixes=(),
        env_extras=(),
        is_gateway=True,
        is_local=False,
        detect_by_key_prefix="",
        detect_by_base_keyword="volces",
        default_api_base="https://ark.cn-beijing.volces.com/api/v3",
        strip_model_prefix=False,
        model_overrides=(),
    ),

    # === 标准提供商（通过模型名关键词匹配）===============

    # Anthropic：LiteLLM 原生识别 "claude-*"，无需前缀
    ProviderSpec(
        name="anthropic",
        keywords=("anthropic", "claude"),
        env_key="ANTHROPIC_API_KEY",
        display_name="Anthropic",
        litellm_prefix="",
        skip_prefixes=(),
        env_extras=(),
        is_gateway=False,
        is_local=False,
        detect_by_key_prefix="",
        detect_by_base_keyword="",
        default_api_base="",
        strip_model_prefix=False,
        model_overrides=(),
        supports_prompt_caching=True,
    ),

    # OpenAI：LiteLLM 原生识别 "gpt-*"，无需前缀
    ProviderSpec(
        name="openai",
        keywords=("openai", "gpt"),
        env_key="OPENAI_API_KEY",
        display_name="OpenAI",
        litellm_prefix="",
        skip_prefixes=(),
        env_extras=(),
        is_gateway=False,
        is_local=False,
        detect_by_key_prefix="",
        detect_by_base_keyword="",
        default_api_base="",
        strip_model_prefix=False,
        model_overrides=(),
    ),

    # OpenAI Codex：使用 OAuth，而非 API 密钥
    ProviderSpec(
        name="openai_codex",
        keywords=("openai-codex",),
        env_key="",                         # 基于 OAuth，无 API 密钥
        display_name="OpenAI Codex",
        litellm_prefix="",                  # 不通过 LiteLLM 路由
        skip_prefixes=(),
        env_extras=(),
        is_gateway=False,
        is_local=False,
        detect_by_key_prefix="",
        detect_by_base_keyword="codex",
        default_api_base="https://chatgpt.com/backend-api",
        strip_model_prefix=False,
        model_overrides=(),
        is_oauth=True,                      # 基于 OAuth 认证
    ),

    # Github Copilot：使用 OAuth，而非 API 密钥
    ProviderSpec(
        name="github_copilot",
        keywords=("github_copilot", "copilot"),
        env_key="",                         # 基于 OAuth，无 API 密钥
        display_name="Github Copilot",
        litellm_prefix="github_copilot",   # github_copilot/model → github_copilot/model
        skip_prefixes=("github_copilot/",),
        env_extras=(),
        is_gateway=False,
        is_local=False,
        detect_by_key_prefix="",
        detect_by_base_keyword="",
        default_api_base="",
        strip_model_prefix=False,
        model_overrides=(),
        is_oauth=True,                      # 基于 OAuth 认证
    ),

    # DeepSeek：需要 "deepseek/" 前缀供 LiteLLM 路由
    ProviderSpec(
        name="deepseek",
        keywords=("deepseek",),
        env_key="DEEPSEEK_API_KEY",
        display_name="DeepSeek",
        litellm_prefix="deepseek",          # deepseek-chat → deepseek/deepseek-chat
        skip_prefixes=("deepseek/",),       # 避免双重前缀
        env_extras=(),
        is_gateway=False,
        is_local=False,
        detect_by_key_prefix="",
        detect_by_base_keyword="",
        default_api_base="",
        strip_model_prefix=False,
        model_overrides=(),
    ),

    # Gemini：需要 "gemini/" 前缀供 LiteLLM
    ProviderSpec(
        name="gemini",
        keywords=("gemini",),
        env_key="GEMINI_API_KEY",
        display_name="Gemini",
        litellm_prefix="gemini",            # gemini-pro → gemini/gemini-pro
        skip_prefixes=("gemini/",),         # 避免双重前缀
        env_extras=(),
        is_gateway=False,
        is_local=False,
        detect_by_key_prefix="",
        detect_by_base_keyword="",
        default_api_base="",
        strip_model_prefix=False,
        model_overrides=(),
    ),

    # Zhipu：LiteLLM 使用 "zai/" 前缀
    # 同时镜像密钥到 ZHIPUAI_API_KEY（某些 LiteLLM 路径检查该变量）
    # skip_prefixes：已通过网关路由时不添加 "zai/"
    ProviderSpec(
        name="zhipu",
        keywords=("zhipu", "glm", "zai"),
        env_key="ZAI_API_KEY",
        display_name="Zhipu AI",
        litellm_prefix="zai",              # glm-4 → zai/glm-4
        skip_prefixes=("zhipu/", "zai/", "openrouter/", "hosted_vllm/"),
        env_extras=(
            ("ZHIPUAI_API_KEY", "{api_key}"),
        ),
        is_gateway=False,
        is_local=False,
        detect_by_key_prefix="",
        detect_by_base_keyword="",
        default_api_base="",
        strip_model_prefix=False,
        model_overrides=(),
    ),

    # DashScope：Qwen 模型，需要 "dashscope/" 前缀
    ProviderSpec(
        name="dashscope",
        keywords=("qwen", "dashscope"),
        env_key="DASHSCOPE_API_KEY",
        display_name="DashScope",
        litellm_prefix="dashscope",         # qwen-max → dashscope/qwen-max
        skip_prefixes=("dashscope/", "openrouter/"),
        env_extras=(),
        is_gateway=False,
        is_local=False,
        detect_by_key_prefix="",
        detect_by_base_keyword="",
        default_api_base="",
        strip_model_prefix=False,
        model_overrides=(),
    ),

    # Moonshot：Kimi 模型，需要 "moonshot/" 前缀
    # LiteLLM 需要 MOONSHOT_API_BASE 环境变量找到端点
    # Kimi K2.5 API 强制 temperature >= 1.0
    ProviderSpec(
        name="moonshot",
        keywords=("moonshot", "kimi"),
        env_key="MOONSHOT_API_KEY",
        display_name="Moonshot",
        litellm_prefix="moonshot",          # kimi-k2.5 → moonshot/kimi-k2.5
        skip_prefixes=("moonshot/", "openrouter/"),
        env_extras=(
            ("MOONSHOT_API_BASE", "{api_base}"),
        ),
        is_gateway=False,
        is_local=False,
        detect_by_key_prefix="",
        detect_by_base_keyword="",
        default_api_base="https://api.moonshot.ai/v1",   # 国际版；中国使用 api.moonshot.cn
        strip_model_prefix=False,
        model_overrides=(
            ("kimi-k2.5", {"temperature": 1.0}),
        ),
    ),

    # MiniMax：需要 "minimax/" 前缀供 LiteLLM 路由
    # 使用 OpenAI 兼容 API 在 api.minimax.io/v1
    ProviderSpec(
        name="minimax",
        keywords=("minimax",),
        env_key="MINIMAX_API_KEY",
        display_name="MiniMax",
        litellm_prefix="minimax",            # MiniMax-M2.1 → minimax/MiniMax-M2.1
        skip_prefixes=("minimax/", "openrouter/"),
        env_extras=(),
        is_gateway=False,
        is_local=False,
        detect_by_key_prefix="",
        detect_by_base_keyword="",
        default_api_base="https://api.minimax.io/v1",
        strip_model_prefix=False,
        model_overrides=(),
    ),

    # === 本地部署（通过配置键匹配，而非 api_base）=========

    # vLLM / 任何 OpenAI 兼容的本地服务器
    # 当配置键为 "vllm" 时检测（provider_name="vllm"）
    ProviderSpec(
        name="vllm",
        keywords=("vllm",),
        env_key="HOSTED_VLLM_API_KEY",
        display_name="vLLM/Local",
        litellm_prefix="hosted_vllm",      # Llama-3-8B → hosted_vllm/Llama-3-8B
        skip_prefixes=(),
        env_extras=(),
        is_gateway=False,
        is_local=True,
        detect_by_key_prefix="",
        detect_by_base_keyword="",
        default_api_base="",                # 用户必须在配置中提供
        strip_model_prefix=False,
        model_overrides=(),
    ),

    # === 辅助（非主要 LLM 提供商）============================

    # Groq：主要用于 Whisper 语音转录，也可用于 LLM
    # 需要 "groq/" 前缀供 LiteLLM 路由。放在最后——它很少赢得回退
    ProviderSpec(
        name="groq",
        keywords=("groq",),
        env_key="GROQ_API_KEY",
        display_name="Groq",
        litellm_prefix="groq",              # llama3-8b-8192 → groq/llama3-8b-8192
        skip_prefixes=("groq/",),           # 避免双重前缀
        env_extras=(),
        is_gateway=False,
        is_local=False,
        detect_by_key_prefix="",
        detect_by_base_keyword="",
        default_api_base="",
        strip_model_prefix=False,
        model_overrides=(),
    ),
)


# ---------------------------------------------------------------------------
# 查找辅助函数
# ---------------------------------------------------------------------------

def find_by_model(model: str) -> ProviderSpec | None:
    """
    通过模型名关键词匹配标准提供商（不区分大小写）
    
    跳过网关/本地——它们通过 api_key/api_base 匹配。
    
    参数：
    - model: 模型名称
    
    返回：
    - 匹配的 ProviderSpec，如果没找到则返回 None
    """
    # 转换为小写并标准化
    model_lower = model.lower()
    model_normalized = model_lower.replace("-", "_")
    # 提取模型前缀（如果有）
    model_prefix = model_lower.split("/", 1)[0] if "/" in model_lower else ""
    normalized_prefix = model_prefix.replace("-", "_")
    
    # 只考虑标准提供商（非网关、非本地）
    std_specs = [s for s in PROVIDERS if not s.is_gateway and not s.is_local]

    # 优先匹配显式提供商前缀——防止 `github-copilot/...codex` 匹配 openai_codex
    for spec in std_specs:
        if model_prefix and normalized_prefix == spec.name:
            return spec

    # 通过关键词匹配
    for spec in std_specs:
        if any(kw in model_lower or kw.replace("-", "_") in model_normalized for kw in spec.keywords):
            return spec
        
    return None


def find_gateway(
    provider_name: str | None = None,  # 提供商名称
    api_key: str | None = None,        # API 密钥
    api_base: str | None = None,       # API 基础 URL
) -> ProviderSpec | None:
    """
    检测网关/本地提供商
    
    优先级：
      1. provider_name — 如果映射到网关/本地规格，直接使用
      2. api_key 前缀 — 如 "sk-or-" → OpenRouter
      3. api_base 关键字 — 如 URL 中的 "aihubmix" → AiHubMix
    
    注意：带有自定义 api_base 的标准提供商（如代理后的 DeepSeek）
    不会被误认为 vLLM——旧的回退已移除。
    
    参数：
    - provider_name: 配置中的提供商名称
    - api_key: API 密钥
    - api_base: API 基础 URL
    
    返回：
    - 匹配的 ProviderSpec，如果没找到则返回 None
    """
    # 1. 通过配置键直接匹配
    if provider_name:
        spec = find_by_name(provider_name)
        if spec and (spec.is_gateway or spec.is_local):
            return spec

    # 2. 通过 api_key 前缀 / api_base 关键字自动检测
    for spec in PROVIDERS:
        # 通过密钥前缀检测
        if spec.detect_by_key_prefix and api_key and api_key.startswith(spec.detect_by_key_prefix):
            return spec
        # 通过 api_base 关键字检测
        if spec.detect_by_base_keyword and api_base and spec.detect_by_base_keyword in api_base:
            return spec

    return None


def find_by_name(name: str) -> ProviderSpec | None:
    """
    通过配置字段名称查找提供商规格
    
    参数：
    - name: 配置字段名称，如 "dashscope"
    
    返回：
    - 匹配的 ProviderSpec，如果没找到则返回 None
    """
    for spec in PROVIDERS:
        if spec.name == name:
            return spec
    return None
