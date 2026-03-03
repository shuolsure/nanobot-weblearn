/**
 * 运行演示数据文件 - 消息处理流程
 * 采用链式数据流设计：上一轮的输出 = 下一轮的输入
 */

const demoScenarios = {
  scenario1: {
    id: "scenario1",
    title: "📨 消息处理流程",
    subtitle: "从用户发送消息到 AI 回复的完整旅程",
    description: "这是 Nanobot 最核心的运行场景，展示了消息如何从用户端经过系统处理，最终得到 AI 的智能回复。",
    
    // 全局数据流上下文（用于追踪数据传递）
    globalContext: {
      initialInput: {
        type: "UserInput",
        content: "你好，请介绍一下你自己",
        channel: "cli",
        chat_id: "user123",
        timestamp: "2024-01-01 12:00:00"
      }
    },
    
    steps: [
      {
        id: 1,
        node: "user-input",
        title: "步骤 1: 用户发送消息",
        description: "一切从这里开始！用户在聊天界面输入了一条消息。",
        icon: "fa-comment-dots",
        color: "#4A90E2",
        
        // 数据流：初始输入
        dataFlow: {
          input: {
            source: "用户",
            type: "原始文本",
            content: "你好，请介绍一下你自己"
          },
          output: {
            type: "InboundMessage",
            content: "你好，请介绍一下你自己",
            channel: "cli",
            chat_id: "user123",
            metadata: {}
          },
          transformation: "用户输入 → InboundMessage 对象"
        },
        
        code: {
          file: "nanobot/bus/queue.py",
          functionName: "publish_inbound()",
          line: 45,
          signature: "async def publish_inbound(self, content: str, channel: str, chat_id: str, metadata: dict = None)",
          snippet: `async def publish_inbound(self, content: str, channel: str, chat_id: str, metadata: dict = None):
    """发布入站消息到消息队列"""
    # 创建 InboundMessage 对象
    msg = InboundMessage(
        content=content,
        channel=channel,
        chat_id=chat_id,
        metadata=metadata or {}
    )
    
    # 放入异步队列
    await self.inbound_queue.put(msg)
    logger.debug(f"Published inbound message: {content[:50]}...")`,
          
          explanation: `**关键作用：**
1. 📥 接收用户输入
2. 📦 包装成 InboundMessage 对象
3. 📬 放入异步队列等待处理

**为什么使用队列？**
- ✅ 解耦：发送者和处理者不需要直接通信
- ✅ 缓冲：处理速度慢时消息不会丢失
- ✅ 异步：发送者不需要等待`,
          
          callStack: [
            { level: 1, method: "用户输入", file: "CLI 界面" },
            { level: 2, method: "publish_inbound()", file: "bus/queue.py" },
            { level: 3, method: "InboundMessage()", file: "bus/events.py" },
            { level: 4, method: "queue.put()", file: "asyncio/queues.py" }
          ]
        },
        
        tips: [
          "💡 InboundMessage 是数据类，标准化消息格式",
          "💡 asyncio.Queue 是异步安全的，无需额外加锁",
          "💡 metadata 可传递额外信息（如用户 ID、时间戳）"
        ]
      },
      
      {
        id: 2,
        node: "message-bus",
        title: "步骤 2: 消息总线接收",
        description: "消息进入系统后，被消息总线管理和分发。",
        icon: "fa-bus",
        color: "#F5A623",
        
        // 数据流：上一轮的输出作为这一轮的输入
        dataFlow: {
          input: {
            // 这里应该是步骤 1 的 output
            type: "InboundMessage",
            content: "你好，请介绍一下你自己",
            channel: "cli",
            chat_id: "user123",
            status: "在队列中等待"
          },
          output: {
            type: "InboundMessage",
            content: "你好，请介绍一下你自己",
            channel: "cli",
            chat_id: "user123",
            status: "已消费，准备处理"
          },
          transformation: "从队列中取出消息 → 传递给 AgentLoop"
        },
        
        code: {
          file: "nanobot/bus/queue.py",
          functionName: "consume_inbound()",
          line: 78,
          signature: "async def consume_inbound(self) -> InboundMessage",
          snippet: `async def consume_inbound(self) -> InboundMessage:
    """消费（获取）入站消息"""
    # 从异步队列获取消息（阻塞等待）
    msg = await self.inbound_queue.get()
    
    # 标记任务完成
    self.inbound_queue.task_done()
    
    logger.debug(f"Consumed inbound message from {msg.channel}")
    return msg`,
          
          explanation: `**关键点：**
1. ⏳ 阻塞等待：队列为空时等待（不占用 CPU）
2. 📥 FIFO：先来的消息先处理
3. ✅ task_done：标记处理完成

**await 的魔力：**
- 等待时不阻塞 CPU
- 有新消息自动"醒来"
- 这就是异步编程的高效之处！`,
          
          callStack: [
            { level: 1, method: "AgentLoop.run()", file: "agent/loop.py" },
            { level: 2, method: "consume_inbound()", file: "bus/queue.py" },
            { level: 3, method: "queue.get()", file: "asyncio/queues.py" },
            { level: 4, method: "task_done()", file: "asyncio/queues.py" }
          ]
        },
        
        tips: [
          "💡 await 让出 CPU，实现高效并发",
          "💡 task_done() 配合 join() 等待所有任务完成",
          "💡 FIFO = First In First Out"
        ]
      },
      
      {
        id: 3,
        node: "agent-loop",
        title: "步骤 3: AgentLoop 主循环",
        description: "系统的心脏，持续监听并处理消息。",
        icon: "fa-heartbeat",
        color: "#E74C3C",
        
        dataFlow: {
          input: {
            // 步骤 2 的 output
            type: "InboundMessage",
            content: "你好，请介绍一下你自己",
            channel: "cli",
            chat_id: "user123"
          },
          output: {
            type: "AsyncTask",
            task_id: "task_123",
            handler: "_dispatch",
            status: "已创建"
          },
          transformation: "消息 → 异步处理任务"
        },
        
        code: {
          file: "nanobot/agent/loop.py",
          functionName: "run()",
          line: 498,
          signature: "async def run(self) -> None",
          snippet: `async def run(self) -> None:
    """运行代理循环的主入口"""
    self._running = True
    await self._connect_mcp()
    logger.info("Agent loop started")

    while self._running:
        try:
            # 获取消息（1 秒超时）
            msg = await asyncio.wait_for(
                self.bus.consume_inbound(), 
                timeout=1.0
            )
        except asyncio.TimeoutError:
            continue

        # 处理 /stop 命令
        if msg.content.strip().lower() == "/stop":
            await self._handle_stop(msg)
        else:
            # 创建异步任务
            task = asyncio.create_task(self._dispatch(msg))
            self._active_tasks.setdefault(
                msg.session_key, []
            ).append(task)`,
          
          explanation: `**主循环工作原理：**
1. 🔄 无限循环：while self._running
2. ⏰ 超时等待：1 秒超时，定期检查停止信号
3. 🚀 创建任务：为每条消息创建异步任务

**为什么设置超时？**
- 不设置超时无法响应 /stop 命令
- 1 秒超时既不太频繁，又能及时响应`,
          
          callStack: [
            { level: 1, method: "启动 AgentLoop", file: "main.py" },
            { level: 2, method: "run()", file: "agent/loop.py" },
            { level: 3, method: "consume_inbound()", file: "bus/queue.py" },
            { level: 4, method: "create_task()", file: "asyncio/tasks.py" }
          ]
        },
        
        tips: [
          "💡 while self._running 可优雅停止",
          "💡 asyncio.wait_for 添加超时保护",
          "💡 create_task 立即开始执行",
          "💡 setdefault 键不存在时创建空列表"
        ]
      },
      
      {
        id: 4,
        node: "dispatch",
        title: "步骤 4: 消息分发处理",
        description: "消息被分发到具体处理器，开始真正处理。",
        icon: "fa-random",
        color: "#9B59B6",
        
        dataFlow: {
          input: {
            // 步骤 3 的 output
            type: "AsyncTask",
            message: {
              content: "你好，请介绍一下你自己",
              channel: "cli",
              chat_id: "user123"
            }
          },
          output: {
            type: "OutboundMessage 或 None",
            content: "处理结果",
            status: "处理中"
          },
          transformation: "加锁保护 → 调用处理器 → 发送响应"
        },
        
        code: {
          file: "nanobot/agent/loop.py",
          functionName: "_dispatch()",
          line: 581,
          signature: "async def _dispatch(self, msg: InboundMessage) -> None",
          snippet: `async def _dispatch(self, msg: InboundMessage) -> None:
    """分发消息到处理器"""
    # 使用全局锁确保顺序处理
    async with self._processing_lock:
        try:
            # 处理消息
            response = await self._process_message(msg)
            
            # 发送响应
            if response is not None:
                await self.bus.publish_outbound(response)
        except asyncio.CancelledError:
            logger.info("Task cancelled")
            raise
        except Exception:
            logger.exception("Error processing message")
            await self.bus.publish_outbound(
                OutboundMessage(content="Error occurred")
            )`,
          
          explanation: `**分发器职责：**
1. 🔒 加锁保护：确保消息顺序处理
2. 🎯 调用处理器：_process_message
3. 📤 发送响应：publish_outbound
4. ⚠️ 异常处理：捕获错误并发送友好提示

**为什么需要锁？**
- 防止并发处理导致状态混乱
- 确保对话历史的顺序性`,
          
          callStack: [
            { level: 1, method: "create_task(_dispatch)", file: "agent/loop.py" },
            { level: 2, method: "_dispatch()", file: "agent/loop.py" },
            { level: 3, method: "_process_message()", file: "agent/loop.py" },
            { level: 4, method: "publish_outbound()", file: "bus/queue.py" }
          ]
        },
        
        tips: [
          "💡 async with 自动获取和释放锁",
          "💡 CancelledError 是任务被取消的特殊异常",
          "💡 logger.exception 自动记录堆栈跟踪"
        ]
      },
      
      {
        id: 5,
        node: "process-message",
        title: "步骤 5: 核心消息处理",
        description: "真正的魔法！解析消息、构建上下文、调用 LLM。",
        icon: "fa-magic",
        color: "#1ABC9C",
        
        dataFlow: {
          input: {
            // 步骤 4 的 input（传递下来的消息）
            type: "InboundMessage",
            content: "你好，请介绍一下你自己",
            channel: "cli",
            chat_id: "user123"
          },
          output: {
            type: "OutboundMessage",
            content: "你好！我是 Nanobot，一个智能助手...",
            tool_calls: null
          },
          transformation: "消息 → 会话历史 → 上下文 → LLM 响应 → AI 回复"
        },
        
        code: {
          file: "nanobot/agent/loop.py",
          functionName: "_process_message()",
          line: 640,
          signature: "async def _process_message(self, msg: InboundMessage, ...) -> OutboundMessage | None",
          snippet: `async def _process_message(self, msg, ...):
    """处理单条入站消息"""
    # 判断消息类型
    if msg.channel == "system":
        # 处理系统消息
        ...
    elif msg.content.startswith('/'):
        # 处理斜杠命令
        if command == '/new':
            await self.sessions.clear(msg.session_key)
            return OutboundMessage(content="New conversation")
    else:
        # 正常消息处理
        session = self.sessions.get_or_create(msg.session_key)
        
        # 添加用户消息到历史
        session.add_message({
            "role": "user",
            "content": msg.content
        })
        
        # 构建上下文
        context = await self.context_builder.build_context(
            session=session,
            channel=msg.channel,
            chat_id=msg.chat_id
        )
        
        # 调用 LLM
        response = await self.llm_provider.generate(
            messages=context.messages,
            tools=context.tools
        )
        
        # 处理响应
        if response.tool_calls:
            # 执行工具调用
            ...
        else:
            # 纯文本回复
            ai_message = {
                "role": "assistant",
                "content": response.content
            }
            session.add_message(ai_message)
            return OutboundMessage(content=response.content)`,
          
          explanation: `**核心处理流程：**
1. 🔍 判断类型：系统消息/命令/普通消息
2. 📝 添加历史：保存到会话
3. 🧠 构建上下文：系统提示 + 历史 + 记忆 + 工具
4. 🤖 调用 LLM：生成回复
5. 🛠️ 处理响应：检查工具调用
6. 💬 返回回复

**这是整个系统的"大脑"！**`,
          
          callStack: [
            { level: 1, method: "_dispatch()", file: "agent/loop.py" },
            { level: 2, method: "_process_message()", file: "agent/loop.py" },
            { level: 3, method: "build_context()", file: "agent/context.py" },
            { level: 4, method: "generate()", file: "providers/base.py" }
          ]
        },
        
        tips: [
          "💡 系统消息用于内部通信",
          "💡 斜杠命令是系统保留命令",
          "💡 build_context 组装所有必要信息",
          "💡 tool_calls 是 LLM 请求调用工具"
        ]
      },
      
      {
        id: 6,
        node: "build-context",
        title: "步骤 6: 构建上下文",
        description: "组装所有必要信息，为 LLM 准备完整的知识包。",
        icon: "fa-box-open",
        color: "#3498DB",
        
        dataFlow: {
          input: {
            // 步骤 5 中调用的输入
            session: "Session 对象",
            channel: "cli",
            chat_id: "user123",
            history: [{"role": "user", "content": "你好，请介绍一下你自己"}]
          },
          output: {
            type: "Context",
            messages: [
              {"role": "system", "content": "你是有帮助的助手"},
              {"role": "user", "content": "你好，请介绍一下你自己"}
            ],
            tools: ["weather", "search", "calc"],
            memory: null
          },
          transformation: "会话 + 记忆 + 工具 → 完整上下文"
        },
        
        code: {
          file: "nanobot/agent/context.py",
          functionName: "build_context()",
          line: 45,
          signature: "async def build_context(self, session: Session, channel: str, chat_id: str) -> Context",
          snippet: `async def build_context(self, session, channel, chat_id):
    """构建上下文 - 发送给 LLM 的完整知识包"""
    # 1. 系统提示
    system_prompt = self.config.system_prompt
    
    # 2. 对话历史
    history = session.get_history(
        max_messages=self.memory_window
    )
    messages = [
        {"role": "system", "content": system_prompt}
    ] + history
    
    # 3. 长期记忆（如果启用）
    if self.memory_enabled:
        memories = await self.memory_store.retrieve(
            query=session.last_message,
            limit=5
        )
        if memories:
            system_prompt += "\\n相关记忆：" + memories
    
    # 4. 可用工具
    tools = self.tool_registry.get_tools_for_channel(channel)
    
    # 5. 渠道信息
    channel_info = {
        "channel": channel,
        "chat_id": chat_id,
        "timestamp": datetime.now().isoformat()
    }
    
    return Context(
        messages=messages,
        system_prompt=system_prompt,
        tools=tools,
        channel_info=channel_info
    )`,
          
          explanation: `**上下文五大要素：**
1. 📜 系统提示：定义 AI 角色和行为
2. 💬 对话历史：最近的对话记录
3. 🧠 长期记忆：用户偏好、历史事实
4. 🛠️ 可用工具：天气查询、文件读写等
5. 📊 渠道信息：来源渠道、时间戳

**为什么需要上下文？**
- LLM 是无状态的，每次调用都是独立的
- 上下文让 LLM"记住"之前的对话`,
          
          callStack: [
            { level: 1, method: "_process_message()", file: "agent/loop.py" },
            { level: 2, method: "build_context()", file: "agent/context.py" },
            { level: 3, method: "get_history()", file: "session/manager.py" },
            { level: 4, method: "retrieve()", file: "agent/memory.py" }
          ]
        },
        
        tips: [
          "💡 系统提示是对话的基调",
          "💡 memory_window 控制历史消息数量",
          "💡 记忆检索使用语义相似度",
          "💡 上下文越大，LLM 处理越慢"
        ]
      },
      
      {
        id: 7,
        node: "llm-generate",
        title: "步骤 7: 调用 LLM 生成回复",
        description: "将上下文发送给大语言模型，等待智能回复。",
        icon: "fa-brain",
        color: "#E67E22",
        
        dataFlow: {
          input: {
            // 步骤 6 的 output
            messages: [
              {"role": "system", "content": "你是有帮助的助手"},
              {"role": "user", "content": "你好，请介绍一下你自己"}
            ],
            tools: ["weather", "search", "calc"],
            temperature: 0.7
          },
          output: {
            type: "LLMResponse",
            content: "你好！我是 Nanobot，一个智能助手...",
            tool_calls: [],
            usage: {
              "prompt_tokens": 50,
              "completion_tokens": 100,
              "total_tokens": 150
            }
          },
          transformation: "上下文 → LLM API → AI 回复"
        },
        
        code: {
          file: "nanobot/providers/base.py",
          functionName: "generate()",
          line: 120,
          signature: "async def generate(self, messages: list, tools: list = None, ...) -> LLMResponse",
          snippet: `async def generate(self, messages, tools=None, ...):
    """调用大语言模型生成回复"""
    # 1. 准备请求
    request_body = {
        "model": self.model_name,
        "messages": messages,
        "temperature": self.temperature,
        "max_tokens": self.max_tokens,
    }
    
    if tools:
        request_body["tools"] = tools
        request_body["tool_choice"] = "auto"
    
    # 2. 发送请求
    async with self.http_client.post(
        self.api_endpoint,
        json=request_body,
        headers=self.headers
    ) as response:
        if response.status != 200:
            raise LLMError(f"API error: {response.status}")
        result = await response.json()
    
    # 3. 解析响应
    choice = result["choices"][0]
    message = choice["message"]
    
    return LLMResponse(
        content=message.get("content", ""),
        tool_calls=message.get("tool_calls", []),
        usage=result.get("usage", {})
    )`,
          
          explanation: `**LLM 调用流程：**
1. 📦 准备请求：组装模型、消息、参数
2. 🌐 发送请求：HTTP POST 到 API 端点
3. ⏳ 等待响应：异步等待（几秒到几十秒）
4. 📥 解析响应：提取内容、工具调用、token 使用

**关键参数：**
- temperature：控制创造性（0=确定，1=随机）
- max_tokens：限制回复长度`,
          
          callStack: [
            { level: 1, method: "_process_message()", file: "agent/loop.py" },
            { level: 2, method: "generate()", file: "providers/base.py" },
            { level: 3, method: "http_client.post()", file: "aiohttp/client.py" },
            { level: 4, method: "response.json()", file: "aiohttp/client_reqrep.py" }
          ]
        },
        
        tips: [
          "💡 temperature 越高越有创意但越不可预测",
          "💡 max_tokens 限制输出长度",
          "💡 usage 显示 token 消耗用于计费",
          "💡 使用异步 HTTP 提高性能"
        ]
      },
      
      {
        id: 8,
        node: "send-response",
        title: "步骤 8: 发送响应给用户",
        description: "将 AI 的回复发送回用户，完成一次完整交互。",
        icon: "fa-paper-plane",
        color: "#2ECC71",
        
        dataFlow: {
          input: {
            // 步骤 7 的 output
            type: "LLMResponse",
            content: "你好！我是 Nanobot，一个智能助手...",
            channel: "cli",
            chat_id: "user123"
          },
          output: {
            type: "DisplayedMessage",
            status: "已发送",
            channel: "cli",
            displayed: true
          },
          transformation: "AI 回复 → 出站队列 → 用户界面"
        },
        
        code: {
          file: "nanobot/bus/queue.py",
          functionName: "publish_outbound()",
          line: 112,
          signature: "async def publish_outbound(self, message: OutboundMessage) -> None",
          snippet: `async def publish_outbound(self, message):
    """发布出站消息 - 消息离开系统的出口"""
    # 放入出站队列
    await self.outbound_queue.put(message)
    
    logger.info(f"Published outbound: {message.content[:50]}...")
    
    # 根据渠道分发
    if message.channel == "cli":
        print(f"🤖 AI: {message.content}")
    elif message.channel == "telegram":
        await self.telegram_bot.send_message(
            chat_id=message.chat_id,
            text=message.content
        )
    elif message.channel == "discord":
        await self.discord_client.send_message(
            channel_id=message.chat_id,
            content=message.content
        )`,
          
          explanation: `**发送响应步骤：**
1. 📬 放入出站队列：保证顺序发送
2. 📝 记录日志：方便调试
3. 🎯 渠道分发：根据 channel 选择发送方式
   - CLI：打印到控制台
   - Telegram：调用 Bot API
   - Discord：调用 Discord API

**为什么使用队列？**
- ✅ 解耦、缓冲、顺序、可靠

**🎉 一次完整交互结束！**`,
          
          callStack: [
            { level: 1, method: "_dispatch()", file: "agent/loop.py" },
            { level: 2, method: "publish_outbound()", file: "bus/queue.py" },
            { level: 3, method: "queue.put()", file: "asyncio/queues.py" },
            { level: 4, method: "send_message()", file: "channels/telegram.py" }
          ]
        },
        
        tips: [
          "💡 OutboundMessage 与 InboundMessage 结构类似",
          "💡 渠道分发使用策略模式，易于扩展",
          "💡 队列保证消息顺序发送",
          "💡 一次完整交互结束"
        ]
      }
    ],
    
    // 流程图节点定义（横向排列，支持换行和分支）
    flowNodes: [
      // 第一行：主流程
      { id: "user-input", label: "用户输入", icon: "fa-comment-dots", x: 50, y: 80 },
      { id: "message-bus", label: "消息总线", icon: "fa-bus", x: 250, y: 80 },
      { id: "agent-loop", label: "AgentLoop", icon: "fa-heartbeat", x: 450, y: 80 },
      { id: "dispatch", label: "分发", icon: "fa-random", x: 650, y: 80 },
      
      // 第二行：处理流程（分支）
      { id: "process-message", label: "消息处理", icon: "fa-magic", x: 850, y: 80 },
      { id: "build-context", label: "构建上下文", icon: "fa-box-open", x: 850, y: 200 },
      { id: "llm-generate", label: "LLM 生成", icon: "fa-brain", x: 850, y: 320 },
      
      // 第三行：返回流程
      { id: "send-response", label: "发送响应", icon: "fa-paper-plane", x: 650, y: 320 }
    ],
    
    // 流程图连线（支持分支）
    flowEdges: [
      // 主流程：从左到右
      { from: "user-input", to: "message-bus" },
      { from: "message-bus", to: "agent-loop" },
      { from: "agent-loop", to: "dispatch" },
      { from: "dispatch", to: "process-message" },
      
      // 分支流程：向下
      { from: "process-message", to: "build-context" },
      { from: "build-context", to: "llm-generate" },
      
      // 返回流程：向左
      { from: "llm-generate", to: "send-response" },
      { from: "send-response", to: "message-bus", style: "dashed", label: "返回" }
    ]
  },
  
  // ========== 场景 2：工具调用流程 ==========
  scenario2: {
    id: "scenario2",
    title: "🔧 工具调用流程",
    subtitle: "AI 如何使用外部工具完成任务",
    description: "当 AI 需要查询天气、搜索信息或执行计算时，会调用外部工具。这个场景展示了工具调用的完整流程。",
    
    globalContext: {
      initialInput: {
        type: "UserInput",
        content: "北京今天天气怎么样？",
        channel: "cli",
        chat_id: "user123"
      }
    },
    
    steps: [
      {
        id: 1,
        node: "user-input",
        title: "步骤 1: 用户询问天气",
        description: "用户提出了一个需要外部数据的问题。",
        icon: "fa-comment-dots",
        color: "#4A90E2",
        
        dataFlow: {
          input: { source: "用户", content: "北京今天天气怎么样？" },
          output: { type: "InboundMessage", content: "北京今天天气怎么样？", channel: "cli" },
          transformation: "用户问题 → 入站消息"
        },
        
        code: {
          file: "nanobot/bus/queue.py",
          functionName: "publish_inbound()",
          line: 45,
          snippet: `async def publish_inbound(self, content: str, channel: str, chat_id: str, metadata: dict = None):
    msg = InboundMessage(
        content=content,
        channel=channel,
        chat_id=chat_id,
        metadata=metadata or {}
    )
    await self.inbound_queue.put(msg)`,
          explanation: "**将用户问题包装成消息对象，放入队列等待处理。**",
          callStack: [
            { level: 1, method: "用户输入", file: "CLI" },
            { level: 2, method: "publish_inbound()", file: "bus/queue.py" }
          ]
        },
        
        tips: ["💡 这是一个需要外部数据的问题", "💡 AI 本身不知道实时天气"]
      },
      
      {
        id: 2,
        node: "message-bus",
        title: "步骤 2: 消息传递",
        description: "消息通过消息总线传递给 Agent。",
        icon: "fa-bus",
        color: "#F5A623",
        
        dataFlow: {
          input: { type: "InboundMessage", content: "北京今天天气怎么样？" },
          output: { type: "InboundMessage", content: "北京今天天气怎么样？" },
          transformation: "消息队列传递"
        },
        
        code: {
          file: "nanobot/bus/manager.py",
          functionName: "start()",
          line: 78,
          snippet: `async def start(self):
    """启动消息总线"""
    self.running = True
    
    # 启动入站消息处理
    self.inbound_task = asyncio.create_task(self._process_inbound())
    
    # 启动出站消息处理
    self.outbound_task = asyncio.create_task(self._process_outbound())
    
    logger.info("Message bus started")`,
          explanation: "**消息总线持续监听队列，收到消息后触发处理流程。**",
          callStack: [
            { level: 1, method: "start()", file: "bus/manager.py" },
            { level: 2, method: "_process_inbound()", file: "bus/manager.py" }
          ]
        },
        
        tips: ["💡 消息总线是异步的", "💡 使用 asyncio.Task 并发处理"]
      },
      
      {
        id: 3,
        node: "agent-loop",
        title: "步骤 3: Agent 分析问题",
        description: "Agent 分析用户问题，识别出需要调用天气工具。",
        icon: "fa-heartbeat",
        color: "#E02454",
        
        dataFlow: {
          input: { type: "InboundMessage", content: "北京今天天气怎么样？" },
          output: { type: "SessionContext", has_tool_call: true, tool_name: "weather" },
          transformation: "识别工具调用需求"
        },
        
        code: {
          file: "nanobot/agent/loop.py",
          functionName: "run()",
          line: 156,
          snippet: `async def run(self, input_message: InboundMessage) -> OutboundMessage:
    """运行 Agent 处理循环"""
    session = await self.session_manager.get_session(input_message.chat_id)
    
    # 构建上下文
    context = await self._build_context(session, input_message)
    
    # LLM 生成响应
    response = await self.llm.generate(context)
    
    # 检查是否需要调用工具
    if response.tool_calls:
        tool_result = await self._execute_tool(response.tool_calls[0])
        # 使用工具结果再次生成
        return await self._generate_with_tool_result(session, tool_result)
    
    return OutboundMessage(content=response.content)`,
          explanation: "**Agent 检测到需要调用天气工具，准备执行工具调用。**",
          callStack: [
            { level: 1, method: "run()", file: "agent/loop.py" },
            { level: 2, method: "_build_context()", file: "agent/loop.py" },
            { level: 3, method: "llm.generate()", file: "llm/client.py" }
          ]
        },
        
        tips: ["💡 LLM 决定是否需要工具", "💡 tool_calls 包含工具信息"]
      },
      
      {
        id: 4,
        node: "dispatch",
        title: "步骤 4: 分发到工具处理器",
        description: "系统识别到工具调用请求，分发到对应的工具处理器。",
        icon: "fa-random",
        color: "#17BF63",
        
        dataFlow: {
          input: { type: "LLMResponse", tool_calls: [{name: "weather", args: {city: "北京"}}] },
          output: { type: "ToolRequest", tool_name: "weather", args: {city: "北京"} },
          transformation: "工具调用分发"
        },
        
        code: {
          file: "nanobot/agent/loop.py",
          functionName: "_execute_tool()",
          line: 189,
          snippet: `async def _execute_tool(self, tool_call: ToolCall) -> Any:
    """执行工具调用"""
    tool_name = tool_call.name
    args = tool_call.arguments
    
    # 获取工具实例
    tool = self.tool_registry.get_tool(tool_name)
    if not tool:
        raise ValueError(f"Tool not found: {tool_name}")
    
    # 执行工具
    logger.info(f"Executing tool: {tool_name} with args: {args}")
    result = await tool.execute(**args)
    
    return result`,
          explanation: "**从工具注册表获取天气工具实例，并执行调用。**",
          callStack: [
            { level: 1, method: "_execute_tool()", file: "agent/loop.py" },
            { level: 2, method: "get_tool()", file: "tools/registry.py" },
            { level: 3, method: "tool.execute()", file: "tools/weather.py" }
          ]
        },
        
        tips: ["💡 工具注册表管理所有工具", "💡 工具异步执行"]
      },
      
      {
        id: 5,
        node: "process-message",
        title: "步骤 5: 执行天气工具",
        description: "天气工具调用外部 API 获取天气数据。",
        icon: "fa-magic",
        color: "#D0021B",
        
        dataFlow: {
          input: { type: "ToolRequest", tool_name: "weather", args: {city: "北京"} },
          output: { type: "ToolResult", data: {temp: "25°C", condition: "晴", humidity: "60%"} },
          transformation: "调用天气 API"
        },
        
        code: {
          file: "nanobot/tools/weather.py",
          functionName: "execute()",
          line: 23,
          snippet: `class WeatherTool(BaseTool):
    """天气查询工具"""
    
    async def execute(self, city: str) -> dict:
        """执行天气查询"""
        # 调用天气 API
        api_key = os.getenv("WEATHER_API_KEY")
        url = f"https://api.weather.com/v3/w/conditions?city={city}&apiKey={api_key}"
        
        async with aiohttp.ClientSession() as session:
            async with session.get(url) as response:
                data = await response.json()
        
        return {
            "temperature": data["temperature"],
            "condition": data["condition"],
            "humidity": data["humidity"]
        }`,
          explanation: "**调用第三方天气 API，获取实时天气数据。**",
          callStack: [
            { level: 1, method: "execute()", file: "tools/weather.py" },
            { level: 2, method: "session.get()", file: "aiohttp" },
            { level: 3, method: "response.json()", file: "aiohttp" }
          ]
        },
        
        tips: ["💡 使用 aiohttp 异步 HTTP 请求", "💡 API Key 从环境变量读取"]
      },
      
      {
        id: 6,
        node: "build-context",
        title: "步骤 6: 整合工具结果",
        description: "将工具返回的结果整合到对话上下文中。",
        icon: "fa-box-open",
        color: "#9013FE",
        
        dataFlow: {
          input: { type: "ToolResult", data: {temp: "25°C", condition: "晴"} },
          output: { type: "SessionContext", tool_result_included: true },
          transformation: "工具结果 → 上下文"
        },
        
        code: {
          file: "nanobot/agent/loop.py",
          functionName: "_generate_with_tool_result()",
          line: 210,
          snippet: `async def _generate_with_tool_result(self, session: Session, tool_result: Any) -> OutboundMessage:
    """使用工具结果生成最终回复"""
    # 构建包含工具结果的上下文
    context = await self._build_context(session)
    
    # 添加工具结果到系统消息
    system_msg = f"工具查询结果：{tool_result}"
    context.messages.append(Message(role="system", content=system_msg))
    
    # 再次调用 LLM 生成自然语言回复
    response = await self.llm.generate(context)
    
    return OutboundMessage(content=response.content)`,
          explanation: "**将天气数据添加到上下文，让 LLM 生成自然语言回复。**",
          callStack: [
            { level: 1, method: "_generate_with_tool_result()", file: "agent/loop.py" },
            { level: 2, method: "_build_context()", file: "agent/loop.py" },
            { level: 3, method: "llm.generate()", file: "llm/client.py" }
          ]
        },
        
        tips: ["💡 工具结果作为系统消息", "💡 LLM 将数据转换为自然语言"]
      },
      
      {
        id: 7,
        node: "llm-generate",
        title: "步骤 7: LLM 生成回复",
        description: "LLM 根据天气数据生成友好的回复。",
        icon: "fa-brain",
        color: "#4175E2",
        
        dataFlow: {
          input: { type: "SessionContext", tool_result: {temp: "25°C", condition: "晴"} },
          output: { type: "LLMResponse", content: "北京今天天气晴朗，气温 25°C，湿度 60%，非常适合外出活动！" },
          transformation: "数据 → 自然语言"
        },
        
        code: {
          file: "nanobot/llm/client.py",
          functionName: "generate()",
          line: 89,
          snippet: `async def generate(self, context: SessionContext) -> LLMResponse:
    """调用 LLM 生成回复"""
    # 构建 API 请求
    messages = context.messages
    model = self.config.model
    temperature = self.config.temperature
    
    # 调用 LLM API
    response = await self._call_llm_api(
        model=model,
        messages=messages,
        temperature=temperature
    )
    
    # 解析响应
    content = response.choices[0].message.content
    
    return LLMResponse(content=content)`,
          explanation: "**LLM 根据天气数据生成友好的自然语言回复。**",
          callStack: [
            { level: 1, method: "generate()", file: "llm/client.py" },
            { level: 2, method: "_call_llm_api()", file: "llm/client.py" },
            { level: 3, method: "openai.ChatCompletion.create()", file: "openai" }
          ]
        },
        
        tips: ["💡 LLM 将结构化数据转为自然语言", "💡 temperature 控制创造性"]
      },
      
      {
        id: 8,
        node: "send-response",
        title: "步骤 8: 发送天气回复",
        description: "将生成的天气回复发送给用户。",
        icon: "fa-paper-plane",
        color: "#50E3C2",
        
        dataFlow: {
          input: { type: "OutboundMessage", content: "北京今天天气晴朗，气温 25°C..." },
          output: { type: "UserReceived", channel: "cli", displayed: true },
          transformation: "发送响应到用户"
        },
        
        code: {
          file: "nanobot/bus/queue.py",
          functionName: "publish_outbound()",
          line: 98,
          snippet: `async def publish_outbound(self, message: OutboundMessage):
    """发布出站消息"""
    await self.outbound_queue.put(message)
    
    # 根据渠道分发
    if message.channel == "cli":
        print(f"🤖 AI: {message.content}")
    elif message.channel == "telegram":
        await self.telegram_bot.send_message(
            chat_id=message.chat_id,
            text=message.content
        )`,
          explanation: "**将天气回复通过原始渠道发送给用户。**",
          callStack: [
            { level: 1, method: "publish_outbound()", file: "bus/queue.py" },
            { level: 2, method: "queue.put()", file: "asyncio/queues.py" },
            { level: 3, method: "send_message()", file: "channels/telegram.py" }
          ]
        },
        
        tips: ["💡 工具调用完成", "💡 用户体验到智能查询"]
      }
    ],
    
    flowNodes: [
      { id: "user-input", label: "用户询问", icon: "fa-comment-dots", x: 50, y: 80 },
      { id: "message-bus", label: "消息总线", icon: "fa-bus", x: 250, y: 80 },
      { id: "agent-loop", label: "Agent 分析", icon: "fa-heartbeat", x: 450, y: 80 },
      { id: "dispatch", label: "工具分发", icon: "fa-random", x: 650, y: 80 },
      { id: "process-message", label: "执行工具", icon: "fa-magic", x: 850, y: 80 },
      { id: "build-context", label: "整合结果", icon: "fa-box-open", x: 850, y: 200 },
      { id: "llm-generate", label: "生成回复", icon: "fa-brain", x: 850, y: 320 },
      { id: "send-response", label: "发送回复", icon: "fa-paper-plane", x: 650, y: 320 }
    ],
    
    flowEdges: [
      { from: "user-input", to: "message-bus" },
      { from: "message-bus", to: "agent-loop" },
      { from: "agent-loop", to: "dispatch" },
      { from: "dispatch", to: "process-message" },
      { from: "process-message", to: "build-context" },
      { from: "build-context", to: "llm-generate" },
      { from: "llm-generate", to: "send-response" },
      { from: "send-response", to: "message-bus", style: "dashed", label: "返回" }
    ]
  },
  
  // ========== 场景 3：多轮对话流程 ==========
  scenario3: {
    id: "scenario3",
    title: "💬 多轮对话流程",
    subtitle: "Session 如何维护对话历史",
    description: "多轮对话需要记住之前的对话内容。这个场景展示了 Session 如何管理对话历史，让 AI 理解上下文。",
    
    globalContext: {
      conversationHistory: [
        { role: "user", content: "我想学习 Python" },
        { role: "assistant", content: "太好了！Python 是一门非常优秀的编程语言..." },
        { role: "user", content: "它有什么特点？" }
      ]
    },
    
    steps: [
      {
        id: 1,
        node: "user-input",
        title: "步骤 1: 用户追问",
        description: "用户在之前对话的基础上继续提问。",
        icon: "fa-comment-dots",
        color: "#4A90E2",
        
        dataFlow: {
          input: { source: "用户", content: "它有什么特点？" },
          output: { type: "InboundMessage", content: "它有什么特点？", chat_id: "user123" },
          transformation: "用户追问 → 入站消息"
        },
        
        code: {
          file: "nanobot/bus/queue.py",
          functionName: "publish_inbound()",
          line: 45,
          snippet: `async def publish_inbound(self, content: str, channel: str, chat_id: str, metadata: dict = None):
    msg = InboundMessage(
        content=content,
        channel=channel,
        chat_id=chat_id,
        metadata=metadata or {}
    )
    await self.inbound_queue.put(msg)`,
          explanation: "**接收用户的追问，这个追问需要结合之前的对话理解。**",
          callStack: [
            { level: 1, method: "用户输入", file: "CLI" },
            { level: 2, method: "publish_inbound()", file: "bus/queue.py" }
          ]
        },
        
        tips: ["💡 '它'指代 Python，需要上下文", "💡 这是第三轮对话"]
      },
      
      {
        id: 2,
        node: "message-bus",
        title: "步骤 2: 消息传递",
        description: "消息通过消息总线传递。",
        icon: "fa-bus",
        color: "#F5A623",
        
        dataFlow: {
          input: { type: "InboundMessage", content: "它有什么特点？" },
          output: { type: "InboundMessage", content: "它有什么特点？" },
          transformation: "消息队列传递"
        },
        
        code: {
          file: "nanobot/bus/manager.py",
          functionName: "_process_inbound()",
          line: 92,
          snippet: `async def _process_inbound(self):
    """处理入站消息"""
    while self.running:
        try:
            # 从队列获取消息
            msg = await self.inbound_queue.get()
            
            # 获取会话
            session = await self.session_manager.get_session(msg.chat_id)
            
            # 添加到会话历史
            session.add_message(Message(role="user", content=msg.content))
            
            # 触发 Agent 处理
            await self.agent_loop.run(msg)
            
        except Exception as e:
            logger.error(f"Error processing inbound: {e}")`,
          explanation: "**关键：将新消息添加到会话历史中！**",
          callStack: [
            { level: 1, method: "_process_inbound()", file: "bus/manager.py" },
            { level: 2, method: "get_session()", file: "session/manager.py" },
            { level: 3, method: "session.add_message()", file: "session/session.py" }
          ]
        },
        
        tips: ["💡 消息自动添加到历史", "💡 session 对象维护状态"]
      },
      
      {
        id: 3,
        node: "agent-loop",
        title: "步骤 3: 获取会话历史",
        description: "Agent 获取完整的对话历史，理解上下文。",
        icon: "fa-heartbeat",
        color: "#E02454",
        
        dataFlow: {
          input: { type: "InboundMessage", content: "它有什么特点？" },
          output: { type: "Session", history_length: 4, includes_context: true },
          transformation: "获取会话 + 历史"
        },
        
        code: {
          file: "nanobot/session/manager.py",
          functionName: "get_session()",
          line: 34,
          snippet: `async def get_session(self, chat_id: str) -> Session:
    """获取或创建会话"""
    # 检查缓存
    if chat_id in self.sessions:
        session = self.sessions[chat_id]
        logger.debug(f"Retrieved existing session: {chat_id}")
    else:
        # 创建新会话
        session = Session(
            chat_id=chat_id,
            created_at=datetime.now(),
            messages=[]
        )
        self.sessions[chat_id] = session
        logger.info(f"Created new session: {chat_id}")
    
    return session`,
          explanation: "**从缓存中获取会话对象，包含所有历史消息。**",
          callStack: [
            { level: 1, method: "get_session()", file: "session/manager.py" },
            { level: 2, method: "Session()", file: "session/session.py" }
          ]
        },
        
        tips: ["💡 使用字典缓存会话", "💡 chat_id 作为唯一标识"]
      },
      
      {
        id: 4,
        node: "dispatch",
        title: "步骤 4: 构建完整上下文",
        description: "将所有历史消息构建成 LLM 可理解的上下文。",
        icon: "fa-random",
        color: "#17BF63",
        
        dataFlow: {
          input: { 
            type: "Session", 
            history: [
              {role: "system", content: "You are a helpful assistant."},
              {role: "user", content: "你好"},
              {role: "assistant", content: "你好！有什么可以帮助你的吗？"},
              {role: "user", content: "今天天气怎么样？"}
            ] 
          },
          output: { 
            type: "SessionContext", 
            messages: [
              {role: "system", content: "You are a helpful assistant."},
              {role: "user", content: "你好"},
              {role: "assistant", content: "你好！有什么可以帮助你的吗？"},
              {role: "user", content: "今天天气怎么样？"}
            ] 
          },
          transformation: "会话 → LLM 上下文"
        },
        
        code: {
          file: "nanobot/agent/loop.py",
          functionName: "_build_context()",
          line: 134,
          snippet: `async def _build_context(self, session: Session, new_message: InboundMessage = None) -> SessionContext:
    """构建会话上下文"""
    # 系统提示词
    system_prompt = self.config.system_prompt or "You are a helpful assistant."
    
    # 历史消息
    context_messages = [
        Message(role="system", content=system_prompt)
    ]
    
    # 添加历史对话（限制最近 N 轮）
    max_history = self.config.max_history_length
    recent_messages = session.messages[-max_history*2:] if max_history else session.messages
    
    context_messages.extend(recent_messages)
    
    # 添加新消息
    if new_message:
        context_messages.append(Message(role="user", content=new_message.content))
    
    return SessionContext(messages=context_messages)`,
          explanation: "**将系统提示词 + 历史对话 + 新消息组合成完整上下文。**",
          callStack: [
            { level: 1, method: "_build_context()", file: "agent/loop.py" },
            { level: 2, method: "Session.messages", file: "session/session.py" }
          ]
        },
        
        tips: ["💡 限制历史长度避免超长", "💡 系统提示词始终在第一轮"]
      },
      
      {
        id: 5,
        node: "process-message",
        title: "步骤 5: 上下文包含历史",
        description: "LLM 收到的上下文包含完整的对话历史。",
        icon: "fa-magic",
        color: "#D0021B",
        
        dataFlow: {
          input: { 
            type: "SessionContext", 
            messages: [
              {role: "system", content: "You are a helpful assistant."},
              {role: "user", content: "你好"},
              {role: "assistant", content: "你好！有什么可以帮助你的吗？"},
              {role: "user", content: "今天天气怎么样？"}
            ] 
          },
          output: { type: "LLMRequest", context_ready: true },
          transformation: "上下文准备完成"
        },
        
        code: {
          file: "nanobot/agent/loop.py",
          functionName: "run()",
          line: 156,
          snippet: `async def run(self, input_message: InboundMessage) -> OutboundMessage:
    """运行 Agent 处理循环"""
    # 获取会话
    session = await self.session_manager.get_session(input_message.chat_id)
    
    # 构建包含历史的上下文
    context = await self._build_context(session, input_message)
    
    # 此时 context.messages 包含：
    # 1. system: "You are a helpful assistant."
    # 2. user: "我想学习 Python"
    # 3. assistant: "太好了！Python 是一门..."
    # 4. user: "它有什么特点？"
    
    logger.info(f"Context built with {len(context.messages)} messages")
    
    # LLM 生成回复
    response = await self.llm.generate(context)
    
    return OutboundMessage(content=response.content)`,
          explanation: "**LLM 能看到完整对话历史，理解'它'指代 Python。**",
          callStack: [
            { level: 1, method: "run()", file: "agent/loop.py" },
            { level: 2, method: "_build_context()", file: "agent/loop.py" },
            { level: 3, method: "llm.generate()", file: "llm/client.py" }
          ]
        },
        
        tips: ["💡 LLM 基于历史理解上下文", "💡 '它'的指代关系清晰"]
      },
      
      {
        id: 6,
        node: "build-context",
        title: "步骤 6: LLM 理解上下文",
        description: "LLM 根据历史对话理解用户问题。",
        icon: "fa-box-open",
        color: "#9013FE",
        
        dataFlow: {
          input: { type: "LLMRequest", messages: "system+user1+asst1+user2", user_question: "它有什么特点？" },
          output: { type: "LLMUnderstanding", understands: "Python 的特点" },
          transformation: "上下文理解"
        },
        
        code: {
          file: "nanobot/llm/client.py",
          functionName: "generate()",
          line: 89,
          snippet: `async def generate(self, context: SessionContext) -> LLMResponse:
    """LLM 基于上下文生成回复"""
    # 调用 LLM API
    response = await self._call_llm_api(
        model=self.config.model,
        messages=context.messages,  # 包含历史
        temperature=self.config.temperature
    )
    
    # LLM 会分析所有消息，理解上下文
    # 识别出"它"指的是 Python
    # 生成关于 Python 特点的回复
    
    content = response.choices[0].message.content
    
    return LLMResponse(content=content)`,
          explanation: "**LLM 分析完整对话，理解'它'=Python，生成针对性回复。**",
          callStack: [
            { level: 1, method: "generate()", file: "llm/client.py" },
            { level: 2, method: "_call_llm_api()", file: "llm/client.py" }
          ]
        },
        
        tips: ["💡 LLM 的注意力机制理解指代", "💡 历史越完整，理解越准确"]
      },
      
      {
        id: 7,
        node: "llm-generate",
        title: "步骤 7: 生成针对性回复",
        description: "LLM 生成关于 Python 特点的详细回复。",
        icon: "fa-brain",
        color: "#4175E2",
        
        dataFlow: {
          input: { type: "LLMUnderstanding", topic: "Python 特点" },
          output: { type: "LLMResponse", content: "Python 有以下特点：1. 简洁易读..." },
          transformation: "理解 → 生成"
        },
        
        code: {
          file: "nanobot/llm/client.py",
          functionName: "generate()",
          line: 102,
          snippet: `# LLM 生成的回复示例：
response_content = """
Python 有以下主要特点：

1. **简洁易读**：语法清晰，接近自然语言
2. **跨平台**：可在 Windows、Mac、Linux 上运行
3. **丰富的库**：标准库和第三方库非常完善
4. **动态类型**：无需声明变量类型
5. **解释执行**：代码直接运行，无需编译
6. **面向对象**：支持类和对象
7. **可扩展**：可调用 C/C++ 代码

你想从哪个方面开始学习？"""`,
          explanation: "**基于上下文的完整回复，直接回答'它有什么特点'。**",
          callStack: [
            { level: 1, method: "LLM 内部处理", file: "openai/gpt" }
          ]
        },
        
        tips: ["💡 回复直接针对问题", "💡 不需要用户重复 Python"]
      },
      
      {
        id: 8,
        node: "send-response",
        title: "步骤 8: 发送回复并保存历史",
        description: "发送回复给用户，同时将新对话保存到历史。",
        icon: "fa-paper-plane",
        color: "#50E3C2",
        
        dataFlow: {
          input: { type: "OutboundMessage", content: "Python 有以下特点：..." },
          output: { type: "UserReceived", session_updated: true, history_length: 6 },
          transformation: "发送 + 保存历史"
        },
        
        code: {
          file: "nanobot/bus/manager.py",
          functionName: "_process_outbound()",
          line: 115,
          snippet: `async def _process_outbound(self):
    """处理出站消息"""
    while self.running:
        try:
            # 从队列获取消息
            msg = await self.outbound_queue.get()
            
            # 获取会话
            session = await self.session_manager.get_session(msg.chat_id)
            
            # 添加 AI 回复到历史
            session.add_message(Message(role="assistant", content=msg.content))
            
            # 发送给用户
            if msg.channel == "cli":
                print(f"🤖 AI: {msg.content}")
            
        except Exception as e:
            logger.error(f"Error processing outbound: {e}")`,
          explanation: "**关键：将 AI 回复也保存到历史，为下一轮对话做准备。**",
          callStack: [
            { level: 1, method: "_process_outbound()", file: "bus/manager.py" },
            { level: 2, method: "session.add_message()", file: "session/session.py" },
            { level: 3, method: "print()", file: "builtin" }
          ]
        },
        
        tips: ["💡 双向保存：用户消息+AI 回复", "💡 历史持续增长", "💡 下一轮对话已准备好"]
      }
    ],
    
    flowNodes: [
      { id: "user-input", label: "用户追问", icon: "fa-comment-dots", x: 50, y: 80 },
      { id: "message-bus", label: "消息总线", icon: "fa-bus", x: 250, y: 80 },
      { id: "agent-loop", label: "获取会话", icon: "fa-heartbeat", x: 450, y: 80 },
      { id: "dispatch", label: "构建上下文", icon: "fa-random", x: 650, y: 80 },
      { id: "process-message", label: "包含历史", icon: "fa-magic", x: 850, y: 80 },
      { id: "build-context", label: "LLM 理解", icon: "fa-box-open", x: 850, y: 200 },
      { id: "llm-generate", label: "生成回复", icon: "fa-brain", x: 850, y: 320 },
      { id: "send-response", label: "保存历史", icon: "fa-paper-plane", x: 650, y: 320 }
    ],
    
    flowEdges: [
      { from: "user-input", to: "message-bus" },
      { from: "message-bus", to: "agent-loop" },
      { from: "agent-loop", to: "dispatch" },
      { from: "dispatch", to: "process-message" },
      { from: "process-message", to: "build-context" },
      { from: "build-context", to: "llm-generate" },
      { from: "llm-generate", to: "send-response" },
      { from: "send-response", to: "message-bus", style: "dashed", label: "返回" }
    ]
  },
  
  // ========== 场景 4：错误处理流程 ==========
  scenario4: {
    id: "scenario4",
    title: "⚠️ 错误处理流程",
    subtitle: "系统如何应对异常情况",
    description: "当 LLM API 失败、工具调用出错或网络异常时，系统如何优雅地处理错误并恢复。",
    
    globalContext: {
      initialInput: {
        type: "UserInput",
        content: "帮我计算 100 除以 0",
        channel: "cli",
        chat_id: "user123"
      },
      errorScenario: "tool_execution_error"
    },
    
    steps: [
      {
        id: 1,
        node: "user-input",
        title: "步骤 1: 用户提出危险请求",
        description: "用户请求了一个会导致错误的操作。",
        icon: "fa-comment-dots",
        color: "#4A90E2",
        
        dataFlow: {
          input: { source: "用户", content: "帮我计算 100 除以 0" },
          output: { type: "InboundMessage", content: "帮我计算 100 除以 0" },
          transformation: "危险请求 → 入站消息"
        },
        
        code: {
          file: "nanobot/bus/queue.py",
          functionName: "publish_inbound()",
          line: 45,
          snippet: `async def publish_inbound(self, content: str, channel: str, chat_id: str, metadata: dict = None):
    msg = InboundMessage(
        content=content,
        channel=channel,
        chat_id=chat_id,
        metadata=metadata or {}
    )
    await self.inbound_queue.put(msg)`,
          explanation: "**接收用户请求，系统还不知道这是一个危险操作。**",
          callStack: [
            { level: 1, method: "用户输入", file: "CLI" },
            { level: 2, method: "publish_inbound()", file: "bus/queue.py" }
          ]
        },
        
        tips: ["💡 除以 0 会触发异常", "💡 测试错误处理机制"]
      },
      
      {
        id: 2,
        node: "message-bus",
        title: "步骤 2: 消息传递",
        description: "消息正常传递。",
        icon: "fa-bus",
        color: "#F5A623",
        
        dataFlow: {
          input: { type: "InboundMessage", content: "帮我计算 100 除以 0" },
          output: { type: "InboundMessage", content: "帮我计算 100 除以 0" },
          transformation: "消息队列传递"
        },
        
        code: {
          file: "nanobot/bus/manager.py",
          functionName: "_process_inbound()",
          line: 92,
          snippet: `async def _process_inbound(self):
    while self.running:
        msg = await self.inbound_queue.get()
        session = await self.session_manager.get_session(msg.chat_id)
        session.add_message(Message(role="user", content=msg.content))
        await self.agent_loop.run(msg)`,
          explanation: "**消息正常传递，进入 Agent 处理流程。**",
          callStack: [
            { level: 1, method: "_process_inbound()", file: "bus/manager.py" }
          ]
        },
        
        tips: ["💡 消息总线不关心内容", "💡 错误处理在下游"]
      },
      
      {
        id: 3,
        node: "agent-loop",
        title: "步骤 3: Agent 决定调用计算器工具",
        description: "Agent 识别出需要调用计算工具。",
        icon: "fa-heartbeat",
        color: "#E02454",
        
        dataFlow: {
          input: { type: "InboundMessage", content: "帮我计算 100 除以 0" },
          output: { type: "ToolCall", tool_name: "calculator", operation: "divide", args: {a: 100, b: 0} },
          transformation: "识别计算需求"
        },
        
        code: {
          file: "nanobot/agent/loop.py",
          functionName: "run()",
          line: 167,
          snippet: `async def run(self, input_message: InboundMessage) -> OutboundMessage:
    session = await self.session_manager.get_session(input_message.chat_id)
    context = await self._build_context(session, input_message)
    response = await self.llm.generate(context)
    
    # 检查是否需要调用工具
    if response.tool_calls:
        try:
            tool_result = await self._execute_tool(response.tool_calls[0])
            return await self._generate_with_tool_result(session, tool_result)
        except Exception as e:
            # 捕获工具执行错误
            logger.error(f"Tool execution failed: {e}")
            return await self._handle_tool_error(session, e)
    
    return OutboundMessage(content=response.content)`,
          explanation: "**Agent 决定调用计算器工具，执行除法运算。**",
          callStack: [
            { level: 1, method: "run()", file: "agent/loop.py" },
            { level: 2, method: "llm.generate()", file: "llm/client.py" },
            { level: 3, method: "_execute_tool()", file: "agent/loop.py" }
          ]
        },
        
        tips: ["💡 try-except 捕获异常", "💡 准备错误处理"]
      },
      
      {
        id: 4,
        node: "dispatch",
        title: "步骤 4: 调用计算器工具",
        description: "执行除法运算，触发除以 0 错误。",
        icon: "fa-random",
        color: "#17BF63",
        
        dataFlow: {
          input: { type: "ToolCall", tool_name: "calculator", args: {a: 100, b: 0} },
          output: { type: "Error", error: "ZeroDivisionError: division by zero" },
          transformation: "触发异常"
        },
        
        code: {
          file: "nanobot/tools/calculator.py",
          functionName: "execute()",
          line: 15,
          snippet: `class CalculatorTool(BaseTool):
    """计算器工具"""
    
    async def execute(self, operation: str, a: float, b: float) -> float:
        """执行数学计算"""
        try:
            if operation == "add":
                return a + b
            elif operation == "subtract":
                return a - b
            elif operation == "multiply":
                return a * b
            elif operation == "divide":
                # ⚠️ 这里会触发 ZeroDivisionError
                return a / b
            else:
                raise ValueError(f"Unknown operation: {operation}")
        except Exception as e:
            logger.error(f"Calculation failed: {e}")
            raise`,
          explanation: "**⚠️ 除以 0 触发 ZeroDivisionError 异常！**",
          callStack: [
            { level: 1, method: "execute()", file: "tools/calculator.py" },
            { level: 2, method: "divide", file: "builtin" },
            { level: 3, method: "ZeroDivisionError", file: "builtin" }
          ]
        },
        
        tips: ["⚠️ 除以 0 错误", "💡 异常被抛出"]
      },
      
      {
        id: 5,
        node: "process-message",
        title: "步骤 5: 捕获并处理异常",
        description: "Agent 捕获异常，准备友好的错误提示。",
        icon: "fa-magic",
        color: "#D0021B",
        
        dataFlow: {
          input: { type: "Error", error: "ZeroDivisionError" },
          output: { type: "ErrorHandler", error_message: "无法除以零" },
          transformation: "异常捕获"
        },
        
        code: {
          file: "nanobot/agent/loop.py",
          functionName: "_handle_tool_error()",
          line: 234,
          snippet: `async def _handle_tool_error(self, session: Session, error: Exception) -> OutboundMessage:
    """处理工具执行错误"""
    # 分析错误类型
    if isinstance(error, ZeroDivisionError):
        friendly_msg = "抱歉，无法执行除以零的操作哦！在数学中，除以零是未定义的。"
    elif isinstance(error, ValueError):
        friendly_msg = "抱歉，输入的参数有问题。"
    elif isinstance(error, TimeoutError):
        friendly_msg = "抱歉，工具调用超时了，请稍后再试。"
    else:
        friendly_msg = f"抱歉，执行过程中出现了错误：{str(error)}"
    
    # 记录详细错误日志
    logger.error(f"Tool error details: {error}", exc_info=True)
    
    # 添加错误到会话历史
    session.add_message(Message(role="system", content=f"[Error: {type(error).__name__}]"))
    
    return OutboundMessage(content=friendly_msg)`,
          explanation: "**捕获异常，转换为友好的用户提示。**",
          callStack: [
            { level: 1, method: "_handle_tool_error()", file: "agent/loop.py" },
            { level: 2, method: "isinstance()", file: "builtin" },
            { level: 3, method: "logger.error()", file: "logging" }
          ]
        },
        
        tips: ["💡 友好的错误提示", "💡 详细日志记录", "💡 用户体验优先"]
      },
      
      {
        id: 6,
        node: "build-context",
        title: "步骤 6: 记录错误到历史",
        description: "将错误信息记录到会话历史，便于调试。",
        icon: "fa-box-open",
        color: "#9013FE",
        
        dataFlow: {
          input: { type: "ErrorHandler", error_type: "ZeroDivisionError" },
          output: { type: "SessionContext", error_logged: true },
          transformation: "错误日志记录"
        },
        
        code: {
          file: "nanobot/agent/loop.py",
          functionName: "_handle_tool_error()",
          line: 248,
          snippet: `# 记录错误到会话历史
session.add_message(Message(
    role="system", 
    content=f"[Error: {type(error).__name__}]"
))

# 详细日志
logger.error(
    f"Tool error details: {error}", 
    exc_info=True  # 包含堆栈跟踪
)`,
          explanation: "**将错误信息保存到会话历史，方便后续调试和分析。**",
          callStack: [
            { level: 1, method: "session.add_message()", file: "session/session.py" },
            { level: 2, method: "logger.error()", file: "logging" }
          ]
        },
        
        tips: ["💡 错误也保存到历史", "💡 exc_info=True 包含堆栈"]
      },
      
      {
        id: 7,
        node: "llm-generate",
        title: "步骤 7: 生成友好提示",
        description: "不需要调用 LLM，直接使用预设的友好提示。",
        icon: "fa-brain",
        color: "#4175E2",
        
        dataFlow: {
          input: { type: "ErrorHandler", error_type: "ZeroDivisionError" },
          output: { type: "FriendlyMessage", content: "抱歉，无法执行除以零的操作..." },
          transformation: "错误 → 友好提示"
        },
        
        code: {
          file: "nanobot/agent/loop.py",
          functionName: "_handle_tool_error()",
          line: 237,
          snippet: `# 根据错误类型生成友好提示
if isinstance(error, ZeroDivisionError):
    friendly_msg = "抱歉，无法执行除以零的操作哦！在数学中，除以零是未定义的。"
elif isinstance(error, ValueError):
    friendly_msg = "抱歉，输入的参数有问题。"
elif isinstance(error, TimeoutError):
    friendly_msg = "抱歉，工具调用超时了，请稍后再试。"
else:
    friendly_msg = f"抱歉，执行过程中出现了错误：{str(error)}"

return OutboundMessage(content=friendly_msg)`,
          explanation: "**使用预设的友好提示，不需要再次调用 LLM。**",
          callStack: [
            { level: 1, method: "_handle_tool_error()", file: "agent/loop.py" }
          ]
        },
        
        tips: ["💡 预设错误模板", "💡 快速响应用户"]
      },
      
      {
        id: 8,
        node: "send-response",
        title: "步骤 8: 发送错误提示",
        description: "将友好的错误提示发送给用户。",
        icon: "fa-paper-plane",
        color: "#50E3C2",
        
        dataFlow: {
          input: { type: "OutboundMessage", content: "抱歉，无法执行除以零的操作..." },
          output: { type: "UserReceived", error_handled: true },
          transformation: "发送错误提示"
        },
        
        code: {
          file: "nanobot/bus/queue.py",
          functionName: "publish_outbound()",
          line: 98,
          snippet: `async def publish_outbound(self, message: OutboundMessage):
    """发布出站消息（包含错误提示）"""
    await self.outbound_queue.put(message)
    
    # 发送给用户
    if message.channel == "cli":
        print(f"🤖 AI: {message.content}")
        # 输出：🤖 AI: 抱歉，无法执行除以零的操作哦！
    elif message.channel == "telegram":
        await self.telegram_bot.send_message(
            chat_id=message.chat_id,
            text=message.content
        )`,
          explanation: "**将友好的错误提示发送给用户，完成错误处理。**",
          callStack: [
            { level: 1, method: "publish_outbound()", file: "bus/queue.py" },
            { level: 2, method: "print()", file: "builtin" }
          ]
        },
        
        tips: ["💡 错误处理完成", "💡 用户体验良好", "💡 系统继续运行"]
      }
    ],
    
    flowNodes: [
      { id: "user-input", label: "危险请求", icon: "fa-comment-dots", x: 50, y: 80 },
      { id: "message-bus", label: "消息总线", icon: "fa-bus", x: 250, y: 80 },
      { id: "agent-loop", label: "调用工具", icon: "fa-heartbeat", x: 450, y: 80 },
      { id: "dispatch", label: "触发错误", icon: "fa-random", x: 650, y: 80 },
      { id: "process-message", label: "捕获异常", icon: "fa-magic", x: 850, y: 80 },
      { id: "build-context", label: "记录错误", icon: "fa-box-open", x: 850, y: 200 },
      { id: "llm-generate", label: "友好提示", icon: "fa-brain", x: 850, y: 320 },
      { id: "send-response", label: "发送提示", icon: "fa-paper-plane", x: 650, y: 320 }
    ],
    
    flowEdges: [
      { from: "user-input", to: "message-bus" },
      { from: "message-bus", to: "agent-loop" },
      { from: "agent-loop", to: "dispatch" },
      { from: "dispatch", to: "process-message" },
      { from: "process-message", to: "build-context" },
      { from: "build-context", to: "llm-generate" },
      { from: "llm-generate", to: "send-response" },
      { from: "send-response", to: "message-bus", style: "dashed", label: "返回" }
    ]
  }
};

// 导出数据
if (typeof module !== 'undefined' && module.exports) {
  module.exports = demoScenarios;
}
