# Claude Code 技术架构文档 (高精细度)

## 1. 整体架构模型

Claude Code 采用 **Reactor-based Agentic Loop** 架构。系统由一个核心的状态驱动循环（Query Loop）和一组动态装载的外部资源（Tools/MCP）组成。

### 1.1 核心组件
- **Loop Controller (`query.ts`)**: 驱动 LLM 采样、状态转移和错误恢复。
- **Concurrency Manager (`StreamingToolExecutor.ts`)**: 实时调度流式涌现的工具调用，管理并行 I/O。
- **State Store (`AppStateStore.ts`)**: 基于 React Context 的全局状态机，负责同步 UI 与后台执行逻辑。
- **Isolation Container (`AgentTool.tsx`)**: 提供 Worktree 或子进程级别的执行隔离。

## 2. 采样与执行流水线 (The Pipeline)

一次用户请求的完整生命周期遵循以下流水线：

1. **Preprocessing (预处理)**:
    - `attachmentProvider`: 扫描环境变量、Git 状态、CLAUDE.md 等，生成辅助上下文。
    - `CompactionEngine`: 检查消息历史长度，执行 `microcompact`（元数据剪枝）或 `autocompact`（递归摘要）。
2. **Sampling (推理采样)**:
    - 调用 `deps.callModel` 进行流式采样。
    - **Reactive Handling**: 推理过程中若检测到 `max_output_tokens` 限制，立即停止并注入 `Continue` 指令。
3. **Dispatching (分发执行)**:
    - 工具调用块（`tool_use`）被推入 `StreamingToolExecutor`。
    - `PermissionGate`: 根据权限模式（auto/bypass/manual）阻断或通过请求。
    - `ExecutionUnit`: 启动子进程（Bash）或发送网络请求（MCP/Web）。
4. **Integration (结果整合)**:
    - 工具输出被包装为 `tool_result` 消息，作为下一轮推理的 `user` 输入。

## 3. 多 Agent 协作协议

Claude Code 不使用复杂的图搜索算法进行 Agent 分发，而是采用 **Recursive Tool Selection**。

### 3.1 协调协议 (XML-over-Turn)
- **Coordinator**: 拥有特殊的 `SystemPrompt`，引导其进行任务规划。
- **SendMessage Tool**: 充当 Agent 之间的信箱系统。
- **Task Notification**: 子 Agent 完成任务后，会自动生成一段带有元数据的 XML 摘要，发送回父 Agent 的输入队列，触发父 Agent 的下一轮推理。

### 3.2 隔离等级
- **L1 (Context Isolation)**: 共享目录，但拥有独立的对话历史。
- **L2 (Directory Isolation)**: 通过 `AgentWorktree` 提供独立的 Git 索引和文件副本。
- **L3 (Remote Isolation)**: CCR 远程环境，物理级隔离。

## 4. 扩展性设计

### 4.1 MCP (Model Context Protocol) 深度集成
系统在启动时会批量扫描 `.mcp.json` 配置文件。
- **Dynamic Adapter**: 将任何 MCP 服务器提供的 Schema 动态映射为系统的内部 `Tool` 对象。
- **Elicitation Loop**: 处理 MCP 协议中的“用户反馈请求”，将远程服务器的授权需求无缝嵌入本地 CLI 交互中。

### 4.2 生命周期钩子 (Hooks)
系统定义了 20+ 个关键 Hook 点，例如：
- `session_start`: 初始化环境。
- `pre_tool_use`: 在执行高危 Bash 命令前进行静态代码扫描。
- `post_sampling`: 在模型回复后但在展示给用户前，执行合规性检查。
