import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/prisma";
import { F, KEYS, HOUSE } from "./seed";
import { call } from "./helpers/route";
import { signInAs } from "./helpers/session";
import { connectMcp } from "./helpers/mcp";
import * as dashboard from "@/app/api/admin/dashboard/route";

describe("e2e harness", () => {
  it("runs against the local database only", () => {
    expect(new URL(process.env.DATABASE_URL!).hostname).toBe("127.0.0.1");
  });
  it("seeds both stores", async () => {
    expect(await prisma.tenant.count()).toBe(2);
    expect(await prisma.order.count({ where: { tenantId: HOUSE } })).toBe(11);
  });
  it("route with a real session", async () => {
    await signInAs(F.admin.super);
    const r = await call(dashboard.GET as never, "GET", "/api/admin/dashboard");
    expect(r.status).toBe(200);
  });
  it("route without a session is 401", async () => {
    const r = await call(dashboard.GET as never, "GET", "/api/admin/dashboard");
    expect(r.status).toBe(401);
  });
  it("MCP in-process", async () => {
    const mcp = await connectMcp(KEYS.houseAdmin);
    const names = await mcp.toolNames();
    expect(names.length).toBe(93);
    const d = await mcp.call("dashboard_summary");
    expect(d.totalOrders ?? d.orderCount ?? d).toBeTruthy();
    await mcp.close();
  });
});
