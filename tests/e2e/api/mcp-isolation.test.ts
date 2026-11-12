/* eslint-disable @typescript-eslint/no-explicit-any -- parsed JSON tool results / zod internals */
/**
 * Cross-cutting: MCP tenant isolation.
 *
 * Every MCP tool that takes a record identifier (directly, or nested inside an
 * array such as orders_fulfill.items[].orderItemId) is called with the OTHER
 * store's admin key against a HOUSE row (and, for house-only tools and a sample
 * of the rest, the reverse). Reads must come back not-found without any of the
 * row's data; writes must be refused at preview (no confirmToken); a confirm
 * token minted by the owning store for the same args must not work for the
 * other store; and the targeted store's rows must be byte-for-byte unchanged.
 *
 * The id-taking tool list is derived from the live tool registry, and the test
 * fails if a tool with an id-like argument has no case here — so a new tool
 * can't silently skip isolation coverage.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ALL_TOOLS, READ_TOOLS, WRITE_TOOLS } from "@/lib/mcp/tools";
import { signConfirmToken } from "@/lib/mcp/confirm-token";
import { signAccessToken } from "@/lib/mcp/tokens";
import { F, KEYS, HOUSE, OTHER } from "../seed";
import { connectMcp, type Mcp } from "../helpers/mcp";
import { stripeState, resendState, s3State, resetAllFakes } from "../helpers/fakes";

// ── helpers ─────────────────────────────────────────────────────────────────

type Args = Record<string, unknown>;

interface Attempt {
  text: string;
  json: any;
  isError: boolean;
  rpcError: boolean;
}

async function attempt(mcp: Mcp, tool: string, args: Args): Promise<Attempt> {
  try {
    const r = (await mcp.raw(tool, args)) as { content?: { type: string; text?: string }[]; isError?: boolean };
    const text = (r.content ?? []).map((c) => c.text ?? "").join("\n");
    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      json = undefined;
    }
    return { text, json, isError: !!r.isError, rpcError: false };
  } catch (err) {
    return { text: err instanceof Error ? err.message : String(err), json: undefined, isError: true, rpcError: true };
  }
}

/** Refused: either a structured blocked result or a tool/protocol error. Never a confirm token. */
function expectRefused(a: Attempt, label: string) {
  expect(a.json?.confirmToken, `${label} must not issue a confirm token: ${a.text}`).toBeUndefined();
  expect(a.json?.status === "pending_confirmation", `${label} must not reach pending_confirmation: ${a.text}`).toBe(false);
  expect(a.json?.done === true, `${label} must not execute: ${a.text}`).toBe(false);
  expect(a.isError || a.json?.blocked === true, `${label} should be refused: ${a.text}`).toBe(true);
}

/** Not found (404) or rejected as invalid (400) — never success. */
function expectNotFound(a: Attempt, label: string) {
  expectRefused(a, label);
  if (!a.isError) expect([400, 404], `${label} status: ${a.text}`).toContain(a.json.status);
}

/** None of the target row's distinctive values may appear (unless the caller supplied them). */
function expectNoLeak(a: Attempt, secrets: string[], args: Args, label: string) {
  const supplied = JSON.stringify(args);
  for (const s of secrets) {
    if (supplied.includes(s)) continue;
    expect(a.text.includes(s), `${label} leaked "${s}": ${a.text.slice(0, 500)}`).toBe(false);
  }
}

/** Volatile columns that legitimately change on a read-only MCP call. */
const VOLATILE = new Set(["lastUsedAt"]);

/** Every row owned by `tenantId` across every table with a tenantId column, plus global singletons. */
async function snapshot(tenantId: string): Promise<Record<string, string[]>> {
  const tables = await prisma.$queryRaw<{ table_name: string }[]>`
    SELECT table_name FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'tenantId' ORDER BY table_name`;
  const out: Record<string, string[]> = {};
  for (const { table_name } of tables) {
    const rows = await prisma.$queryRawUnsafe<{ j: Record<string, unknown> }[]>(
      `SELECT row_to_json(t) AS j FROM "public"."${table_name}" t WHERE t."tenantId" = $1`,
      tenantId,
    );
    out[table_name] = rows
      .map((r) => JSON.stringify(Object.fromEntries(Object.entries(r.j).filter(([k]) => !VOLATILE.has(k)))))
      .sort();
  }
  const tenant = await prisma.$queryRawUnsafe<{ j: unknown }[]>(`SELECT row_to_json(t) AS j FROM "Tenant" t WHERE id = $1`, tenantId);
  out.Tenant = tenant.map((r) => JSON.stringify(r.j));
  const landing = await prisma.$queryRawUnsafe<{ j: unknown }[]>(`SELECT row_to_json(t) AS j FROM "LandingPageSettings" t`);
  out.LandingPageSettings = landing.map((r) => JSON.stringify(r.j)).sort();
  return out;
}

function expectNoExternalSideEffects(label: string) {
  expect(stripeState.calls, `${label}: Stripe calls`).toEqual([]);
  expect(resendState.sent, `${label}: emails sent`).toEqual([]);
  expect(s3State.puts, `${label}: R2 uploads`).toEqual([]);
}

// ── id-argument discovery ───────────────────────────────────────────────────

const ID_KEY = /^(id|.+Id|.+Ids|slug|code|orderNumber)$/;

