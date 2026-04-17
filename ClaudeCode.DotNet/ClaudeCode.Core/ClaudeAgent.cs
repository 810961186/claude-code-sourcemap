using System.Threading.Tasks;
using Microsoft.Agents;
using Microsoft.Agents.Abstractions;
using Microsoft.Agents.Abstractions.State;
using Microsoft.Agents.Core;

namespace ClaudeCode.Core
{
    /// <summary>
    /// [专家视角: 核心推理实体]
    /// 承载了原 TS 项目中 query.ts 的逻辑，利用 MAF 的 Agent 类自动化处理状态管理。
    /// </summary>
    public class ClaudeAgent : Microsoft.Agents.Agent
    {
        private readonly IConversationState _conversationState;

        public ClaudeAgent(IConversationState conversationState)
            : base("ClaudeCodeAgent", "You are an expert software engineer.")
        {
            _conversationState = conversationState;

            // 自动加载基础工具集，MAF 会处理其描述（Prompt）注入
            this.AddTool(new ShellTool());
            this.AddTool(new FileTool());
        }

        /// <summary>
        /// 替代原 query.ts 中的循环采样逻辑。
        /// MAF 会自动处理消息契约（MessageContract）并根据模型输出决定是否调用工具。
        /// </summary>
        public override async Task<Activity> OnTurnAsync(ITurnContext turnContext)
        {
            // 1. 检查上下文是否需要压缩（对应 snipCompact / autocompact）
            await EnsureContextEfficiencyAsync(turnContext);

            // 2. 调用 MAF 核心工作流进行推理
            var result = await base.CallModelAsync(turnContext);

            // 3. 处理流式输出（MAF 内部封装了 Streaming 处理）
            return result;
        }

        private async Task EnsureContextEfficiencyAsync(ITurnContext turnContext)
        {
            var history = await _conversationState.GetHistoryAsync(turnContext);
            if (history.TokenCount > 100000) // 模拟 autocompact 阈值
            {
                // 触发摘要工作流
                var summary = await this.SummarizeHistoryAsync(history);
                await _conversationState.SetHistoryAsync(turnContext, summary);
            }
        }
    }
}
