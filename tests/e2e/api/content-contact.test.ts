/**
 * Contact inbox, communications feed and email log:
 *   /api/admin/contact (GET), /api/admin/contact/[id] (PATCH),
 *   /api/admin/contact/[id]/reply (POST), /api/admin/communications (GET),
 *   /api/admin/email-log/[id] (GET)
 * and contact_messages_list, contact_message_get, contact_message_update,
 * contact_message_reply, communications_list, email_log_get.
 * Not house-only: every store has an inbox, scoped to its own tenant.
 */
import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/prisma";
import { F, KEYS, HOUSE, OTHER } from "../seed";
import { call } from "../helpers/route";
import { signInAs } from "../helpers/session";
import { resendState, sentTo } from "../helpers/fakes";
import { connectMcp, previewConfirmReplay, expectConfirmed, expectReplayBlocked } from "../helpers/mcp";
import * as contactList from "@/app/api/admin/contact/route";
import * as contactOne from "@/app/api/admin/contact/[id]/route";
import * as contactReply from "@/app/api/admin/contact/[id]/reply/route";
import * as comms from "@/app/api/admin/communications/route";
import * as emailLog from "@/app/api/admin/email-log/[id]/route";

const listContact = (query?: Record<string, string>) => call(contactList.GET as never, "GET", "/api/admin/contact", { query });
const patchContact = (id: string, body: unknown) => call(contactOne.PATCH as never, "PATCH", `/api/admin/contact/${id}`, { params: { id }, body });
const postReply = (id: string, body: unknown) => call(contactReply.POST as never, "POST", `/api/admin/contact/${id}/reply`, { params: { id }, body });
const getComms = (query?: Record<string, string>) => call(comms.GET as never, "GET", "/api/admin/communications", { query });
const getEmailLog = (id: string) => call(emailLog.GET as never, "GET", `/api/admin/email-log/${id}`, { params: { id } });

const XSS_NAME = `Carla <img src=x onerror=alert(1)>`;
const XSS_MESSAGE = `Do you sell wholesale?\n<script>steal()</script>`;
const XSS_REPLY = `Yes we do & ship "fast".\n<script>alert('admin')</script>`;

async function makeHostileMessage() {
  await prisma.contactMessage.update({ where: { id: F.msg.unread }, data: { name: XSS_NAME, message: XSS_MESSAGE, subject: "Wholesale <b>now</b>" } });
}

function expectEscaped(html: string) {
  expect(html).not.toContain("<script>");
  expect(html).not.toContain("<img src=x");
  expect(html).toContain("&lt;script&gt;alert(&#39;admin&#39;)&lt;/script&gt;");
  expect(html).toContain("Yes we do &amp; ship &quot;fast&quot;.<br>");
}

async function messageState(id: string) {
  const m = await prisma.contactMessage.findUniqueOrThrow({ where: { id }, include: { replies: true } });
  const logs = await prisma.emailLog.findMany({ where: { relatedId: id, type: "CONTACT_REPLY" } });
  return { status: m.status, replies: m.replies.length, logs: logs.length };
}

describe("contact / communications / email-log routes: auth", () => {
  const cases: [string, () => Promise<{ status: number }>][] = [
    ["GET contact", () => listContact()],
    ["PATCH contact", () => patchContact(F.msg.unread, { status: "ARCHIVED" })],
    ["POST reply", () => postReply(F.msg.unread, { replyText: "hi" })],
    ["GET communications", () => getComms()],
    ["GET email-log", () => getEmailLog(F.email.confirmation)],
  ];
  for (const [name, run] of cases) {
    it(`${name}: no session → 401, nothing changes, no email`, async () => {
      expect((await run()).status).toBe(401);
      expect(await messageState(F.msg.unread)).toEqual({ status: "UNREAD", replies: 0, logs: 0 });
      expect(resendState.sent).toEqual([]);
    });
  }
});