function unwrap(s: z.ZodTypeAny): z.ZodTypeAny {
  let cur: any = s;
  for (let i = 0; i < 10; i++) {
    const def = cur?._def;
    if (def?.innerType) cur = def.innerType;
    else if (def?.schema && (def.typeName === "ZodEffects" || def.type === "pipe")) cur = def.schema;
    else break;
  }
  return cur;
}

/** Paths of id-like arguments in a tool's input shape (recursing into arrays/objects). */
function idPaths(shape: Record<string, z.ZodTypeAny>, prefix = ""): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(shape)) {
    if (k === "confirmToken") continue;
    const path = prefix ? `${prefix}.${k}` : k;
    if (ID_KEY.test(k)) out.push(path);
    let inner: any = unwrap(v);
    if (inner instanceof z.ZodArray) inner = unwrap((inner as any).element ?? inner._def.type);
    if (inner instanceof z.ZodObject) out.push(...idPaths(inner.shape as Record<string, z.ZodTypeAny>, `${path}[]`));
  }
  return out;
}

/** Id-shaped arguments that are not store records (never looked up in the database). */
const NOT_RECORD_IDS: Record<string, string[]> = {
  settings_update: ["googleAnalyticsId"], // Google Analytics measurement id (free text)
  email_template_update: ["socialLinks[].id"], // client-side key inside a JSON array
};

const ID_TOOLS = Object.fromEntries(
  ALL_TOOLS.map((t) => [t.name, idPaths(t.inputShape as Record<string, z.ZodTypeAny>).filter((p) => !(NOT_RECORD_IDS[t.name] ?? []).includes(p))] as const).filter(
    ([, p]) => p.length > 0,
  ),
);

// ── cases ───────────────────────────────────────────────────────────────────

interface Case {
  tool: string;
  args: Args;
  /** Distinctive values of the targeted row that must never come back. */
  secrets: string[];
  /** read lookups default to "notFound"; list filters return an empty page. */
  expect?: "notFound" | "emptyList";
  /** false when the args mix the attacker's own row with a foreign ref (owner can't run them either). */
  control?: false;
  /** Use OAuth access tokens for the stores' SUPER_ADMINs (API keys act as ADMIN, which team_remove refuses by role). */
  superAdmin?: true;
}

const SUPER: Record<string, string> = { [HOUSE]: F.admin.super, [OTHER]: F.admin.oSuper };
const KEY_TENANT = new Map<string, string>([
  [KEYS.houseAdmin, HOUSE],
  [KEYS.otherAdmin, OTHER],
]);

/** The credential to use for a case: the API key, or a SUPER_ADMIN OAuth token for the key's store. */
async function credFor(c: Case, key: string): Promise<string> {
  if (!c.superAdmin) return key;
  const tenantId = KEY_TENANT.get(key)!;
  return signAccessToken({ sub: SUPER[tenantId], tenantId, scope: "mcp:admin" });
}

const ORDER_SECRETS = ["Gift wrap requested", "ana@example.test", "pi_paid", "Woven Hammock", "h_order_paid", "AS-1003"];
const PRODUCT_SECRETS = ["Woven Hammock", "HAM-001", "Maria Hernandez", "handmade", "h_prod_hammock"];

