/**
 * mcp-smoke.ts — read-only smoke test for the MCP endpoint.
 *
 * Runs `initialize` + `tools/list` against a running server and prints the tool
 * count by tag. It NEVER calls a tool, so it can't write anything.
 *
 *   MCP_KEY=oss_live_… npx tsx scripts/mcp-smoke.ts
 *   MCP_URL=https://artisansstories.com/api/mcp MCP_KEY=… npx tsx scripts/mcp-smoke.ts
 *   MCP_PATH_TOKEN=1 MCP_KEY=… npx tsx scripts/mcp-smoke.ts   # test /api/mcp/<key> form
 *
 * Exit 0 on success, 1 on any failure.
 */
const url = process.env.MCP_URL ?? "http://localhost:3000/api/mcp";
const key = (process.env.MCP_KEY ?? "").replace(/\s+/g, "");
const usePath = process.env.MCP_PATH_TOKEN === "1";

function fail(msg: string): never {
  console.error(`MCP_SMOKE_FAIL: ${msg}`);
  process.exit(1);
}

if (!key) fail("set MCP_KEY to an MCP key (oss_live_…) or OAuth access token");

async function rpc(id: number, method: string, params: unknown = {}) {
  const target = usePath ? `${url.replace(/\/$/, "")}/${encodeURIComponent(key)}` : url;
  const res = await fetch(target, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": "2025-06-18",
      ...(usePath ? {} : { Authorization: `Bearer ${key}` }),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
  const text = await res.text();
  if (!res.ok) fail(`${method} → HTTP ${res.status}: ${text.slice(0, 300)}`);
  // enableJsonResponse=true → plain JSON; tolerate SSE framing just in case.
  const json = text.startsWith("{") ? text : (text.split("\n").find((l) => l.startsWith("data: ")) ?? "").slice(6);
  const body = JSON.parse(json) as { result?: Record<string, unknown>; error?: { message: string } };
  if (body.error) fail(`${method} → ${body.error.message}`);
  return body.result as Record<string, unknown>;
}

async function main() {
  console.log(`→ ${url}${usePath ? " (token in path)" : ""}`);
  const init = await rpc(1, "initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "mcp-smoke", version: "1.0.0" },
  });
  const info = init.serverInfo as { name: string; version: string };
  console.log(`initialize: ${info.name} ${info.version}, protocol ${init.protocolVersion}`);
  if (!String(init.instructions ?? "").length) fail("server returned no instructions");

  const list = await rpc(2, "tools/list");
  const tools = list.tools as Array<{ name: string; description: string; annotations?: Record<string, unknown> }>;
  const tag = (t: { description: string }) => /^\[(Read|Write|Sensitive write)\]/.exec(t.description)?.[1] ?? "untagged";
  const counts: Record<string, number> = {};
  for (const t of tools) counts[tag(t)] = (counts[tag(t)] ?? 0) + 1;
  console.log(`tools/list: ${tools.length} tools`, counts);
  const untagged = tools.filter((t) => tag(t) === "untagged" || !t.annotations);
  if (untagged.length) fail(`tools missing tag/annotations: ${untagged.map((t) => t.name).join(", ")}`);
  for (const t of tools) console.log(`  ${tag(t).padEnd(15)} ${t.name}`);
  console.log("MCP_SMOKE_PASS");
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)));
