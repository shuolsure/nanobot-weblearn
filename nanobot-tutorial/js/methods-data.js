/**
 * 方法介绍数据文件
 * 以金字塔结构和知识图谱方式展示所有方法及其关系
 */

const methodsData = {
    // ==================== 金字塔顶层：系统入口 ====================
    pyramid: {
        level1: {
            name: "系统入口层",
            description: "整个系统的起点，负责启动和初始化",
            methods: ["run", "start", "__init__"]
        },
        level2: {
            name: "核心处理层",
            description: "处理消息的核心逻辑，协调各组件工作",
            methods: ["_process_event", "_build_context", "generate", "execute"]
        },
        level3: {
            name: "组件管理层",
            description: "管理各种组件（工具、记忆、渠道等）",
            methods: ["register", "get", "save", "load", "add_message"]
        },
        level4: {
            name: "基础操作层",
            description: "最基础的操作和数据处理",
            methods: ["put", "get", "append", "extend", "parse"]
        }
    },

    // ==================== 知识图谱：方法关系网络 ====================
    knowledgeGraph: {
        nodes: [
            // 系统入口节点
            { id: "run", name: "run()", category: "entry", description: "主循环入口" },
            { id: "start", name: "start()", category: "entry", description: "启动服务" },
            { id: "__init__", name: "__init__()", category: "entry", description: "初始化对象" },
            
            // 核心处理节点
            { id: "_process_event", name: "_process_event()", category: "core", description: "处理消息事件" },
            { id: "_build_context", name: "_build_context()", category: "core", description: "构建上下文" },
            { id: "generate", name: "generate()", category: "core", description: "生成AI回复" },
            { id: "execute", name: "execute()", category: "core", description: "执行工具" },
            
            // 组件管理节点
            { id: "register", name: "register()", category: "manage", description: "注册组件" },
            { id: "get", name: "get()", category: "manage", description: "获取组件" },
            { id: "save", name: "save()", category: "manage", description: "保存数据" },
            { id: "load", name: "load()", category: "manage", description: "加载数据" },
            { id: "add_message", name: "add_message()", category: "manage", description: "添加消息" },
            
            // 基础操作节点
            { id: "put", name: "put()", category: "basic", description: "放入队列" },
            { id: "get_queue", name: "get()", category: "basic", description: "取出队列" },
            { id: "append", name: "append()", category: "basic", description: "追加元素" },
            { id: "extend", name: "extend()", category: "basic", description: "扩展列表" },
            { id: "parse", name: "parse()", category: "basic", description: "解析数据" }
        ],
        edges: [
            // 调用关系
            { from: "run", to: "_process_event", type: "calls" },
            { from: "_process_event", to: "_build_context", type: "calls" },
            { from: "_process_event", to: "generate", type: "calls" },
            { from: "_process_event", to: "execute", type: "calls" },
            { from: "_build_context", to: "get", type: "calls" },
            { from: "_build_context", to: "add_message", type: "calls" },
            { from: "generate", to: "parse", type: "calls" },
            { from: "execute", to: "get", type: "calls" },
            { from: "run", to: "put", type: "uses" },
            { from: "run", to: "get_queue", type: "uses" },
            { from: "add_message", to: "append", type: "uses" },
            { from: "save", to: "load", type: "related" },
            { from: "register", to: "get", type: "related" }
        ]
    },

    // ==================== 详细方法介绍 ====================
    methods: {
        // ===== 系统入口方法 =====
        "run": {
            name: "run()",
            signature: "async def run(self)",
            location: "agent/loop.py",
            level: "顶层",
            category: "系统入口",
            description: "整个AI代理的'心脏'，永不停歇的主循环",
            why: {
                question: "🤔 为什么需要一个'无限循环'来运行AI？",
                answer: [
                    "想象一个客服中心：电话不断打进来，需要一个'接线员'持续等待",
                    "run() 就是这个'接线员'，它 24/7 不间断地监听消息队列",
                    "如果没有循环，处理完一条消息程序就结束了，无法持续服务",
                    "while True 配合 await，让程序'等待但不阻塞'，高效利用资源"
                ]
            },
            usage: {
                question: "🎯 这个方法具体做什么？",
                steps: [
                    "1️⃣ 等待消息：从消息队列获取下一条消息（await 不会卡死CPU）",
                    "2️⃣ 处理消息：调用 _process_event() 进行实际处理",
                    "3️⃣ 发送回复：把AI的回复发送给用户",
                    "4️⃣ 循环继续：回到第1步，等待下一条消息"
                ]
            },
            relations: {
                question: "🔗 这个方法和其他方法的关系？",
                upstream: "被 __main__.py 的 main() 函数调用，作为程序入口",
                downstream: [
                    "调用 message_queue.get() - 获取消息",
                    "调用 _process_event() - 处理消息",
                    "调用 _send_response() - 发送回复"
                ],
                siblings: "与 start()、stop() 共同构成生命周期管理"
            },
            analogy: "就像餐厅的前台服务员：不断等待顾客（消息）→ 记录订单（处理）→ 通知厨房（执行）→ 送回菜品（回复）→ 继续等待下一位顾客",
            codeExample: `async def run(self):
    """主循环 - 永不停歇的心跳"""
    while True:  # 无限循环
        # 等待消息（不会卡住CPU）
        event = await self.message_queue.get()
        
        # 处理这条消息
        async for response in self._process_event(event):
            # 发送响应给用户
            await self._send_response(event, response)`,
            tips: [
                "💡 while True 不会卡死，因为 await 会让出控制权",
                "💡 可以用 asyncio.create_task() 启动多个 run() 实例",
                "💡 添加停止标志可以实现优雅退出"
            ]
        },

        "__init__": {
            name: "__init__()",
            signature: "def __init__(self, config: Config)",
            location: "多个类中",
            level: "顶层",
            category: "系统入口",
            description: "对象的'出生证明'，创建对象时自动调用",
            why: {
                question: "🤔 为什么需要 __init__？不能直接创建对象吗？",
                answer: [
                    "想象生孩子：新生儿需要'起名字'、'登记户口'、'打疫苗'",
                    "__init__ 就是对象的'初始化流程'，设置初始状态",
                    "不同对象需要不同的初始配置（如AI需要配置API密钥）",
                    "没有 __init__，每次创建对象后都要手动设置属性，容易出错"
                ]
            },
            usage: {
                question: "🎯 __init__ 里通常放什么？",
                steps: [
                    "1️⃣ 保存配置：self.config = config（让对象记住配置）",
                    "2️⃣ 创建组件：self.memory = MemoryManager()（初始化依赖）",
                    "3️⃣ 设置初始值：self._cache = {}（准备数据容器）",
                    "4️⃣ 验证参数：检查 config 是否合法"
                ]
            },
            relations: {
                question: "🔗 __init__ 和其他方法的关系？",
                upstream: "被 Python 自动调用，当你执行 obj = ClassName() 时",
                downstream: "为其他方法准备'工作环境'，其他方法依赖 __init__ 创建的属性",
                siblings: "与 __del__（析构）对应，一个创建时调用，一个销毁时调用"
            },
            analogy: "就像装修新房：__init__ 是'装修过程'，设置家具（属性）、接通水电（依赖）、打扫干净（初始状态），之后才能入住（使用对象）",
            codeExample: `def __init__(self, config: Config):
    """初始化AgentLoop"""
    self.config = config                    # 保存配置
    self.provider = create_provider(config) # AI大脑
    self.memory = MemoryManager(config)     # 记忆系统
    self.tools = ToolRegistry()             # 工具箱
    self.message_queue = AsyncQueue()       # 消息队列`,
            tips: [
                "💡 __init__ 不要写太多逻辑，只做初始化",
                "💡 复杂的初始化可以抽成 _initialize() 方法",
                "💡 记得调用 super().__init__() 如果继承父类"
            ]
        },

        // ===== 核心处理方法 =====
        "_process_event": {
            name: "_process_event()",
            signature: "async def _process_event(self, event)",
            location: "agent/loop.py",
            level: "核心层",
            category: "核心处理",
            description: "AI的'思考过程'，处理单条消息的核心逻辑",
            why: {
                question: "🤔 为什么需要单独一个方法来处理事件？",
                answer: [
                    "想象医生看病：需要'询问病史'→'检查'→'诊断'→'开药'多个步骤",
                    "_process_event 把这些步骤封装在一起，形成完整的'诊疗流程'",
                    "处理消息很复杂：构建上下文、调用AI、执行工具、递归处理",
                    "单独封装让代码更清晰，也便于测试和复用"
                ]
            },
            usage: {
                question: "🎯 这个方法如何处理一条消息？",
                steps: [
                    "1️⃣ 构建上下文：收集对话历史、系统提示等信息",
                    "2️⃣ AI思考：调用 provider.generate() 获取AI回复",
                    "3️⃣ 检查工具调用：解析AI回复中的工具调用请求",
                    "4️⃣ 执行工具：如果有工具调用，执行并获取结果",
                    "5️⃣ 递归处理：带着工具结果，让AI继续思考（可能多次循环）",
                    "6️⃣ 返回结果：AI给出最终答案，通过 yield 返回"
                ]
            },
            relations: {
                question: "🔗 这个方法在系统中的位置？",
                upstream: "被 run() 调用，每次收到消息时触发",
                downstream: [
                    "调用 _build_context() - 准备输入",
                    "调用 provider.generate() - AI推理",
                    "调用 _execute_tool() - 执行操作",
                    "递归调用自身 - 多轮思考"
                ],
                siblings: "与 _send_response() 配合，一个处理输入，一个处理输出"
            },
            analogy: "就像解数学题：读题（构建上下文）→ 思考解法（AI生成）→ 查公式（工具调用）→ 再思考（递归）→ 写出答案（返回结果）",
            codeExample: `async def _process_event(self, event):
    """处理单个事件 - AI的思考过程"""
    # 第一步：构建上下文
    context = await self._build_context(event)
    
    # 第二步：让AI思考
    response = await self.provider.generate(context)
    
    # 第三步：检查AI是否想使用工具
    tool_calls = self._parse_tool_calls(response)
    
    if tool_calls:
        # AI想要执行操作
        for tool_call in tool_calls:
            result = await self._execute_tool(tool_call)
            context.append({"role": "tool", "content": result})
        
        # 继续让AI思考（带着工具结果）
        async for final in self._process_event(event):
            yield final
    else:
        # AI给出了最终答案
        yield response`,
            tips: [
                "💡 使用 yield 可以流式返回结果",
                "💡 递归调用实现多轮思考",
                "💡 工具结果是上下文的一部分，影响后续推理"
            ]
        },

        "_build_context": {
            name: "_build_context()",
            signature: "async def _build_context(self, event) -> List[dict]",
            location: "agent/context.py",
            level: "核心层",
            category: "核心处理",
            description: "为AI准备'背景资料'，让AI理解对话场景",
            why: {
                question: "🤔 为什么需要专门构建上下文？直接发消息不行吗？",
                answer: [
                    "想象你走进一个正在进行的会议，你需要知道'议题是什么'、'之前讨论了什么'",
                    "AI也一样，需要'上下文'才能理解用户的问题",
                    "上下文包括：系统提示（AI人设）、历史对话、可用工具等",
                    "没有上下文，AI就像失忆的人，无法连贯对话"
                ]
            },
            usage: {
                question: "🎯 上下文包含哪些内容？按什么顺序？",
                steps: [
                    "1️⃣ 系统提示：告诉AI它是谁、能做什么（最前面，确立人设）",
                    "2️⃣ 长期记忆：重要的历史信息摘要",
                    "3️⃣ 短期记忆：最近几轮对话的原文",
                    "4️⃣ 当前消息：用户刚发的消息",
                    "5️⃣ 工具列表：告诉AI有哪些工具可用"
                ]
            },
            relations: {
                question: "🔗 这个方法如何与其他组件协作？",
                upstream: "被 _process_event() 调用，每次AI推理前准备输入",
                downstream: [
                    "调用 memory.get_long_term() - 获取长期记忆",
                    "调用 memory.get_short_term() - 获取短期记忆",
                    "调用 _build_system_prompt() - 构建系统提示",
                    "调用 _build_tools_schema() - 获取工具列表"
                ],
                siblings: "与 _parse_response() 对应，一个构建输入，一个解析输出"
            },
            analogy: "就像准备考试：系统提示是'考试规则'，长期记忆是'基础知识'，短期记忆是'刚复习的内容'，当前消息是'考题'，工具列表是'允许使用的计算器/公式表'",
            codeExample: `async def build(self, event: Event) -> List[dict]:
    """构建完整的上下文"""
    context = []
    
    # 1. 系统提示 - 告诉AI它是谁
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
    
    return context`,
            tips: [
                "💡 上下文有token限制，需要截断",
                "💡 系统提示放在最前面，影响最大",
                "💡 可以用不同的策略选择历史消息"
            ]
        },

        "generate": {
            name: "generate()",
            signature: "async def generate(self, messages: List[dict], tools: List[dict]) -> str",
            location: "providers/base.py",
            level: "核心层",
            category: "核心处理",
            description: "调用AI大模型生成回复，是AI的'大脑'",
            why: {
                question: "🤔 为什么需要封装 generate() 方法？直接调用API不行吗？",
                answer: [
                    "想象打电话：你需要'拨号'→'等待接通'→'说话'→'听回复'多个步骤",
                    "generate() 封装了这些步骤，提供统一的接口",
                    "不同的AI提供商（OpenAI、Claude等）API不同，需要适配",
                    "封装后可以添加重试、错误处理、日志记录等通用逻辑"
                ]
            },
            usage: {
                question: "🎯 这个方法如何工作？",
                steps: [
                    "1️⃣ 接收消息列表：包含系统提示、历史对话、当前消息",
                    "2️⃣ 调用AI API：把消息发送给大模型（如GPT-4）",
                    "3️⃣ 等待响应：AI需要思考时间，使用 await 异步等待",
                    "4️⃣ 处理响应：解析API返回的数据，提取AI的回复",
                    "5️⃣ 返回结果：把AI的回复返回给调用者"
                ]
            },
            relations: {
                question: "🔗 这个方法在AI系统中的角色？",
                upstream: "被 _process_event() 调用，是AI推理的核心",
                downstream: [
                    "调用HTTP API - 与AI提供商通信",
                    "调用 _parse_response() - 解析响应"
                ],
                siblings: "与 execute() 配合，一个负责'思考'，一个负责'行动'"
            },
            analogy: "就像问老师问题：你把问题写在纸上（构建上下文）→ 交给老师（调用generate）→ 老师思考（AI推理）→ 老师给出答案（返回回复）",
            codeExample: `async def generate(self, messages, tools=None):
    """生成AI回复"""
    # 调用AI API
    response = await self.client.chat.completions.create(
        model=self.model,
        messages=messages,
        tools=tools,
        temperature=0.7
    )
    
    # 提取AI的回复
    return response.choices[0].message.content`,
            tips: [
                "💡 可以添加超时处理，防止长时间等待",
                "💡 可以实现流式输出，提升用户体验",
                "💡 不同模型有不同的特点和适用场景"
            ]
        },

        "execute": {
            name: "execute()",
            signature: "async def execute(self, **kwargs) -> str",
            location: "tools/base.py",
            level: "核心层",
            category: "核心处理",
            description: "执行具体工具操作，是AI的'手'",
            why: {
                question: "🤔 为什么工具需要 execute() 方法？",
                answer: [
                    "AI只能'思考'，不能'动手'，execute() 让AI能实际操作",
                    "比如：AI想查天气，但自己不能上网，需要 execute() 执行搜索",
                    "不同的工具有不同的操作（读文件、发消息、运行代码等）",
                    "统一接口让AI可以调用任何工具，无需关心具体实现"
                ]
            },
            usage: {
                question: "🎯 execute() 如何工作？",
                steps: [
                    "1️⃣ 接收参数：AI提供的工具调用参数",
                    "2️⃣ 验证参数：检查参数是否合法、完整",
                    "3️⃣ 执行操作：调用具体的业务逻辑（如读取文件）",
                    "4️⃣ 处理异常：捕获错误，返回友好的错误信息",
                    "5️⃣ 返回结果：把执行结果返回给AI"
                ]
            },
            relations: {
                question: "🔗 execute() 在工具系统中的位置？",
                upstream: "被 _process_event() 调用，当AI决定使用工具时",
                downstream: [
                    "调用具体的业务逻辑（如文件操作、网络请求）",
                    "可能调用其他工具的方法"
                ],
                siblings: "与 name、description、parameters 属性配合，共同定义一个工具"
            },
            analogy: "就像你的双手：大脑（AI）决定'拿杯子' → 手（execute）执行抓取动作 → 返回触感（执行结果）给大脑",
            codeExample: `async def execute(self, file_path: str) -> str:
    """执行读文件操作"""
    try:
        with open(file_path, 'r') as f:
            content = f.read()
        return f"文件内容：\\n{content}"
    except FileNotFoundError:
        return f"错误：文件 {file_path} 不存在"`,
            tips: [
                "💡 一定要处理异常，避免程序崩溃",
                "💡 返回字符串让AI能理解结果",
                "💡 敏感操作需要权限检查"
            ]
        },

        // ===== 组件管理方法 =====
        "register": {
            name: "register()",
            signature: "def register(self, name: str, item: Any)",
            location: "多个注册表中",
            level: "管理层",
            category: "组件管理",
            description: "把组件'登记入库'，方便后续查找使用",
            why: {
                question: "🤔 为什么需要 register()？不能直接用吗？",
                answer: [
                    "想象图书馆：新书需要'登记编号'→'录入系统'→'上架'才能被找到",
                    "register() 就是组件的'登记入库'流程",
                    "统一管理，避免重复创建，提高性能",
                    "通过名称查找，解耦创建和使用"
                ]
            },
            usage: {
                question: "🎯 register() 的典型用法？",
                steps: [
                    "1️⃣ 创建组件：tool = ReadFileTool()",
                    "2️⃣ 注册组件：registry.register('read_file', tool)",
                    "3️⃣ 后续使用：通过名称获取组件 registry.get('read_file')"
                ]
            },
            relations: {
                question: "🔗 register() 和 get() 的关系？",
                upstream: "在系统初始化时调用，注册所有可用组件",
                downstream: "把组件存入内部字典 self._registry[name] = item",
                siblings: "与 get()、unregister() 组成完整的注册表操作"
            },
            analogy: "就像手机通讯录：添加联系人（register）→ 存储到通讯录（保存到字典）→ 以后通过名字查找（get）",
            codeExample: `def register(self, name: str, tool: BaseTool):
    """注册一个工具"""
    if name in self._tools:
        raise ToolError(f"工具已存在: {name}")
    self._tools[name] = tool`,
            tips: [
                "💡 检查重名避免覆盖",
                "💡 可以添加类型检查",
                "💡 支持批量注册"
            ]
        },

        "get": {
            name: "get()",
            signature: "def get(self, name: str) -> Any",
            location: "多个管理器中",
            level: "管理层",
            category: "组件管理",
            description: "根据名称获取已注册的组件",
            why: {
                question: "🤔 为什么用 get() 而不是直接访问？",
                answer: [
                    "想象去图书馆借书：你报书名（name），管理员去书架找（get）",
                    "get() 封装了查找逻辑，可能涉及缓存、懒加载等",
                    "统一接口，无论内部如何存储，使用方式一样",
                    "可以添加不存在时的处理逻辑（返回None或报错）"
                ]
            },
            usage: {
                question: "🎯 get() 如何使用？",
                steps: [
                    "1️⃣ 传入名称：registry.get('read_file')",
                    "2️⃣ 查找组件：在内部字典中查找",
                    "3️⃣ 返回结果：返回找到的组件，或None/报错"
                ]
            },
            relations: {
                question: "🔗 get() 在组件管理中的作用？",
                upstream: "被各种业务逻辑调用，需要获取组件时",
                downstream: "从内部存储（字典、缓存等）中查找",
                siblings: "与 register() 对应，一个存一个取"
            },
            analogy: "就像字典查词：word = dict.get('hello')，有就返回释义，没有返回None",
            codeExample: `def get(self, name: str) -> BaseTool:
    """获取指定名称的工具"""
    tool = self._tools.get(name)
    if tool is None:
        raise ToolError(f"工具不存在: {name}")
    return tool`,
            tips: [
                "💡 可以返回None或抛异常，根据场景选择",
                "💡 可以实现懒加载，get时才创建",
                "💡 可以添加缓存逻辑"
            ]
        },

        "save": {
            name: "save()",
            signature: "def save(self, data: Any) -> None",
            location: "session/manager.py, memory.py 等",
            level: "管理层",
            category: "组件管理",
            description: "把数据持久化到磁盘，防止丢失",
            why: {
                question: "🤔 为什么需要 save()？数据放内存不行吗？",
                answer: [
                    "想象写日记：如果只记在脑子里，睡一觉就忘了",
                    "内存（RAM）断电就清空，磁盘数据可以长期保存",
                    "程序重启后，可以从磁盘恢复数据",
                    "save() 就是'存档'功能，把内存数据写入文件"
                ]
            },
            usage: {
                question: "🎯 save() 如何工作？",
                steps: [
                    "1️⃣ 接收数据：要保存的对象",
                    "2️⃣ 序列化：把对象转成可存储的格式（JSON、二进制等）",
                    "3️⃣ 写入文件：打开文件，写入数据",
                    "4️⃣ 关闭文件：确保数据落盘"
                ]
            },
            relations: {
                question: "🔗 save() 和 load() 的关系？",
                upstream: "在数据变更后调用，如添加新消息后",
                downstream: "调用文件操作、JSON序列化等",
                siblings: "与 load() 对应，一个存一个取，配合实现持久化"
            },
            analogy: "就像游戏存档：save() = 按存档键，把当前进度写入存档文件；下次玩时用 load() 读取存档",
            codeExample: `def save(self, session: Session) -> None:
    """保存会话到磁盘"""
    path = self._get_path(session.key)
    with open(path, 'w') as f:
        json.dump(session.to_dict(), f)`,
            tips: [
                "💡 定期自动保存，防止数据丢失",
                "💡 可以先写临时文件，成功后再替换",
                "💡 大文件可以增量保存"
            ]
        },

        "load": {
            name: "load()",
            signature: "def load(self, key: str) -> Any",
            location: "session/manager.py, config/loader.py 等",
            level: "管理层",
            category: "组件管理",
            description: "从磁盘读取数据，恢复之前的状态",
            why: {
                question: "🤔 为什么需要 load()？直接创建新的不行吗？",
                answer: [
                    "想象游戏：如果没有 load()，每次都要从头开始玩",
                    "load() 让你'继续上次的进度'",
                    "用户的历史对话、配置设置都需要恢复",
                    "实现'有状态'的服务，而不是每次都重新开始"
                ]
            },
            usage: {
                question: "🎯 load() 的工作流程？",
                steps: [
                    "1️⃣ 定位文件：根据key找到对应的文件",
                    "2️⃣ 读取文件：打开文件，读取原始数据",
                    "3️⃣ 反序列化：把JSON/二进制转回对象",
                    "4️⃣ 验证数据：检查数据是否完整、合法",
                    "5️⃣ 返回对象：返回重建的对象"
                ]
            },
            relations: {
                question: "🔗 load() 在系统启动时的作用？",
                upstream: "在系统启动、需要恢复数据时调用",
                downstream: "调用文件读取、JSON解析等",
                siblings: "与 save() 配对使用，实现完整的持久化"
            },
            analogy: "就像打开游戏继续玩：load() 读取存档文件 → 恢复游戏状态 → 从上次离开的地方继续",
            codeExample: `def load(self, key: str) -> Session:
    """从磁盘加载会话"""
    path = self._get_path(key)
    if not path.exists():
        return None
    with open(path, 'r') as f:
        data = json.load(f)
    return Session.from_dict(data)`,
            tips: [
                "💡 文件不存在时返回None或默认值",
                "💡 要处理文件损坏的情况",
                "💡 可以添加版本兼容处理"
            ]
        },

        "add_message": {
            name: "add_message()",
            signature: "def add_message(self, role: str, content: str, **kwargs)",
            location: "session/manager.py",
            level: "管理层",
            category: "组件管理",
            description: "向会话中添加一条消息",
            why: {
                question: "🤔 为什么需要 add_message()？直接操作列表不行吗？",
                answer: [
                    "想象记账：你不能直接改账本，需要'按格式记录'→'标注时间'→'更新余额'",
                    "add_message() 封装了这些步骤，确保格式正确",
                    "自动添加时间戳、更新元数据",
                    "可以触发后续操作（如检查是否需要整合记忆）"
                ]
            },
            usage: {
                question: "🎯 add_message() 做了什么？",
                steps: [
                    "1️⃣ 构建消息：创建包含role、content、timestamp的字典",
                    "2️⃣ 追加到列表：messages.append(msg)",
                    "3️⃣ 更新时间：更新会话的 updated_at",
                    "4️⃣ 触发检查：检查是否需要记忆整合"
                ]
            },
            relations: {
                question: "🔗 add_message() 在对话流程中的位置？",
                upstream: "收到用户消息或AI回复时调用",
                downstream: "操作 messages 列表，可能触发 save()",
                siblings: "与 get_history() 对应，一个写一个读"
            },
            analogy: "就像写日记：add_message() = 按格式写一条日记（日期+内容）→ 贴到日记本上 → 更新最后写日记的时间",
            codeExample: `def add_message(self, role: str, content: str, **kwargs):
    """添加消息到会话"""
    msg = {
        "role": role,
        "content": content,
        "timestamp": datetime.now().isoformat(),
        **kwargs
    }
    self.messages.append(msg)
    self.updated_at = datetime.now()`,
            tips: [
                "💡 role可以是user、assistant、system、tool",
                "💡 可以添加额外字段（如tool_calls）",
                "💡 自动记录时间很重要"
            ]
        },

        // ===== 基础操作方法 =====
        "put": {
            name: "put()",
            signature: "async def put(self, item: Any)",
            location: "bus/queue.py",
            level: "基础层",
            category: "基础操作",
            description: "把消息放入队列，等待处理",
            why: {
                question: "🤔 为什么需要 put()？直接调用处理方法不行吗？",
                answer: [
                    "想象餐厅：顾客来了不能直接冲进厨房，需要'取号排队'",
                    "put() 就是'取号'，把消息放入队列排队",
                    "实现异步处理，发送者不用等待处理完成",
                    "解耦生产者和消费者，各自按自己的节奏工作"
                ]
            },
            usage: {
                question: "🎯 put() 如何使用？",
                steps: [
                    "1️⃣ 创建消息：构造要发送的数据",
                    "2️⃣ 调用put：await queue.put(message)",
                    "3️⃣ 立即返回：不用等待处理完成，继续执行其他代码"
                ]
            },
            relations: {
                question: "🔗 put() 和 get() 的关系？",
                upstream: "被各种渠道调用，收到用户消息时",
                downstream: "把消息存入内部队列存储",
                siblings: "与 get() 对应，一个放一个取，实现生产者-消费者模式"
            },
            analogy: "就像寄快递：put() = 把包裹交给快递员（放入队列）→ 拿到快递单号（立即返回）→ 不用等对方签收",
            codeExample: `async def put(self, item):
    """放入消息到队列"""
    await self._queue.put(item)`,
            tips: [
                "💡 队列满时会等待（如果设置了maxsize）",
                "💡 是线程/协程安全的",
                "💡 可以批量put提高效率"
            ]
        },

        "append": {
            name: "append()",
            signature: "list.append(item)",
            location: "Python内置",
            level: "基础层",
            category: "基础操作",
            description: "在列表末尾添加一个元素",
            why: {
                question: "🤔 append() 和 extend() 有什么区别？",
                answer: [
                    "append() = 把东西'装进盒子'，盒子作为一个整体放入列表",
                    "extend() = 把盒子里的东西'倒出来'，一个个放入列表",
                    "[1,2].append([3,4]) → [1, 2, [3, 4]]（3个元素）",
                    "[1,2].extend([3,4]) → [1, 2, 3, 4]（4个元素）"
                ]
            },
            usage: {
                question: "🎯 什么时候用 append()？",
                steps: [
                    "添加单个元素：messages.append(new_message)",
                    "添加对象：tools.append(tool_object)",
                    "保持元素完整性：把整个对象作为一个元素添加"
                ]
            },
            relations: {
                question: "🔗 append() 在代码中的使用场景？",
                upstream: "需要向列表添加单个元素时",
                downstream: "直接修改列表，无返回值",
                siblings: "与 extend()、insert() 配合，不同场景用不同方法"
            },
            analogy: "就像排队：append() = 一个人直接站到队尾；extend() = 一队人拆开，一个个站到队尾",
            codeExample: `# append：添加单个元素
messages.append({"role": "user", "content": "你好"})
# 结果：[..., {"role": "user", "content": "你好"}]

# extend：添加多个元素
messages.extend([msg1, msg2])
# 结果：[..., msg1, msg2]`,
            tips: [
                "💡 append 是原地修改，不返回新列表",
                "💡 时间复杂度 O(1)，很快",
                "💡 添加单个元素用 append，多个用 extend"
            ]
        },

        "parse": {
            name: "parse()",
            signature: "def parse(self, data: str) -> Any",
            location: "多个解析器中",
            level: "基础层",
            category: "基础操作",
            description: "解析数据，把字符串转成结构化数据",
            why: {
                question: "🤔 为什么需要 parse()？字符串不好吗？",
                answer: [
                    "AI返回的是文本字符串，但程序需要结构化数据",
                    "parse() 就像'翻译'，把自然语言转成程序能理解的格式",
                    "例如：从AI回复中提取工具调用请求",
                    "解析后可以方便地访问特定字段"
                ]
            },
            usage: {
                question: "🎯 parse() 的典型用法？",
                steps: [
                    "1️⃣ 接收原始数据：通常是字符串",
                    "2️⃣ 应用解析规则：正则、JSON解析等",
                    "3️⃣ 提取关键信息：找出需要的字段",
                    "4️⃣ 返回结构化数据：字典、对象等"
                ]
            },
            relations: {
                question: "🔗 parse() 在数据处理流程中的位置？",
                upstream: "收到原始数据后，如AI回复、配置文件等",
                downstream: "返回结构化数据，供业务逻辑使用",
                siblings: "与 format()、serialize() 对应，一个解析一个格式化"
            },
            analogy: "就像读信：parse() = 读信件内容 → 提取关键信息（时间、地点、事件）→ 整理成便签方便查看",
            codeExample: `def parse_tool_calls(self, response: str) -> List[ToolCall]:
    """从AI回复中解析工具调用"""
    # 查找工具调用标记
    pattern = r'<tool>(.*?)</tool>'
    matches = re.findall(pattern, response)
    
    tool_calls = []
    for match in matches:
        data = json.loads(match)
        tool_calls.append(ToolCall(**data))
    
    return tool_calls`,
            tips: [
                "💡 要处理解析失败的情况",
                "💡 可以添加验证逻辑",
                "💡 不同格式用不同的解析器"
            ]
        }
    },

    // ==================== 方法关系图谱说明 ====================
    relationshipGuide: {
        title: "方法关系图谱解读",
        description: "理解方法之间的调用关系，掌握系统工作流程",
        patterns: [
            {
                name: "调用链（Call Chain）",
                description: "A → B → C，像多米诺骨牌一样依次调用",
                example: "run() → _process_event() → _build_context()",
                color: "#4A90E2"
            },
            {
                name: "循环调用（Loop）",
                description: "A 调用 B，B 又调用 A，形成循环",
                example: "_process_event() 递归调用自身",
                color: "#F5A623"
            },
            {
                name: "配对使用（Pair）",
                description: "两个方法配合使用，完成一个完整操作",
                example: "register() ↔ get()、save() ↔ load()、put() ↔ get()",
                color: "#7ED321"
            },
            {
                name: "层级调用（Hierarchy）",
                description: "上层方法调用下层方法，形成金字塔结构",
                example: "顶层(run) → 核心(_process_event) → 管理(register) → 基础(append)",
                color: "#BD10E0"
            }
        ]
    }
};

// 导出数据
if (typeof module !== 'undefined' && module.exports) {
    module.exports = methodsData;
}