/** OTHER store's admin key aimed at HOUSE rows. */
const OTHER_TO_HOUSE: Case[] = [
  // reads
  { tool: "orders_get", args: { orderId: F.order.paid }, secrets: ORDER_SECRETS },
  { tool: "orders_get", args: { orderNumber: "AS-1003" }, secrets: ORDER_SECRETS },
  { tool: "returns_get", args: { returnId: F.ret.requested }, secrets: ["Too small", "AS-1009", "ana@example.test", "h_ret_requested"] },
  { tool: "products_get", args: { productId: F.prod.hammock }, secrets: PRODUCT_SECRETS },
  { tool: "products_list", args: { categoryId: F.cat.textiles }, secrets: PRODUCT_SECRETS, expect: "emptyList" },
  { tool: "products_addons_get", args: { productId: F.prod.hammock }, secrets: ["LASER_MONOGRAM", F.addon.hammockMonogram] },
  { tool: "categories_get", args: { categoryId: F.cat.textiles }, secrets: ["Textiles", "Pottery", "Woven Hammock"] },
  { tool: "customers_get", args: { customerId: F.cust.ana }, secrets: ["Prefers email", "Lopez", "ana@example.test", "AS-1003"] },
  { tool: "customers_get", args: { email: "ana@example.test" }, secrets: ["Prefers email", "Lopez", F.cust.ana, "AS-1003"] },
  { tool: "discounts_get", args: { discountId: F.disc.save10 }, secrets: ["SAVE10", "PERCENTAGE"] },
  { tool: "discounts_get", args: { code: "SAVE10" }, secrets: [F.disc.save10, "PERCENTAGE"] },
  { tool: "contact_message_get", args: { messageId: F.msg.unread }, secrets: ["Do you sell wholesale?", "carla@example.test", "Carla"] },
  { tool: "email_log_get", args: { emailLogId: F.email.confirmation }, secrets: ["Order Confirmed — AS-1003", "<p>Thanks</p>", "ana@example.test"] },

  // writes
  { tool: "team_update", args: { adminId: F.admin.editor, role: "ADMIN" }, secrets: ["editor@artisansstories.com", "Eddie Editor"] },
  { tool: "team_remove", args: { adminId: F.admin.editor }, secrets: ["editor@artisansstories.com", "Eddie Editor"], superAdmin: true },
  { tool: "orders_set_note", args: { orderId: F.order.paid, adminNote: "pwned" }, secrets: ORDER_SECRETS },
  { tool: "orders_mark_delivered", args: { orderId: F.order.shipped }, secrets: ["AS-1008", "ben@example.test"] },
  {
    tool: "orders_fulfill",
    args: { orderId: F.order.paid, trackingCompany: "USPS", trackingNumber: "1", notifyCustomer: true, items: [{ orderItemId: F.orderItem.paidHammock, quantity: 1 }] },
    secrets: ORDER_SECRETS,
  },
  {
    // The other store's OWN order, but a house line item smuggled into items[].
    tool: "orders_fulfill",
    args: { orderId: F.order.other, trackingCompany: "USPS", trackingNumber: "1", notifyCustomer: false, items: [{ orderItemId: F.orderItem.paidHammock, quantity: 1 }] },
    secrets: ["Woven Hammock", "AS-1003"],
    control: false,
  },
  { tool: "orders_cancel", args: { orderId: F.order.paidCancel, reason: "x" }, secrets: ["AS-1004", "ana@example.test"] },
  { tool: "orders_refund", args: { orderId: F.order.paid }, secrets: ORDER_SECRETS },
  { tool: "orders_resend_confirmation", args: { orderId: F.order.paid }, secrets: ORDER_SECRETS },
  { tool: "returns_set_note", args: { returnId: F.ret.requested, adminNote: "x" }, secrets: ["Too small", "AS-1009"] },
  { tool: "returns_approve", args: { returnId: F.ret.requested }, secrets: ["Too small", "AS-1009", "ana@example.test"] },
  { tool: "returns_reject", args: { returnId: F.ret.requested, reason: "x" }, secrets: ["Too small", "AS-1009", "ana@example.test"] },
  { tool: "returns_receive", args: { returnId: F.ret.approved }, secrets: ["AS-1007", "ben@example.test"] },
  { tool: "returns_set_status", args: { returnId: F.ret.requested, status: "REFUNDED" }, secrets: ["Too small", "AS-1009"] },
  { tool: "returns_refund", args: { returnId: F.ret.received, amount: 100, restock: true }, secrets: ["AS-1005", "Clay Mug", "ana@example.test"] },
  { tool: "products_create", args: { name: "Cross", price: 100, categoryIds: [F.cat.textiles] }, secrets: ["Textiles"] },
  { tool: "products_create", args: { name: "Cross", price: 100, artisanId: F.artisan.maria }, secrets: ["Maria Hernandez"] },
  { tool: "products_update", args: { productId: F.prod.hammock, name: "pwned" }, secrets: PRODUCT_SECRETS },
  { tool: "products_update", args: { productId: F.prod.other, categoryIds: [F.cat.textiles] }, secrets: ["Textiles"], control: false },
  { tool: "products_update", args: { productId: F.prod.other, artisanId: F.artisan.maria }, secrets: ["Maria Hernandez"], control: false },
  {
    tool: "products_update",
    args: { productId: F.prod.other, variants: [{ id: F.variant.hammockBlue, name: "Stolen", optionValues: {}, position: 0, quantity: 999 }] },
    secrets: ["HAM-001-BLU", "Woven Hammock"],
    control: false,
  },
  { tool: "products_delete", args: { productId: F.prod.hammock }, secrets: PRODUCT_SECRETS },
  { tool: "products_addons_set", args: { productId: F.prod.hammock, type: "LASER_MONOGRAM", isEnabled: false }, secrets: PRODUCT_SECRETS },
  { tool: "categories_create", args: { name: "Sub", parentId: F.cat.textiles }, secrets: ["Textiles"] },
  { tool: "categories_update", args: { categoryId: F.cat.textiles, name: "pwned" }, secrets: ["Textiles", "Woven Hammock"] },
  { tool: "categories_update", args: { categoryId: F.cat.other, parentId: F.cat.textiles }, secrets: ["Textiles"], control: false },
  { tool: "categories_delete", args: { categoryId: F.cat.empty }, secrets: ["Empty Category"] },
  { tool: "inventory_adjust", args: { inventoryId: F.inventory.hammockBlue, quantity: 0 }, secrets: ["HAM-001-BLU", "Woven Hammock"] },
  { tool: "customers_update", args: { customerId: F.cust.ana, notes: "pwned" }, secrets: ["Prefers email", "Lopez", "ana@example.test"] },
  { tool: "discounts_update", args: { discountId: F.disc.save10, value: 99 }, secrets: ["SAVE10", "PERCENTAGE"] },
  { tool: "discounts_delete", args: { discountId: F.disc.save10 }, secrets: ["SAVE10", "PERCENTAGE"] },
  { tool: "shipping_zone_update", args: { zoneId: F.zone.us, name: "pwned" }, secrets: ["United States", "Free over $100"] },
  { tool: "shipping_zone_delete", args: { zoneId: F.zone.us }, secrets: ["United States", "Free over $100"] },
  { tool: "shipping_rate_create", args: { zoneId: F.zone.us, name: "pwn", price: 0 }, secrets: ["United States", "Free over $100"] },
  { tool: "shipping_rate_update", args: { rateId: F.rate.usFree, price: 1 }, secrets: ["Free over $100", "United States"] },
  { tool: "shipping_rate_delete", args: { rateId: F.rate.usFree }, secrets: ["Free over $100", "United States"] },
  { tool: "contact_message_update", args: { messageId: F.msg.unread, status: "ARCHIVED" }, secrets: ["Do you sell wholesale?", "carla@example.test"] },
  { tool: "contact_message_reply", args: { messageId: F.msg.unread, replyText: "hi" }, secrets: ["Do you sell wholesale?", "carla@example.test"] },
];

