/**
 * Admin UI pages, rendered for real: a production build (`next build --webpack`)
 * served by `next start` against the local test database, opened in headless
 * Chromium with a real admin session cookie. Every /admin page must load with
 * HTTP 200 (no bounce to login), no Next error page / "Application error",
 * no uncaught browser exception, no 5xx from the admin APIs it calls, and must
 * show a marker from the seeded data. Then the AI Assistants flow: toggle, mint
 * a key (and use it), list, revoke.
 *
 * Nothing may leave the machine: the server's outbound traffic goes through a
 * recording proxy that refuses it, and the test asserts it recorded nothing.
 *
 * E2E_SKIP_UI=1 skips this file; E2E_SKIP_BUILD=1 reuses an existing .next build.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { prisma } from "@/lib/prisma";
import { F, OTHER } from "../seed";
import { signInAs } from "../helpers/session";
import { connectMcp } from "../helpers/mcp";
import { buildApp, startApp, startOutboundRecorder, type Recorder, type RunningServer } from "./next-server";

const SKIP = process.env.E2E_SKIP_UI === "1";
const PORT = Number(process.env.E2E_UI_PORT ?? 3999);

let recorder: Recorder;
let server: RunningServer;
let browser: Browser;

/** path → text (or input value) that proves the page rendered its data. */
const HOUSE_PAGES: Array<[string, string | RegExp]> = [
  ["/admin", /AS-10\d\d/],
  ["/admin/orders", "AS-1003"],
  [`/admin/orders/${F.order.paid}`, "AS-1003"],
  ["/admin/returns", "AS-1009"],
  [`/admin/returns/${F.ret.received}`, "AS-1005"],
  ["/admin/products", "Woven Hammock"],
  ["/admin/products/new", /product/i],
  [`/admin/products/${F.prod.hammock}/edit`, "Woven Hammock"],
  ["/admin/categories", "Textiles"],
  ["/admin/inventory", "Woven Hammock"],
  ["/admin/skus", "HAM-001"],
  ["/admin/customers", "ana@example.test"],
  [`/admin/customers/${F.cust.ana}`, "ana@example.test"],
  ["/admin/discounts", "SAVE10"],
  ["/admin/discounts/new", /discount/i],
  [`/admin/discounts/${F.disc.save10}/edit`, "SAVE10"],
  ["/admin/shipping", "United States"],
  ["/admin/tax", /tax/i],
  ["/admin/reports", /report|sales|revenue/i],
  ["/admin/settings", "Artisans Stories"],
  ["/admin/settings/ai", "AI Assistants"],
  ["/admin/team", "Anna Super"],
  ["/admin/contact", "Carla"],
  ["/admin/communications", /Carla|AS-1003/],
  [`/admin/communications/email/${F.email.confirmation}`, "Order Confirmed — AS-1003"],
  ["/admin/artisans", "Maria Hernandez"],
  ["/admin/artisans/new", /artisan/i],
  [`/admin/artisans/${F.artisan.maria}/edit`, "Maria Hernandez"],
  ["/admin/kb", "Getting Started"],
  ["/admin/kb/getting-started", "Getting Started"],
  ["/admin/landing-page", "Handcrafted treasures from El Salvador"],
  ["/admin/linktree", "Instagram"],
  ["/admin/email-template", "Welcome, friend"],
];

/** The other store sees its own data, and house-only pages send it back to /admin. */
const OTHER_PAGES: Array<[string, string | RegExp]> = [
  ["/admin", /OS-2001|Other Store/],
  ["/admin/orders", "OS-2001"],
  ["/admin/products", "Baseball Glove"],
  ["/admin/settings", "Other Store"],
  ["/admin/settings/ai", "AI Assistants"],
  ["/admin/team", "Olga Owner"],
];
const HOUSE_ONLY = ["/admin/artisans", "/admin/kb", "/admin/landing-page", "/admin/linktree", "/admin/email-template"];

async function newContext(adminId: string, host = "localhost"): Promise<BrowserContext> {
  const token = await signInAs(adminId);
  const ctx = await browser.newContext({ baseURL: `http://${host}:${PORT}` });
  await ctx.addCookies([{ name: "as-admin-session", value: token, domain: host, path: "/", httpOnly: true, sameSite: "Lax" }]);
  return ctx;
}

interface PageReport {
  status: number | null;
  finalUrl: string;
  pageErrors: string[];
  apiFailures: string[];
  text: string;
}

