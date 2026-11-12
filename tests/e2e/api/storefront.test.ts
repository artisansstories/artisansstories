/**
 * Storefront content (house-only): welcome email template, landing page,
 * Instagram status, and MCP registration for the whole storefront tool set.
 * Link Hub lives in storefront-linktree.test.ts.
 *
 * Routes run with real admin sessions; MCP runs in-process against /api/mcp.
 * Every write is read back through the GET route and/or the MCP read tool.
 */
import { describe, it, expect } from "vitest";
import { Client } from "pg";
import { F, KEYS, HOUSE } from "../seed";
import { call } from "../helpers/route";
import { signInAs } from "../helpers/session";
import { connectMcp, previewConfirmReplay, expectConfirmed, expectReplayBlocked } from "../helpers/mcp";
import { s3State, fetchState, PNG_1PX } from "../helpers/fakes";
import * as emailRoute from "@/app/api/admin/email-template/route";
import * as uploadLogo from "@/app/api/admin/email-template/upload-logo/route";
import * as uploadAvatar from "@/app/api/admin/email-template/upload-avatar/route";
import * as landingSettings from "@/app/api/admin/landing-page/settings/route";
import * as landingUpload from "@/app/api/admin/landing-page/upload/route";

const R2 = "https://r2.e2e.test";
const IMG = "https://images.example.test/photo.png";
const PRIVATE_IMG = "https://private.example.test/x.png";

export const STOREFRONT_TOOLS = [
  "email_template_get",
  "email_template_update",
  "email_template_upload_logo",
  "email_template_upload_avatar",
  "landing_page_get",
  "landing_page_update",
  "landing_page_upload_image",
  "linktree_settings_get",
  "linktree_settings_update",
  "linktree_links_list",
  "linktree_link_create",
  "linktree_link_update",
  "linktree_link_delete",
  "linktree_links_reorder",
  "linktree_analytics",
  "instagram_status",
];

async function sql<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    return (await c.query(text, params)).rows as T[];
  } finally {
    await c.end();
  }
}

const templateRow = async (tenantId: string) =>
  (await sql(`SELECT * FROM "WelcomeEmailTemplate" WHERE "tenantId" = $1`, [tenantId]))[0];
const landingRow = async () => (await sql(`SELECT * FROM "LandingPageSettings" WHERE id = 'singleton'`))[0];

function pngForm(name = "logo.png", type = "image/png", extra: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.append("file", new File([PNG_1PX], name, { type }));
  for (const [k, v] of Object.entries(extra)) fd.append(k, v);
  return fd;
}

function textForm(): FormData {
  const fd = new FormData();
  fd.append("file", new File(["hello, not an image"], "notes.txt", { type: "text/plain" }));
  return fd;
}

// ── registration ────────────────────────────────────────────────────────────

describe("storefront MCP registration (house-only)", () => {
  it("house admin key sees all 16 storefront tools", async () => {
    const mcp = await connectMcp(KEYS.houseAdmin);
    const names = await mcp.toolNames();
    for (const t of STOREFRONT_TOOLS) expect(names, t).toContain(t);
    await mcp.close();
  });

  it("other store's admin key sees none of them, and calling one fails without touching data", async () => {
    const mcp = await connectMcp(KEYS.otherAdmin);
    const names = await mcp.toolNames();
    for (const t of STOREFRONT_TOOLS) expect(names, t).not.toContain(t);
    const res = await mcp.raw("email_template_update", { greetingText: "hijack" });
    expect(res.isError).toBe(true);
    const lp = await mcp.raw("landing_page_update", { heroTitle: "hijack" });
    expect(lp.isError).toBe(true);
    expect((await templateRow(HOUSE)).greetingText).toBe("Welcome, friend");
    expect((await landingRow()).heroTitle).toBe("Handcrafted treasures from El Salvador");
    await mcp.close();
  });

  it("house read-only key gets the read tools but no write tools", async () => {
    const mcp = await connectMcp(KEYS.houseRead);
    const names = await mcp.toolNames();
    for (const t of ["email_template_get", "landing_page_get", "linktree_settings_get", "linktree_links_list", "linktree_analytics", "instagram_status"]) {
      expect(names, t).toContain(t);
    }
    for (const t of ["email_template_update", "landing_page_update", "linktree_link_create", "linktree_link_delete"]) {
      expect(names, t).not.toContain(t);
    }
    await mcp.close();
  });
});