/** HOUSE admin key aimed at OTHER rows: every house-only id tool, plus a sample of the rest. */
const HOUSE_TO_OTHER: Case[] = [
  { tool: "artisans_get", args: { artisanId: F.artisan.other }, secrets: ["Olga Other", "olga"] },
  { tool: "artisans_update", args: { artisanId: F.artisan.other, name: "pwned" }, secrets: ["Olga Other"] },
  { tool: "artisans_delete", args: { artisanId: F.artisan.other }, secrets: ["Olga Other"] },
  { tool: "linktree_link_update", args: { linkId: F.link.other, title: "pwned" }, secrets: ["Other Link", "https://other.test"] },
  { tool: "linktree_link_delete", args: { linkId: F.link.other }, secrets: ["Other Link", "https://other.test"] },
  { tool: "linktree_links_reorder", args: { linkIds: [F.link.other, F.link.shop, F.link.insta] }, secrets: ["Other Link", "https://other.test"], control: false },
  { tool: "orders_get", args: { orderId: F.order.other }, secrets: ["oscar@example.test", "OS-2001", "Baseball Glove"] },
  { tool: "orders_get", args: { orderNumber: "OS-2001" }, secrets: ["oscar@example.test", F.order.other, "Baseball Glove"] },
  { tool: "customers_get", args: { customerId: F.cust.other }, secrets: ["oscar@example.test", "Oscar"] },
  { tool: "categories_get", args: { categoryId: F.cat.other }, secrets: ["Gear", "Baseball Glove"] },
  { tool: "contact_message_get", args: { messageId: F.msg.other }, secrets: ["Other store question", "olly@example.test"] },
  { tool: "email_log_get", args: { emailLogId: F.email.other }, secrets: ["Order Confirmed — OS-2001", "oscar@example.test"] },
  { tool: "products_update", args: { productId: F.prod.other, name: "pwned" }, secrets: ["Baseball Glove", "GLV-001"] },
  { tool: "returns_approve", args: { returnId: F.ret.other }, secrets: ["OS-2001", "oscar@example.test"] },
  { tool: "discounts_delete", args: { discountId: F.disc.other }, secrets: ["OTHER5", "FIXED_AMOUNT"] },
  { tool: "inventory_adjust", args: { inventoryId: F.inventory.other, quantity: 0 }, secrets: ["GLV-001-DEF", "Baseball Glove"] },
  { tool: "team_remove", args: { adminId: F.admin.oEditor }, secrets: ["editor@other.test", "Otto Editor"], superAdmin: true },
  { tool: "shipping_rate_delete", args: { rateId: F.rate.other }, secrets: ["Other Flat", "Other Zone"] },
];

/**
 * Id-taking tools that are covered by a dedicated test below instead of the
 * generic "must be refused" table, with the reason.
 */
const DEDICATED: Record<string, string> = {
  kb_articles_get: "slug is per-store; both stores own 'getting-started' — must return the caller's own article",
  kb_articles_update: "slug is per-store; must edit only the caller's own article",
  artisans_create: "slug is a NEW value, not a lookup; per-store unique, must not collide with the other store",
  discounts_create: "productIds/categoryIds are stored filters, not lookups; must not leak or touch the other store",
};

function caseName(dir: string, c: Case) {
  return `${dir} ${c.tool} ${JSON.stringify(c.args)}`;
}

let readNames: Set<string>;
beforeAll(() => {
  readNames = new Set(READ_TOOLS.map((t) => t.name));
});

// ── coverage guard ──────────────────────────────────────────────────────────

describe("isolation coverage", () => {
  it("every tool with an id-like argument has an isolation case", () => {
    const covered = new Set([...OTHER_TO_HOUSE, ...HOUSE_TO_OTHER].map((c) => c.tool).concat(Object.keys(DEDICATED)));
    const missing = Object.keys(ID_TOOLS).filter((t) => !covered.has(t));
    expect(missing, `id-taking tools without an isolation case: ${JSON.stringify(missing.map((m) => [m, ID_TOOLS[m]]))}`).toEqual([]);
    // Sanity: the detector actually sees nested ids.
    expect(ID_TOOLS.orders_fulfill).toContain("items[].orderItemId");
    expect(ID_TOOLS.products_update).toEqual(expect.arrayContaining(["productId", "variants[].id", "images[].variantId", "categoryIds", "artisanId"]));
    expect(Object.keys(ID_TOOLS).length).toBeGreaterThanOrEqual(50);
    for (const [tool, paths] of Object.entries(NOT_RECORD_IDS)) {
      const all = idPaths(ALL_TOOLS.find((t) => t.name === tool)!.inputShape as Record<string, z.ZodTypeAny>);
      expect(all, `${tool} exemption is stale`).toEqual(expect.arrayContaining(paths));
    }
  });

  it("every case names a real tool, and house-only tools are only tested in the house→other direction", () => {
    const byName = new Map(ALL_TOOLS.map((t) => [t.name, t]));
    for (const c of [...OTHER_TO_HOUSE, ...HOUSE_TO_OTHER]) expect(byName.has(c.tool), c.tool).toBe(true);
    for (const c of OTHER_TO_HOUSE) expect(byName.get(c.tool)!.houseOnly, `${c.tool} is house-only`).toBe(false);
    for (const t of Object.keys(DEDICATED)) expect(byName.has(t), t).toBe(true);
    // Every house-only id tool is exercised from the house key against OTHER rows (or dedicated).
    const houseOnlyIdTools = Object.keys(ID_TOOLS).filter((t) => byName.get(t)!.houseOnly);
    const reverse = new Set([...HOUSE_TO_OTHER.map((c) => c.tool), ...Object.keys(DEDICATED)]);
    expect(houseOnlyIdTools.filter((t) => !reverse.has(t))).toEqual([]);
  });
});