async function visit(ctx: BrowserContext, path: string): Promise<{ page: Page; report: PageReport }> {
  const page = await ctx.newPage();
  const pageErrors: string[] = [];
  const apiFailures: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  page.on("response", (r) => {
    if (r.url().includes("/api/") && r.status() >= 500) apiFailures.push(`${r.status()} ${r.request().method()} ${r.url()}`);
  });
  const res = await page.goto(path, { waitUntil: "networkidle" });
  await page.waitForTimeout(150);
  const text = await page.evaluate(() => {
    const values = [...document.querySelectorAll("input, textarea")].map((el) => (el as HTMLInputElement).value);
    return `${document.body.innerText}\n${values.join("\n")}`;
  });
  return { page, report: { status: res?.status() ?? null, finalUrl: page.url(), pageErrors, apiFailures, text } };
}

function expectHealthy(path: string, r: PageReport, marker: string | RegExp) {
  const where = `${path} → ${r.finalUrl}`;
  expect(r.status, where).toBe(200);
  expect(new URL(r.finalUrl).pathname, where).not.toBe("/admin/login");
  expect(r.text, where).not.toMatch(/Application error|Unhandled Runtime Error|Internal Server Error|This page could not be found/);
  expect(r.pageErrors, `${where} browser errors`).toEqual([]);
  expect(r.apiFailures, `${where} API 5xx`).toEqual([]);
  if (typeof marker === "string") expect(r.text, `${where} marker`).toContain(marker);
  else expect(r.text, `${where} marker`).toMatch(marker);
}

