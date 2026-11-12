import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Ordered log of side effects so we can assert sequencing (matches main:
// save reply -> send email -> log email -> mark REPLIED).
const calls: string[] = [];

// ── auth / tenant ────────────────────────────────────────────────────────────
const getAdminSession = vi.fn();
vi.mock("@/lib/admin-auth", () => ({
  getAdminSession: (...a: unknown[]) => getAdminSession(...a),
}));

const db = {
  $tenantId: "tenant_a",
  contactMessage: { findUnique: vi.fn(), update: vi.fn() },
  contactReply: { create: vi.fn() },
};
// Mirrors the real chain: getTenantPrismaForAdmin resolves the tenant from the
// admin session and throws TenantResolutionError when there is none.
vi.mock("@/lib/tenant-context", () => {
  class TenantResolutionError extends Error {
    readonly status = 401;
  }
  return {
    TenantResolutionError,
    getTenantPrismaForAdmin: async () => {
      const s = await getAdminSession();
      if (!s?.tenantId) throw new TenantResolutionError("No admin session");
      return db;
    },
  };
});

// ── email sender ─────────────────────────────────────────────────────────────
const resendSend = vi.fn();
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: (...a: unknown[]) => resendSend(...a) };
  },
}));
const logEmail = vi.fn();
vi.mock("@/lib/email-log", () => ({ logEmail: (...a: unknown[]) => logEmail(...a) }));
vi.mock("@/lib/email-branding", () => ({
  getEmailBranding: async () => ({
    storeName: "Test & <Store>",
    from: "Test Store <hello@test.store>",
    fromAddress: "hello@test.store",
    replyTo: null,
    accentColor: "#000",
    logoUrl: "",
  }),
  emailLogoHtml: () => "<span>logo</span>",
}));

import { POST } from "@/app/api/admin/contact/[id]/reply/route";
import { proxy } from "@/proxy";

const SESSION = { id: "admin_1", email: "a@test.store", name: "A", role: "ADMIN", tenantId: "tenant_a" };
const params = { params: Promise.resolve({ id: "msg_1" }) };

const XSS_REPLY = `Thanks!\n<script>alert("reply")</script> & 'more'`;
const XSS_MESSAGE = `Hello\n<script>alert('orig')</script>`;