// ── generic cross-tenant cases ──────────────────────────────────────────────

async function runCase(c: Case, attackerKey: string, ownerKey: string, ownerTenant: string, dir: string) {
  const label = caseName(dir, c);
  const isRead = readNames.has(c.tool);
  const attacker = await connectMcp(await credFor(c, attackerKey));
  const owner = await connectMcp(await credFor(c, ownerKey));
  try {
    const before = await snapshot(ownerTenant);

    // 1. Plain call (read, or write preview).
    const a = await attempt(attacker, c.tool, c.args);
    if (isRead && c.expect === "emptyList") {
      expect(a.isError, `${label}: ${a.text}`).toBe(false);
      const list = a.json?.products ?? a.json?.items ?? a.json?.data ?? a.json;
      expect(Array.isArray(list) ? list.length : -1, `${label}: ${a.text}`).toBe(0);
    } else if (isRead) {
      expectNotFound(a, label);
    } else {
      expectRefused(a, label);
    }
    expectNoLeak(a, c.secrets, c.args, label);

    if (!isRead) {
      // 2. A confirm token the OWNER would get for these exact args (real preview
      //    when the owner's preview succeeds, else signed for the owner's tenant).
      const ownerPreview = await attempt(owner, c.tool, c.args);
      const ownerToken: string =
        typeof ownerPreview.json?.confirmToken === "string" ? ownerPreview.json.confirmToken : signConfirmToken(ownerTenant, c.tool, c.args);
      resetAllFakes();
      const confirm = await attempt(attacker, c.tool, { ...c.args, confirmToken: ownerToken });
      expectRefused(confirm, `${label} confirm with owner's token`);
      expectNoLeak(confirm, c.secrets, c.args, `${label} confirm`);

      // 3. A token signed for the ATTACKER's own tenant (as if it had previewed) still can't reach the row.
      const attackerTenant = ownerTenant === HOUSE ? OTHER : HOUSE;
      const selfToken = signConfirmToken(attackerTenant, c.tool, c.args);
      const self = await attempt(attacker, c.tool, { ...c.args, confirmToken: selfToken });
      expectRefused(self, `${label} confirm with self-signed token`);
      expectNoExternalSideEffects(label);
    }

    // 4. Smuggled tenantId is stripped by the schema and changes nothing.
    const smuggled = await attempt(attacker, c.tool, { ...c.args, tenantId: ownerTenant });
    if (!(isRead && c.expect === "emptyList")) expectRefused(smuggled, `${label} +tenantId`);
    expectNoLeak(smuggled, c.secrets, c.args, `${label} +tenantId`);

    expect(await snapshot(ownerTenant), `${label}: owner rows changed`).toEqual(before);
  } finally {
    await attacker.close();
    await owner.close();
  }
}

describe("OTHER store key → HOUSE rows", () => {
  it.each(OTHER_TO_HOUSE.map((c) => [caseName("other→house", c), c] as const))("%s", async (_n, c) => {
    await runCase(c, KEYS.otherAdmin, KEYS.houseAdmin, HOUSE, "other→house");
  });

  it("the OTHER store's read-only key gets the same not-found for every house read", async () => {
    const mcp = await connectMcp(KEYS.otherRead);
    try {
      for (const c of OTHER_TO_HOUSE.filter((x) => readNames.has(x.tool) && x.expect !== "emptyList")) {
        const a = await attempt(mcp, c.tool, c.args);
        expectNotFound(a, `other-read ${c.tool}`);
        expectNoLeak(a, c.secrets, c.args, `other-read ${c.tool}`);
      }
    } finally {
      await mcp.close();
    }
  });
});