describe("contact routes", () => {
  it("GET: house messages with replies, unreadCount, status filter, pagination", async () => {
    await signInAs(F.admin.super);
    const r = await listContact();
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ total: 2, pages: 1, unreadCount: 1 });
    expect(r.body.messages.map((m: { id: string }) => m.id)).toEqual([F.msg.unread, F.msg.replied]);
    expect(r.body.messages[1].replies.map((x: { body: string }) => x.body)).toEqual(["About a week."]);
    expect(r.text).not.toContain("olly@example.test");

    const replied = await listContact({ status: "REPLIED" });
    expect(replied.body.messages.map((m: { id: string }) => m.id)).toEqual([F.msg.replied]);
    expect((await listContact({ status: "ALL" })).body.total).toBe(2);
    const page2 = await listContact({ limit: "1", page: "2" });
    expect(page2.body).toMatchObject({ total: 2, pages: 2 });
    expect(page2.body.messages.map((m: { id: string }) => m.id)).toEqual([F.msg.replied]);
  });

  it("GET: the other store sees only its own inbox", async () => {
    await signInAs(F.admin.oSuper);
    const r = await listContact();
    expect(r.status).toBe(200);
    expect(r.body.messages.map((m: { id: string }) => m.id)).toEqual([F.msg.other]);
    expect(r.text).not.toContain("carla@example.test");
  });

  it("PATCH: status and notes, read back via GET; no email", async () => {
    await signInAs(F.admin.super);
    const r = await patchContact(F.msg.unread, { status: "READ", notes: "Follow up Monday" });
    expect(r.status).toBe(200);
    expect(r.body.message).toMatchObject({ id: F.msg.unread, status: "READ", notes: "Follow up Monday" });
    const l = await listContact();
    expect(l.body.unreadCount).toBe(0);
    expect(l.body.messages[0]).toMatchObject({ status: "READ", notes: "Follow up Monday" });
    // notes only → status untouched
    await patchContact(F.msg.unread, { notes: "x" });
    expect((await listContact()).body.messages[0]).toMatchObject({ status: "READ", notes: "x" });
    expect(resendState.sent).toEqual([]);
  });

  it("PATCH: unknown id / other store's id → 404; invalid status → 400 (not 500)", async () => {
    await signInAs(F.admin.super);
    expect((await patchContact("nope", { status: "READ" })).status).toBe(404);
    expect((await patchContact(F.msg.other, { status: "ARCHIVED" })).status).toBe(404);
    expect((await prisma.contactMessage.findUniqueOrThrow({ where: { id: F.msg.other } })).status).toBe("UNREAD");
    expect((await patchContact(F.msg.unread, { status: "BOGUS" })).status).toBe(400);
    expect((await patchContact(F.msg.unread, { notes: 5 })).status).toBe(400);
    expect((await prisma.contactMessage.findUniqueOrThrow({ where: { id: F.msg.unread } })).status).toBe("UNREAD");
  });

  it("POST reply: one escaped email to the sender, ContactReply + EmailLog, REPLIED; shows in communications + email log", async () => {
    await makeHostileMessage();
    await signInAs(F.admin.super);
    const r = await postReply(F.msg.unread, { replyText: XSS_REPLY });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ success: true, message: { id: F.msg.unread, status: "REPLIED" }, reply: { body: XSS_REPLY, direction: "OUTBOUND" } });

    expect(resendState.sent).toHaveLength(1);
    const [mail] = sentTo("carla@example.test");
    expect(mail.subject).toBe("Re: Wholesale <b>now</b>"); // header, not HTML
    expect(mail.replyTo).toBe("hello@artisansstories.com");
    expectEscaped(mail.html);
    expect(mail.html).toContain("Hi Carla &lt;img src=x onerror=alert(1)&gt;,");
    expect(mail.html).toContain("Do you sell wholesale?<br>&lt;script&gt;steal()&lt;/script&gt;");

    const state = await messageState(F.msg.unread);
    expect(state).toEqual({ status: "REPLIED", replies: 1, logs: 1 });
    const log = await prisma.emailLog.findFirstOrThrow({ where: { relatedId: F.msg.unread, type: "CONTACT_REPLY" } });
    expect(log).toMatchObject({ tenantId: HOUSE, toEmail: "carla@example.test", relatedType: "CONTACT", subject: "Re: Wholesale <b>now</b>", resendId: "email_1" });
    expectEscaped(log.bodyHtml!);
    expect(log.bodyHtml).toContain("Wholesale &lt;b&gt;now&lt;/b&gt;");

    // Communications feed shows the conversation as REPLIED with the thread.
    const c = await getComms({ filter: "CONVERSATIONS" });
    const conv = c.body.items.find((i: { kind: string; data: { id: string } }) => i.kind === "conversation" && i.data.id === F.msg.unread);
    expect(conv.data.status).toBe("REPLIED");
    expect(conv.data.replies.map((x: { body: string }) => x.body)).toEqual([XSS_REPLY]);
    expect(c.body.unreadCount).toBe(0);

    // The email log entry is readable through the email-log route.
    const e = await getEmailLog(log.id);
    expect(e.status).toBe(200);
    expect(e.body.log).toMatchObject({ id: log.id, type: "CONTACT_REPLY", toEmail: "carla@example.test" });
  });

  it("POST reply: a hostile store name/logo URL is escaped in the logo header and sign-off", async () => {
    await prisma.tenant.update({ where: { id: OTHER }, data: { name: `Olga's <b>Shop</b>` } });
    await prisma.tenantTheme.update({ where: { tenantId: OTHER }, data: { logoUrl: `https://cdn.example.test/x.png" onerror="alert(1)` } });
    await signInAs(F.admin.oSuper);
    const r = await postReply(F.msg.other, { replyText: "Hi" });
    expect(r.status).toBe(200);
    const [mail] = sentTo("olly@example.test");
    expect(mail.html).not.toContain("<b>Shop</b>");
    expect(mail.html).not.toContain(`" onerror="`);
    expect(mail.html).toContain(`alt="Olga&#39;s &lt;b&gt;Shop&lt;/b&gt;"`);
    expect(mail.html).toContain(`src="https://cdn.example.test/x.png&quot; onerror=&quot;alert(1)"`);
    expect(mail.html).toContain("Olga&#39;s &lt;b&gt;Shop&lt;/b&gt;</p>");
  });

  it("POST reply: Resend failure → honest error, no reply row, no log, not REPLIED", async () => {
    await signInAs(F.admin.super);
    resendState.failNext = "Domain not verified";
    const r = await postReply(F.msg.unread, { replyText: "Hello" });
    expect(r.status).toBe(502);
    expect(r.body.error).toContain("Domain not verified");
    expect(await messageState(F.msg.unread)).toEqual({ status: "UNREAD", replies: 0, logs: 0 });
    expect(resendState.sent).toEqual([]);
  });

  it("POST reply: empty text → 400, unknown/other store → 404; nothing sent", async () => {
    await signInAs(F.admin.super);
    expect((await postReply(F.msg.unread, { replyText: "   " })).status).toBe(400);
    expect((await postReply(F.msg.unread, {})).status).toBe(400);
    expect((await postReply(F.msg.unread, { replyText: 42 })).status).toBe(400);
    expect((await postReply("nope", { replyText: "hi" })).status).toBe(404);
    expect((await postReply(F.msg.other, { replyText: "hi" })).status).toBe(404);
    expect(resendState.sent).toEqual([]);
    expect(await messageState(F.msg.unread)).toEqual({ status: "UNREAD", replies: 0, logs: 0 });
  });
});

