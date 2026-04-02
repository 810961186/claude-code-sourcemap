# Claude Code 项目架构与运行逻辑文档

本文档旨在拆分 Claude Code 项目的核心逻辑，描述其主要架构和运行流程。

## 1. 核心架构概述

Claude Code 是一个基于 TypeScript 的多 Agent 命令行工具，旨在辅助软件工程任务。其架构采用了典型的“主循环 + 插件/工具”模式，并支持复杂的多 Agent 协作。

### 1.1 关键组件目录
- `src/main.tsx`: CLI 入口点，负责参数解析和环境初始化。
- `src/query.ts`: 核心查询循环，管理与大模型的交互。
- `src/Tool.ts`: 工具基类与定义，所有 Agent 可调用的操作（如读写文件、运行 Bash）都封装为工具。
- `src/coordinator/`: 协调者模式逻辑，负责任务拆解和多 Worker 管理。
- `src/tools/AgentTool/`: Agent 工具，允许一个 Agent 产生（spawn）另一个子 Agent。
- `src/services/`: 各种核心服务，包括 MCP（Model Context Protocol）、分析、策略限制等。

## 2. 运行逻辑拆解

项目运行可以分为以下几个关键阶段：

### 2.1 初始化阶段 (Initialization)
1. **环境准备**: `main.tsx` 首先执行一系列副作用操作，如性能剖析（startupProfiler）、读取配置（MDM/Keychain）。
2. **参数解析**: 使用 `commander` 解析 CLI 参数（如 `--print`, `--model`, `--assistant`）。
3. **环境初始化 (`init`)**: 加载全局配置、身份验证状态、遥测系统。
4. **工具与命令加载**: 加载内置工具（Tools）和斜杠命令（Commands）。

### 2.2 交互阶段 (REPL/Interactive) 或 单次执行 (`--print`)
- **交互模式**: 启动基于 `Ink` 的 React 终端 UI。
- **非交互模式**: 直接进入 `query` 循环处理用户输入。

### 2.3 核心查询循环 (`query` loop)
这是项目的“心脏”，位于 `src/query.ts`。其逻辑如下：
1. **上下文组装**: 收集消息历史、系统提示词、环境变量等。
2. **上下文压缩 (Compaction)**: 如果上下文过长，执行自动压缩（Autocompact）或清理（Snip），以节省 Token。
3. **API 调用**: 调用 Anthropic API 或其他配置的模型。
4. **流式处理 (Streaming)**: 处理 API 返回的流，包括文本、Thinking 块和工具调用（Tool Use）。
5. **工具执行**:
   - 识别 API 请求的工具调用。
   - 检查权限（Permission check）。
   - 执行工具逻辑（如 `BashTool` 运行命令）。
   - 将工具结果（Tool Result）作为用户消息写回上下文。
6. **循环判断**: 如果模型产生了工具调用，循环继续执行，直到模型给出最终文本回复或达到最大轮次限制。

### 2.4 多 Agent 协调 (Coordinator & Workers)
当开启协调者模式时：
1. **Coordinator**: 主 Agent 被赋予“协调者”角色，其系统提示词引导其进行任务规划。
2. **AgentTool**: 协调者通过 `AgentTool` 创建 `worker` 类型的子 Agent。
3. **异步执行**: 子 Agent 在独立的上下文和 `query` 循环中运行。
4. **结果通知**: 子 Agent 完成后，其结果以 `<task-notification>` XML 格式返回给协调者。

## 3. 核心机制详解

### 3.1 权限控制 (Permissions)
- **权限模式**: 支持 `default`, `auto`, `bypassPermissions` 等模式。
- **规则配置**: 通过 `alwaysAllowRules` 和 `alwaysDenyRules` 预设行为。
- **动态确认**: 在执行破坏性操作（如写文件）前弹出确认。

### 3.2 状态管理 (State Management)
- **AppState**: 集中管理工具权限、MCP 连接、任务列表等状态。
- **React Integration**: 使用 `ink` (React for CLI) 驱动 UI 渲染，通过自定义 Hook（如 `useAppState`）同步状态。

### 3.3 遥测与分析 (Telemetry & Analytics)
- 集成了大量的事件记录（`logEvent`），用于跟踪工具使用、Token 消耗和执行耗时。

## 4. 逻辑粒度拆解

- **Tool 粒度**: 最小的功能单元。每个工具定义了 `inputSchema` 和 `call` 方法。
- **Turn 粒度**: 一次 API 请求及随后的工具执行构成一个 Turn（轮次）。
- **Session 粒度**: 从启动到退出的完整会话，包含多个 Turn。
- **Agent 粒度**: 具有独立身份、提示词和工具集的执行实体。

## 5. 扩展性设计

- **MCP (Model Context Protocol)**: 允许集成外部工具服务器，动态扩展工具集。
- **Hooks**: 在各个生命周期点（SessionStart, PreToolUse, PostSampling 等）注入逻辑。
- **Skills**: 基于提示词的预定义能力。