// ── email template ──────────────────────────────────────────────────────────

describe("email template routes", () => {
  it("GET: 401 without session, 403 for the other store, house row for house admin", async () => {
    expect((await call(emailRoute.GET as never, "GET", "/api/admin/email-template")).status).toBe(401);
    await signInAs(F.admin.oSuper);
    const other = await call(emailRoute.GET as never, "GET", "/api/admin/email-template");
    expect(other.status).toBe(403);
    expect(JSON.stringify(other.body)).not.toContain("Other welcome");
    await signInAs(F.admin.super);
    const r = await call(emailRoute.GET as never, "GET", "/api/admin/email-template");
    expect(r.status).toBe(200);
    expect(r.body.template).toMatchObject({ id: F.template.house, tenantId: HOUSE, greetingText: "Welcome, friend", bodyHtml: "<p>Thanks for joining</p>", accentColor: "#8B6914" });
  });

  it("POST saves a full body for the house store only; read back via GET and MCP", async () => {
    await signInAs(F.admin.super);
    const cur = (await call(emailRoute.GET as never, "GET", "/api/admin/email-template")).body.template;
    const body = {
      ...cur,
      greetingText: "Hola, amigo",
      bodyHtml: "<p>New body</p>",
      accentColor: "#112233",
      socialLinks: [{ id: "instagram", platform: "instagram", url: "https://instagram.com/as", enabled: true }],
      signatureData: { name: "Anna", closing: "With love," },
    };
    const r = await call(emailRoute.POST as never, "POST", "/api/admin/email-template", { body });
    expect(r.status).toBe(200);
    expect(r.body.template).toMatchObject({ id: F.template.house, greetingText: "Hola, amigo", accentColor: "#112233" });

    const back = await call(emailRoute.GET as never, "GET", "/api/admin/email-template");
    expect(back.body.template).toMatchObject({
      greetingText: "Hola, amigo",
      bodyHtml: "<p>New body</p>",
      socialLinks: [{ id: "instagram", platform: "instagram", url: "https://instagram.com/as", enabled: true }],
      signatureData: { name: "Anna", closing: "With love," },
    });
    const mcp = await connectMcp(KEYS.houseAdmin);
    expect((await mcp.call("email_template_get")).template.greetingText).toBe("Hola, amigo");
    await mcp.close();
    // The other store's template is untouched.
    expect((await templateRow("tenant_other_store")).greetingText).toBe("Other welcome");
  });

  it("POST: 401 without session; 403 for the other store and nothing changes", async () => {
    const body = { greetingText: "hijack" };
    expect((await call(emailRoute.POST as never, "POST", "/api/admin/email-template", { body })).status).toBe(401);
    await signInAs(F.admin.oSuper);
    expect((await call(emailRoute.POST as never, "POST", "/api/admin/email-template", { body })).status).toBe(403);
    expect((await templateRow(HOUSE)).greetingText).toBe("Welcome, friend");
    expect((await templateRow("tenant_other_store")).greetingText).toBe("Other welcome");
  });
});

describe("email template uploads (routes)", () => {
  for (const [kind, mod, path] of [
    ["logo", uploadLogo, "/api/admin/email-template/upload-logo"],
    ["avatar", uploadAvatar, "/api/admin/email-template/upload-avatar"],
  ] as const) {
    it(`${kind}: real PNG lands in R2 under the house tenant prefix and returns the public URL`, async () => {
      await signInAs(F.admin.super);
      const r = await call(mod.POST as never, "POST", path, { formData: pngForm(`${kind}.png`) });
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      expect(s3State.puts).toHaveLength(1);
      const put = s3State.puts[0];
      expect(put.Key).toMatch(new RegExp(`^tenants/${HOUSE}/email/${kind}-\\d+\\.png$`));
      expect(put.ContentType).toBe("image/png");
      expect(put.size).toBe(PNG_1PX.length);
      expect(r.body).toEqual({ url: `${R2}/${put.Key}`, filename: `${kind}.png` });
    });

    it(`${kind}: wrong type → 400, no file → 400, nothing stored`, async () => {
      await signInAs(F.admin.super);
      const bad = await call(mod.POST as never, "POST", path, { formData: textForm() });
      expect(bad.status).toBe(400);
      const none = await call(mod.POST as never, "POST", path, { formData: new FormData() });
      expect(none.status).toBe(400);
      expect(s3State.puts).toHaveLength(0);
    });

    it(`${kind}: 401 without session, 403 for the other store`, async () => {
      expect((await call(mod.POST as never, "POST", path, { formData: pngForm() })).status).toBe(401);
      await signInAs(F.admin.oSuper);
      expect((await call(mod.POST as never, "POST", path, { formData: pngForm() })).status).toBe(403);
      expect(s3State.puts).toHaveLength(0);
    });
  }
});