describe("communications + email-log routes", () => {
  it("GET communications: merged house feed, filters, no other-store rows", async () => {
    await signInAs(F.admin.super);
    const all = await getComms();
    expect(all.status).toBe(200);
    expect(all.body).toMatchObject({ total: 3, pages: 1, unreadCount: 1 });
    // Newest first. The replied message and the confirmation email are both seeded 3 days ago.
    const keys = all.body.items.map((i: { kind: string; data: { id: string } }) => `${i.kind}:${i.data.id}`);
    expect(keys[0]).toBe(`conversation:${F.msg.unread}`);
    expect([...keys].sort()).toEqual([`conversation:${F.msg.replied}`, `conversation:${F.msg.unread}`, `email:${F.email.confirmation}`].sort());
    const times = all.body.items.map((i: { createdAt: string }) => Date.parse(i.createdAt));
    expect(times).toEqual([...times].sort((a: number, b: number) => b - a));
    expect(all.text).not.toContain("oscar@example.test");
    expect(all.text).not.toContain("olly@example.test");

    const tx = await getComms({ filter: "TRANSACTIONAL" });
    expect(tx.body.items.map((i: { data: { id: string } }) => i.data.id)).toEqual([F.email.confirmation]);
    const unread = await getComms({ filter: "unread" });
    expect(unread.body.items.map((i: { data: { id: string } }) => i.data.id)).toEqual([F.msg.unread]);
    const p2 = await getComms({ limit: "2", page: "2" });
    expect(p2.body).toMatchObject({ total: 3, pages: 2 });
    expect(p2.body.items.map((i: { kind: string; data: { id: string } }) => `${i.kind}:${i.data.id}`)).toEqual([keys[2]]);
  });

  it("GET communications: other store gets its own feed", async () => {
    await signInAs(F.admin.oSuper);
    const r = await getComms();
    expect(r.body.items.map((i: { data: { id: string } }) => i.data.id).sort()).toEqual([F.email.other, F.msg.other].sort());
  });

  it("GET email-log: house log with body; other store's / unknown → 404", async () => {
    await signInAs(F.admin.super);
    const r = await getEmailLog(F.email.confirmation);
    expect(r.status).toBe(200);
    expect(r.body.log).toMatchObject({ id: F.email.confirmation, bodyHtml: "<p>Thanks</p>", toEmail: "ana@example.test" });
    expect((await getEmailLog(F.email.other)).status).toBe(404);
    expect((await getEmailLog("nope")).status).toBe(404);
    await signInAs(F.admin.oSuper);
    expect((await getEmailLog(F.email.other)).status).toBe(200);
    expect((await getEmailLog(F.email.confirmation)).status).toBe(404);
  });
});

