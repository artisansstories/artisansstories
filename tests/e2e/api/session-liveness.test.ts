/**
 * Admin sessions last 30 days; the AdminUser row is re-checked on every API
 * request (resolveTenantFromAdminSession), so deactivating or deleting an admin
 * cuts off access immediately, and a session can't claim another store.
 */
import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/prisma";
import { F, OTHER } from "../seed";
import { call } from "../helpers/route";
import { signInAs } from "../helpers/session";
import * as dashboard from "@/app/api/admin/dashboard/route";
import * as settings from "@/app/api/admin/settings/route";
import * as orders from "@/app/api/admin/orders/route";

describe("admin session liveness", () => {
  it("an active admin's session works", async () => {
    await signInAs(F.admin.admin);
    expect((await call(orders.GET as never, "GET", "/api/admin/orders")).status).toBe(200);
  });

  it("deactivating an admin cuts off their existing session on every route", async () => {
    await signInAs(F.admin.admin);
    await prisma.adminUser.update({ where: { id: F.admin.admin }, data: { isActive: false } });
    expect((await call(dashboard.GET as never, "GET", "/api/admin/dashboard")).status).toBe(401);
    expect((await call(orders.GET as never, "GET", "/api/admin/orders")).status).toBe(401);
    const before = await prisma.storeSettings.findUniqueOrThrow({ where: { id: F.settings.house } });
    const put = await call(settings.PUT as never, "PUT", "/api/admin/settings", { body: { storeEnabled: !before.storeEnabled } });
    expect(put.status).toBe(401);
    const after = await prisma.storeSettings.findUniqueOrThrow({ where: { id: F.settings.house } });
    expect(after.storeEnabled).toBe(before.storeEnabled);
  });

  it("a deleted admin's session is refused", async () => {
    await signInAs(F.admin.editor);
    await prisma.adminUser.delete({ where: { id: F.admin.editor } });
    expect((await call(orders.GET as never, "GET", "/api/admin/orders")).status).toBe(401);
  });

  it("a session claiming another store than the admin belongs to is refused", async () => {
    await signInAs(F.admin.admin, { tenantId: OTHER });
    const r = await call(orders.GET as never, "GET", "/api/admin/orders");
    expect(r.status).toBe(401);
    expect(r.text).not.toContain("OS-2001");
  });
});