describe("email template MCP", () => {
  it("email_template_get returns the seeded house template", async () => {
    const mcp = await connectMcp(KEYS.houseAdmin);
    const r = await mcp.call("email_template_get");
    expect(r.template).toMatchObject({ id: F.template.house, tenantId: HOUSE, greetingText: "Welcome, friend", accentColor: "#8B6914" });
    await mcp.close();
  });

  it("email_template_update: preview (no change) → confirm → replay blocked → read back", async () => {
    const mcp = await connectMcp(KEYS.houseAdmin);
    const args = { greetingText: "Bienvenidos", signatureData: { name: "Anna", closing: "Abrazos" } };
    const flow = await previewConfirmReplay(mcp, "email_template_update", args, async (p) => {
      expect(p.preview.changedFields).toEqual(expect.arrayContaining(["greetingText", "signatureName", "signatureText", "signatureData"]));
      expect(p.preview.changes.greetingText).toEqual({ before: "Welcome, friend", after: "Bienvenidos" });
      expect((await templateRow(HOUSE)).greetingText).toBe("Welcome, friend");
    });
    const result = expectConfirmed(flow);
    expect(result.template).toMatchObject({ greetingText: "Bienvenidos", signatureName: "Anna", signatureText: "Abrazos" });
    expectReplayBlocked(flow);

    const back = await mcp.call("email_template_get");
    expect(back.template).toMatchObject({
      greetingText: "Bienvenidos",
      bodyHtml: "<p>Thanks for joining</p>", // untouched fields kept
      accentColor: "#8B6914",
      signatureData: { name: "Anna", closing: "Abrazos" },
    });
    await signInAs(F.admin.super);
    expect((await call(emailRoute.GET as never, "GET", "/api/admin/email-template")).body.template.greetingText).toBe("Bienvenidos");
    expect((await templateRow("tenant_other_store")).greetingText).toBe("Other welcome");
    await mcp.close();
  });

  for (const kind of ["logo", "avatar"] as const) {
    it(`email_template_upload_${kind}: preview (no upload) → confirm stores PNG → replay blocked`, async () => {
      const mcp = await connectMcp(KEYS.houseAdmin);
      const flow = await previewConfirmReplay(mcp, `email_template_upload_${kind}`, { imageUrl: IMG }, (p) => {
        expect(p.preview).toMatchObject({ source: IMG, fileName: "photo.png", contentType: "image/png", bytes: PNG_1PX.length, publishes: false });
        expect(p.preview.storesAs).toContain(`tenants/${HOUSE}/email/${kind}-`);
        expect(s3State.puts).toHaveLength(0);
      });
      const result = expectConfirmed(flow);
      expectReplayBlocked(flow);
      expect(s3State.puts).toHaveLength(1);
      expect(s3State.puts[0].Key).toMatch(new RegExp(`^tenants/${HOUSE}/email/${kind}-\\d+\\.png$`));
      expect(s3State.puts[0].ContentType).toBe("image/png");
      expect(result).toEqual({ url: `${R2}/${s3State.puts[0].Key}`, filename: "photo.png" });
      // The template itself is unchanged until the URL is passed to email_template_update.
      expect((await templateRow(HOUSE)).logoUrl).toBeNull();
      await mcp.close();
    });

    it(`email_template_upload_${kind}: private host refused, 404 image refused, nothing stored`, async () => {
      const mcp = await connectMcp(KEYS.houseAdmin);
      const priv = await mcp.call(`email_template_upload_${kind}`, { imageUrl: PRIVATE_IMG });
      expect(priv).toMatchObject({ done: false, blocked: true, status: 400 });
      expect(priv.reason).toMatch(/not public/i);
      expect(fetchState.served.some((u) => u.includes("private"))).toBe(false);
      const missing = await mcp.call(`email_template_upload_${kind}`, { imageUrl: "https://images.example.test/missing.png" });
      expect(missing).toMatchObject({ done: false, blocked: true, status: 400 });
      const http = await mcp.call(`email_template_upload_${kind}`, { imageUrl: "http://images.example.test/a.png" });
      expect(http).toMatchObject({ done: false, blocked: true });
      expect(s3State.puts).toHaveLength(0);
      await mcp.close();
    });
  }

  it("upload_logo URL → email_template_update logoUrl → visible via GET route", async () => {
    const mcp = await connectMcp(KEYS.houseAdmin);
    const up = expectConfirmed(await previewConfirmReplay(mcp, "email_template_upload_logo", { imageUrl: IMG }));
    expectConfirmed(await previewConfirmReplay(mcp, "email_template_update", { logoUrl: up.url }));
    await signInAs(F.admin.super);
    expect((await call(emailRoute.GET as never, "GET", "/api/admin/email-template")).body.template.logoUrl).toBe(up.url);
    await mcp.close();
  });
});

