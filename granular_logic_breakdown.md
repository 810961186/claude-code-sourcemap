# Claude Code 核心逻辑粒度拆解

本文档深入到函数和状态机级别，详细拆解 Claude Code 的运行逻辑。

## 1. 核心查询循环 (`query.ts` - 状态机)

`query` 循环是一个异步生成器，管理着 Agent 的生命周期状态。

### 1.1 状态转移逻辑
- **初始化状态**: 接收 `messages`, `systemPrompt`, `toolUseContext`。
- **上下文准备 (Context Assembly)**:
    - `applyToolResultBudget`: 强制对工具结果进行 Token 预算限制，超过限制则持久化到磁盘。
    - `microcompact`: 无损压缩，移除不必要的元数据或中间状态。
    - `snipCompact`: 基于历史窗口的裁剪。
    - `autocompact`: 当 Token 接近模型上限时，启动子 Agent 对历史对话进行摘要总结，生成 `SystemCompactBoundaryMessage`。
- **采样阶段 (Sampling)**:
    - `callModel`: 调用大模型，支持流式返回。
    - **错误恢复逻辑**:
        - `ModelFallback`: 处理 429 或 500 错误，自动切换备选模型（如 Sonnet -> Haiku）。
        - `MaxOutputTokensRecovery`: 遇到输出长度限制时，自动注入回复提示语，引导模型“继续（Continue）”。
        - `PromptTooLongRecovery`: 遇到 413 错误时，强制触发 `contextCollapse` 或 `reactiveCompact`。
- **执行阶段 (Execution)**:
    - `StreamingToolExecutor`: 管理并发。判断工具是否 `isConcurrencySafe`。
    - `runToolUse`: 处理工具执行，包括权限校验、Hooks 触发（`PreToolUse`, `PostToolUse`）。
- **收尾阶段 (Termination)**:
    - `handleStopHooks`: 执行所有注册的停止钩子，判断是否满足任务完成条件。
    - `checkTokenBudget`: 检查当前 Turn 的费用预算。

## 2. 工具执行引擎 (`StreamingToolExecutor.ts`)

负责在模型流式输出工具调用时，实现“即读即算”。

- **并发调度**:
    - 维护 `TrackedTool` 数组。
    - 若新来的工具是 `concurrencySafe` 的，且当前运行的工具也都是安全的，则并行启动。
    - 若是不安全的工具，则必须等待队列清空后独占执行。
- **顺序保证**: 结果必须按照模型调用的顺序返回，即使后面的工具先执行完。
- **级联中断**: 如果某个 `Bash` 工具出错，`StreamingToolExecutor` 会通过 `siblingAbortController` 中断其他并行的子进程。

## 3. 多 Agent 产生与隔离 (`AgentTool.tsx` & `runAgent.ts`)

这是 Claude Code 实现递归能力的关键。

### 3.1 隔离模式 (Isolation)
- **Worktree 模式**: 使用 `git worktree` 创建一个完全隔离的代码副本，Agent 在此目录下操作，防止污染主工作区。
- **CCR (Remote) 模式**: 将任务打包发送到远程受控环境执行（Anthropic 内部功能）。

### 3.2 状态继承与隔离
- **同步 Agent**: 共享 `AppState` 和 `AbortController`。
- **异步 Agent (`run_in_background`)**:
    - 创建独立的 `AbortController`。
    - `AppState` 写操作通过专用通道发回主进程。
    - 结果通过 `<task-notification>` XML 异步传回。
- **上下文 Fork**: 子 Agent 可以选择继承父 Agent 的部分或全部消息历史。

## 4. MCP (Model Context Protocol) 适配层

- **动态连接**: 通过 `connectToServer` 建立 SSE 或 Stdio 传输。
- **URL Elicitation**: 特殊的交互协议。当工具需要用户授权（如 OAuth）时，会返回 `-32042` 错误，触发 `elicitationHandler` 弹出浏览器或输入框。
- **资源管理**: 支持 `resources/list` 和 `resources/read`，允许模型主动拉取上下文。

## 5. UI 与 交互 (`Ink`)

- **React-as-CLI**: 使用 `ink` 将 React 组件渲染为 ANSI 终端输出。
- **双向绑定**: UI 通过 `useAppState` 监听任务进度，实时渲染 `Spinner`, `ProgressBar` 和工具输出。