describe.skipIf(SKIP)("admin UI (next start, local DB)", () => {
  beforeAll(async () => {
    recorder = await startOutboundRecorder();
    if (process.env.E2E_SKIP_BUILD !== "1") await buildApp(recorder.url);
    server = await startApp(recorder.url, PORT);
    browser = await chromium.launch({ args: ["--host-resolver-rules=MAP localhost 127.0.0.1, MAP *.localhost 127.0.0.1"] });
  }, 25 * 60_000);

  afterAll(async () => {
    await browser?.close();
    await server?.stop();
    // The build and every page load above went through the recorder.
    expect(recorder?.requests ?? [], "outbound requests from next build / next start").toEqual([]);
    await recorder?.close();
  });

  it("every house admin page renders its data", async () => {
    const ctx = await newContext(F.admin.super);
    for (const [path, marker] of HOUSE_PAGES) {
      const { page, report } = await visit(ctx, path);
      expectHealthy(path, report, marker);
      await page.close();
    }
    await ctx.close();
  }, 180_000);

  it("the login page renders without a session", async () => {
    const ctx = await browser.newContext({ baseURL: `http://localhost:${PORT}` });
    const { report } = await visit(ctx, "/admin/login");
    expect(report.status).toBe(200);
    expect(report.text).not.toMatch(/Application error/);
    expect(report.text).toMatch(/sign in|email/i);
    // A protected page without a session lands on login, never on data.
    const { report: guarded } = await visit(ctx, "/admin/orders");
    expect(new URL(guarded.finalUrl).pathname).toBe("/admin/login");
    expect(guarded.text).not.toContain("AS-1003");
    await ctx.close();
  });

  it("the other store's admin shows only its own data; house-only pages redirect", async () => {
    const ctx = await newContext(F.admin.oSuper, "other-store.localhost");
    for (const [path, marker] of OTHER_PAGES) {
      const { page, report } = await visit(ctx, path);
      expectHealthy(path, report, marker);
      expect(report.text, path).not.toContain("AS-1003");
      expect(report.text, path).not.toContain("Woven Hammock");
      await page.close();
    }
    for (const path of HOUSE_ONLY) {
      const { page, report } = await visit(ctx, path);
      expect(new URL(report.finalUrl).pathname, path).toBe("/admin");
      expect(report.text, path).not.toContain("Maria Hernandez");
      await page.close();
    }
    await ctx.close();
  }, 120_000);

  it("an EDITOR sees the team page without management controls", async () => {
    const ctx = await newContext(F.admin.editor);
    const { page, report } = await visit(ctx, "/admin/team");
    expectHealthy("/admin/team", report, "Anna Super");
    expect(await page.getByRole("button", { name: /invite/i }).count()).toBe(0);
    await ctx.close();
  });

  it("AI Assistants: toggle off/on, mint a key that works, list it, revoke it", async () => {
    const ctx = await newContext(F.admin.super);
    const { page, report } = await visit(ctx, "/admin/settings/ai");
    expectHealthy("/admin/settings/ai", report, "AI Assistants");
    const flag = async () => (await prisma.storeSettings.findUniqueOrThrow({ where: { id: F.settings.house } })).mcpEnabled;

    const toggle = page.getByRole("switch", { name: "AI assistant access" });
    expect(await toggle.isChecked()).toBe(true);
    await toggle.click();
    await expect.poll(flag).toBe(false);
    await toggle.click();
    await expect.poll(flag).toBe(true);

    await page.getByRole("button", { name: "Connect Muse" }).click();
    await page.getByRole("button", { name: "Create key" }).click();
    const tokenBox = page.getByText(/^oss_live_[A-Za-z0-9]+$/).first();
    await tokenBox.waitFor();
    const token = (await tokenBox.textContent())!.trim();

    // The key is real: the MCP server accepts it for this store.
    const mcp = await connectMcp(token);
    expect((await mcp.toolNames()).length).toBe(95);
    await mcp.close();

    await page.getByRole("button", { name: "Done" }).click();
    const row = page.locator("tr", { hasText: token.slice(0, 12) });
    await expect.poll(() => row.count()).toBe(1);
    const minted = await prisma.tenantApiKey.findFirstOrThrow({ where: { prefix: token.slice(0, 12) } });
    expect(minted.scopes).toEqual(["mcp:admin"]);
    expect(minted.revokedAt).toBeNull();

    page.once("dialog", (d) => void d.accept());
    await row.getByRole("button", { name: "Revoke" }).click();
    await expect.poll(() => row.count()).toBe(0);
    expect((await prisma.tenantApiKey.findUniqueOrThrow({ where: { id: minted.id } })).revokedAt).not.toBeNull();
    await expect(connectMcp(token)).rejects.toThrow();
    await ctx.close();
  }, 120_000);

  // ── policy decisions in the UI: refused actions are hidden or disabled ──

  it("order page: shipped/delivered orders offer Create return instead of Cancel; creating one works", async () => {
    const ctx = await newContext(F.admin.super);
    for (const [id, n] of [[F.order.delivered, "AS-1009"], [F.order.shipped, "AS-1008"]] as const) {
      const { page, report } = await visit(ctx, `/admin/orders/${id}`);
      expectHealthy(`/admin/orders/${id}`, report, n);
      expect(await page.getByRole("button", { name: "Cancel Order" }).count(), n).toBe(0);
      expect(await page.getByRole("button", { name: "Create return" }).count(), n).toBe(1);
      await page.close();
    }
    const { page } = await visit(ctx, `/admin/orders/${F.order.shipped}`);
    await page.getByRole("button", { name: "Create return" }).click();
    await page.getByRole("checkbox").uncheck(); // no customer email in this test
    await page.getByRole("button", { name: "Create return" }).last().click();
    await expect.poll(() => prisma.return.count({ where: { orderId: F.order.shipped, status: "APPROVED" } })).toBe(1);
    // An unshipped order still offers Cancel.
    const { page: open } = await visit(ctx, `/admin/orders/${F.order.paidCancel}`);
    expect(await open.getByRole("button", { name: "Cancel Order" }).count()).toBe(1);
    await ctx.close();
  }, 120_000);

  it("order page: when the refund can't go through, the dialog says why and the order is not cancelled", async () => {
    const ctx = await newContext(F.admin.super);
    const { page } = await visit(ctx, `/admin/orders/${F.order.paidCancel}`);
    await page.getByRole("button", { name: "Cancel Order" }).click();
    await page.getByPlaceholder("Reason for cancellation...").fill("Out of stock");
    const seen = recorder.requests.length;
    await page.getByRole("button", { name: "Cancel Order" }).last().click();
    // Stripe is unreachable from the test server (the outbound recorder refuses it).
    const alert = page.getByRole("alert").filter({ hasText: /not cancelled|NOT cancelled/i });
    await alert.waitFor({ timeout: 60_000 });
    expect(await alert.textContent()).toMatch(/Nothing changed; try again|safe to try again/i);
    const order = await prisma.order.findUniqueOrThrow({ where: { id: F.order.paidCancel } });
    expect(order).toMatchObject({ status: "PROCESSING", financialStatus: "PAID", cancelledAt: null });
    expect((await prisma.inventory.findUniqueOrThrow({ where: { id: F.inventory.hammockRed } })).quantity).toBe(2);
    // The only outbound attempts were to Stripe, and they were refused. Drop
    // them so the suite-wide "nothing left the machine" check still covers the rest.
    const attempts = recorder.requests.splice(seen);
    expect(attempts.length).toBeGreaterThan(0);
    expect(attempts.every((r) => r.url.includes("api.stripe.com")), JSON.stringify(attempts)).toBe(true);
    await ctx.close();
  }, 180_000);

  it("team page: owner protection is mirrored (ADMIN can't act on the owner; nobody acts on themselves)", async () => {
    const menus = async (adminId: string) => {
      const ctx = await newContext(adminId);
      const { page, report } = await visit(ctx, "/admin/team");
      expectHealthy("/admin/team", report, "Anna Super");
      const n = await page.getByRole("button", { name: "···" }).count();
      await ctx.close();
      return n;
    };
    // Members: Anna (owner), Adam (ADMIN), Eddie (EDITOR), Gone (inactive EDITOR).
    expect(await menus(F.admin.super)).toBe(3); // everyone but herself
    expect(await menus(F.admin.admin)).toBe(2); // not himself, not the owner
    expect(await menus(F.admin.editor)).toBe(0);
    // Only an owner is offered Remove, and the "Super Admin" role only to owners.
    const ctx = await newContext(F.admin.admin);
    const { page } = await visit(ctx, "/admin/team");
    await page.getByRole("button", { name: "···" }).first().click();
    expect(await page.getByRole("button", { name: "Remove" }).count()).toBe(0);
    await page.getByRole("button", { name: "Edit Role" }).click();
    expect(await page.locator("option[value=SUPER_ADMIN]").count()).toBe(0);
    await ctx.close();
    const sctx = await newContext(F.admin.super);
    const { page: sp } = await visit(sctx, "/admin/team");
    await sp.getByRole("button", { name: "···" }).first().click();
    expect(await sp.getByRole("button", { name: "Remove" }).count()).toBe(1);
    await sp.getByRole("button", { name: "Edit Role" }).click();
    expect(await sp.locator("option[value=SUPER_ADMIN]").count()).toBe(1);
    await sctx.close();
  }, 120_000);

  it("settings: an EDITOR's Store status switch is disabled; an ADMIN's works", async () => {
    const ctx = await newContext(F.admin.editor);
    const { page, report } = await visit(ctx, "/admin/settings");
    expectHealthy("/admin/settings", report, "Artisans Stories");
    const sw = page.getByRole("switch");
    await expect.poll(() => sw.getAttribute("aria-disabled")).toBe("true");
    await sw.click();
    expect(await sw.getAttribute("aria-checked")).toBe("false");
    expect(report.text + (await page.evaluate(() => document.body.innerText))).toContain("Only an Admin or Super Admin can take the store live");
    await ctx.close();
    const actx = await newContext(F.admin.admin);
    const { page: ap } = await visit(actx, "/admin/settings");
    const asw = ap.getByRole("switch");
    await expect.poll(() => asw.getAttribute("aria-disabled")).toBe("false");
    await asw.click();
    expect(await asw.getAttribute("aria-checked")).toBe("true");
    await actx.close();
  }, 120_000);

  it("artisan edit page: Instagram panel shows status, a Connect link to the nonce-protected route, and Disconnect", async () => {
    const ctx = await newContext(F.admin.super);
    const { page, report } = await visit(ctx, `/admin/artisans/${F.artisan.maria}/edit`);
    expectHealthy("maria edit", report, "Instagram Connection");
    const panel = page.getByTestId("instagram-connection");
    await expect.poll(() => panel.innerText()).toMatch(/Connected \(Instagram user 17841400000\)/);
    expect(await panel.getByRole("link", { name: "Reconnect Instagram" }).getAttribute("href")).toBe(`/api/admin/instagram/connect?artisanId=${F.artisan.maria}`);
    await panel.getByRole("button", { name: "Disconnect" }).click();
    await expect.poll(async () => (await prisma.artisan.findUniqueOrThrow({ where: { id: F.artisan.maria } })).igAccessToken).toBeNull();
    await expect.poll(() => panel.innerText()).toContain("Not connected.");
    const { page: jose } = await visit(ctx, `/admin/artisans/${F.artisan.jose}/edit`);
    const jp = jose.getByTestId("instagram-connection");
    await expect.poll(() => jp.innerText()).toContain("Not connected.");
    expect(await jp.getByRole("link", { name: "Connect Instagram" }).getAttribute("href")).toBe(`/api/admin/instagram/connect?artisanId=${F.artisan.jose}`);
    expect(await jp.getByRole("button", { name: "Disconnect" }).count()).toBe(0);
    await ctx.close();
  }, 120_000);

  it("AI Assistants: an EDITOR can't toggle or mint", async () => {
    const ctx = await newContext(F.admin.editor);
    const { page, report } = await visit(ctx, "/admin/settings/ai");
    expectHealthy("/admin/settings/ai", report, "AI Assistants");
    const toggle = page.getByRole("switch", { name: "AI assistant access" });
    if (await toggle.count()) expect(await toggle.isDisabled()).toBe(true);
    const connect = page.getByRole("button", { name: "Connect Muse" });
    if (await connect.count()) expect(await connect.isDisabled()).toBe(true);
    expect(await prisma.tenantApiKey.count({ where: { tenantId: OTHER, revokedAt: null } })).toBe(2);
    await ctx.close();
  });
});