// ── landing page ────────────────────────────────────────────────────────────

describe("landing page routes", () => {
  it("GET: 401 without session, 403 for the other store, seeded singleton for house admin", async () => {
    expect((await call(landingSettings.GET as never, "GET", "/api/admin/landing-page/settings")).status).toBe(401);
    await signInAs(F.admin.oSuper);
    expect((await call(landingSettings.GET as never, "GET", "/api/admin/landing-page/settings")).status).toBe(403);
    await signInAs(F.admin.super);
    const r = await call(landingSettings.GET as never, "GET", "/api/admin/landing-page/settings");
    expect(r.status).toBe(200);
    expect(r.body.settings).toMatchObject({
      id: "singleton",
      heroTitle: "Handcrafted treasures from El Salvador",
      heroSubtitle: "Join the waitlist",
      aboutTitle: "Meet Anna",
      socialLinks: [{ platform: "instagram", url: "https://instagram.com/artisansstories" }],
    });
  });

  it("POST saves for the house admin; read back via GET and landing_page_get", async () => {
    await signInAs(F.admin.super);
    const cur = (await call(landingSettings.GET as never, "GET", "/api/admin/landing-page/settings")).body.settings;
    const body = {
      ...cur,
      heroTitle: "New hero",
      aboutContent: "<p>About us</p>",
      showEmailForm: false,
      emailButtonText: "Tell me",
      socialLinks: [{ platform: "tiktok", url: "https://tiktok.com/@as" }],
    };
    const r = await call(landingSettings.POST as never, "POST", "/api/admin/landing-page/settings", { body });
    expect(r.status).toBe(200);
    expect(r.body.settings).toMatchObject({ heroTitle: "New hero", showEmailForm: false, emailButtonText: "Tell me" });
    const back = (await call(landingSettings.GET as never, "GET", "/api/admin/landing-page/settings")).body.settings;
    expect(back).toMatchObject({ heroTitle: "New hero", aboutContent: "<p>About us</p>", aboutTitle: "Meet Anna", socialLinks: [{ platform: "tiktok", url: "https://tiktok.com/@as" }] });
    const mcp = await connectMcp(KEYS.houseAdmin);
    expect((await mcp.call("landing_page_get")).settings.heroTitle).toBe("New hero");
    await mcp.close();
  });

  it("POST: 401 without session; 403 for the other store and the page is unchanged", async () => {
    const body = { heroTitle: "Hijacked" };
    expect((await call(landingSettings.POST as never, "POST", "/api/admin/landing-page/settings", { body })).status).toBe(401);
    await signInAs(F.admin.oSuper);
    expect((await call(landingSettings.POST as never, "POST", "/api/admin/landing-page/settings", { body })).status).toBe(403);
    expect((await landingRow()).heroTitle).toBe("Handcrafted treasures from El Salvador");
  });

  it("upload: PNG converted to WebP under tenants/<house>/landing-page/<field>-<uuid>.webp", async () => {
    await signInAs(F.admin.super);
    const r = await call(landingUpload.POST as never, "POST", "/api/admin/landing-page/upload", {
      formData: pngForm("hero.png", "image/png", { field: "heroImageUrl" }),
    });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(s3State.puts).toHaveLength(1);
    const put = s3State.puts[0];
    expect(put.Key).toMatch(new RegExp(`^tenants/${HOUSE}/landing-page/heroImageUrl-[0-9a-f-]{36}\\.webp$`));
    expect(put.ContentType).toBe("image/webp");
    expect(r.body).toEqual({ url: `${R2}/${put.Key}` });
    // Upload alone does not change the page.
    expect((await landingRow()).heroImageUrl).toBeNull();
  });

  it("upload: wrong type → 400, missing file → 400, unknown field → 400, nothing stored", async () => {
    await signInAs(F.admin.super);
    const fd = textForm();
    fd.append("field", "heroImageUrl");
    expect((await call(landingUpload.POST as never, "POST", "/api/admin/landing-page/upload", { formData: fd })).status).toBe(400);
    const none = new FormData();
    none.append("field", "heroImageUrl");
    expect((await call(landingUpload.POST as never, "POST", "/api/admin/landing-page/upload", { formData: none })).status).toBe(400);
    const badField = await call(landingUpload.POST as never, "POST", "/api/admin/landing-page/upload", {
      formData: pngForm("x.png", "image/png", { field: "../../tenants/other/evil" }),
    });
    expect(badField.status).toBe(400);
    expect(s3State.puts).toHaveLength(0);
  });

  it("upload: 401 without session, 403 for the other store", async () => {
    const form = () => pngForm("hero.png", "image/png", { field: "heroImageUrl" });
    expect((await call(landingUpload.POST as never, "POST", "/api/admin/landing-page/upload", { formData: form() })).status).toBe(401);
    await signInAs(F.admin.oSuper);
    expect((await call(landingUpload.POST as never, "POST", "/api/admin/landing-page/upload", { formData: form() })).status).toBe(403);
    expect(s3State.puts).toHaveLength(0);
  });
});

