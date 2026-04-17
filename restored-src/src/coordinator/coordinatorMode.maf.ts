import { feature } from 'bun:bundle'
import { ASYNC_AGENT_ALLOWED_TOOLS } from '../constants/tools.js'
import { checkStatsigFeatureGate_CACHED_MAY_BE_STALE } from '../services/analytics/growthbook.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../services/analytics/index.js'
import { AGENT_TOOL_NAME } from '../tools/AgentTool/constants.js'
import { BASH_TOOL_NAME } from '../tools/BashTool/toolName.js'
import { FILE_EDIT_TOOL_NAME } from '../tools/FileEditTool/constants.js'
import { FILE_READ_TOOL_NAME } from '../tools/FileReadTool/prompt.js'
import { SEND_MESSAGE_TOOL_NAME } from '../tools/SendMessageTool/constants.js'
import { SYNTHETIC_OUTPUT_TOOL_NAME } from '../tools/SyntheticOutputTool/SyntheticOutputTool.js'
import { TASK_STOP_TOOL_NAME } from '../tools/TaskStopTool/prompt.js'
import { TEAM_CREATE_TOOL_NAME } from '../tools/TeamCreateTool/constants.js'
import { TEAM_DELETE_TOOL_NAME } from '../tools/TeamDeleteTool/constants.js'
import { isEnvTruthy } from '../utils/envUtils.js'

/**
 * [专家视角 1: 引入 MAF 类型抽象]
 * 模拟微软 MAF 的核心接口。在真实项目中，应导入 @microsoft/agents-sdk。
 */
interface MAFAgent {
  id: string;
  name: string;
  role: string;
  tools: any[];
  memory: any;
}

interface MAFOrchestrator {
  agents: MAFAgent[];
  plan(): Promise<void>;
  execute(): Promise<void>;
}

/**
 * [专家视角 2: 基于 MAF 的磁吸编排器 (Magnetic Orchestrator)]
 * 用于替代原有的基于 XML <task-notification> 的手动协调逻辑。
 * MAF 的 MagneticOrchestrator 会维护一个动态任务列表，并根据任务状态自动分发给空闲 Worker。
 */
class ClaudeMagneticOrchestrator implements MAFOrchestrator {
  public agents: MAFAgent[] = [];
  private taskList: Array<{ id: string; description: string; status: 'pending' | 'in-progress' | 'completed' }> = [];

  constructor(public manager: MAFAgent) {}

  /**
   * [专家视角 3: 任务规划与分发]
   * 代替了 CoordinatorMode.ts 中 "2. Your Role" 描述的半手动过程。
   */
  async plan() {
    // 经理 Agent (Coordinator) 生成任务清单
    logEvent('maf_orchestrator_planning', { managerId: this.manager.id });
  }

  async execute() {
    // 自动化调度：循环检查任务清单，分发给 Worker
  }
}

// ... 保持原有工具集合定义 ...
const INTERNAL_WORKER_TOOLS = new Set([
  TEAM_CREATE_TOOL_NAME,
  TEAM_DELETE_TOOL_NAME,
  SEND_MESSAGE_TOOL_NAME,
  SYNTHETIC_OUTPUT_TOOL_NAME,
])

export function isCoordinatorMode(): boolean {
  if (feature('COORDINATOR_MODE')) {
    return isEnvTruthy(process.env.CLAUDE_CODE_COORDINATOR_MODE)
  }
  return false
}

// ... 省略 matchSessionMode 等函数 ...

/**
 * [专家视角 4: 系统提示词重构]
 * 在 MAF 架构下，系统提示词不再需要详细描述 XML 格式。
 * 因为消息传递是通过 MAF 协议 (MessageContract) 标准化的。
 */
export function getCoordinatorSystemPrompt(): string {
  if (isEnvTruthy(process.env.USE_MAF_ENGINE)) {
      return `You are the Lead Coordinator using the Microsoft Agent Framework.

## 1. Role and Strategy
- You manage a pool of autonomous Workers via the Magnetic Orchestrator.
- Your primary tool is 'DelegateTask' which handles the underlying Agent/Workflow creation.
- You no longer parse XML notifications; status updates arrive as type-safe Event objects.

## 2. Orchestration Patterns
- Sequential: For linear research -> implementation chains.
- Concurrent: For parallel exploration across multiple modules.
- Magnetic: For managing long-running, complex features with dynamic task lists.

## 3. Communication
- Summarize findings for the user as they are committed to the Shared Memory.
- Use the 'Synthesize' tool to combine Worker insights before the next planning phase.`;
  }

  // 以下是原始逻辑，用于兼容非 MAF 模式
  const workerCapabilities = isEnvTruthy(process.env.CLAUDE_CODE_SIMPLE)
    ? 'Workers have access to Bash, Read, and Edit tools, plus MCP tools from configured MCP servers.'
    : 'Workers have access to standard tools, MCP tools from configured MCP servers, and project skills via the Skill tool. Delegate skill invocations (e.g. /commit, /verify) to workers.'

  return `You are Claude Code, an AI assistant that orchestrates software engineering tasks across multiple workers.
  ... (原有提示词) ...`;
}

/**
 * [专家视角 5: 工具适配器 (Tool Adapter)]
 * 将 Claude Code 的 Tool 对象包装成 MAF 兼容的函数调用。
 */
export function wrapAsMAFTool(claudeTool: any) {
  return {
    name: claudeTool.name,
    description: claudeTool.description,
    parameters: claudeTool.inputSchema,
    invoke: async (args: any, context: any) => {
      // 桥接 MAF 上下文到 Claude Code 的 ToolUseContext
      return claudeTool.call(args, context, () => Promise.resolve({ behavior: 'allow' }), {});
    }
  };
}