describe("control: the owning store's key CAN do each of these (so the refusals above are real)", () => {
  const houseOnly = new Set(ALL_TOOLS.filter((t) => t.houseOnly).map((t) => t.name));
  async function control(cases: Case[], ownerKey: string) {
    const owner = await connectMcp(ownerKey);
    const ownerSuper = await connectMcp(await credFor({ superAdmin: true } as Case, ownerKey));
    try {
      // House-only tools aren't registered for the other store (asserted in "house-only tools").
      const runnable = cases.filter((x) => x.control !== false && x.expect !== "emptyList" && !(ownerKey === KEYS.otherAdmin && houseOnly.has(x.tool)));
      for (const c of runnable) {
        const a = await attempt(c.superAdmin ? ownerSuper : owner, c.tool, c.args);
        if (readNames.has(c.tool)) {
          expect(a.isError || a.json?.blocked === true, `owner ${c.tool} ${JSON.stringify(c.args)}: ${a.text.slice(0, 300)}`).toBe(false);
          // The owner sees at least one of the values the attacker must not.
          expect(c.secrets.some((s) => a.text.includes(s)), `owner ${c.tool} shows its data`).toBe(true);
        } else {
          expect(a.json?.status, `owner ${c.tool} ${JSON.stringify(c.args)}: ${a.text.slice(0, 300)}`).toBe("pending_confirmation");
        }
      }
    } finally {
      await owner.close();
      await ownerSuper.close();
    }
  }
  it("house key on house rows", () => control(OTHER_TO_HOUSE, KEYS.houseAdmin));
  it("other key on other rows", () => control(HOUSE_TO_OTHER, KEYS.otherAdmin));
});

describe("HOUSE store key → OTHER rows", () => {
  it.each(HOUSE_TO_OTHER.map((c) => [caseName("house→other", c), c] as const))("%s", async (_n, c) => {
    await runCase(c, KEYS.houseAdmin, KEYS.otherAdmin, OTHER, "house→other");
  });
});

// ── dedicated cases ─────────────────────────────────────────────────────────

describe("per-store business keys", () => {
  it("kb_articles_get with a slug both stores use returns only the house article", async () => {
    const mcp = await connectMcp(KEYS.houseAdmin);
    try {
      const a = await attempt(mcp, "kb_articles_get", { slug: "getting-started" });
      expect(a.isError).toBe(false);
      expect(a.json.article.id).toBe(F.kb.gettingStarted);
      expectNoLeak(a, ["Other Store Secret Doc", "other tenant only", F.kb.other], {}, "kb_articles_get");
    } finally {
      await mcp.close();
    }
  });

  it("kb_articles_update with a shared slug edits only the house article", async () => {
    const otherBefore = await snapshot(OTHER);
    const mcp = await connectMcp(KEYS.houseAdmin);
    try {
      const args = { slug: "getting-started", title: "Getting Started v2" };
      const p = await attempt(mcp, "kb_articles_update", args);
      expect(p.json?.status, p.text).toBe("pending_confirmation");
      expectNoLeak(p, ["Other Store Secret Doc", "other tenant only", F.kb.other], {}, "kb preview");
      const c = await attempt(mcp, "kb_articles_update", { ...args, confirmToken: p.json.confirmToken });
      expect(c.json?.done, c.text).toBe(true);
      expect((await prisma.kBArticle.findUniqueOrThrow({ where: { id: F.kb.gettingStarted } })).title).toBe("Getting Started v2");
      expect(await snapshot(OTHER)).toEqual(otherBefore);
    } finally {
      await mcp.close();
    }
  });

  it("artisans_create with the other store's slug creates a house artisan and leaves theirs alone", async () => {
    const otherBefore = await snapshot(OTHER);
    const mcp = await connectMcp(KEYS.houseAdmin);
    try {
      const args = { name: "Olga House", slug: "olga" };
      const p = await attempt(mcp, "artisans_create", args);
      expect(p.json?.status, p.text).toBe("pending_confirmation");
      expectNoLeak(p, ["Olga Other", F.artisan.other], {}, "artisans_create preview");
      const c = await attempt(mcp, "artisans_create", { ...args, confirmToken: p.json.confirmToken });
      expect(c.json?.done, c.text).toBe(true);
      const created = await prisma.artisan.findMany({ where: { slug: "olga" }, orderBy: { tenantId: "asc" } });
      expect(created.map((r) => r.tenantId).sort()).toEqual([OTHER, HOUSE].sort());
      expect(await snapshot(OTHER)).toEqual(otherBefore);
    } finally {
      await mcp.close();
    }
  });

  it("discounts_create from OTHER reusing a house code and house product/category ids: no conflict oracle, no house change", async () => {
    const houseBefore = await snapshot(HOUSE);
    const mcp = await connectMcp(KEYS.otherAdmin);
    try {
      const args = { code: "SAVE10", type: "PERCENTAGE", value: 5, appliesToAll: false, productIds: [F.prod.hammock], categoryIds: [F.cat.textiles] };
      const p = await attempt(mcp, "discounts_create", args);
      // The house store's SAVE10 must not make the other store's code "already exist".
      expect(p.json?.status, p.text).toBe("pending_confirmation");
      expectNoLeak(p, [F.disc.save10, "Woven Hammock", "Textiles"], {}, "discounts_create preview");
      const c = await attempt(mcp, "discounts_create", { ...args, confirmToken: p.json.confirmToken });
      expect(c.json?.done, c.text).toBe(true);
      expectNoLeak(c, [F.disc.save10, "Woven Hammock", "Textiles"], {}, "discounts_create confirm");
      const rows = await prisma.discount.findMany({ where: { code: "SAVE10" } });
      expect(rows.map((r) => r.tenantId).sort()).toEqual([HOUSE, OTHER].sort());
      expect(await snapshot(HOUSE)).toEqual(houseBefore);
    } finally {
      await mcp.close();
    }
  });

  it("products_update images[].variantId pointing at a house variant is dropped, not linked", async () => {
    const houseBefore = await snapshot(HOUSE);
    const mcp = await connectMcp(KEYS.otherAdmin);
    try {
      const args = { productId: F.prod.other, images: [{ url: "https://cdn.example.test/glove.webp", variantId: F.variant.hammockRed }] };
      const p = await attempt(mcp, "products_update", args);
      expect(p.json?.status, p.text).toBe("pending_confirmation");
      expectNoLeak(p, ["HAM-001-RED", "Woven Hammock", "hammock-red.webp"], {}, "images preview");
      const c = await attempt(mcp, "products_update", { ...args, confirmToken: p.json.confirmToken });
      expect(c.json?.done, c.text).toBe(true);
      const imgs = await prisma.productImage.findMany({ where: { productId: F.prod.other } });
      expect(imgs).toHaveLength(1);
      expect(imgs[0].tenantId).toBe(OTHER);
      expect(imgs[0].variantId).toBeNull();
      expect(await snapshot(HOUSE)).toEqual(houseBefore);
    } finally {
      await mcp.close();
    }
  });
});