describe("landing page MCP", () => {
  it("landing_page_get returns the seeded singleton", async () => {
    const mcp = await connectMcp(KEYS.houseAdmin);
    const r = await mcp.call("landing_page_get");
    expect(r.settings).toMatchObject({ id: "singleton", heroTitle: "Handcrafted treasures from El Salvador", aboutTitle: "Meet Anna" });
    await mcp.close();
  });

  it("landing_page_update: preview (no change) → confirm → replay blocked → read back", async () => {
    const mcp = await connectMcp(KEYS.houseAdmin);
    const args = { heroTitle: "Live soon", showComingSoonBadge: false, emailSubText: "Promise, no spam" };
    const flow = await previewConfirmReplay(mcp, "landing_page_update", args, async (p) => {
      expect(p.preview.createsRow).toBe(false);
      expect(p.preview.changes.heroTitle).toEqual({ before: "Handcrafted treasures from El Salvador", after: "Live soon" });
      expect(p.preview.changedFields).toEqual(expect.arrayContaining(["heroTitle", "showComingSoonBadge", "emailSubText"]));
      expect((await landingRow()).heroTitle).toBe("Handcrafted treasures from El Salvador");
    });
    expect(expectConfirmed(flow).settings).toMatchObject({ heroTitle: "Live soon", showComingSoonBadge: false });
    expectReplayBlocked(flow);
    const back = (await mcp.call("landing_page_get")).settings;
    expect(back).toMatchObject({
      heroTitle: "Live soon",
      showComingSoonBadge: false,
      emailSubText: "Promise, no spam",
      aboutTitle: "Meet Anna", // untouched
      heroSubtitle: "Join the waitlist",
      socialLinks: [{ platform: "instagram", url: "https://instagram.com/artisansstories" }],
    });
    await signInAs(F.admin.super);
    expect((await call(landingSettings.GET as never, "GET", "/api/admin/landing-page/settings")).body.settings.heroTitle).toBe("Live soon");
    await mcp.close();
  });

  it("landing_page_upload_image: preview (no upload) → confirm stores WebP → replay blocked", async () => {
    const mcp = await connectMcp(KEYS.houseAdmin);
    const flow = await previewConfirmReplay(mcp, "landing_page_upload_image", { imageUrl: IMG, field: "aboutImageUrl" }, (p) => {
      expect(p.preview).toMatchObject({ source: IMG, contentType: "image/png", publishes: false });
      expect(p.preview.storesAs).toBe(`tenants/${HOUSE}/landing-page/aboutImageUrl-<uuid>.webp`);
      expect(s3State.puts).toHaveLength(0);
    });
    const result = expectConfirmed(flow);
    expectReplayBlocked(flow);
    expect(s3State.puts).toHaveLength(1);
    expect(s3State.puts[0].Key).toMatch(new RegExp(`^tenants/${HOUSE}/landing-page/aboutImageUrl-[0-9a-f-]{36}\\.webp$`));
    expect(s3State.puts[0].ContentType).toBe("image/webp");
    expect(result).toEqual({ url: `${R2}/${s3State.puts[0].Key}` });
    // Wire it into the page and read it back.
    expectConfirmed(await previewConfirmReplay(mcp, "landing_page_update", { aboutImageUrl: result.url }));
    expect((await mcp.call("landing_page_get")).settings.aboutImageUrl).toBe(result.url);
    await mcp.close();
  });

  it("landing_page_upload_image: private host refused, bad field rejected, nothing stored", async () => {
    const mcp = await connectMcp(KEYS.houseAdmin);
    const priv = await mcp.call("landing_page_upload_image", { imageUrl: PRIVATE_IMG, field: "heroImageUrl" });
    expect(priv).toMatchObject({ done: false, blocked: true, status: 400 });
    // Schema enum: rejected by input validation before any fetch.
    const bad = await mcp.raw("landing_page_upload_image", { imageUrl: IMG, field: "evil" });
    expect(bad.isError).toBe(true);
    expect(fetchState.served).toHaveLength(0);
    expect(s3State.puts).toHaveLength(0);
    await mcp.close();
  });
});

