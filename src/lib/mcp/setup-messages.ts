/** Ready-to-paste setup messages shown on Settings → AI Assistants. */
import type { Assistant } from "./keys";

export function setupMessage(assistant: Assistant, mcpUrl: string): string {
  if (assistant === "muse") {
    return `Build a custom connector to my Artisans Stories store admin. Its MCP server is ${mcpUrl} (Streamable HTTP). It takes my key as an Authorization: Bearer header; ask me for the key in your secure credentials prompt. List the tools, save it as a skill called 'Artisans Stories', and run one read check from the saved skill.`;
  }
  return `Connect to my Artisans Stories store admin as a remote MCP server. Server URL: ${mcpUrl} (Streamable HTTP transport). Authentication: send my API key in an Authorization: Bearer header. Ask me for the key through your secure credentials or connector settings rather than in chat if you can. After connecting, list the tools and run one read-only check (dashboard_summary) to confirm it works.`;
}
