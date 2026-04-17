# Claude Code C# & MAF 复刻方案

## 1. 核心模块映射 (TS -> C# MAF)

| 原始功能 (TypeScript) | 复刻模块 (C# MAF) | MAF 核心类/概念 |
| --- | --- | --- |
| `src/query.ts` (核心循环) | `ClaudeAgent.cs` | `Microsoft.Agents.Agent` |
| `src/Tool.ts` (工具定义) | `BaseTool.cs` | `Microsoft.Agents.Tool` |
| `src/tools/BashTool/` | `ShellTool.cs` | `AgentTool` Attribute |
| `src/coordinator/` | `MagneticCodingOrchestrator.cs` | `MagneticOrchestrator` |
| `src/services/mcp/` | `McpPlugin.cs` | `IAgentPlugin` / `Middleware` |
| `src/state/AppState.ts` | `ConversationState.cs` | `IConversationState` |
| `src/ink/` (终端 UI) | `TerminalUI.cs` | `Spectre.Console` (C# 终端增强库) |

## 2. 业务流转逻辑 (Request Lifecycle)

1. **Input (输入层)**: 用户通过 CLI 输入指令。
2. **Context Enrichment (上下文增强)**:
   - MAF Middleware 自动收集系统环境（OS, Shell 类型）。
   - `SessionMemory` 加载历史对话。
3. **Reasoning (推理层 - `ClaudeAgent`)**:
   - Agent 接收 `MessageContract`。
   - 触发 MAF 内部的 `Workflow`，判断是否需要调用工具。
4. **Tool Execution (工具层)**:
   - 若模型请求调用 `Bash`，MAF 自动分发到 `ShellTool` 实例。
   - `ShellTool` 执行并返回强类型的 `ToolResult`。
5. **Orchestration (编排层 - 若开启多 Agent)**:
   - `MagneticOrchestrator` 维护一个 `TaskList`。
   - 经理 Agent 发现任务复杂，调用 `AgentTool` 产生子 Agent 实例。
   - 子 Agent 完成后，MAF 通过 `Event` 机制通知经理 Agent，无需 XML 解析。
6. **Output (输出层)**: 最终结果流式返回给终端 UI。

## 3. 详细数据流转 (Data Flow)

### 3.1 意图识别流 (Intent Stream)
- `TerminalUI` -> `ActivityHandler` (接收文本)
- `ActivityHandler` -> `ClaudeAgent` (请求采样)
- `ClaudeAgent` -> `LLMProvider` (Azure OpenAI / Anthropic)
- `LLMProvider` -> `ToolCall` (发现工具请求)

### 3.2 工具执行流 (Tool Execution)
- `ToolCall` -> `ToolExecutor` (MAF 核心)
- `ToolExecutor` -> `ShellTool` / `FileEditTool` (具体执行)
- `Result` -> `ClaudeAgent` (注入上下文)

### 3.3 异步编排流 (Async Orchestration)
- `ClaudeAgent` -> `MagneticOrchestrator.SpawnChild`
- `Orchestrator` -> `BackgroundWorker` (MAF Agent 实例)
- `BackgroundWorker` -> `Checkpoint` (保存中间状态)
- `Event` -> `ManagerAgent` (通知结果)

## 4. C# 项目结构建议

```text
ClaudeCode.DotNet/
├── ClaudeCode.CLI/           # CLI 入口与 UI 渲染 (Spectre.Console)
├── ClaudeCode.Core/          # 核心 Agent 与 Workflow (Microsoft.Agents)
├── ClaudeCode.Tools/         # 基础工具集 (Bash, File, Git, MCP)
├── ClaudeCode.Common/        # 模型接口定义与配置
└── ClaudeCode.Test/          # 单元测试与集成测试
```