// ── Instagram ───────────────────────────────────────────────────────────────

describe("instagram_status MCP", () => {
  it("reports per-artisan connection state for the house store only, never the token", async () => {
    const mcp = await connectMcp(KEYS.houseAdmin);
    const raw = await mcp.raw("instagram_status");
    const text = (raw.content as { text: string }[])[0].text;
    expect(text).not.toContain("IGSECRET");
    const r = JSON.parse(text);
    expect(r.artisans.map((a: { id: string }) => a.id)).toEqual([F.artisan.jose, F.artisan.maria]); // name asc
    const maria = r.artisans.find((a: { id: string }) => a.id === F.artisan.maria);
    expect(maria).toMatchObject({ connected: true, hasToken: true, igUserId: "17841400000", tokenExpired: false });
    expect(maria.daysUntilExpiry).toBeGreaterThanOrEqual(29);
    expect(maria.daysUntilExpiry).toBeLessThanOrEqual(30);
    expect(maria).not.toHaveProperty("igAccessToken");
    const jose = r.artisans.find((a: { id: string }) => a.id === F.artisan.jose);
    expect(jose).toMatchObject({ connected: false, hasToken: false, igUserId: null, tokenExpiresAt: null, daysUntilExpiry: null });
    // OAuth needs a browser: the tool hands back the admin page to click.
    expect(jose.connectAdminUrl).toBe(`https://artisansstories.com/admin/artisans/${F.artisan.jose}/edit#instagram`);
    expect(jose.nextStep).toContain('click "Connect Instagram"');
    expect(maria).not.toHaveProperty("connectAdminUrl");
    await mcp.close();
  });

  it("expired token shows connected:false, tokenExpired:true", async () => {
    await sql(`UPDATE "Artisan" SET "igTokenExpiry" = NOW() - INTERVAL '1 day' WHERE id = $1`, [F.artisan.maria]);
    const mcp = await connectMcp(KEYS.houseAdmin);
    const maria = (await mcp.call("instagram_status")).artisans.find((a: { id: string }) => a.id === F.artisan.maria);
    expect(maria).toMatchObject({ connected: false, hasToken: true, tokenExpired: true, connectAdminUrl: `https://artisansstories.com/admin/artisans/${F.artisan.maria}/edit#instagram` });
    expect(maria.nextStep).toMatch(/^The Instagram token expired\./);
    await mcp.close();
  });
});
