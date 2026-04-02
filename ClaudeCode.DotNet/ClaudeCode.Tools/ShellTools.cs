using System.Diagnostics;
using System.Threading.Tasks;
using Microsoft.Agents;
using Microsoft.Agents.Core.Attributes;

namespace ClaudeCode.Tools
{
    /// <summary>
    /// [专家视角: 系统操作工具集]
    /// 复刻原 BashTool.tsx 的逻辑。通过 AgentTool 特性定义 Schema。
    /// </summary>
    public class ShellTool
    {
        /// <summary>
        /// 执行终端指令。
        /// [专家提示]: 此处对应原 TS 版的 exec 封装，MAF 会自动解析 description 作为模型参数描述。
        /// </summary>
        [AgentTool("execute_command", "Run a shell command on the host system.")]
        public async Task<string> ExecuteCommandAsync(
            [AgentToolParameter("command", "The exact shell command to run.")] string command,
            [AgentToolParameter("timeout", "Optional timeout in ms.")] int timeout = 30000)
        {
            try
            {
                var processStartInfo = new ProcessStartInfo
                {
                    FileName = "bash", // 或根据 OS 切换到 pwsh
                    Arguments = $"-c \"{command}\"",
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    UseShellExecute = false,
                    CreateNoWindow = true
                };

                using var process = Process.Start(processStartInfo);
                var output = await process.StandardOutput.ReadToEndAsync();
                var error = await process.StandardError.ReadToEndAsync();

                // 复刻 BashTool.tsx 的输出整合逻辑
                return string.IsNullOrEmpty(error) ? output : $"Output: {output}\nError: {error}";
            }
            catch (System.Exception ex)
            {
                return $"Execution Failed: {ex.Message}";
            }
        }
    }

    public class FileTool
    {
        [AgentTool("read_file", "Read the content of a specific file.")]
        public async Task<string> ReadFileAsync(string path)
        {
            return await System.IO.File.ReadAllTextAsync(path);
        }

        [AgentTool("edit_file", "Write or overwrite content to a file.")]
        public async Task<string> EditFileAsync(string path, string content)
        {
            await System.IO.File.WriteAllTextAsync(path, content);
            return "File updated successfully.";
        }
    }
}