// ── list/aggregate reads never include the other store ──────────────────────

describe("id-less reads only ever see the caller's store", () => {
  const HOUSE_MARKERS = ["Woven Hammock", "ana@example.test", "AS-1003", "SAVE10", "United States", "Do you sell wholesale?", "Adam Admin"];
  // Not "hello@artisansstories.com": it is the platform-wide default sender (EmailLog.fromEmail /
  // StoreSettings.contactEmail schema defaults), not house data.
  const OTHER_MARKERS = ["Baseball Glove", "oscar@example.test", "OS-2001", "OTHER5", "Other Zone", "Other store question", "Otto Editor", "owner@other.test"];

  it("every read tool without required args, called by OTHER, contains no house markers (and vice versa)", async () => {
    const other = await connectMcp(KEYS.otherAdmin);
    const house = await connectMcp(KEYS.houseAdmin);
    try {
      const noArgReads = READ_TOOLS.filter((t) => z.object(t.inputShape).safeParse({}).success);
      expect(noArgReads.length).toBeGreaterThan(15);
      for (const t of noArgReads) {
        if (!t.houseOnly) {
          const a = await attempt(other, t.name, {});
          expect(a.isError, `${t.name}: ${a.text}`).toBe(false);
          for (const m of HOUSE_MARKERS) expect(a.text.includes(m), `other ${t.name} leaked "${m}"`).toBe(false);
        }
        const b = await attempt(house, t.name, {});
        expect(b.isError, `${t.name}: ${b.text}`).toBe(false);
        for (const m of OTHER_MARKERS) expect(b.text.includes(m), `house ${t.name} leaked "${m}"`).toBe(false);
      }
    } finally {
      await other.close();
      await house.close();
    }
  });
});

// ── confirm tokens are tenant-bound ─────────────────────────────────────────

describe("confirm tokens are bound to the store that previewed", () => {
  const ID_LESS_WRITES: [string, Args][] = [
    ["settings_update", { storeName: "Hijacked" }],
    ["settings_update_email_branding", { emailFromName: "Hijacked" }],
    ["tax_update", { defaultTaxRate: 42 }],
    ["discounts_create", { code: "XTENANT", type: "PERCENTAGE", value: 50 }],
    ["categories_create", { name: "Cross Tenant" }],
    ["team_add", { name: "Mallory", email: "mallory@example.test", role: "ADMIN" }],
  ];

  it.each(ID_LESS_WRITES)("%s: a token from the house preview is refused for the other store (whose own preview succeeds)", async (tool, args) => {
    const house = await connectMcp(KEYS.houseAdmin);
    const other = await connectMcp(KEYS.otherAdmin);
    try {
      const before = { house: await snapshot(HOUSE), other: await snapshot(OTHER) };
      const p = await attempt(house, tool, args);
      expect(p.json?.status, p.text).toBe("pending_confirmation");
      // Sanity: the other store CAN preview this (so the refusal below is the token check, not a 404).
      const op = await attempt(other, tool, args);
      expect(op.json?.status, op.text).toBe("pending_confirmation");
      const c = await attempt(other, tool, { ...args, confirmToken: p.json.confirmToken });
      expectRefused(c, `${tool} cross-tenant confirm`);
      expect(c.json?.reason).toMatch(/does not match/);
      // ... and smuggling the house tenantId alongside doesn't help.
      const s = await attempt(other, tool, { ...args, tenantId: HOUSE, confirmToken: p.json.confirmToken });
      expectRefused(s, `${tool} cross-tenant confirm +tenantId`);
      expect({ house: await snapshot(HOUSE), other: await snapshot(OTHER) }).toEqual(before);
    } finally {
      await house.close();
      await other.close();
    }
  });

  it("a smuggled tenantId on a confirmed write lands in the caller's store only", async () => {
    const houseBefore = await snapshot(HOUSE);
    const other = await connectMcp(KEYS.otherAdmin);
    try {
      const args = { storeName: "Other Renamed", tenantId: HOUSE };
      const p = await attempt(other, "settings_update", args);
      expect(p.json?.status, p.text).toBe("pending_confirmation");
      expect(p.text.includes("Artisans Stories")).toBe(false);
      const c = await attempt(other, "settings_update", { ...args, confirmToken: p.json.confirmToken });
      expect(c.json?.done, c.text).toBe(true);
      expect((await prisma.storeSettings.findUniqueOrThrow({ where: { tenantId: OTHER } })).storeName).toBe("Other Renamed");
      expect(await snapshot(HOUSE)).toEqual(houseBefore);
      const list = await attempt(other, "products_list", { tenantId: HOUSE });
      expect(list.text.includes("Woven Hammock")).toBe(false);
      expect(list.text.includes("Baseball Glove")).toBe(true);
    } finally {
      await other.close();
    }
  });
});