describe("contact / communications MCP tools", () => {
  it("registered for both stores", async () => {
    const names = ["contact_messages_list", "contact_message_get", "contact_message_update", "contact_message_reply", "communications_list", "email_log_get"];
    for (const key of [KEYS.houseAdmin, KEYS.otherAdmin]) {
      const mcp = await connectMcp(key);
      const have = await mcp.toolNames();
      for (const n of names) expect(have).toContain(n);
      await mcp.close();
    }
  });

  it("contact_messages_list / contact_message_get: real data, tenant-scoped", async () => {
    const mcp = await connectMcp(KEYS.houseAdmin);
    const l = await mcp.call("contact_messages_list");
    expect(l).toMatchObject({ total: 2, unreadCount: 1 });
    expect(l.messages.map((m: { id: string; replyCount: number }) => [m.id, m.replyCount])).toEqual([[F.msg.unread, 0], [F.msg.replied, 1]]);
    expect(l.messages[0].messageSnippet).toBe("Do you sell wholesale?");
    expect((await mcp.call("contact_messages_list", { status: "UNREAD" })).messages).toHaveLength(1);

    const g = await mcp.call("contact_message_get", { messageId: F.msg.replied });
    expect(g.message).toMatchObject({ id: F.msg.replied, email: "dan@example.test", message: "How long to ship?" });
    expect(g.message.replies.map((r: { body: string }) => r.body)).toEqual(["About a week."]);
    expect(await mcp.call("contact_message_get", { messageId: F.msg.other })).toMatchObject({ blocked: true, status: 404 });
    await mcp.close();

    const other = await connectMcp(KEYS.otherAdmin);
    const ol = await other.call("contact_messages_list");
    expect(ol.messages.map((m: { id: string }) => m.id)).toEqual([F.msg.other]);
    await other.close();
  });

  it("contact_message_update: preview (no change) → confirm → replay blocked → read back", async () => {
    const mcp = await connectMcp(KEYS.houseAdmin);
    const flow = await previewConfirmReplay(mcp, "contact_message_update", { messageId: F.msg.unread, status: "ARCHIVED", notes: "spam?" }, async (p) => {
      expect(p.preview.changes).toEqual({ status: { before: "UNREAD", after: "ARCHIVED" }, notes: { before: null, after: "spam?" } });
      expect(p.preview.emailsSent).toEqual([]);
      expect((await prisma.contactMessage.findUniqueOrThrow({ where: { id: F.msg.unread } })).status).toBe("UNREAD");
    });
    expect(expectConfirmed(flow).message).toMatchObject({ status: "ARCHIVED", notes: "spam?" });
    expectReplayBlocked(flow);
    const g = await mcp.call("contact_message_get", { messageId: F.msg.unread });
    expect(g.message).toMatchObject({ status: "ARCHIVED", notes: "spam?" });
    expect(resendState.sent).toEqual([]);
    expect(await mcp.call("contact_message_update", { messageId: "nope", status: "READ" })).toMatchObject({ blocked: true, status: 404 });
    await mcp.close();
  });

  it("contact_message_reply: preview sends nothing → confirm sends exactly one escaped email → replay blocked", async () => {
    await makeHostileMessage();
    const mcp = await connectMcp(KEYS.houseAdmin);
    const flow = await previewConfirmReplay(mcp, "contact_message_reply", { messageId: F.msg.unread, replyText: XSS_REPLY }, async (p) => {
      expect(p.preview.email).toMatchObject({ to: ["carla@example.test"], subject: "Re: Wholesale <b>now</b>", replyTo: "hello@artisansstories.com" });
      expect(p.preview).toMatchObject({ currentStatus: "UNREAD", newStatus: "REPLIED", previousOutboundReplies: 0 });
      expect(resendState.sent).toEqual([]);
      expect(await messageState(F.msg.unread)).toEqual({ status: "UNREAD", replies: 0, logs: 0 });
    });
    expect(expectConfirmed(flow)).toMatchObject({ success: true, message: { status: "REPLIED" } });
    expectReplayBlocked(flow);
    expect(resendState.sent).toHaveLength(1);
    expectEscaped(resendState.sent[0].html);
    expect(await messageState(F.msg.unread)).toEqual({ status: "REPLIED", replies: 1, logs: 1 });

    // Reflected in communications_list and email_log_get.
    const c = await mcp.call("communications_list", { filter: "CONVERSATIONS" });
    const conv = c.items.find((i: { conversation?: { id: string } }) => i.conversation?.id === F.msg.unread);
    expect(conv.conversation).toMatchObject({ status: "REPLIED", replyCount: 1 });
    const log = await prisma.emailLog.findFirstOrThrow({ where: { relatedId: F.msg.unread, type: "CONTACT_REPLY" } });
    const e = await mcp.call("email_log_get", { emailLogId: log.id });
    expect(e.log).toMatchObject({ id: log.id, type: "CONTACT_REPLY", toEmail: "carla@example.test" });
    expectEscaped(e.log.bodyHtml);

    // A second reply is allowed but the preview warns.
    const again = await mcp.call("contact_message_reply", { messageId: F.msg.unread, replyText: "One more thing" });
    expect(again.preview).toMatchObject({ previousOutboundReplies: 1 });
    expect(again.preview.warning).toContain("already has 1 sent reply");
    await mcp.close();
  });

  it("contact_message_reply: Resend failure → failed outcome, nothing recorded, not REPLIED", async () => {
    const mcp = await connectMcp(KEYS.houseAdmin);
    const preview = await mcp.call("contact_message_reply", { messageId: F.msg.unread, replyText: "Hello" });
    resendState.failNext = "Rate limited";
    const r = await mcp.call("contact_message_reply", { messageId: F.msg.unread, replyText: "Hello", confirmToken: preview.confirmToken });
    expect(r).toMatchObject({ done: false, blocked: true, outcome: "failed", status: 502 });
    expect(r.reason).toContain("Rate limited");
    expect(await messageState(F.msg.unread)).toEqual({ status: "UNREAD", replies: 0, logs: 0 });
    expect(await mcp.call("contact_message_reply", { messageId: F.msg.other, replyText: "x" })).toMatchObject({ blocked: true, status: 404 });
    await mcp.close();
  });

  it("communications_list: house feed without HTML bodies; other store isolated", async () => {
    const mcp = await connectMcp(KEYS.houseAdmin);
    const c = await mcp.call("communications_list");
    expect(c).toMatchObject({ total: 3, unreadCount: 1 });
    expect(c.items.map((i: { kind: string }) => i.kind).sort()).toEqual(["conversation", "conversation", "email"]);
    const email = c.items.find((i: { kind: string }) => i.kind === "email").email;
    expect(email).toMatchObject({ id: F.email.confirmation, hasBody: true });
    expect(email).not.toHaveProperty("bodyHtml");
    const replied = c.items.find((i: { conversation?: { id: string } }) => i.conversation?.id === F.msg.replied).conversation;
    expect(replied).toMatchObject({ replyCount: 1, messageSnippet: "How long to ship?" });
    expect(replied).not.toHaveProperty("replies");
    expect((await mcp.call("communications_list", { filter: "TRANSACTIONAL" })).items).toHaveLength(1);
    expect(JSON.stringify(c)).not.toContain("oscar@example.test");
    await mcp.close();

    const other = await connectMcp(KEYS.otherAdmin);
    const oc = await other.call("communications_list");
    expect(oc.total).toBe(2);
    expect(JSON.stringify(oc)).not.toContain("carla@example.test");
    await other.close();
  });

  it("email_log_get: house log with body; other store's → 404 (and vice versa)", async () => {
    const mcp = await connectMcp(KEYS.houseAdmin);
    expect((await mcp.call("email_log_get", { emailLogId: F.email.confirmation })).log).toMatchObject({ bodyHtml: "<p>Thanks</p>", tenantId: HOUSE });
    expect(await mcp.call("email_log_get", { emailLogId: F.email.other })).toMatchObject({ blocked: true, status: 404 });
    await mcp.close();
    const other = await connectMcp(KEYS.otherAdmin);
    expect((await other.call("email_log_get", { emailLogId: F.email.other })).log).toMatchObject({ tenantId: OTHER });
    expect(await other.call("email_log_get", { emailLogId: F.email.confirmation })).toMatchObject({ blocked: true, status: 404 });
    await other.close();
  });
});