const contactMsg = {
  id: "msg_1",
  tenantId: "tenant_a",
  name: `Eve <img src=x onerror=alert(1)>`,
  email: "eve@example.com",
  subject: `Hi <b>there</b>`,
  message: XSS_MESSAGE,
  status: "UNREAD",
  notes: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

function req(body: unknown, cookie?: string) {
  return new NextRequest("http://localhost/api/admin/contact/msg_1/reply", {
    method: "POST",
    headers: { host: "localhost", "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  calls.length = 0;
  vi.clearAllMocks();
  getAdminSession.mockResolvedValue(SESSION);
  db.contactMessage.findUnique.mockResolvedValue(contactMsg);
  db.contactReply.create.mockImplementation(async (a: { data: Record<string, unknown> }) => {
    calls.push("reply.create");
    return { id: "rep_1", ...a.data, createdAt: "2026-01-02T00:00:00.000Z" };
  });
  resendSend.mockImplementation(async () => {
    calls.push("email.send");
    return { data: { id: "re_123" }, error: null };
  });
  logEmail.mockImplementation(async () => {
    calls.push("email.log");
  });
  db.contactMessage.update.mockImplementation(async () => {
    calls.push("message.update");
    return { ...contactMsg, status: "REPLIED", replies: [{ id: "rep_1" }] };
  });
});

describe("POST /api/admin/contact/[id]/reply", () => {
  it("200 with { success, message, reply } and side effects in main's order", async () => {
    const res = await POST(req({ replyText: `  ${XSS_REPLY}  ` }), params);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Object.keys(json).sort()).toEqual(["message", "reply", "success"]);
    expect(json.success).toBe(true);
    expect(json.message).toMatchObject({ id: "msg_1", status: "REPLIED", replies: [{ id: "rep_1" }] });
    expect(json.reply).toMatchObject({
      id: "rep_1",
      tenantId: "tenant_a",
      contactMessageId: "msg_1",
      body: XSS_REPLY, // stored raw (trimmed); escaping is only for HTML output
      direction: "OUTBOUND",
      senderName: "Test & <Store>",
    });
    expect(calls).toEqual(["reply.create", "email.send", "email.log", "message.update"]);
    expect(db.contactMessage.update).toHaveBeenCalledWith({
      where: { id: "msg_1" },
      data: { status: "REPLIED" },
      include: { replies: { orderBy: { createdAt: "asc" } } },
    });
  });

  it("HTML-escapes reply, original message, name and store name in the sent HTML", async () => {
    await POST(req({ replyText: XSS_REPLY }), params);
    expect(resendSend).toHaveBeenCalledTimes(1);
    const sent = resendSend.mock.calls[0][0] as { html: string; text: string; subject: string; to: string[] };
    const html = sent.html;

    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("Test & <Store>");
    expect(html).toContain(`&lt;script&gt;alert(&quot;reply&quot;)&lt;/script&gt; &amp; &#39;more&#39;`);
    expect(html).toContain(`&lt;script&gt;alert(&#39;orig&#39;)&lt;/script&gt;`);
    expect(html).toContain("Hi Eve &lt;img src=x onerror=alert(1)&gt;,");
    expect(html).toContain("Test &amp; &lt;Store&gt;");
    // Line breaks preserved as <br> (after escaping).
    expect(html).toContain("Thanks!<br>&lt;script&gt;");
    expect(html).toContain("Hello<br>&lt;script&gt;");

    // Non-HTML parts are unchanged from main.
    expect(sent.to).toEqual(["eve@example.com"]);
    expect(sent.subject).toBe("Re: Hi <b>there</b>");
    expect(sent.text).toContain(XSS_REPLY);
  });

  it("escapes user text in the logged email HTML too", async () => {
    await POST(req({ replyText: XSS_REPLY }), params);
    const logged = logEmail.mock.calls[0][0] as { bodyHtml: string; type: string; resendId: string };
    expect(logged.type).toBe("CONTACT_REPLY");
    expect(logged.resendId).toBe("re_123");
    expect(logged.bodyHtml).not.toContain("<script>");
    expect(logged.bodyHtml).not.toContain("<b>there</b>");
    expect(logged.bodyHtml).toContain("&lt;script&gt;");
    expect(logged.bodyHtml).toContain("Re: Hi &lt;b&gt;there&lt;/b&gt;");
  });

  it("400 when reply text is blank, nothing sent", async () => {
    const res = await POST(req({ replyText: "   " }), params);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Reply text is required" });
    expect(resendSend).not.toHaveBeenCalled();
    expect(db.contactReply.create).not.toHaveBeenCalled();
  });

  it("404 when the message does not exist, nothing sent", async () => {
    db.contactMessage.findUnique.mockResolvedValue(null);
    const res = await POST(req({ replyText: "hi" }), params);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Message not found" });
    expect(resendSend).not.toHaveBeenCalled();
  });

  describe("no session", () => {
    it("401 from the /api/admin proxy (no cookie), route never runs, no email", async () => {
      getAdminSession.mockResolvedValue(null);
      const res = await proxy(req({ replyText: "hi" }));
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "Unauthorized" });
      expect(resendSend).not.toHaveBeenCalled();
      expect(db.contactReply.create).not.toHaveBeenCalled();
    });

    it("401 from the proxy for an invalid session cookie, no email", async () => {
      const res = await proxy(req({ replyText: "hi" }, "as-admin-session=not-a-jwt"));
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "Unauthorized" });
      expect(resendSend).not.toHaveBeenCalled();
    });

    it("route itself (proxy bypassed): no email, no DB writes; status matches main (500)", async () => {
      getAdminSession.mockResolvedValue(null);
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      const res = await POST(req({ replyText: "hi" }), params);
      spy.mockRestore();
      // main has no in-route session check here: the TenantResolutionError from
      // getTenantPrismaForAdmin lands in the catch-all. Kept for parity.
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: "Failed to send reply" });
      expect(resendSend).not.toHaveBeenCalled();
      expect(logEmail).not.toHaveBeenCalled();
      expect(db.contactReply.create).not.toHaveBeenCalled();
      expect(db.contactMessage.update).not.toHaveBeenCalled();
    });
  });
});
