import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { ALL_TOOLS, READ_TOOLS, WRITE_TOOLS, TOOL_AREAS } from "@/lib/mcp/tools";
import { toolsFor } from "@/lib/mcp/server";

vi.mock("@/lib/mcp/audit", () => ({ auditMcpWrite: vi.fn(async () => {}) }));

describe("tool registry conventions", () => {
  it("has unique tool names", () => {
    const names = ALL_TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("tags every description and sets every annotation", () => {
    for (const t of ALL_TOOLS) {
      const tag = t.kind === "read" ? "[Read] " : t.kind === "write" ? "[Write] " : "[Sensitive write] ";
      expect(t.description.startsWith(tag), t.name).toBe(true);
      expect(t.annotations.title, t.name).toBeTruthy();
      expect(t.annotations.readOnlyHint, t.name).toBe(t.kind === "read");
      for (const k of ["destructiveHint", "idempotentHint", "openWorldHint"] as const) {
        expect(typeof t.annotations[k], `${t.name}.${k}`).toBe("boolean");
      }
    }
  });

  it("write tools take a confirmToken; read tools don't", () => {
    for (const t of WRITE_TOOLS) expect(t.inputShape.confirmToken, t.name).toBeDefined();
    for (const t of READ_TOOLS) expect(t.inputShape.confirmToken, t.name).toBeUndefined();
  });

  it("every optional field accepts null (.nullish(), not .optional())", () => {
    const check = (schema: z.ZodType, path: string) => {
      if (schema.safeParse(undefined).success) {
        expect(schema.safeParse(null).success, `${path} is optional but rejects null`).toBe(true);
      }
    };
    for (const t of ALL_TOOLS) {
      for (const [k, s] of Object.entries(t.inputShape)) check(s as z.ZodType, `${t.name}.${k}`);
    }
  });

  it("read-only credentials get a registry with no write tools", () => {
    const ro = toolsFor({ scope: "mcp:read", isHouse: true });
    expect(ro.every((t) => t.kind === "read")).toBe(true);
    const full = toolsFor({ scope: "mcp:admin", isHouse: true });
    expect(full.length).toBe(ALL_TOOLS.length);
  });

  it("house-only tools are not registered for other tenants", () => {
    const tools = toolsFor({ scope: "mcp:admin", isHouse: false });
    expect(tools.some((t) => t.houseOnly)).toBe(false);
  });

  it("covers every admin area", () => {
    expect(Object.keys(TOOL_AREAS).sort()).toEqual(
      ["admin", "catalog", "commerce", "content", "orders", "returns", "storefront"].sort(),
    );
  });
});
