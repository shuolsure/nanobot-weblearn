/**
 * 源码数据文件
 * 包含每个知识点对应的源码片段、解释和文件路径
 */

const codeData = {
    // ==================== 核心功能部分 ====================
    
    // AI 代理引擎
    'agent-engine': {
        title: 'AI 代理引擎源码解析',
        file: 'nanobot/agent/loop.py',
        description: '这是 Nanobot 的核心处理循环，负责接收消息、调用 LLM、执行工具并返回结果。',
        sections: [
            {
                name: '主循环入口',
                code: `async def run(self):
    """
    主处理循环 - 这是整个 AI 代理的"心脏"
    
    工作流程：
    1. 从消息队列获取用户消息
    2. 构建上下文（包括历史对话、系统提示等）
    3. 调用 LLM 获取回复
    4. 如果需要调用工具，执行工具并继续循环
    5. 返回最终回复给用户
    """
    while True:
        # 等待并获取下一条消息
        event = await self.message_queue.get()
        
        # 处理消息
        async for response in self._process_event(event):
            yield response`,
                explanation: 'run() 方法是一个无限循环，持续监听用户消息。每当收到消息时，它会调用 _process_event() 进行处理。'
            },
            {
                name: '消息处理核心',
                code: `async def _process_event(self, event):
    """
    处理单个消息事件
    
    这是 AI "思考"的核心：
    1. 构建上下文 → 让 AI 知道"我们在聊什么"
    2. 调用 LLM → AI 开始"思考"
    3. 解析响应 → 理解 AI 想要做什么
    4. 执行工具 → 如果 AI 想要执行操作
    5. 继续循环 → 直到 AI 给出最终回复
    """
    # 构建对话上下文
    context = await self._build_context(event)
    
    # 调用 LLM 获取响应
    response = await self.provider.generate(context)
    
    # 解析响应中的工具调用
    tool_calls = self._parse_tool_calls(response)
    
    if tool_calls:
        # 执行工具并继续对话
        for tool_call in tool_calls:
            result = await self._execute_tool(tool_call)
            # 将工具结果加入上下文，继续对话
            context.append({"role": "tool", "content": result})
        # 递归处理，直到没有更多工具调用
        async for final_response in self._process_event(event):
            yield final_response
    else:
        # 没有工具调用，返回最终回复
        yield response`,
                explanation: '这个方法实现了"思考-行动-观察"循环。AI 先思考要做什么，如果需要执行操作就调用工具，然后观察结果继续思考。'
            }
        ],
        relatedFiles: ['context.py', 'tools/registry.py'],
        tips: [
            '理解这个循环是理解整个系统的关键',
            'AI 不是一次性给出答案，而是可能经过多轮"思考-行动"',
            '每次工具调用的结果都会反馈给 AI，让它做出更好的决策'
        ]
    },

    // 工具系统
    'tool-system': {
        title: '工具系统源码解析',
        file: 'nanobot/agent/tools/',
        description: '工具系统让 AI 能够执行实际操作，如读写文件、搜索网页等。',
        sections: [
            {
                name: '工具基类定义',
                code: `class BaseTool(ABC):
    """
    所有工具的基类
    
    每个工具必须实现：
    - name: 工具名称（AI 会用这个名字调用）
    - description: 工具描述（告诉 AI 这个工具能做什么）
    - parameters: 参数定义（告诉 AI 需要提供什么参数）
    - execute(): 执行方法（实际的业务逻辑）
    """
    
    @property
    @abstractmethod
    def name(self) -> str:
        """工具名称，如 'read_file'、'search_web'"""
        pass
    
    @property
    @abstractmethod
    def description(self) -> str:
        """工具描述，AI 会根据这个描述决定是否使用该工具"""
        pass
    
    @property
    def parameters(self) -> dict:
        """
        参数定义，使用 JSON Schema 格式
        例如：
        {
            "type": "object",
            "properties": {
                "file_path": {"type": "string", "description": "文件路径"}
            },
            "required": ["file_path"]
        }
        """
        return {}
    
    @abstractmethod
    async def execute(self, **kwargs) -> str:
        """
        执行工具
        
        参数：kwargs - AI 提供的参数
        返回：字符串结果，会反馈给 AI
        """
        pass`,
                explanation: 'BaseTool 定义了工具的标准接口。所有工具都必须继承这个类并实现相应方法。这种设计让添加新工具变得非常简单。'
            },
            {
                name: '工具注册表',
                code: `class ToolRegistry:
    """
    工具注册表 - 管理所有可用工具
    
    就像一个"工具箱"，AI 可以从中选择需要的工具
    """
    
    def __init__(self):
        self._tools: Dict[str, BaseTool] = {}
    
    def register(self, tool: BaseTool):
        """注册一个工具"""
        self._tools[tool.name] = tool
    
    def get(self, name: str) -> BaseTool:
        """根据名称获取工具"""
        return self._tools.get(name)
    
    def get_all_schemas(self) -> List[dict]:
        """
        获取所有工具的 JSON Schema
        
        这些信息会发送给 LLM，让它知道有哪些工具可用
        """
        schemas = []
        for tool in self._tools.values():
            schemas.append({
                "name": tool.name,
                "description": tool.description,
                "parameters": tool.parameters
            })
        return schemas`,
                explanation: 'ToolRegistry 管理所有工具。当 AI 需要调用工具时，它会通过这个注册表找到对应的工具并执行。'
            },
            {
                name: '文件操作工具示例',
                code: `class ReadFileTool(BaseTool):
    """读取文件内容的工具"""
    
    @property
    def name(self) -> str:
        return "read_file"
    
    @property
    def description(self) -> str:
        return "读取指定文件的内容"
    
    @property
    def parameters(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "file_path": {
                    "type": "string",
                    "description": "要读取的文件路径"
                }
            },
            "required": ["file_path"]
        }
    
    async def execute(self, file_path: str) -> str:
        """执行文件读取"""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
            return f"文件内容:\\n{content}"
        except Exception as e:
            return f"读取文件失败: {str(e)}"`,
                explanation: '这是一个完整的工具实现示例。AI 可以通过调用 read_file 工具来读取文件内容。'
            }
        ],
        relatedFiles: ['base.py', 'registry.py', 'filesystem.py', 'shell.py', 'web.py'],
        tips: [
            '添加新工具只需：1) 继承 BaseTool 2) 实现必要方法 3) 注册到 ToolRegistry',
            '工具的 description 非常重要，AI 根据它决定是否使用该工具',
            '工具执行出错时，返回错误信息让 AI 知道发生了什么'
        ]
    },

    // 多渠道接入
    'multi-channel': {
        title: '多渠道接入源码解析',
        file: 'nanobot/channels/',
        description: '多渠道系统让 AI 能够在 Telegram、WhatsApp、Discord 等多个平台上工作。',
        sections: [
            {
                name: '渠道基类',
                code: `class BaseChannel(ABC):
    """
    渠道基类 - 所有聊天平台的统一接口
    
    不管是 Telegram、WhatsApp 还是其他平台，
    都需要实现这个接口，让 AI 能够统一处理
    """
    
    @abstractmethod
    async def start(self):
        """启动渠道，开始监听消息"""
        pass
    
    @abstractmethod
    async def stop(self):
        """停止渠道"""
        pass
    
    @abstractmethod
    async def send_message(self, user_id: str, message: str):
        """
        发送消息给用户
        
        参数：
        - user_id: 用户标识（不同平台格式不同）
        - message: 要发送的消息内容
        """
        pass
    
    # 消息回调 - 当收到消息时调用
    def set_message_handler(self, handler: Callable):
        """
        设置消息处理器
        
        当收到用户消息时，会调用这个处理器
        处理器通常是 Agent Loop
        """
        self._message_handler = handler`,
                explanation: 'BaseChannel 定义了所有渠道必须实现的接口。这种抽象让 AI 核心逻辑不需要关心具体是哪个平台。'
            },
            {
                name: '渠道管理器',
                code: `class ChannelManager:
    """
    渠道管理器 - 统一管理所有渠道
    
    负责：
    1. 启动/停止所有渠道
    2. 将消息路由到正确的处理器
    3. 管理用户会话
    """
    
    def __init__(self):
        self._channels: Dict[str, BaseChannel] = {}
        self._message_queue = AsyncQueue()
    
    def register(self, name: str, channel: BaseChannel):
        """注册一个渠道"""
        self._channels[name] = channel
        # 设置消息处理器
        channel.set_message_handler(self._handle_message)
    
    async def start_all(self):
        """启动所有渠道"""
        for name, channel in self._channels.items():
            await channel.start()
            print(f"渠道 {name} 已启动")
    
    async def _handle_message(self, channel_name: str, user_id: str, content: str):
        """
        处理来自任何渠道的消息
        
        所有消息都会被放入统一的消息队列，
        由 Agent Loop 统一处理
        """
        event = MessageEvent(
            channel=channel_name,
            user_id=user_id,
            content=content
        )
        await self._message_queue.put(event)`,
                explanation: 'ChannelManager 是所有渠道的"指挥官"。它将不同平台的消息统一到一个队列中，让 AI 能够统一处理。'
            }
        ],
        relatedFiles: ['base.py', 'manager.py'],
        tips: [
            '添加新平台只需实现 BaseChannel 接口',
            '所有平台的消息最终都进入同一个队列，由 AI 统一处理',
            '这种设计让 AI 的核心逻辑与平台无关'
        ]
    },

    // 记忆系统
    'memory-system': {
        title: '记忆系统源码解析',
        file: 'nanobot/agent/memory.py',
        description: '记忆系统让 AI 能够"记住"之前的对话，实现连贯的多轮对话。',
        sections: [
            {
                name: '记忆管理器',
                code: `class MemoryManager:
    """
    记忆管理器 - 让 AI 拥有"记忆"
    
    记忆分为两种：
    1. 短期记忆：当前对话的上下文
    2. 长期记忆：重要信息的持久化存储
    """
    
    def __init__(self, storage_path: str):
        self.storage_path = storage_path
        self._short_term: Dict[str, List[Message]] = {}
        self._long_term: Dict[str, List[Memory]] = {}
    
    async def add_message(self, session_id: str, message: Message):
        """
        添加消息到短期记忆
        
        每条用户消息和 AI 回复都会被记录
        """
        if session_id not in self._short_term:
            self._short_term[session_id] = []
        self._short_term[session_id].append(message)
        
        # 检查是否需要整合记忆
        if len(self._short_term[session_id]) > 20:
            await self._consolidate(session_id)
    
    async def get_context(self, session_id: str) -> List[Message]:
        """
        获取对话上下文
        
        返回短期记忆 + 相关的长期记忆
        """
        context = []
        
        # 添加长期记忆中的相关信息
        if session_id in self._long_term:
            context.extend(self._long_term[session_id])
        
        # 添加短期记忆
        if session_id in self._short_term:
            context.extend(self._short_term[session_id])
        
        return context`,
                explanation: 'MemoryManager 管理两种记忆。短期记忆保存最近的对话，长期记忆保存重要信息。'
            },
            {
                name: '记忆整合',
                code: `async def _consolidate(self, session_id: str):
    """
    记忆整合 - 将短期记忆转化为长期记忆
    
    类似人类睡眠时大脑整理记忆：
    1. 总结最近的对话
    2. 提取重要信息
    3. 存储到长期记忆
    4. 清理短期记忆
    """
    messages = self._short_term[session_id]
    
    # 使用 LLM 总结对话
    summary = await self._summarize_messages(messages)
    
    # 提取关键信息
    key_info = await self._extract_key_info(messages)
    
    # 存储到长期记忆
    if session_id not in self._long_term:
        self._long_term[session_id] = []
    
    self._long_term[session_id].append(Memory(
        type="summary",
        content=summary,
        key_info=key_info,
        timestamp=datetime.now()
    ))
    
    # 清理短期记忆，只保留最近几条
    self._short_term[session_id] = messages[-5:]`,
                explanation: '当短期记忆太多时，系统会自动总结并转移到长期记忆。这防止了上下文过长，同时保留了重要信息。'
            }
        ],
        relatedFiles: ['memory.py', 'context.py'],
        tips: [
            '记忆整合是自动进行的，不需要手动触发',
            '长期记忆会持久化到磁盘，重启后仍然存在',
            '可以调整整合的阈值（默认 20 条消息）'
        ]
    },

    // 定时任务
    'cron-system': {
        title: '定时任务源码解析',
        file: 'nanobot/cron/',
        description: '定时任务系统让 AI 能够在指定时间执行操作，如提醒、定期检查等。',
        sections: [
            {
                name: '任务类型定义',
                code: `@dataclass
class CronJob:
    """
    定时任务定义
    
    支持三种类型：
    1. 一次性任务：在指定时间执行一次
    2. 周期性任务：每隔一段时间执行
    3. Cron 表达式：使用标准 cron 语法
    """
    id: str                    # 任务唯一标识
    user_id: str               # 所属用户
    task_type: CronType        # 任务类型
    schedule: str              # 调度规则
    action: str                # 要执行的操作
    next_run: datetime         # 下次执行时间
    created_at: datetime       # 创建时间

class CronType(Enum):
    """任务类型枚举"""
    ONCE = "once"              # 一次性
    INTERVAL = "interval"      # 周期性
    CRON = "cron"              # Cron 表达式`,
                explanation: 'CronJob 定义了定时任务的数据结构。不同类型的任务有不同的调度方式。'
            },
            {
                name: '调度服务',
                code: `class CronService:
    """
    定时任务服务 - 管理所有定时任务
    
    工作原理：
    1. 维护一个任务列表
    2. 每秒检查是否有任务需要执行
    3. 执行到期的任务
    4. 更新下次执行时间
    """
    
    def __init__(self, agent_loop):
        self.agent_loop = agent_loop
        self._jobs: Dict[str, CronJob] = {}
        self._running = False
    
    async def start(self):
        """启动调度服务"""
        self._running = True
        await self._load_jobs()  # 从存储加载任务
        asyncio.create_task(self._run_scheduler())
    
    async def _run_scheduler(self):
        """调度循环 - 每秒检查一次"""
        while self._running:
            now = datetime.now()
            
            for job in self._jobs.values():
                if job.next_run <= now:
                    # 执行任务
                    await self._execute_job(job)
                    # 更新下次执行时间
                    self._update_next_run(job)
            
            await asyncio.sleep(1)
    
    async def add_job(self, job: CronJob):
        """添加新的定时任务"""
        self._jobs[job.id] = job
        await self._save_jobs()
    
    async def _execute_job(self, job: CronJob):
        """
        执行任务
        
        将任务转化为消息发送给 Agent Loop
        """
        event = CronEvent(
            job_id=job.id,
            user_id=job.user_id,
            action=job.action
        )
        await self.agent_loop.process_event(event)`,
                explanation: 'CronService 是一个后台服务，持续检查是否有任务到期。到期时，它会将任务发送给 AI 处理。'
            }
        ],
        relatedFiles: ['service.py', 'types.py', 'tools/cron.py'],
        tips: [
            '定时任务会持久化存储，重启后继续有效',
            '使用 Cron 表达式可以实现复杂的调度规则',
            '任务执行时会创建新的对话上下文'
        ]
    },

    // ==================== 系统架构部分 ====================
    
    // 数据流处理
    'data-flow': {
        title: '数据流处理源码解析',
        file: 'nanobot/agent/loop.py',
        description: '理解消息如何在系统中流动，是理解整个架构的关键。',
        sections: [
            {
                name: '消息接收',
                code: `async def run(self):
    """
    消息接收 - 从队列获取消息
    
    消息队列是一个异步队列，支持：
    - 多个渠道同时发送消息
    - 按顺序处理消息
    - 非阻塞等待
    """
    while True:
        # 阻塞等待下一条消息
        event = await self.message_queue.get()
        
        # 根据事件类型分发
        if event.type == EventType.MESSAGE:
            async for response in self._handle_message(event):
                yield response
        elif event.type == EventType.CRON:
            async for response in self._handle_cron(event):
                yield response`,
                explanation: '消息队列实现了生产者-消费者模式。多个渠道（生产者）将消息放入队列，AI 循环（消费者）从队列取出消息处理。'
            },
            {
                name: '上下文构建',
                code: `async def _build_context(self, event) -> List[dict]:
    """
    构建对话上下文
    
    上下文包含：
    1. 系统提示 - 定义 AI 的角色和能力
    2. 长期记忆 - 之前总结的重要信息
    3. 短期记忆 - 最近的对话历史
    4. 当前消息 - 用户刚刚说的话
    5. 工具定义 - AI 可以使用的工具
    """
    context = []
    
    # 1. 系统提示
    context.append({
        "role": "system",
        "content": self.system_prompt
    })
    
    # 2. 长期记忆
    long_term = await self.memory.get_long_term(event.user_id)
    if long_term:
        context.append({
            "role": "system",
            "content": f"之前的记忆：{long_term}"
        })
    
    # 3. 短期记忆（最近对话）
    short_term = await self.memory.get_short_term(event.user_id)
    context.extend(short_term)
    
    # 4. 当前消息
    context.append({
        "role": "user",
        "content": event.content
    })
    
    return context`,
                explanation: '上下文构建是 AI "理解"对话的关键。它将所有相关信息组合起来，让 AI 知道"我们在聊什么"。'
            },
            {
                name: '工具执行',
                code: `async def _execute_tool(self, tool_call: ToolCall) -> str:
    """
    执行工具调用
    
    流程：
    1. 从注册表获取工具
    2. 验证参数
    3. 执行工具
    4. 返回结果
    """
    tool = self.tool_registry.get(tool_call.name)
    
    if not tool:
        return f"错误：未知工具 {tool_call.name}"
    
    try:
        # 执行工具
        result = await tool.execute(**tool_call.arguments)
        return result
    except Exception as e:
        return f"工具执行失败：{str(e)}"`,
                explanation: '工具执行是 AI "行动"的体现。AI 决定调用什么工具，系统负责执行并返回结果。'
            }
        ],
        relatedFiles: ['loop.py', 'context.py', 'tools/registry.py'],
        tips: [
            '数据流是单向的：用户 → 队列 → AI → 工具 → AI → 用户',
            '每个环节都是异步的，不会阻塞其他处理',
            '理解数据流就理解了整个系统的工作方式'
        ]
    },

    // 核心模块关系
    'core-modules': {
        title: '核心模块关系源码解析',
        file: 'nanobot/agent/',
        description: '了解各个核心模块如何协作，形成完整的 AI 代理系统。',
        sections: [
            {
                name: 'Agent Loop - 主控制器',
                code: `class AgentLoop:
    """
    Agent Loop - 整个系统的"大脑"
    
    它协调所有其他模块：
    - Memory: 管理对话记忆
    - Context: 构建对话上下文
    - Tools: 执行工具调用
    - Provider: 调用 LLM API
    """
    
    def __init__(
        self,
        provider: LLMProvider,
        memory: MemoryManager,
        tools: ToolRegistry,
        config: Config
    ):
        self.provider = provider      # LLM 提供商
        self.memory = memory          # 记忆管理器
        self.tools = tools            # 工具注册表
        self.config = config          # 配置
        self.message_queue = AsyncQueue()  # 消息队列`,
                explanation: 'AgentLoop 是主控制器，它持有所有其他模块的引用，协调它们的工作。'
            },
            {
                name: 'Context - 上下文构建器',
                code: `class ContextBuilder:
    """
    上下文构建器 - 准备 AI 需要的所有信息
    
    负责：
    1. 组装系统提示
    2. 加载历史对话
    3. 注入工具定义
    4. 控制上下文长度
    """
    
    async def build(
        self,
        user_id: str,
        current_message: str,
        tools: List[Tool]
    ) -> List[dict]:
        """构建完整的对话上下文"""
        context = []
        
        # 系统提示
        context.append(self._build_system_prompt())
        
        # 历史对话
        history = await self._load_history(user_id)
        context.extend(history)
        
        # 当前消息
        context.append({
            "role": "user",
            "content": current_message
        })
        
        # 工具定义（如果支持）
        if tools:
            context.append({
                "role": "system",
                "content": self._format_tools(tools)
            })
        
        return context`,
                explanation: 'ContextBuilder 负责准备发送给 LLM 的所有信息。它确保 AI 有足够的上下文来理解用户意图。'
            },
            {
                name: '模块协作流程',
                code: `# 完整的处理流程示例

async def process_user_message(user_id: str, message: str):
    """
    处理用户消息的完整流程
    
    展示各模块如何协作：
    """
    
    # 1. Memory 记录用户消息
    await memory.add_message(user_id, Message(
        role="user",
        content=message
    ))
    
    # 2. Context 构建对话上下文
    context = await context_builder.build(
        user_id=user_id,
        current_message=message,
        tools=tools.get_all()
    )
    
    # 3. Provider 调用 LLM
    response = await provider.generate(context)
    
    # 4. 解析工具调用
    tool_calls = parse_tool_calls(response)
    
    # 5. Tools 执行工具
    for tool_call in tool_calls:
        result = await tools.execute(
            tool_call.name,
            tool_call.arguments
        )
        # 将结果加入上下文
        context.append({
            "role": "tool",
            "content": result
        })
        # 再次调用 LLM
        response = await provider.generate(context)
    
    # 6. Memory 记录 AI 回复
    await memory.add_message(user_id, Message(
        role="assistant",
        content=response
    ))
    
    return response`,
                explanation: '这个伪代码展示了完整的数据流和模块协作。每个模块各司其职，共同完成用户请求。'
            }
        ],
        relatedFiles: ['loop.py', 'context.py', 'memory.py', 'tools/registry.py'],
        tips: [
            'AgentLoop 是协调者，不直接处理细节',
            '每个模块都是独立的，可以单独测试和替换',
            '模块之间通过接口通信，降低了耦合度'
        ]
    },

    // 消息总线
    'message-bus': {
        title: '消息总线源码解析',
        file: 'nanobot/bus/',
        description: '消息总线是系统的"神经网络"，负责在不同组件之间传递消息。',
        sections: [
            {
                name: '事件类型定义',
                code: `@dataclass
class MessageEvent:
    """用户消息事件"""
    type: EventType = EventType.MESSAGE
    channel: str       # 来源渠道（telegram、whatsapp 等）
    user_id: str       # 用户标识
    content: str       # 消息内容
    timestamp: datetime = field(default_factory=datetime.now)

@dataclass
class CronEvent:
    """定时任务事件"""
    type: EventType = EventType.CRON
    job_id: str        # 任务 ID
    user_id: str       # 所属用户
    action: str        # 要执行的操作
    timestamp: datetime = field(default_factory=datetime.now)

class EventType(Enum):
    """事件类型枚举"""
    MESSAGE = "message"    # 用户消息
    CRON = "cron"          # 定时任务
    SYSTEM = "system"      # 系统事件`,
                explanation: '事件类型定义了系统中传递的消息格式。不同类型的事件有不同的处理方式。'
            },
            {
                name: '异步消息队列',
                code: `class AsyncQueue:
    """
    异步消息队列 - 系统的"神经网络"
    
    特点：
    1. 异步非阻塞 - 不会卡住系统
    2. 线程安全 - 多个生产者可以同时写入
    3. 无限容量 - 不会丢失消息
    """
    
    def __init__(self):
        self._queue = asyncio.Queue()
    
    async def put(self, item):
        """放入消息（非阻塞）"""
        await self._queue.put(item)
    
    async def get(self):
        """获取消息（阻塞等待）"""
        return await self._queue.get()
    
    def qsize(self):
        """获取队列大小"""
        return self._queue.qsize()
    
    def empty(self):
        """检查队列是否为空"""
        return self._queue.empty()`,
                explanation: 'AsyncQueue 是整个消息系统的基础。它实现了生产者-消费者模式，让不同组件能够异步通信。'
            }
        ],
        relatedFiles: ['events.py', 'queue.py'],
        tips: [
            '消息队列解耦了消息的发送和接收',
            '异步设计让系统能够高效处理并发',
            '所有组件通过消息队列通信，降低了耦合'
        ]
    },

    // ==================== 文件夹结构 - 各文件详解 ====================
    
    // ----- agent/ 目录 -----
    
    // loop.py - 主处理循环
    'file-loop': {
        title: 'loop.py - AI 代理的主循环',
        file: 'nanobot/agent/loop.py',
        description: '这是整个系统的"心脏"，负责协调所有组件完成用户请求。',
        sections: [
            {
                name: '🤔 思考：什么是"循环"?',
                code: `class AgentLoop:
    """
    AgentLoop - AI 代理的主循环类
    
    💡 想一想：
    - 为什么叫"循环"而不是"函数"?
    - 循环意味着什么？持续运行、不断处理
    """
    
    def __init__(self, config: Config):
        # 初始化各个组件
        self.provider = create_provider(config)    # AI 大脑
        self.memory = MemoryManager(config)        # 记忆系统
        self.tools = ToolRegistry()                # 工具箱
        self.message_queue = AsyncQueue()          # 消息队列
        
        # 加载所有工具
        self._load_tools()`,
                explanation: `**苏格拉底式提问**：

1. 🎯 **为什么需要把 AI 封装成一个"类"？**
   → 想象一下，如果用函数来写，每次调用都需要传入所有参数
   → 用类可以把"状态"（记忆、配置、工具）保存在 self 里
   → 这样不同的方法可以共享这些数据
   → 这叫"封装"：把数据和操作数据的方法放在一起

2. 🎯 **self 是什么意思？**
   → self 代表"当前对象"
   → 就像说"我的名字"、"我的年龄"
   → self.provider = 意思是"这个 AI 的提供商是..."
   → 每个创建的 AgentLoop 实例都有自己的 self

3. 🎯 **为什么需要 message_queue（消息队列）？**
   → 想象一个客服中心：电话不断打进来
   → 如果一个电话没处理完，下一个电话怎么办？
   → 队列让消息"排队等待"，AI 一个一个处理
   → 这样就不会混乱，也不会丢消息

4. 🎯 **这些组件是如何协作的？**
   → provider：负责"思考"（调用 AI 大模型）
   → memory：负责"记忆"（记住对话历史）
   → tools：负责"行动"（执行具体操作）
   → message_queue：负责"调度"（管理消息流）
   → 通过"循环"不断协调它们的工作`
            },
            {
                name: '🔄 理解：主循环的工作方式',
                code: `async def run(self):
    """
    主循环 - 永不停歇的"心跳"
    
    💡 思考：
    - while True 会一直运行吗？
    - 如果没有消息，会怎样？
    - await 是什么意思？
    """
    while True:
        # 等待消息（不会卡住 CPU）
        event = await self.message_queue.get()
        
        # 处理这条消息
        async for response in self._process_event(event):
            # 发送响应给用户
            await self._send_response(event, response)`,
                explanation: `**苏格拉底式提问**：

1. 🎯 **async 和 await 是什么？**
   → async = 异步，表示这个函数可以"暂停"和"恢复"
   → await = 等待，但不会阻塞整个程序
   → 例子：await 就像"等外卖"，你可以先做别的事
   → 当外卖到了（消息来了），再继续处理

2. 🎯 **while True 会不会让电脑卡死？**
   → 不会！这就是 async 的神奇之处
   → 当执行 await self.message_queue.get() 时
   → 程序会"让出控制权"，CPU 可以处理其他事情
   → 当有消息时，程序会被"唤醒"继续执行
   → 这叫"协程"：轻量级的并发

3. 🎯 **为什么用 async for 而不是普通的 for？**
   → 因为 AI 的响应可能是"流式"的
   → 就像 ChatGPT 一个字一个字地输出
   → async for 可以逐个处理这些"片段"
   → 普通的 for 只能等所有内容都准备好

4. 🎯 **消息从哪里来？**
   → 来自 Telegram、WhatsApp、Discord 等渠道
   → 这些渠道把消息放入队列
   → 主循环从队列中取出消息处理
   → 这叫"生产者-消费者"模式`
            },
            {
                name: '🎯 实践：处理一条消息',
                code: `async def _process_event(self, event):
    """
    处理单个事件 - AI 的"思考过程"
    
    💡 观察：
    - 这个方法做了哪些事情？
    - 为什么可能有多次循环？
    """
    # 第一步：构建上下文
    context = await self._build_context(event)
    
    # 第二步：让 AI "思考"
    response = await self.provider.generate(context)
    
    # 第三步：检查 AI 是否想使用工具
    tool_calls = self._parse_tool_calls(response)
    
    if tool_calls:
        # AI 想要执行操作
        for tool_call in tool_calls:
            result = await self._execute_tool(tool_call)
            context.append({"role": "tool", "content": result})
        
        # 继续让 AI 思考（带着工具结果）
        async for final in self._process_event(event):
            yield final
    else:
        # AI 给出了最终答案
        yield response`,
                explanation: `**苏格拉底式提问**：

1. 🎯 **为什么要"构建上下文"？**
   → 想象你走进一个正在进行的对话
   → 你需要知道"之前说了什么"才能理解当前话题
   → 上下文包含：系统提示、历史对话、当前消息
   → 这让 AI 能"连贯"地对话

2. 🎯 **provider.generate() 做了什么？**
   → 把上下文发送给 AI 大模型（如 GPT-4）
   → AI 根据上下文"生成"回复
   → 这个过程可能需要几秒钟
   → await 表示"等待 AI 回复"

3. 🎯 **为什么执行工具后还要继续循环？**
   → 例子：用户问"北京天气怎么样？"
   → AI 第一次回复："我需要查天气"（工具调用）
   → 执行工具后得到："北京今天晴，25度"
   → AI 需要根据这个结果继续思考
   → 最终回复："北京今天天气晴朗，气温25度"

4. 🎯 **这个过程像什么？**
   → 像人类解决问题：
   1. 听问题 → 理解上下文
   2. 思考 → AI 生成回复
   3. 查资料 → 执行工具
   4. 再思考 → 根据结果继续
   5. 回答 → 最终回复

5. 🎯 **yield 是什么意思？**
   → yield = "产出"，把结果"发送出去"
   → 和 return 不同，yield 后函数可以继续执行
   → 这让调用者可以"逐步"接收结果`
            }
        ],
        relatedFiles: ['context.py', 'tools/registry.py', 'providers/base.py'],
        tips: [
            '💡 先理解"为什么需要循环"，再看"怎么实现循环"',
            '💡 async/await 是 Python 异步编程的关键，建议先学习这个概念',
            '💡 尝试在脑海中模拟：用户发消息 → 系统如何一步步处理',
            '💡 可以用 print() 语句在关键位置打印日志，观察执行流程'
        ]
    },

    // context.py - 上下文构建
    'file-context': {
        title: 'context.py - 对话上下文构建',
        file: 'nanobot/agent/context.py',
        description: '负责准备发送给 AI 的所有信息，让 AI 能够理解对话背景。',
        sections: [
            {
                name: '🤔 思考：AI 如何"理解"对话?',
                code: `class ContextBuilder:
    """
    上下文构建器 - 为 AI 准备"背景资料"
    
    💡 想一想：
    - 你和朋友聊天时，为什么能理解他在说什么？
    - 因为你们有"共同背景"：之前的对话、共同经历
    - AI 也需要这样的"背景"！
    """
    
    def __init__(self, config: Config, memory: MemoryManager):
        self.config = config
        self.memory = memory
        self.max_tokens = config.max_context_tokens`,
                explanation: `**苏格拉底式提问**：

1. 🎯 **什么是"上下文"？**
   → 上下文 = 对话的"背景信息"
   → 就像你走进一个房间，看到大家都在笑
   → 你需要知道"刚才发生了什么"才能理解
   → AI 也一样，需要知道之前的对话内容

2. 🎯 **为什么需要 max_tokens 限制？**
   → AI 的"记忆容量"有限，不能无限塞内容
   → tokens ≈ 词的数量（中文一个字约1-2个token）
   → GPT-4 的上下文窗口约 8K-128K tokens
   → 超过限制会报错，所以需要截断

3. 🎯 **memory 参数是做什么的？**
   → 从记忆系统中获取历史对话
   → 就像你翻看聊天记录
   → AI 可以"回忆"之前说过的话`
            },
            {
                name: '📚 理解：上下文的组成',
                code: `async def build(self, event: Event) -> List[dict]:
    """
    构建完整的上下文
    
    💡 观察：
    - 上下文包含哪些部分？
    - 为什么要按这个顺序排列？
    """
    context = []
    
    # 1. 系统提示 - 告诉 AI 它是谁
    context.append({
        "role": "system",
        "content": self._build_system_prompt()
    })
    
    # 2. 长期记忆 - 重要的历史信息
    long_term = await self.memory.get_long_term(event.user_id)
    if long_term:
        context.append({
            "role": "system", 
            "content": f"之前的记忆：\\n{long_term}"
        })
    
    # 3. 短期记忆 - 最近几轮对话
    short_term = await self.memory.get_short_term(event.user_id)
    context.extend(short_term)
    
    # 4. 当前用户消息
    context.append({
        "role": "user",
        "content": event.content
    })
    
    # 5. 可用的工具列表
    tools_schema = self._build_tools_schema()
    
    return context, tools_schema`,
                explanation: `**苏格拉底式提问**：

1. 🎯 **为什么系统提示放在最前面？**
   → 这是 AI 的"人设"，先确立身份再对话
   → 就像演戏前先看剧本角色设定
   → 系统提示会影响 AI 的所有回复

2. 🎯 **长期记忆和短期记忆有什么区别？**
   → 长期记忆：重要信息的摘要（如用户偏好）
   → 短期记忆：最近对话的原文
   → 类比：长期 = 你记得朋友的名字；短期 = 刚才聊的内容

3. 🎯 **为什么要告诉 AI 有哪些工具？**
   → 让 AI 知道自己"能做什么"
   → 就像告诉厨师厨房里有什么食材
   → AI 会根据工具描述决定是否使用

4. 🎯 **context.extend() 和 append() 有什么区别？**
   → append：添加一个元素到列表末尾
   → extend：把另一个列表的所有元素添加到末尾
   → 例如：[1,2].append([3,4]) → [1,2,[3,4]]
   → 例如：[1,2].extend([3,4]) → [1,2,3,4]`
            },
            {
                name: '🎯 实践：系统提示的构建',
                code: `def _build_system_prompt(self) -> str:
    """
    构建系统提示 - AI 的"人设"
    
    💡 思考：
    - 如果你是 AI，你希望别人怎么告诉你"你是谁"？
    """
    prompt = \"\"\"
    你是一个智能助手 Nanobot。
    
    你的能力：
    - 回答用户问题
    - 执行文件操作
    - 搜索网络信息
    - 设置定时提醒
    
    你的特点：
    - 友好、耐心
    - 承认不知道的事情
    - 主动询问不清楚的地方
    \"\"\"
    
    # 添加当前时间
    prompt += f"\\n当前时间：{datetime.now()}"
    
    return prompt`,
                explanation: `**苏格拉底式提问**：

1. 🎯 **系统提示可以多长？**
   → 越简洁越好，但要包含关键信息
   → 太长会占用宝贵的 token 配额
   → 建议控制在 500 tokens 以内

2. 🎯 **为什么要告诉 AI 当前时间？**
   → 让 AI 能理解"今天"、"明天"等时间词
   → 否则 AI 不知道"现在"是什么时候
   → 可以帮助 AI 做时间相关的判断

3. 🎯 **如何改进这个提示？**
   → 添加具体的回答风格要求
   → 添加禁止事项（如"不要透露敏感信息"）
   → 添加特定领域的知识
   → 根据用户需求定制

4. 🎯 **三引号 \"\"\" 是什么意思？**
   → Python 的多行字符串
   → 可以包含换行和引号
   → 常用于长文本和文档字符串`
            }
        ],
        relatedFiles: ['loop.py', 'memory.py'],
        tips: [
            '💡 上下文就是 AI 的"短期记忆"，决定了 AI 能理解多少内容',
            '💡 系统提示很重要，它定义了 AI 的行为方式',
            '💡 尝试修改系统提示，看看 AI 的行为会有什么变化',
            '💡 上下文构建是优化 AI 性能的关键点'
        ]
    },

    // memory.py - 记忆管理
    'file-memory': {
        title: 'memory.py - 记忆管理系统',
        file: 'nanobot/agent/memory.py',
        description: '让 AI 拥有"记忆"，能够记住之前的对话内容。',
        sections: [
            {
                name: '🤔 思考：AI 需要"记忆"吗?',
                code: `class MemoryManager:
    """
    记忆管理器 - AI 的"海马体"
    
    💡 想一想：
    - 如果没有记忆，每次对话会怎样？
    - 人类的记忆是如何工作的？
    - 短期记忆 vs 长期记忆？
    """
    
    def __init__(self, config: Config):
        self.config = config
        self.storage_path = config.memory_path
        
        # 短期记忆：最近几轮对话
        self._short_term: Dict[str, List[Message]] = {}
        
        # 长期记忆：重要的历史信息
        self._long_term: Dict[str, List[Memory]] = {}`,
                explanation: '**苏格拉底式提问**：\n\n1. 为什么需要两种记忆？\n   → 短期：保持对话连贯；长期：记住重要事实\n\n2. 为什么用 Dict 存储？\n   → 每个用户有独立的记忆空间'
            },
            {
                name: '📝 理解：记忆的存储',
                code: `async def add_message(self, user_id: str, message: Message):
    """
    添加消息到记忆
    
    💡 观察：
    - 消息是如何被存储的？
    - 什么时候会触发"记忆整合"？
    """
    # 初始化用户的记忆空间
    if user_id not in self._short_term:
        self._short_term[user_id] = []
    
    # 添加消息
    self._short_term[user_id].append(message)
    
    # 检查是否需要整合
    if len(self._short_term[user_id]) > self.config.memory_threshold:
        await self._consolidate(user_id)`,
                explanation: '**苏格拉底式提问**：\n\n1. 什么是"记忆整合"？\n   → 把短期记忆压缩成长期记忆\n\n2. 为什么要设置阈值？\n   → 不能无限存储，需要定期整理'
            },
            {
                name: '🔄 实践：记忆整合过程',
                code: `async def _consolidate(self, user_id: str):
    """
    记忆整合 - 类似人类睡眠时的记忆整理
    
    💡 思考：
    - 人类睡觉时，大脑在做什么？
    - 为什么有些事记得清楚，有些模糊？
    """
    messages = self._short_term[user_id]
    
    # 使用 AI 总结这些对话
    summary = await self._summarize_with_ai(messages)
    
    # 提取关键信息
    key_facts = await self._extract_key_facts(messages)
    
    # 存储到长期记忆
    memory = Memory(
        summary=summary,
        key_facts=key_facts,
        timestamp=datetime.now()
    )
    
    if user_id not in self._long_term:
        self._long_term[user_id] = []
    self._long_term[user_id].append(memory)
    
    # 清理短期记忆，只保留最近几条
    self._short_term[user_id] = messages[-5:]
    
    # 持久化到磁盘
    await self._save_to_disk(user_id)`,
                explanation: '**苏格拉底式提问**：\n\n1. 为什么要用 AI 来总结？\n   → 自动提取重要信息，节省存储空间\n\n2. 为什么要保留最近几条？\n   → 保持当前对话的连贯性\n\n3. 为什么要存到磁盘？\n   → 重启后记忆不会丢失'
            }
        ],
        relatedFiles: ['loop.py', 'context.py'],
        tips: [
            '💡 记忆系统是 AI 拥有"个性"的基础',
            '💡 记忆整合的阈值可以根据需要调整',
            '💡 可以扩展记忆系统，存储用户偏好等信息'
        ]
    },

    // skills.py - 技能加载
    'file-skills': {
        title: 'skills.py - 技能加载系统',
        file: 'nanobot/agent/skills.py',
        description: '动态加载和管理 AI 的技能模块。',
        sections: [
            {
                name: '🤔 思考：什么是"技能"?',
                code: `class SkillLoader:
    """
    技能加载器 - AI 的"技能树"
    
    💡 想一想：
    - 技能和工具有什么区别？
    - 技能 = 一组相关的工具 + 提示词
    - 例如："编程助手"技能 = 代码执行 + 文件操作 + 编程提示
    """
    
    def __init__(self, skills_dir: str):
        self.skills_dir = skills_dir
        self.loaded_skills: Dict[str, Skill] = {}`,
                explanation: '**苏格拉底式提问**：\n\n1. 为什么需要"技能"这个概念？\n   → 让 AI 可以针对不同场景有不同专长\n\n2. 技能和工具的关系？\n   → 技能是工具的"套餐组合"'
            },
            {
                name: '📂 理解：技能的加载',
                code: `async def load_skill(self, skill_name: str) -> Skill:
    """
    加载一个技能
    
    💡 观察：
    - 技能文件是什么格式？
    - 加载过程做了什么？
    """
    skill_path = os.path.join(self.skills_dir, f"{skill_name}.yaml")
    
    # 读取技能配置
    with open(skill_path, 'r') as f:
        config = yaml.safe_load(f)
    
    # 解析技能配置
    skill = Skill(
        name=config['name'],
        description=config['description'],
        tools=config.get('tools', []),
        system_prompt=config.get('system_prompt', ''),
        examples=config.get('examples', [])
    )
    
    # 验证工具是否存在
    for tool_name in skill.tools:
        if not self.tool_registry.has(tool_name):
            raise SkillError(f"Tool not found: {tool_name}")
    
    self.loaded_skills[skill_name] = skill
    return skill`,
                explanation: '**苏格拉底式提问**：\n\n1. 为什么用 YAML 格式？\n   → 人类可读，方便编辑\n\n2. 技能配置包含哪些内容？\n   → 名称、描述、工具列表、系统提示、示例'
            }
        ],
        relatedFiles: ['loop.py', 'tools/registry.py'],
        tips: [
            '💡 技能系统让 AI 可以"切换角色"',
            '💡 可以创建自己的技能文件来定制 AI',
            '💡 技能的 examples 字段可以帮助 AI 更好理解任务'
        ]
    },

    // subagent.py - 子代理管理
    'file-subagent': {
        title: 'subagent.py - 子代理管理系统',
        file: 'nanobot/agent/subagent.py',
        description: '允许 AI 创建"子代理"来并行处理复杂任务。',
        sections: [
            {
                name: '🤔 思考：为什么需要"子代理"?',
                code: `class SubagentManager:
    """
    子代理管理器 - AI 的"分身术"
    
    💡 想一想：
    - 如果一个任务很复杂，你会怎么做？
    - 拆分成小任务，分给不同人做？
    - 子代理就是 AI 的"助手团队"
    """
    
    def __init__(self, main_agent: AgentLoop):
        self.main_agent = main_agent
        self.subagents: Dict[str, AgentLoop] = {}
        self.max_subagents = 5`,
                explanation: '**苏格拉底式提问**：\n\n1. 为什么限制最大子代理数量？\n   → 资源有限，避免创建太多\n\n2. 子代理和主代理有什么区别？\n   → 子代理专注特定任务，完成后销毁'
            },
            {
                name: '🎯 实践：创建子代理',
                code: `async def spawn(self, task: str, context: dict) -> str:
    """
    创建一个子代理来执行任务
    
    💡 观察：
    - 子代理是如何创建的？
    - 结果如何返回？
    """
    # 创建子代理 ID
    subagent_id = f"sub_{uuid.uuid4().hex[:8]}"
    
    # 创建子代理实例
    subagent = AgentLoop(
        config=self.main_agent.config,
        parent_id=self.main_agent.id
    )
    
    # 设置子代理的特定上下文
    subagent.set_context(context)
    
    # 执行任务
    result = await subagent.execute(task)
    
    # 清理子代理
    del subagent
    
    return result`,
                explanation: '**苏格拉底式提问**：\n\n1. 为什么每个子代理有独立 ID？\n   → 方便追踪和管理\n\n2. 为什么要清理子代理？\n   → 释放资源'
            }
        ],
        relatedFiles: ['loop.py', 'tools/spawn.py'],
        tips: [
            '💡 子代理适合处理可以并行的独立任务',
            '💡 子代理之间不会互相干扰',
            '💡 复杂任务可以拆分给多个子代理'
        ]
    },

    // ----- agent/tools/ 目录 -----

    // base.py - 工具基类
    'file-tools-base': {
        title: 'tools/base.py - 工具基类定义',
        file: 'nanobot/agent/tools/base.py',
        description: '定义所有工具必须遵循的接口规范。',
        sections: [
            {
                name: '🤔 思考：什么是"工具"?',
                code: `class BaseTool(ABC):
    """
    工具基类 - 所有工具的"模板"
    
    💡 想一想：
    - 工具是什么？锤子？扳手？
    - 对 AI 来说，工具 = 能执行的操作
    - 例如：读文件、搜网页、发消息
    """
    
    @property
    @abstractmethod
    def name(self) -> str:
        """工具名称 - AI 用这个名字调用工具"""
        pass
    
    @property
    @abstractmethod
    def description(self) -> str:
        """工具描述 - 告诉 AI 这个工具能做什么"""
        pass`,
                explanation: `**苏格拉底式提问**：

1. 🎯 **什么是 ABC（抽象基类）？**
   → ABC = Abstract Base Class（抽象基类）
   → 它是一个"模板"，定义了子类必须实现的方法
   → 不能直接创建 ABC 的实例，只能继承它
   → 这叫"抽象"：只定义"是什么"，不定义"怎么做"

2. 🎯 **@property 是什么意思？**
   → @property 把方法变成"属性"
   → 调用时不加括号：tool.name 而不是 tool.name()
   → 好处：看起来像属性，但实际是方法
   → 可以添加只读、写入控制等逻辑

3. 🎯 **@abstractmethod 是什么意思？**
   → 标记这个方法是"抽象的"（没有实现）
   → 子类必须实现这个方法，否则会报错
   → 这强制所有工具都有 name 和 description
   → 保证了接口的一致性

4. 🎯 **name 和 description 为什么很重要？**
   → AI 根据它们决定是否使用这个工具
   → name：AI 用这个名字"调用"工具
   → description：告诉 AI 这个工具能做什么
   → 写得越清楚，AI 使用得越准确`
            },
            {
                name: '📐 理解：参数定义',
                code: `@property
def parameters(self) -> dict:
    """
    参数定义 - 告诉 AI 需要提供什么参数
    
    💡 观察：
    - 使用 JSON Schema 格式
    - 定义参数类型和描述
    """
    return {
        "type": "object",
        "properties": {
            "param1": {
                "type": "string",
                "description": "参数1的描述"
            },
            "param2": {
                "type": "number",
                "description": "参数2的描述"
            }
        },
        "required": ["param1"]  # 必需参数
    }`,
                explanation: `**苏格拉底式提问**：

1. 🎯 **为什么用 JSON Schema？**
   → JSON Schema 是一种标准格式，用于描述 JSON 数据结构
   → AI 能理解这个格式，知道需要提供什么参数
   → 类型检查：确保参数类型正确
   → 文档化：参数描述帮助 AI 理解用途

2. 🎯 **"type": "object" 是什么意思？**
   → 表示参数是一个对象（字典）
   → 对象包含多个属性（properties）
   → 这是最常用的参数类型

3. 🎯 **required 字段的作用？**
   → 告诉 AI 哪些参数必须提供
   → 如果缺少必需参数，AI 会报错
   → 可选参数可以不提供

4. 🎯 **常见的参数类型有哪些？**
   → string：字符串（如文件路径）
   → number：数字（如数量）
   → boolean：布尔值（如是否）
   → array：数组（如列表）
   → object：对象（如配置）`
            },
            {
                name: '🎯 实践：执行方法',
                code: `@abstractmethod
async def execute(self, **kwargs) -> str:
    """
    执行工具 - 实际的业务逻辑
    
    💡 思考：
    - 为什么返回字符串？
    - 如果出错了怎么办？
    """
    try:
        # 执行具体操作
        result = await self._do_work(**kwargs)
        return f"成功：{result}"
    except Exception as e:
        return f"失败：{str(e)}"`,
                explanation: `**苏格拉底式提问**：

1. 🎯 **为什么返回字符串而不是对象？**
   → 字符串可以直接反馈给 AI
   → AI 能理解自然语言描述的结果
   → 不需要额外的格式转换
   → 简单直接，易于调试

2. 🎯 **为什么要捕获异常？**
   → 工具执行可能出错（文件不存在、网络问题等）
   → 如果不捕获，错误会中断整个流程
   → 捕获后返回错误信息，让 AI 知道发生了什么
   → AI 可以根据错误信息调整策略

3. 🎯 ****kwargs 是什么？**
   → 可变关键字参数
   → 接收任意数量的命名参数
   → 例如：execute(file_path="test.txt", mode="read")
   → kwargs 会变成 {"file_path": "test.txt", "mode": "read"}

4. 🎯 **为什么要用 async？**
   → 很多操作是"耗时"的（读文件、网络请求）
   → async 让这些操作不阻塞主线程
   → 提高系统的并发能力`
            }
        ],
        relatedFiles: ['registry.py', 'filesystem.py', 'shell.py'],
        tips: [
            '💡 理解 BaseTool 是创建自定义工具的第一步',
            '💡 description 写得越清楚，AI 使用得越准确',
            '💡 所有工具都遵循相同的接口，方便扩展',
            '💡 可以添加参数验证逻辑',
            '💡 错误信息要清晰，帮助 AI 理解问题'
        ]
    },

    // registry.py - 工具注册表
    'file-tools-registry': {
        title: 'tools/registry.py - 工具注册表',
        file: 'nanobot/agent/tools/registry.py',
        description: '管理所有可用工具，提供注册、查找功能。',
        sections: [
            {
                name: '🤔 思考：为什么需要"注册表"?',
                code: `class ToolRegistry:
    """
    工具注册表 - AI 的"工具箱"
    
    💡 想一想：
    - 你家的工具箱是怎么组织的？
    - 钳子放这里，螺丝刀放那里...
    - 注册表就是这样一个"收纳盒"
    """
    
    def __init__(self):
        # 用字典存储工具：名称 -> 工具对象
        self._tools: Dict[str, BaseTool] = {}`,
                explanation: '**苏格拉底式提问**：\n\n1. 为什么用字典存储？\n   → 通过名称快速查找工具\n\n2. 为什么不直接用列表？\n   → 字典查找更快 O(1) vs O(n)'
            },
            {
                name: '📦 理解：注册和获取',
                code: `def register(self, tool: BaseTool):
    """
    注册一个工具
    
    💡 观察：
    - 工具是如何被添加的？
    - 如果重名会怎样？
    """
    if tool.name in self._tools:
        raise ToolError(f"Tool already registered: {tool.name}")
    self._tools[tool.name] = tool

def get(self, name: str) -> BaseTool:
    """
    获取一个工具
    
    💡 思考：
    - 如果工具不存在怎么办？
    """
    if name not in self._tools:
        raise ToolError(f"Tool not found: {name}")
    return self._tools[name]`,
                explanation: '**苏格拉底式提问**：\n\n1. 为什么要检查重名？\n   → 避免工具冲突\n\n2. 为什么找不到工具要报错？\n   → 让调用者知道出了什么问题'
            },
            {
                name: '📋 实践：获取所有工具定义',
                code: `def get_all_schemas(self) -> List[dict]:
    """
    获取所有工具的定义
    
    💡 思考：
    - 这个方法返回什么？
    - 谁会用到这个信息？
    """
    schemas = []
    for tool in self._tools.values():
        schemas.append({
            "name": tool.name,
            "description": tool.description,
            "parameters": tool.parameters
        })
    return schemas`,
                explanation: '**苏格拉底式提问**：\n\n1. 这个方法返回给谁用？\n   → 发送给 AI，让它知道有哪些工具可用\n\n2. 为什么不直接返回工具对象？\n   → AI 只需要知道工具的"定义"，不需要实现细节'
            }
        ],
        relatedFiles: ['base.py', 'loop.py'],
        tips: [
            '💡 注册表模式在软件设计中很常见',
            '💡 可以动态注册和注销工具',
            '💡 工具的名称应该是唯一的、有意义的'
        ]
    },

    // shell.py - Shell 命令执行
    'file-tools-shell': {
        title: 'tools/shell.py - Shell 命令执行',
        file: 'nanobot/agent/tools/shell.py',
        description: '让 AI 能够执行系统命令，强大但需要谨慎使用。',
        sections: [
            {
                name: '⚠️ 思考：让 AI 执行命令安全吗?',
                code: `class ShellTool(BaseTool):
    """
    Shell 命令执行工具
    
    ⚠️ 警告：这是一个危险工具！
    
    💡 思考：
    - 如果 AI 执行了 rm -rf / 会怎样？
    - 如何限制 AI 的权限？
    """
    
    @property
    def name(self) -> str:
        return "execute_shell"
    
    @property
    def description(self) -> str:
        return "执行系统命令。谨慎使用！"`,
                explanation: '**苏格拉底式提问**：\n\n1. 为什么说这是危险工具？\n   → AI 可以执行任何命令，包括删除文件\n\n2. 如何保护系统？\n   → 白名单命令、沙箱环境、用户确认'
            },
            {
                name: '🔒 理解：安全限制',
                code: `async def execute(self, command: str) -> str:
    """
    执行命令
    
    💡 观察：
    - 有哪些安全检查？
    - 如何处理危险命令？
    """
    # 检查命令是否在白名单中
    if not self._is_allowed(command):
        return "错误：此命令不在允许列表中"
    
    # 检查是否包含危险模式
    if self._is_dangerous(command):
        return "错误：检测到危险操作，需要用户确认"
    
    try:
        # 执行命令
        result = await asyncio.create_subprocess_shell(
            command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await result.communicate()
        
        return stdout.decode() or stderr.decode()
    except Exception as e:
        return f"执行失败：{str(e)}"`,
                explanation: '**苏格拉底式提问**：\n\n1. 白名单是什么意思？\n   → 只允许执行预先定义的安全命令\n\n2. 为什么用 asyncio 执行？\n   → 异步执行，不会阻塞主循环'
            }
        ],
        relatedFiles: ['base.py', 'registry.py'],
        tips: [
            '⚠️ Shell 工具需要严格的安全控制',
            '💡 建议在沙箱环境中运行',
            '💡 可以记录所有执行的命令用于审计'
        ]
    },

    // filesystem.py - 文件操作
    'file-tools-filesystem': {
        title: 'tools/filesystem.py - 文件操作工具',
        file: 'nanobot/agent/tools/filesystem.py',
        description: '让 AI 能够读写文件、搜索文件内容。',
        sections: [
            {
                name: '🤔 思考：AI 需要哪些文件操作?',
                code: `# 文件操作工具集
# 包含：读文件、写文件、搜索文件、列出目录

class ReadFileTool(BaseTool):
    """读取文件内容"""
    @property
    def name(self) -> str:
        return "read_file"
    
    @property
    def description(self) -> str:
        return "读取指定文件的内容"

class WriteFileTool(BaseTool):
    """写入文件内容"""
    @property
    def name(self) -> str:
        return "write_file"
    
    @property
    def description(self) -> str:
        return "将内容写入指定文件"

class SearchFilesTool(BaseTool):
    """搜索文件内容"""
    @property
    def name(self) -> str:
        return "search_files"
    
    @property
    def description(self) -> str:
        return "在文件中搜索匹配的内容"`,
                explanation: '**苏格拉底式提问**：\n\n1. 为什么分成多个工具而不是一个？\n   → 每个工具职责单一，AI 更容易理解\n\n2. 还需要什么文件操作？\n   → 删除、移动、重命名等'
            },
            {
                name: '📖 实践：读取文件',
                code: `async def execute(self, file_path: str) -> str:
    """
    读取文件内容
    
    💡 观察：
    - 如何处理大文件？
    - 如何处理编码问题？
    """
    # 安全检查：路径是否允许访问
    if not self._is_safe_path(file_path):
        return "错误：无权访问此路径"
    
    try:
        # 检查文件大小
        size = os.path.getsize(file_path)
        if size > self.max_file_size:
            return f"错误：文件过大 ({size} bytes)"
        
        # 读取文件
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        return content
    except FileNotFoundError:
        return "错误：文件不存在"
    except UnicodeDecodeError:
        return "错误：无法解码文件（可能是二进制文件）"`,
                explanation: '**苏格拉底式提问**：\n\n1. 为什么要检查文件大小？\n   → 避免读取超大文件导致内存溢出\n\n2. 为什么要检查路径安全？\n   → 防止 AI 读取敏感文件'
            }
        ],
        relatedFiles: ['base.py', 'shell.py'],
        tips: [
            '💡 文件操作需要设置安全边界',
            '💡 大文件应该分块读取',
            '💡 可以添加文件类型过滤'
        ]
    },

    // web.py - 网页搜索
    'file-tools-web': {
        title: 'tools/web.py - 网页搜索工具',
        file: 'nanobot/agent/tools/web.py',
        description: '让 AI 能够搜索互联网、获取网页内容。',
        sections: [
            {
                name: '🌐 思考：AI 如何"上网"?',
                code: `class WebSearchTool(BaseTool):
    """
    网页搜索工具
    
    💡 想一想：
    - AI 如何知道网上有什么？
    - 需要调用搜索引擎 API
    - 然后获取搜索结果
    """
    
    @property
    def name(self) -> str:
        return "search_web"
    
    @property
    def description(self) -> str:
        return "搜索互联网获取信息"`,
                explanation: '**苏格拉底式提问**：\n\n1. AI 能直接"看"网页吗？\n   → 不能，需要通过工具获取网页内容\n\n2. 搜索结果如何处理？\n   → 返回摘要给 AI 分析'
            },
            {
                name: '🔍 实践：执行搜索',
                code: `async def execute(self, query: str, num_results: int = 5) -> str:
    """
    执行网页搜索
    
    💡 观察：
    - 搜索流程是怎样的？
    - 结果如何格式化？
    """
    # 调用搜索引擎 API
    results = await self.search_api.search(query, num_results)
    
    # 格式化结果
    output = []
    for i, result in enumerate(results, 1):
        output.append(f"""
        [{i}] {result.title}
        链接: {result.url}
        摘要: {result.snippet}
        """)
    
    return "\\n".join(output)`,
                explanation: '**苏格拉底式提问**：\n\n1. 为什么限制结果数量？\n   → 太多结果会让 AI 困惑\n\n2. 摘要的作用是什么？\n   → 让 AI 快速了解内容，决定是否深入'
            }
        ],
        relatedFiles: ['base.py'],
        tips: [
            '💡 网页搜索让 AI 获取实时信息',
            '💡 可以添加内容过滤功能',
            '💡 注意 API 调用限制和费用'
        ]
    },

    // message.py - 消息发送
    'file-tools-message': {
        title: 'tools/message.py - 消息发送工具',
        file: 'nanobot/agent/tools/message.py',
        description: '让 AI 能够主动发送消息给用户。',
        sections: [
            {
                name: '💬 思考：AI 为什么要主动发消息?',
                code: `class SendMessageTool(BaseTool):
    """
    消息发送工具
    
    💡 想一想：
    - 定时提醒：AI 需要在指定时间发消息
    - 通知：任务完成时通知用户
    - 主动沟通：AI 有重要信息要告诉用户
    """
    
    @property
    def name(self) -> str:
        return "send_message"
    
    @property
    def description(self) -> str:
        return "主动发送消息给用户"`,
                explanation: '**苏格拉底式提问**：\n\n1. AI 平时怎么回复消息？\n   → 被动回复：用户发消息，AI 回复\n\n2. 主动发消息有什么用？\n   → 定时提醒、任务通知、主动汇报'
            },
            {
                name: '📤 实践：发送消息',
                code: `async def execute(self, user_id: str, message: str) -> str:
    """
    发送消息给用户
    
    💡 观察：
    - 如何找到用户？
    - 如何发送消息？
    """
    # 获取用户的渠道信息
    channel = self.channel_manager.get_user_channel(user_id)
    
    if not channel:
        return "错误：找不到用户"
    
    try:
        # 发送消息
        await channel.send_message(user_id, message)
        return "消息发送成功"
    except Exception as e:
        return f"发送失败：{str(e)}"`,
                explanation: '**苏格拉底式提问**：\n\n1. 为什么需要 channel_manager？\n   → 用户可能在多个平台，需要找到正确的渠道\n\n2. 发送失败怎么处理？\n   → 返回错误信息，让 AI 知道发生了什么'
            }
        ],
        relatedFiles: ['base.py', 'channels/manager.py'],
        tips: [
            '💡 主动消息让 AI 更"智能"',
            '💡 注意消息频率，避免打扰用户',
            '💡 可以添加消息模板功能'
        ]
    },

    // cron.py - 定时任务
    'file-tools-cron': {
        title: 'tools/cron.py - 定时任务工具',
        file: 'nanobot/agent/tools/cron.py',
        description: '让 AI 能够设置定时提醒和周期性任务。',
        sections: [
            {
                name: '⏰ 思考：AI 如何"记住"时间?',
                code: `class CronTool(BaseTool):
    """
    定时任务工具
    
    💡 想一想：
    - 用户说"明天早上8点提醒我"
    - AI 如何理解"明天早上8点"？
    - 如何确保准时提醒？
    """
    
    @property
    def name(self) -> str:
        return "schedule_task"
    
    @property
    def description(self) -> str:
        return "设置定时任务或提醒"`,
                explanation: '**苏格拉底式提问**：\n\n1. AI 如何理解自然语言时间？\n   → 通过上下文中的当前时间推算\n\n2. 定时任务存在哪里？\n   → 数据库或文件，重启后不丢失'
            },
            {
                name: '📅 实践：创建定时任务',
                code: `async def execute(
    self,
    task_type: str,      # once/interval/cron
    schedule: str,       # 时间表达式
    action: str,         # 要执行的操作
    user_id: str         # 用户ID
) -> str:
    """
    创建定时任务
    
    💡 观察：
    - 支持哪些类型的定时？
    - 任务信息如何存储？
    """
    # 创建任务对象
    job = CronJob(
        id=str(uuid.uuid4()),
        user_id=user_id,
        task_type=CronType(task_type),
        schedule=schedule,
        action=action,
        next_run=self._calculate_next_run(schedule)
    )
    
    # 添加到调度器
    await self.cron_service.add_job(job)
    
    return f"任务已创建，下次执行时间：{job.next_run}"`,
                explanation: '**苏格拉底式提问**：\n\n1. 三种任务类型有什么区别？\n   → once: 一次性；interval: 周期性；cron: 复杂调度\n\n2. next_run 如何计算？\n   → 根据调度表达式解析'
            }
        ],
        relatedFiles: ['base.py', 'cron/service.py'],
        tips: [
            '💡 Cron 表达式很强大，但学习曲线陡峭',
            '💡 建议提供自然语言时间解析',
            '💡 任务执行失败要有重试机制'
        ]
    },

    // mcp.py - MCP 协议
    'file-tools-mcp': {
        title: 'tools/mcp.py - MCP 协议集成',
        file: 'nanobot/agent/tools/mcp.py',
        description: 'Model Context Protocol - 标准化的工具协议。',
        sections: [
            {
                name: '🔗 思考：什么是 MCP?',
                code: `class MCPTool(BaseTool):
    """
    MCP (Model Context Protocol) 工具
    
    💡 想一想：
    - 为什么需要协议？
    - 不同 AI 系统如何共享工具？
    - MCP 就像"工具的 USB 接口"
    """
    
    def __init__(self, mcp_server_url: str):
        self.client = MCPClient(mcp_server_url)
    
    @property
    def name(self) -> str:
        return "mcp_tool"`,
                explanation: '**苏格拉底式提问**：\n\n1. 为什么叫"协议"？\n   → 规定了工具如何描述、如何调用\n\n2. MCP 的好处？\n   → 工具可以在不同 AI 系统间共享'
            }
        ],
        relatedFiles: ['base.py'],
        tips: [
            '💡 MCP 是新兴标准，值得关注',
            '💡 可以通过 MCP 接入外部工具服务',
            '💡 协议标准化有利于生态发展'
        ]
    },

    // spawn.py - 子代理启动
    'file-tools-spawn': {
        title: 'tools/spawn.py - 子代理启动工具',
        file: 'nanobot/agent/tools/spawn.py',
        description: '让 AI 能够创建子代理来并行处理任务。',
        sections: [
            {
                name: '🚀 思考：为什么需要"分身"?',
                code: `class SpawnTool(BaseTool):
    """
    子代理启动工具
    
    💡 想一想：
    - 一个任务可以拆分成多个子任务
    - 子任务可以并行执行
    - 子代理就是 AI 的"分身"
    """
    
    @property
    def name(self) -> str:
        return "spawn_agent"
    
    @property
    def description(self) -> str:
        return "创建一个子代理来执行特定任务"`,
                explanation: '**苏格拉底式提问**：\n\n1. 什么时候需要子代理？\n   → 任务可以独立执行、需要并行\n\n2. 子代理和主代理如何通信？\n   → 通过返回值传递结果'
            }
        ],
        relatedFiles: ['base.py', 'subagent.py'],
        tips: [
            '💡 子代理适合处理独立子任务',
            '💡 注意控制子代理数量',
            '💡 子代理的结果需要汇总处理'
        ]
    },

    // ----- bus/ 目录 -----

    // events.py - 事件类型
    'file-bus-events': {
        title: 'bus/events.py - 事件类型定义',
        file: 'nanobot/bus/events.py',
        description: '定义系统中传递的各种消息事件类型。',
        sections: [
            {
                name: '📨 思考：系统中有哪些"消息"?',
                code: `@dataclass
class MessageEvent:
    """
    用户消息事件
    
    💡 想一想：
    - 用户发来的消息包含什么？
    - 谁发的？从哪个平台？说了什么？
    """
    type: EventType = EventType.MESSAGE
    channel: str       # 来源渠道
    user_id: str       # 用户ID
    content: str       # 消息内容
    timestamp: datetime = field(default_factory=datetime.now)

@dataclass
class CronEvent:
    """
    定时任务事件
    
    💡 思考：
    - 定时任务触发时，需要什么信息？
    """
    type: EventType = EventType.CRON
    job_id: str        # 任务ID
    user_id: str       # 所属用户
    action: str        # 要执行的操作
    timestamp: datetime = field(default_factory=datetime.now)`,
                explanation: `**苏格拉底式提问**：

1. 🎯 **什么是事件（Event）？**
   → 事件 = 系统中发生的"事情"
   → 就像生活中的"事件"：电话响了、闹钟响了
   → 在程序中，事件用于"通知"其他部分发生了什么
   → 这是"事件驱动"架构的基础

2. 🎯 **为什么用 @dataclass？**
   → dataclass 自动生成 __init__、__repr__ 等方法
   → 减少样板代码，让类定义更简洁
   → 例如：不用写 def __init__(self, type, channel, ...):
   → 自动处理初始化逻辑

3. 🎯 **timestamp 为什么有默认值？**
   → field(default_factory=datetime.now) 表示"自动记录当前时间"
   → 每次创建事件时，自动设置时间戳
   → 不需要手动传入时间
   → 确保每条消息都有准确的时间记录

4. 🎯 **channel 和 user_id 的作用？**
   → channel：标识消息来源（telegram、wechat 等）
   → user_id：标识是哪个用户发的
   → 这样 AI 可以针对不同用户、不同渠道做不同处理`
            },
            {
                name: '📋 理解：事件类型枚举',
                code: `class EventType(Enum):
    """
    事件类型枚举
    
    💡 观察：
    - 系统中有哪些类型的事件？
    - 为什么用枚举而不是字符串？
    """
    MESSAGE = "message"    # 用户消息
    CRON = "cron"          # 定时任务
    SYSTEM = "system"      # 系统事件
    ERROR = "error"        # 错误事件`,
                explanation: `**苏格拉底式提问**：

1. 🎯 **什么是枚举（Enum）？**
   → 枚举 = 一组命名的常量
   → 把相关的值组织在一起
   → 例如：一周七天、四季、方向等
   → 使用枚举可以避免"魔法字符串"

2. 🎯 **为什么用枚举而不是字符串？**
   → 字符串容易拼写错误："mesage" vs "message"
   → 枚举有自动补全，减少错误
   → 枚举是类型安全的，IDE 会检查
   → 代码更易读：EventType.MESSAGE 比 "message" 更清晰

3. 🎯 **还可以添加什么事件类型？**
   → FILE_CHANGE：文件变更事件
   → USER_JOIN：用户加入事件
   → USER_LEAVE：用户离开事件
   → COMMAND：命令事件（如 /help）

4. 🎯 **枚举的值为什么是字符串？**
   → 方便序列化（转成 JSON）
   → 方便日志记录和调试
   → 可以用 event.type.value 获取字符串值`
            }
        ],
        relatedFiles: ['queue.py', 'loop.py'],
        tips: [
            '💡 事件是系统各组件通信的"语言"',
            '💡 新增事件类型要考虑向后兼容',
            '💡 事件设计要包含足够的信息',
            '💡 可以添加事件优先级字段'
        ]
    },

    // queue.py - 消息队列
    'file-bus-queue': {
        title: 'bus/queue.py - 异步消息队列',
        file: 'nanobot/bus/queue.py',
        description: '实现异步消息传递的核心组件。',
        sections: [
            {
                name: '🔄 思考：为什么需要"队列"?',
                code: `class AsyncQueue:
    """
    异步消息队列
    
    💡 想一想：
    - 如果没有队列，消息如何传递？
    - 直接调用？那会"阻塞"！
    - 队列就像"信箱"，发送者放入，接收者取出
    """
    
    def __init__(self):
        self._queue = asyncio.Queue()`,
                explanation: `**苏格拉底式提问**：

1. 🎯 **什么是队列（Queue）？**
   → 队列 = 排队等候的数据结构
   → 先进先出（FIFO）：先来的先处理
   → 就像超市排队结账，先来的先结账
   → 这是最公平的处理方式

2. 🎯 **为什么用 asyncio.Queue？**
   → asyncio.Queue 是异步队列
   → 不会阻塞线程，可以高效等待
   → 当队列为空时，get() 会"暂停"而不是"卡住"
   → 当有消息时，自动"唤醒"继续执行

3. 🎯 **如果没有队列会怎样？**
   → 直接调用：A 调 B，B 必须立即响应
   → 如果 B 在忙，A 就要等待（阻塞）
   → 有队列：A 把消息放入队列，继续做别的事
   → B 有空时从队列取出消息处理

4. 🎯 **队列的大小有限制吗？**
   → 默认无限，但可以设置上限
   → asyncio.Queue(maxsize=100) 限制最多 100 条消息
   → 队列满时，put() 会等待
   → 这可以防止消息堆积过多`
            },
            {
                name: '📥📤 理解：放入和取出',
                code: `async def put(self, item):
    """
    放入消息
    
    💡 观察：
    - await 是什么意思？
    - 什么时候会"等待"？
    """
    await self._queue.put(item)

async def get(self):
    """
    取出消息
    
    💡 思考：
    - 如果队列为空会怎样？
    - 会一直等待吗？
    """
    return await self._queue.get()`,
                explanation: `**苏格拉底式提问**：

1. 🎯 **为什么两个方法都有 await？**
   → put() 可能等待：队列满时需要等待空间
   → get() 可能等待：队列空时需要等待消息
   → await 表示"可能需要等待，但不会阻塞整个程序"
   → 等待期间，CPU 可以处理其他任务

2. 🎯 **队列为空时 get() 会怎样？**
   → 会"暂停"等待，直到有消息
   → 这不是"死等"，而是"异步等待"
   → 程序可以处理其他事情
   → 当有消息放入队列时，自动唤醒

3. 🎯 **这像生活中的什么场景？**
   → 就像取号排队：
   → put() = 取号，把号放入队列
   → get() = 叫号，取出下一个号码
   → 如果没人取号，叫号的人就等待

4. 🎯 **如何实现"不等待"的获取？**
   → 可以用 get_nowait() 方法
   → 如果队列为空，立即抛出异常
   → 适合需要"尝试获取"的场景
   → 可以用 try-except 处理空队列情况`
            }
        ],
        relatedFiles: ['events.py', 'loop.py'],
        tips: [
            '💡 队列实现了生产者-消费者模式',
            '💡 异步队列是高并发系统的基础',
            '💡 可以添加优先级功能',
            '💡 注意处理队列满和空的情况',
            '💡 可以添加队列监控，观察消息堆积'
        ]
    },

    // ----- channels/ 目录 -----

    // base.py - 渠道基类
    'file-channels-base': {
        title: 'channels/base.py - 渠道基类',
        file: 'nanobot/channels/base.py',
        description: '定义所有聊天渠道必须实现的接口。',
        sections: [
            {
                name: '📱 思考：什么是"渠道"?',
                code: `class BaseChannel(ABC):
    """
    渠道基类 - 所有聊天平台的统一接口
    
    💡 想一想：
    - Telegram、WhatsApp、Discord...
    - 它们有什么共同点？
    - 发消息、收消息、用户管理
    """
    
    @abstractmethod
    async def start(self):
        """启动渠道"""
        pass
    
    @abstractmethod
    async def stop(self):
        """停止渠道"""
        pass
    
    @abstractmethod
    async def send_message(self, user_id: str, message: str):
        """发送消息给用户"""
        pass`,
                explanation: '**苏格拉底式提问**：\n\n1. 为什么需要统一接口？\n   → AI 不需要关心具体平台\n\n2. 还需要什么方法？\n   → 获取用户信息、处理回调查询等'
            },
            {
                name: '🔗 理解：消息处理器',
                code: `def set_message_handler(self, handler: Callable):
    """
    设置消息处理器
    
    💡 观察：
    - 当收到消息时，调用这个处理器
    - 处理器通常是 Agent Loop
    """
    self._message_handler = handler

async def _on_message_received(self, user_id: str, content: str):
    """
    内部方法：收到消息时调用
    
    💡 思考：
    - 这个方法在哪里被调用？
    - 由子类在收到平台消息时调用
    """
    if self._message_handler:
        await self._message_handler(
            channel=self.name,
            user_id=user_id,
            content=content
        )`,
                explanation: '**苏格拉底式提问**：\n\n1. 为什么用回调而不是直接处理？\n   → 解耦，渠道不关心消息如何处理\n\n2. handler 的参数为什么这样设计？\n   → 包含足够信息让 AI 知道消息来源'
            }
        ],
        relatedFiles: ['manager.py', 'loop.py'],
        tips: [
            '💡 添加新平台只需实现这个基类',
            '💡 不同平台的消息格式需要统一',
            '💡 注意处理平台特有的功能（如按钮、图片）'
        ]
    },

    // manager.py - 渠道管理器
    'file-channels-manager': {
        title: 'channels/manager.py - 渠道管理器',
        file: 'nanobot/channels/manager.py',
        description: '统一管理所有聊天渠道。',
        sections: [
            {
                name: '🎛️ 思考：如何管理多个渠道?',
                code: `class ChannelManager:
    """
    渠道管理器 - 所有渠道的"指挥官"
    
    💡 想一想：
    - 同时运行 Telegram、WhatsApp、Discord
    - 如何统一管理？
    - 如何确保消息不丢失？
    """
    
    def __init__(self):
        self._channels: Dict[str, BaseChannel] = {}
        self._message_queue = AsyncQueue()`,
                explanation: '**苏格拉底式提问**：\n\n1. 为什么需要管理器？\n   → 统一启动/停止、统一消息路由\n\n2. 消息队列的作用？\n   → 所有渠道的消息汇聚到一个队列'
            },
            {
                name: '🚀 实践：启动所有渠道',
                code: `async def start_all(self):
    """
    启动所有已注册的渠道
    
    💡 观察：
    - 如何同时启动多个渠道？
    - 如果某个渠道启动失败怎么办？
    """
    tasks = []
    for name, channel in self._channels.items():
        # 为每个渠道创建启动任务
        task = asyncio.create_task(channel.start())
        tasks.append(task)
        print(f"渠道 {name} 正在启动...")
    
    # 等待所有渠道启动
    await asyncio.gather(*tasks, return_exceptions=True)
    print("所有渠道已启动")`,
                explanation: '**苏格拉底式提问**：\n\n1. 为什么用 asyncio.gather？\n   → 并行启动，不用一个一个等\n\n2. return_exceptions=True 的作用？\n   → 一个失败不影响其他'
            }
        ],
        relatedFiles: ['base.py', 'loop.py'],
        tips: [
            '💡 渠道管理器是系统的"入口"',
            '💡 注意处理渠道启动失败的情况',
            '💡 可以添加渠道健康检查功能'
        ]
    },

    // ----- providers/ 目录 -----

    // base.py - LLM 提供商基类
    'file-providers-base': {
        title: 'providers/base.py - LLM 提供商基类',
        file: 'nanobot/providers/base.py',
        description: '定义 AI 模型提供商的统一接口。',
        sections: [
            {
                name: '🧠 思考：什么是 LLM 提供商?',
                code: `class LLMProvider(ABC):
    """
    LLM 提供商基类
    
    💡 想一想：
    - OpenAI、Claude、本地模型...
    - 它们有什么共同点？
    - 接收消息列表，返回 AI 回复
    """
    
    @abstractmethod
    async def generate(
        self,
        messages: List[dict],
        tools: List[dict] = None
    ) -> LLMResponse:
        """
        生成 AI 回复
        
        参数：
        - messages: 对话历史
        - tools: 可用工具列表
        """
        pass`,
                explanation: '**苏格拉底式提问**：\n\n1. 为什么需要统一接口？\n   → 可以轻松切换不同的 AI 模型\n\n2. tools 参数的作用？\n   → 让 AI 知道可以调用哪些工具'
            }
        ],
        relatedFiles: ['registry.py', 'loop.py'],
        tips: [
            '💡 提供商模式让系统可以支持多种 AI',
            '💡 注意处理 API 限流和错误',
            '💡 可以添加流式输出支持'
        ]
    },

    // registry.py - 提供商注册表
    'file-providers-registry': {
        title: 'providers/registry.py - 提供商注册表',
        file: 'nanobot/providers/registry.py',
        description: '管理所有可用的 AI 模型提供商。',
        sections: [
            {
                name: '🏭 思考：如何选择 AI 模型?',
                code: `class ProviderRegistry:
    """
    提供商注册表
    
    💡 想一想：
    - 不同任务可能需要不同的 AI
    - 如何在运行时切换？
    - 配置文件指定 + 注册表查找
    """
    
    def __init__(self):
        self._providers: Dict[str, LLMProvider] = {}
    
    def register(self, name: str, provider: LLMProvider):
        """注册一个提供商"""
        self._providers[name] = provider
    
    def get(self, name: str) -> LLMProvider:
        """获取指定提供商"""
        return self._providers.get(name)`,
                explanation: '**苏格拉底式提问**：\n\n1. 为什么用名称而不是类型？\n   → 同一类型可能有多个配置\n\n2. 如何选择默认提供商？\n   → 配置文件指定'
            }
        ],
        relatedFiles: ['base.py', 'config/loader.py'],
        tips: [
            '💡 可以注册多个同类型提供商',
            '💡 支持动态切换 AI 模型',
            '💡 可以添加提供商健康检查'
        ]
    },

    // ----- config/ 目录 -----

    // loader.py - 配置加载器
    'file-config-loader': {
        title: 'config/loader.py - 配置加载器',
        file: 'nanobot/config/loader.py',
        description: '负责加载和管理系统配置。',
        sections: [
            {
                name: '⚙️ 思考：配置应该放在哪里?',
                code: `class ConfigLoader:
    """
    配置加载器
    
    💡 想一想：
    - 配置可以来自哪里？
    - 文件、环境变量、命令行参数
    - 优先级如何？
    """
    
    def __init__(self, config_path: str = "config.yaml"):
        self.config_path = config_path
        self._config = None
    
    async def load(self) -> Config:
        """
        加载配置
        
        💡 观察：
        - 加载顺序：默认值 → 文件 → 环境变量
        - 后加载的覆盖前面的
        """
        # 1. 加载默认配置
        config = self._get_defaults()
        
        # 2. 从文件加载
        if os.path.exists(self.config_path):
            with open(self.config_path) as f:
                file_config = yaml.safe_load(f)
                config = self._merge(config, file_config)
        
        # 3. 从环境变量加载
        env_config = self._load_from_env()
        config = self._merge(config, env_config)
        
        return Config(**config)`,
                explanation: '**苏格拉底式提问**：\n\n1. 为什么有优先级？\n   → 允许在不同环境使用不同配置\n\n2. 环境变量的作用？\n   → 敏感信息（API Key）不应写在文件里'
            }
        ],
        relatedFiles: ['schema.py'],
        tips: [
            '💡 敏感配置用环境变量',
            '💡 配置验证很重要',
            '💡 支持配置热更新'
        ]
    },

    // schema.py - 配置模式
    'file-config-schema': {
        title: 'config/schema.py - 配置模式定义',
        file: 'nanobot/config/schema.py',
        description: '定义配置的数据结构和验证规则。',
        sections: [
            {
                name: '📐 思考：如何确保配置正确?',
                code: `@dataclass
class Config:
    """
    配置数据类
    
    💡 想一想：
    - 如何知道配置是否完整？
    - 如何知道类型是否正确？
    - 使用 dataclass + 类型注解
    """
    # AI 模型配置
    provider: str                    # 提供商名称
    model: str                       # 模型名称
    api_key: str                     # API 密钥
    max_tokens: int = 4096           # 最大 token 数
    
    # 记忆配置
    memory_path: str = "./memory"    # 记忆存储路径
    memory_threshold: int = 20       # 记忆整合阈值
    
    # 工具配置
    allowed_tools: List[str] = None  # 允许的工具列表
    
    def __post_init__(self):
        """验证配置"""
        if not self.api_key:
            raise ConfigError("API Key 不能为空")
        if self.max_tokens < 100:
            raise ConfigError("max_tokens 太小")`,
                explanation: '**苏格拉底式提问**：\n\n1. 为什么用 dataclass？\n   → 自动生成方法，类型安全\n\n2. __post_init__ 的作用？\n   → 初始化后验证，确保配置正确'
            }
        ],
        relatedFiles: ['loader.py'],
        tips: [
            '💡 配置验证可以提前发现问题',
            '💡 使用默认值减少必填项',
            '💡 可以添加配置文档'
        ]
    },

    // ----- session/ 目录 -----

    // manager.py - 会话管理器
    'file-session-manager': {
        title: 'session/manager.py - 会话管理器',
        file: 'nanobot/session/manager.py',
        description: '管理对话历史的核心模块，负责存储、加载和管理用户的对话会话。',
        sections: [
            {
                name: '🤔 思考：为什么需要"会话管理"?',
                code: `"""
会话管理：管理对话历史

这个模块提供了会话管理功能，用于存储和管理对话历史。

设计思路：
- 使用 JSONL 格式存储消息（每行一条消息）
- 支持内存缓存提高性能
- 支持会话持久化到磁盘
- 支持从旧位置迁移会话

会话存储：
- 位置：工作区/sessions/目录
- 格式：JSONL 文件（每行一条消息）
- 命名：{channel}_{chat_id}.jsonl
"""`,
                explanation: `**苏格拉底式提问**：

1. 🎯 **为什么 AI 需要记住对话历史？**
   → 想象你在和朋友聊天，如果朋友不记得刚才说了什么，对话会很奇怪
   → AI 也是一样，需要知道"上下文"才能给出连贯的回答
   → 例如：你问"它多少钱？"，AI 需要知道"它"指的是什么

2. 🎯 **为什么用 JSONL 格式而不是普通 JSON？**
   → JSONL = JSON Lines，每行是一个独立的 JSON 对象
   → 好处1：追加消息很方便，只需要在文件末尾加一行
   → 好处2：即使文件损坏，也只影响部分数据
   → 好处3：读取时可以逐行处理，内存效率高

3. 🎯 **什么是"持久化"？**
   → 持久化 = 把数据保存到硬盘，而不是只存在内存中
   → 内存中的数据：程序关闭就没了（RAM）
   → 硬盘中的数据：程序关闭后还在，下次启动可以继续用`
            },
            {
                name: '📦 理解：Session 会话类',
                code: `@dataclass
class Session:
    """
    会话：存储对话历史
    
    💡 什么是 dataclass？
    → Python 的一个装饰器，自动生成 __init__ 等方法
    → 让你用更少的代码定义数据类
    """
    
    # 会话键：格式为 channel:chat_id
    # 例如："telegram:123456789" 或 "wechat:user_abc"
    key: str
    
    # 消息列表：存储所有消息
    # 每条消息是一个字典，包含 role、content 等
    messages: list[dict[str, Any]] = field(default_factory=list)
    
    # 创建时间
    created_at: datetime = field(default_factory=datetime.now)
    
    # 更新时间（每次添加消息都会更新）
    updated_at: datetime = field(default_factory=datetime.now)
    
    # 元数据：存储额外信息（如用户设置、偏好等）
    metadata: dict[str, Any] = field(default_factory=dict)
    
    # 已整合到文件的消息数量
    last_consolidated: int = 0`,
                explanation: `**苏格拉底式提问**：

1. 🎯 **为什么 key 的格式是 "channel:chat_id"？**
   → channel 表示渠道：telegram、wechat、discord 等
   → chat_id 是该渠道中的唯一标识
   → 这样可以区分不同平台上的不同对话

2. 🎯 **messages 列表里存什么？**
   → 每条消息是一个字典，例如：
   \`\`\`python
   {
       "role": "user",           # 谁说的：user/assistant/system/tool
       "content": "你好",         # 说了什么
       "timestamp": "2024-...",  # 什么时候说的
   }
   \`\`\`

3. 🎯 **field(default_factory=list) 是什么意思？**
   → 这是 Python 的一个重要概念！
   → 错误写法：messages: list = []  # 所有实例共享同一个列表！
   → 正确写法：messages: list = field(default_factory=list)  # 每个实例有自己的列表
   → default_factory 是一个函数，每次创建新实例时调用

4. 🎯 **last_consolidated 是什么？**
   → consolidated = "整合/合并"
   → 当消息太多时，AI 会把旧消息总结成摘要
   → 这个数字记录已经整合了多少条消息`
            },
            {
                name: '➕ 实践：添加消息',
                code: `def add_message(self, role: str, content: str, **kwargs: Any) -> None:
    """
    添加消息到会话
    
    💡 参数说明：
    - role: 谁说的（user=用户, assistant=AI, system=系统, tool=工具）
    - content: 说了什么
    - **kwargs: 其他字段（如 tool_calls, tool_call_id）
    """
    # 构建消息字典
    msg = {
        "role": role,                    # 角色
        "content": content,              # 内容
        "timestamp": datetime.now().isoformat(),  # 当前时间
        **kwargs                         # 其他字段
    }
    # 追加到消息列表
    self.messages.append(msg)
    # 更新时间戳
    self.updated_at = datetime.now()`,
                explanation: `**苏格拉底式提问**：

1. 🎯 **为什么要有 role 字段？**
   → AI 需要知道每句话是谁说的
   → user：用户说的话
   → assistant：AI 的回复
   → system：系统指令（如"你是一个助手"）
   → tool：工具返回的结果

2. 🎯 ****kwargs 是什么？**
   → 这是 Python 的"可变关键字参数"
   → 可以传入任意数量的命名参数
   → 例如：add_message("user", "你好", name="张三", age=25)
   → kwargs 会变成 {"name": "张三", "age": 25}

3. 🎯 **为什么用 isoformat() 存时间？**
   → isoformat() 返回标准格式：2024-01-15T10:30:00.123456
   → 好处：人类可读，程序可解析，跨时区友好
   → 读取时可以用 datetime.fromisoformat() 还原

4. 🎯 **为什么每次都要更新 updated_at？**
   → 方便按"最近活跃"排序会话
   → 可以用来清理长时间不活跃的会话`
            },
            {
                name: '📖 实践：获取历史消息',
                code: `def get_history(self, max_messages: int = 500) -> list[dict[str, Any]]:
    """
    获取未整合的消息历史，用于 LLM 输入
    
    💡 为什么要"对齐到用户回合"？
    → 避免孤立的 tool_result 块
    → 确保消息格式正确
    """
    # 获取未整合的消息
    unconsolidated = self.messages[self.last_consolidated:]
    # 截取最近的消息（防止消息太多）
    sliced = unconsolidated[-max_messages:]

    # 丢弃开头的非用户消息
    # 为什么？因为 tool_result 必须跟在 user 消息后面
    for i, m in enumerate(sliced):
        if m.get("role") == "user":
            sliced = sliced[i:]
            break

    # 格式化输出
    out: list[dict[str, Any]] = []
    for m in sliced:
        # 构建条目
        entry: dict[str, Any] = {
            "role": m["role"], 
            "content": m.get("content", "")
        }
        # 复制工具相关字段
        for k in ("tool_calls", "tool_call_id", "name"):
            if k in m:
                entry[k] = m[k]
        out.append(entry)
        
    return out`,
                explanation: `**苏格拉底式提问**：

1. 🎯 **为什么要限制 max_messages？**
   → LLM 有"上下文窗口"限制，不能无限输入
   → 消息太多会超出 token 限制
   → 500 条通常是安全的数量

2. 🎯 **为什么用 [-max_messages:]？**
   → 这是 Python 的"负索引切片"
   → [-500:] 表示"取最后 500 个"
   → 例如：列表有 1000 条，取 [-500:] 得到后 500 条

3. 🎯 **为什么要丢弃开头的非用户消息？**
   → 想象消息序列：[tool_result, tool_result, user, assistant, user]
   → 如果从 tool_result 开始，AI 会困惑："这是什么工具的结果？"
   → 必须从 user 消息开始，上下文才完整

4. 🎯 **for k in ("tool_calls", ...) 是什么意思？**
   → 遍历一个元组中的每个元素
   → 检查消息中是否有这些字段
   → 如果有，就复制到输出中
   → 这是为了保留工具调用相关的信息`
            },
            {
                name: '🗂️ 理解：SessionManager 会话管理器',
                code: `class SessionManager:
    """
    会话管理器：管理对话会话
    
    💡 设计模式：管理器模式
    → 一个类负责管理多个对象
    → 提供创建、获取、保存、列出等功能
    """
    
    def __init__(self, workspace: Path):
        """
        初始化会话管理器
        
        参数：
        - workspace: 工作区路径（会话文件存储的位置）
        """
        self.workspace = workspace
        # 会话存储目录
        self.sessions_dir = ensure_dir(self.workspace / "sessions")
        # 旧版会话目录（用于迁移）
        self.legacy_sessions_dir = Path.home() / ".nanobot" / "sessions"
        # 内存缓存（提高性能）
        self._cache: dict[str, Session] = {}`,
                explanation: `**苏格拉底式提问**：

1. 🎯 **为什么需要 SessionManager 而不是直接用 Session？**
   → Session 只是一个数据容器
   → SessionManager 负责"管理"：加载、保存、缓存、查找
   → 这叫"关注点分离"：一个类只做一件事

2. 🎯 **什么是"缓存"（cache）？**
   → 缓存 = 临时存储，为了提高速度
   → 内存读取：纳秒级（很快）
   → 硬盘读取：毫秒级（较慢）
   → 把常用的数据放在内存中，避免频繁读硬盘

3. 🎯 **为什么有 legacy_sessions_dir？**
   → legacy = "遗留/旧版"
   → 软件升级时，存储位置可能变化
   → 需要支持从旧位置迁移数据
   → Path.home() 返回用户主目录（如 /Users/xxx）`
            },
            {
                name: '🔄 实践：获取或创建会话',
                code: `def get_or_create(self, key: str) -> Session:
    """
    获取现有会话或创建新会话
    
    💡 这是一个常用的设计模式：
    → 如果存在，就返回
    → 如果不存在，就创建
    """
    # 第一步：检查缓存
    if key in self._cache:
        return self._cache[key]

    # 第二步：尝试从磁盘加载
    session = self._load(key)
    if session is None:
        # 第三步：创建新会话
        session = Session(key=key)

    # 第四步：更新缓存
    self._cache[key] = session
    return session`,
                explanation: `**苏格拉底式提问**：

1. 🎯 **为什么先检查缓存，再加载磁盘？**
   → 缓存在内存中，速度极快
   → 磁盘 I/O 比较慢
   → 先查缓存可以避免不必要的磁盘读取

2. 🎯 **这个流程像什么？**
   → 就像你去图书馆借书：
   1. 先看看自己包里有没有（检查缓存）
   2. 没有的话去书架找（加载磁盘）
   3. 书架也没有就买一本（创建新会话）
   4. 借到后放包里（更新缓存）

3. 🎯 **get_or_create 是什么模式？**
   → 这叫"懒加载"（Lazy Loading）
   → 只在需要时才加载/创建
   → 不是一开始就加载所有会话`
            },
            {
                name: '💾 实践：保存会话到磁盘',
                code: `def save(self, session: Session) -> None:
    """
    保存会话到磁盘
    
    💡 JSONL 格式：
    → 第一行是元数据
    → 后续每行是一条消息
    """
    # 获取会话路径
    path = self._get_session_path(session.key)

    # 写入 JSONL 文件
    with open(path, "w", encoding="utf-8") as f:
        # 写入元数据行
        metadata_line = {
            "_type": "metadata",           # 标记这是元数据
            "key": session.key,
            "created_at": session.created_at.isoformat(),
            "updated_at": session.updated_at.isoformat(),
            "metadata": session.metadata,
            "last_consolidated": session.last_consolidated
        }
        f.write(json.dumps(metadata_line, ensure_ascii=False) + "\\n")
        
        # 写入消息行
        for msg in session.messages:
            f.write(json.dumps(msg, ensure_ascii=False) + "\\n")

    # 更新缓存
    self._cache[session.key] = session`,
                explanation: `**苏格拉底式提问**：

1. 🎯 **为什么用 "w" 模式而不是 "a" 模式？**
   → "w" = write，覆盖写入
   → "a" = append，追加写入
   → 这里每次保存都重写整个文件，确保数据一致

2. 🎯 **ensure_ascii=False 是什么意思？**
   → False：保留中文字符（"你好"）
   → True：转成 ASCII 编码（"\\u4f60\\u597d"）
   → 我们要支持中文，所以用 False

3. 🎯 **为什么每行末尾加 \\n？**
   → JSONL = JSON Lines，每行一个 JSON
   → 换行符分隔不同的记录
   → 读取时可以逐行处理

4. 🎯 **为什么保存后还要更新缓存？**
   → 确保缓存和磁盘数据一致
   → 虽然数据没变，但这是个好习惯`
            }
        ],
        relatedFiles: ['../agent/memory.py', '../agent/context.py'],
        tips: [
            '💡 会话管理是 AI 应用的基础，理解它很重要',
            '💡 JSONL 格式适合追加写入，但不适合随机访问',
            '💡 缓存能提高性能，但要注意内存占用',
            '💡 可以添加会话过期清理功能',
            '💡 考虑添加会话导出/导入功能'
        ]
    },

    // ----- cron/ 目录 -----

    // service.py - 定时服务
    'file-cron-service': {
        title: 'cron/service.py - 定时任务服务',
        file: 'nanobot/cron/service.py',
        description: '管理和执行定时任务的后台服务。',
        sections: [
            {
                name: '⏰ 思考：如何实现"定时"?',
                code: `class CronService:
    """
    定时任务服务
    
    💡 想一想：
    - 如何知道什么时候执行任务？
    - 每秒检查？会不会太慢？
    - 用调度算法优化
    """
    
    def __init__(self, agent_loop: AgentLoop):
        self.agent_loop = agent_loop
        self._jobs: Dict[str, CronJob] = {}
        self._running = False
    
    async def start(self):
        """启动调度服务"""
        self._running = True
        await self._load_jobs()  # 加载已保存的任务
        asyncio.create_task(self._run_scheduler())`,
                explanation: '**苏格拉底式提问**：\n\n1. 为什么需要后台服务？\n   → 持续运行，检查任务\n\n2) 任务为什么要持久化？\n   → 重启后不丢失'
            },
            {
                name: '🔄 实践：调度循环',
                code: `async def _run_scheduler(self):
    """
    调度循环
    
    💡 观察：
    - 每秒检查一次
    - 执行到期的任务
    - 更新下次执行时间
    """
    while self._running:
        now = datetime.now()
        
        for job in list(self._jobs.values()):
            if job.next_run <= now:
                # 执行任务
                asyncio.create_task(
                    self._execute_job(job)
                )
                # 更新下次执行时间
                self._update_next_run(job)
        
        await asyncio.sleep(1)`,
                explanation: '**苏格拉底式提问**：\n\n1. 为什么用 asyncio.create_task？\n   → 不阻塞调度循环\n\n2) 为什么用 list() 复制？\n   → 避免迭代时修改字典'
            }
        ],
        relatedFiles: ['types.py', 'tools/cron.py'],
        tips: [
            '💡 可以用更高效的调度算法',
            '💡 任务执行失败要有重试',
            '💡 注意时区处理'
        ]
    },

    // types.py - 任务类型
    'file-cron-types': {
        title: 'cron/types.py - 任务类型定义',
        file: 'nanobot/cron/types.py',
        description: '定义定时任务的数据结构。',
        sections: [
            {
                name: '📋 理解：任务数据结构',
                code: `class CronType(Enum):
    """
    任务类型
    
    💡 思考：
    - 一次性：指定时间执行一次
    - 周期性：每隔一段时间执行
    - Cron：复杂时间表达式
    """
    ONCE = "once"        # 一次性
    INTERVAL = "interval"  # 周期性
    CRON = "cron"        # Cron 表达式

@dataclass
class CronJob:
    """
    定时任务
    
    💡 观察：
    - 包含哪些信息？
    - 如何标识一个任务？
    """
    id: str              # 任务唯一ID
    user_id: str         # 所属用户
    task_type: CronType  # 任务类型
    schedule: str        # 调度规则
    action: str          # 要执行的操作
    next_run: datetime   # 下次执行时间
    created_at: datetime # 创建时间`,
                explanation: '**苏格拉底式提问**：\n\n1. 为什么需要 id？\n   → 可以取消、修改任务\n\n2) next_run 如何计算？\n   → 根据任务类型和调度规则'
            }
        ],
        relatedFiles: ['service.py'],
        tips: [
            '💡 Cron 表达式功能强大',
            '💡 可以添加任务标签分类',
            '💡 支持任务依赖关系'
        ]
    },

    // ----- heartbeat/ 目录 -----

    // service.py - 心跳服务
    'file-heartbeat-service': {
        title: 'heartbeat/service.py - 心跳服务',
        file: 'nanobot/heartbeat/service.py',
        description: '定期检查系统健康状态的服务。',
        sections: [
            {
                name: '💓 思考：为什么需要"心跳"?',
                code: `class HeartbeatService:
    """
    心跳服务
    
    💡 想一想：
    - 医生为什么要听心跳？
    - 确认系统"活着"
    - 检测异常情况
    """
    
    async def start(self):
        """启动心跳服务"""
        while True:
            await self._check_health()
            await asyncio.sleep(60)  # 每分钟检查一次
    
    async def _check_health(self):
        """
        健康检查
        
        💡 观察：
        - 检查哪些内容？
        - 发现问题怎么办？
        """
        # 检查 AI 服务
        ai_ok = await self._check_ai_service()
        
        # 检查数据库
        db_ok = await self._check_database()
        
        # 检查消息队列
        queue_ok = await self._check_queue()
        
        if not all([ai_ok, db_ok, queue_ok]):
            await self._alert_admin("系统健康检查失败")`,
                explanation: '**苏格拉底式提问**：\n\n1. 为什么要定期检查？\n   → 及时发现问题\n\n2) 检查频率如何确定？\n   → 平衡及时性和资源消耗'
            }
        ],
        relatedFiles: [],
        tips: [
            '💡 心跳是运维监控的基础',
            '💡 可以集成告警系统',
            '💡 记录健康检查日志'
        ]
    },

    // ----- cli/ 目录 -----

    // commands.py - CLI 命令
    'file-cli-commands': {
        title: 'cli/commands.py - 命令行接口',
        file: 'nanobot/cli/commands.py',
        description: '提供命令行操作接口。',
        sections: [
            {
                name: '💻 思考：为什么需要 CLI?',
                code: `# CLI 命令定义
# 使用 Click 库

@click.group()
def cli():
    """
    Nanobot 命令行工具
    
    💡 想一想：
    - 除了聊天，还需要什么操作？
    - 启动服务、管理配置、查看状态
    """
    pass

@cli.command()
@click.option('--config', default='config.yaml', help='配置文件路径')
def start(config: str):
    """
    启动 AI 代理服务
    
    💡 观察：
    - 如何指定配置文件？
    - 启动流程是怎样的？
    """
    # 加载配置
    cfg = load_config(config)
    
    # 创建并启动代理
    agent = AgentLoop(cfg)
    asyncio.run(agent.run())`,
                explanation: '**苏格拉底式提问**：\n\n1. 为什么用 Click？\n   → 简化命令行参数处理\n\n2) 还需要什么命令？\n   → stop、status、config 等'
            },
            {
                name: '🔧 其他命令',
                code: `@cli.command()
def status():
    """查看服务状态"""
    # 检查服务是否运行
    # 显示统计信息
    pass

@cli.command()
@click.argument('user_id')
def reset_memory(user_id: str):
    """重置用户记忆"""
    # 清除指定用户的记忆
    pass

@cli.command()
def list_tools():
    """列出所有可用工具"""
    # 显示已注册的工具
    pass`,
                explanation: '**苏格拉底式提问**：\n\n1. reset_memory 命令的作用？\n   → 清除用户数据，重新开始\n\n2) 为什么需要 list_tools？\n   → 了解 AI 能做什么'
            }
        ],
        relatedFiles: ['../__main__.py'],
        tips: [
            '💡 CLI 是运维的重要工具',
            '💡 命令要简洁明了',
            '💡 添加帮助文档'
        ]
    },

    // ----- utils/ 目录 -----

    // helpers.py - 辅助函数
    'file-utils-helpers': {
        title: 'utils/helpers.py - 辅助函数',
        file: 'nanobot/utils/helpers.py',
        description: '通用的工具函数集合。',
        sections: [
            {
                name: '🔧 思考：什么是"辅助函数"?',
                code: `# 辅助函数 - 通用、可复用的工具

def truncate(text: str, max_length: int = 100) -> str:
    """
    截断文本
    
    💡 思考：
    - 为什么要截断？
    - 如何优雅地截断？
    """
    if len(text) <= max_length:
        return text
    return text[:max_length-3] + "..."

def format_timestamp(dt: datetime) -> str:
    """
    格式化时间戳
    
    💡 观察：
    - 人类可读的格式
    - 考虑时区
    """
    return dt.strftime("%Y-%m-%d %H:%M:%S")

def safe_json_loads(text: str, default=None):
    """
    安全的 JSON 解析
    
    💡 思考：
    - 如果解析失败怎么办？
    - 返回默认值而不是报错
    """
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return default`,
                explanation: '**苏格拉底式提问**：\n\n1. 为什么需要这些函数？\n   → 避免重复代码\n\n2) 为什么叫"辅助"？\n   → 不是核心逻辑，但很有用'
            }
        ],
        relatedFiles: [],
        tips: [
            '💡 辅助函数要通用、无副作用',
            '💡 添加类型注解和文档',
            '💡 定期整理和优化'
        ]
    },

    // ----- 根目录文件 -----

    // __init__.py - 包初始化
    'file-init': {
        title: '__init__.py - 包初始化文件',
        file: 'nanobot/__init__.py',
        description: 'Python 包的初始化文件，定义公开接口。',
        sections: [
            {
                name: '📦 思考：__init__.py 的作用?',
                code: `"""
Nanobot - 轻量级 AI 代理框架

这个文件定义了包的公开接口
"""

# 导出主要类，方便使用
from .agent.loop import AgentLoop
from .agent.tools.base import BaseTool
from .agent.tools.registry import ToolRegistry
from .config.loader import Config, load_config
from .bus.events import MessageEvent, CronEvent

# 版本号
__version__ = "1.0.0"

# 公开接口
__all__ = [
    "AgentLoop",
    "BaseTool",
    "ToolRegistry",
    "Config",
    "load_config",
    "MessageEvent",
    "CronEvent",
]`,
                explanation: '**苏格拉底式提问**：\n\n1. 为什么需要 __init__.py？\n   → 标识 Python 包，初始化模块\n\n2) __all__ 的作用？\n   → 定义 from package import * 时导入的内容'
            }
        ],
        relatedFiles: ['__main__.py'],
        tips: [
            '💡 __init__.py 可以是空的',
            '💡 导出常用类方便使用',
            '💡 添加包级别的文档'
        ]
    },

    // __main__.py - 模块入口
    'file-main': {
        title: '__main__.py - 模块入口文件',
        file: 'nanobot/__main__.py',
        description: '支持直接运行 python -m nanobot。',
        sections: [
            {
                name: '🚀 思考：如何让包可直接运行?',
                code: `"""
模块入口 - 支持 python -m nanobot 运行

💡 想一想：
- python nanobot/cli.py 和 python -m nanobot 有什么区别？
- 后者更符合 Python 规范
"""

from .cli.commands import cli

if __name__ == "__main__":
    # 启动命令行工具
    cli()`,
                explanation: '**苏格拉底式提问**：\n\n1. __main__.py 什么时候被执行？\n   → python -m nanobot 时\n\n2) 为什么这样设计？\n   → 统一入口，方便使用'
            }
        ],
        relatedFiles: ['__init__.py', 'cli/commands.py'],
        tips: [
            '💡 保持入口简洁',
            '💡 可以添加启动前的检查',
            '💡 处理启动异常'
        ]
    }
};

// 导出数据
if (typeof module !== 'undefined' && module.exports) {
    module.exports = codeData;
}