// ── house-only tools ────────────────────────────────────────────────────────

describe("house-only tools", () => {
  const HOUSE_ONLY = ALL_TOOLS.filter((t) => t.houseOnly).map((t) => t.name).sort();
  const HOUSE_ONLY_PATTERN = /^(artisans_|kb_|linktree_|landing_page_|email_template_|instagram_status$)/;

  it("registry totals match docs/MCP.md (39 read, 23 write, 31 sensitive; 24 house-only)", () => {
    expect(ALL_TOOLS).toHaveLength(93);
    expect(ALL_TOOLS.filter((t) => t.kind === "read")).toHaveLength(39);
    expect(ALL_TOOLS.filter((t) => t.kind === "write")).toHaveLength(23);
    expect(ALL_TOOLS.filter((t) => t.kind === "sensitive")).toHaveLength(31);
    expect(HOUSE_ONLY).toHaveLength(24);
    expect(READ_TOOLS.length + WRITE_TOOLS.length).toBe(93);
    // houseOnly flag and name families agree both ways.
    expect(HOUSE_ONLY.every((n) => HOUSE_ONLY_PATTERN.test(n))).toBe(true);
    expect(ALL_TOOLS.filter((t) => HOUSE_ONLY_PATTERN.test(t.name)).map((t) => t.name).sort()).toEqual(HOUSE_ONLY);
    expect(new Set(ALL_TOOLS.map((t) => t.name)).size).toBe(93);
  });

  it("tools/list counts per key: house admin 93, house read 39, other admin 69, other read 29", async () => {
    const houseOnlyReads = READ_TOOLS.filter((t) => t.houseOnly).length; // 10
    const expected: [string, number][] = [
      [KEYS.houseAdmin, 93],
      [KEYS.houseRead, 39],
      [KEYS.otherAdmin, 93 - 24],
      [KEYS.otherRead, 39 - houseOnlyReads],
    ];
    expect(houseOnlyReads).toBe(10);
    for (const [key, n] of expected) {
      const mcp = await connectMcp(key);
      try {
        const names = await mcp.toolNames();
        expect(names, key).toHaveLength(n);
        if (key === KEYS.houseAdmin) expect(names).toEqual(expect.arrayContaining(HOUSE_ONLY));
        if (key === KEYS.otherAdmin || key === KEYS.otherRead) {
          expect(names.filter((x) => HOUSE_ONLY.includes(x) || HOUSE_ONLY_PATTERN.test(x)), key).toEqual([]);
        }
      } finally {
        await mcp.close();
      }
    }
  });

  it("calling any house-only tool by name with the OTHER key fails cleanly with no data and no change", async () => {
    const before = await snapshot(HOUSE);
    const beforeOther = await snapshot(OTHER);
    const mcp = await connectMcp(KEYS.otherAdmin);
    try {
      const plausibleArgs: Record<string, Args> = {
        artisans_get: { artisanId: F.artisan.maria },
        artisans_update: { artisanId: F.artisan.maria, name: "pwned" },
        artisans_delete: { artisanId: F.artisan.maria },
        artisans_create: { name: "x" },
        kb_articles_get: { slug: "getting-started" },
        kb_articles_update: { slug: "getting-started", title: "pwned" },
        linktree_link_update: { linkId: F.link.shop, title: "pwned" },
        linktree_link_delete: { linkId: F.link.shop },
        linktree_link_create: { title: "x", url: "https://x.test" },
        linktree_links_reorder: { linkIds: [F.link.insta, F.link.shop] },
        email_template_upload_logo: { imageUrl: "https://images.example.test/a.png" },
        email_template_upload_avatar: { imageUrl: "https://images.example.test/a.png" },
        landing_page_upload_image: { imageUrl: "https://images.example.test/a.png", field: "heroImageUrl" },
      };
      for (const name of HOUSE_ONLY) {
        const args = plausibleArgs[name] ?? {};
        const a = await attempt(mcp, name, args);
        expect(a.isError, `${name}: ${a.text}`).toBe(true);
        expect(a.json?.confirmToken).toBeUndefined();
        expect(a.text, name).toMatch(/not found|unknown tool|tool .* not|does not exist|invalid/i);
        for (const leak of ["Maria Hernandez", "IGSECRET", "Getting Started", "Handcrafted treasures", "Welcome, friend", "Shop", "Instagram"]) {
          expect(a.text.includes(leak), `${name} leaked ${leak}: ${a.text}`).toBe(false);
        }
        // Even with a house-minted token.
        const t = await attempt(mcp, name, { ...args, confirmToken: signConfirmToken(HOUSE, name, args) });
        expect(t.isError, name).toBe(true);
      }
      // The connection still works afterwards (no crash).
      const ok = await attempt(mcp, "settings_get", {});
      expect(ok.isError).toBe(false);
      expect(ok.text).toContain("Other Store");
      expect(s3State.puts).toEqual([]);
      expect(await snapshot(HOUSE)).toEqual(before);
      expect(await snapshot(OTHER)).toEqual(beforeOther);
    } finally {
      await mcp.close();
    }
  });
});
