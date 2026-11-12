/**
 * tests/e2e/seed.ts — deterministic fixtures for the e2e suite.
 *
 * Every row has a fixed, readable id (F.*) so tests can point at exactly the
 * record they need. `resetAndSeed()` truncates every table and reseeds, so each
 * test file starts from the same known state. Runs ONLY against the local test
 * database (asserted in tests/e2e/env.ts before any import of the Prisma client).
 *
 * Two stores:
 *   - house:  tenant_artisans_stories / slug "artisans-stories" (DEFAULT_TENANT_ID)
 *   - other:  tenant_other_store      / slug "other-store"
 */
import { Prisma, PrismaClient } from "@prisma/client";
import { hashApiKey } from "@/lib/api-key";

export const HOUSE = "tenant_artisans_stories";
export const OTHER = "tenant_other_store";

/** Raw MCP keys (only their sha256 is stored, like production). */
export const KEYS = {
  houseAdmin: "oss_live_E2EHOUSEADMINKEY000000000000000",
  houseRead: "oss_live_E2EHOUSEREADKEY0000000000000000",
  otherAdmin: "oss_live_E2EOTHERADMINKEY000000000000000",
  otherRead: "oss_live_E2EOTHERREADKEY0000000000000000",
  houseStorefront: "oss_live_E2EHOUSESTOREFRONT0000000000000",
} as const;

/** Fixture ids. h_* = house store, o_* = other store. */
export const F = {
  settings: { house: "singleton", other: "settings_other" },
  admin: {
    super: "h_admin_super",
    admin: "h_admin_admin",
    editor: "h_admin_editor",
    inactive: "h_admin_inactive",
    oSuper: "o_admin_super",
    oEditor: "o_admin_editor",
  },
  cat: { textiles: "h_cat_textiles", pottery: "h_cat_pottery", empty: "h_cat_empty", other: "o_cat_1" },
  prod: { hammock: "h_prod_hammock", mug: "h_prod_mug", draft: "h_prod_draft", other: "o_prod_1" },
  variant: {
    hammockBlue: "h_var_hammock_blue", // inventory 10
    hammockRed: "h_var_hammock_red", // inventory 2 (low stock)
    mug: "h_var_mug", // NO inventory row (return-refund restock bug)
    draft: "h_var_draft",
    other: "o_var_1",
  },
  inventory: { hammockBlue: "h_inv_hammock_blue", hammockRed: "h_inv_hammock_red", draft: "h_inv_draft", other: "o_inv_1" },
  addon: { hammockMonogram: "h_addon_hammock" },
  artisan: { maria: "h_artisan_maria", jose: "h_artisan_jose", other: "o_artisan_1" },
  cust: { ana: "h_cust_ana", ben: "h_cust_ben", other: "o_cust_1" },
  address: { ana: "h_addr_ana", other: "o_addr_1" },
  order: {
    pending: "h_order_pending",
    authorized: "h_order_authorized",
    paid: "h_order_paid",
    paidCancel: "h_order_paid_cancel",
    paidReturn: "h_order_paid_return",
    partial: "h_order_partial",
    fulfilled: "h_order_fulfilled",
    shipped: "h_order_shipped",
    delivered: "h_order_delivered",
    cancelled: "h_order_cancelled",
    refunded: "h_order_refunded",
    other: "o_order_paid",
  },
  orderItem: {
    pendingHammock: "h_oi_pending_hammock",
    authorizedHammock: "h_oi_authorized_hammock",
    authorizedMug: "h_oi_authorized_mug",
    paidHammock: "h_oi_paid_hammock",
    paidCancelHammock: "h_oi_paid_cancel_hammock",
    paidReturnMug: "h_oi_paid_return_mug",
    paidReturnHammock: "h_oi_paid_return_hammock",
    partialHammock: "h_oi_partial_hammock",
    fulfilledHammock: "h_oi_fulfilled_hammock",
    shippedHammock: "h_oi_shipped_hammock",
    deliveredHammock: "h_oi_delivered_hammock",
    cancelledHammock: "h_oi_cancelled_hammock",
    refundedHammock: "h_oi_refunded_hammock",
    other: "o_oi_1",
  },
  fulfillment: { shipped: "h_ful_shipped", delivered: "h_ful_delivered", fulfilled: "h_ful_fulfilled" },
  ret: {
    requested: "h_ret_requested",
    approved: "h_ret_approved",
    rejected: "h_ret_rejected",
    received: "h_ret_received", // mug item: variant with NO inventory row
    refunded: "h_ret_refunded",
    other: "o_ret_requested",
  },
  disc: { save10: "h_disc_save10", freeship: "h_disc_freeship", other: "o_disc_1" },
  zone: { us: "h_zone_us", intl: "h_zone_intl", other: "o_zone_1" },
  rate: { usStandard: "h_rate_us_standard", usFree: "h_rate_us_free", intl: "h_rate_intl", other: "o_rate_1" },
  kb: { gettingStarted: "h_kb_getting_started", shipping: "h_kb_shipping", other: "o_kb_1" },
  msg: { unread: "h_msg_unread", replied: "h_msg_replied", other: "o_msg_1" },
  reply: { replied: "h_reply_1" },
  email: { confirmation: "h_email_confirmation", other: "o_email_1" },
  link: { shop: "h_link_shop", insta: "h_link_insta", other: "o_link_1" },
  click: { one: "h_click_1", two: "h_click_2" },
  template: { house: "h_template", other: "o_template" },
  key: { houseAdmin: "h_key_admin", houseRead: "h_key_read", otherAdmin: "o_key_admin", otherRead: "o_key_read", storefront: "h_key_storefront" },
} as const;

/** Stripe payment intents the fake Stripe knows about: id → amount charged (cents). */
export const PAYMENT_INTENTS: Record<string, { amount: number; status: "succeeded" | "requires_capture" | "requires_payment_method"; refunded?: number }> = {
  pi_pending: { amount: 5000, status: "requires_payment_method" },
  pi_authorized: { amount: 15500, status: "requires_capture" },
  pi_paid: { amount: 12000, status: "succeeded" },
  pi_paid_cancel: { amount: 12000, status: "succeeded" },
  pi_paid_return: { amount: 15500, status: "succeeded" },
  pi_partial: { amount: 12000, status: "succeeded", refunded: 2000 },
  pi_fulfilled: { amount: 12000, status: "succeeded" },
  pi_shipped: { amount: 12000, status: "succeeded" },
  pi_delivered: { amount: 12000, status: "succeeded" },
  pi_refunded: { amount: 12000, status: "succeeded", refunded: 12000 },
  pi_other: { amount: 9000, status: "succeeded" },
};

const ADDR = {
  firstName: "Ana",
  lastName: "Lopez",
  address1: "1 Main St",
  city: "Austin",
  state: "Texas",
  zip: "78701",
  country: "US",
};

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

/** Every application table, truncated between files. */
export async function resetDb(prisma: PrismaClient): Promise<void> {
  const rows = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (rows.length === 0) return;
  const list = rows.map((r) => `"public"."${r.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

export async function seed(prisma: PrismaClient): Promise<void> {
  // ── tenants ────────────────────────────────────────────────────────────────
  await prisma.tenant.createMany({
    data: [
      { id: HOUSE, slug: "artisans-stories", name: "Artisans Stories", isPlatformOwner: true },
      { id: OTHER, slug: "other-store", name: "Other Store" },
    ],
  });
  await prisma.tenantTheme.create({
    data: { tenantId: OTHER, emailFromName: "Other Store Team", emailAccentColor: "#123456", logoUrl: "https://cdn.example.test/other-logo.png" },
  });
  await prisma.storeSettings.createMany({
    data: [
      { id: F.settings.house, tenantId: HOUSE, storeName: "Artisans Stories", facebookPixelId: "1234567890", mcpEnabled: true, contactEmail: "hello@artisansstories.com" },
      { id: F.settings.other, tenantId: OTHER, storeName: "Other Store", mcpEnabled: true, contactEmail: "owner@other.test" },
    ],
  });

  // ── admins ────────────────────────────────────────────────────────────────
  await prisma.adminUser.createMany({
    data: [
      { id: F.admin.super, tenantId: HOUSE, email: "anna@artisansstories.com", name: "Anna Super", role: "SUPER_ADMIN", createdAt: daysAgo(400) },
      { id: F.admin.admin, tenantId: HOUSE, email: "admin@artisansstories.com", name: "Adam Admin", role: "ADMIN", createdAt: daysAgo(300) },
      { id: F.admin.editor, tenantId: HOUSE, email: "editor@artisansstories.com", name: "Eddie Editor", role: "EDITOR", createdAt: daysAgo(200) },
      { id: F.admin.inactive, tenantId: HOUSE, email: "gone@artisansstories.com", name: "Gone Admin", role: "EDITOR", isActive: false, createdAt: daysAgo(100) },
      { id: F.admin.oSuper, tenantId: OTHER, email: "owner@other.test", name: "Olga Owner", role: "SUPER_ADMIN", createdAt: daysAgo(90) },
      { id: F.admin.oEditor, tenantId: OTHER, email: "editor@other.test", name: "Otto Editor", role: "EDITOR", createdAt: daysAgo(80) },
    ],
  });

  // ── MCP / storefront keys ──────────────────────────────────────────────────
  await prisma.tenantApiKey.createMany({
    data: [
      { id: F.key.houseAdmin, tenantId: HOUSE, name: "Muse", keyHash: hashApiKey(KEYS.houseAdmin), prefix: KEYS.houseAdmin.slice(0, 12), scopes: ["mcp:admin"] },
      { id: F.key.houseRead, tenantId: HOUSE, name: "Grokbot (read-only)", keyHash: hashApiKey(KEYS.houseRead), prefix: KEYS.houseRead.slice(0, 12), scopes: ["mcp:read"] },
      { id: F.key.otherAdmin, tenantId: OTHER, name: "Muse", keyHash: hashApiKey(KEYS.otherAdmin), prefix: KEYS.otherAdmin.slice(0, 12), scopes: ["mcp:admin"] },
      { id: F.key.otherRead, tenantId: OTHER, name: "Muse (read-only)", keyHash: hashApiKey(KEYS.otherRead), prefix: KEYS.otherRead.slice(0, 12), scopes: ["mcp:read"] },
      { id: F.key.storefront, tenantId: HOUSE, name: "Storefront", keyHash: hashApiKey(KEYS.houseStorefront), prefix: KEYS.houseStorefront.slice(0, 12), scopes: ["store:read"] },
    ],
  });

  // ── catalog ───────────────────────────────────────────────────────────────
  await prisma.category.createMany({
    data: [
      { id: F.cat.textiles, tenantId: HOUSE, slug: "textiles", name: "Textiles", position: 0 },
      { id: F.cat.pottery, tenantId: HOUSE, slug: "pottery", name: "Pottery", position: 1, parentId: F.cat.textiles },
      { id: F.cat.empty, tenantId: HOUSE, slug: "empty", name: "Empty Category", position: 2 },
      { id: F.cat.other, tenantId: OTHER, slug: "gear", name: "Gear", position: 0 },
    ],
  });
  await prisma.artisan.createMany({
    data: [
      {
        id: F.artisan.maria, tenantId: HOUSE, slug: "maria", name: "Maria Hernandez", status: "ACTIVE", isFeatured: true,
        tagline: "Weaver", craft: "Hammocks", city: "Nahuizalco", region: "Sonsonate", practicingSince: 1998,
        featuredPosts: { instagram: ["https://instagram.com/p/abc"], displayCount: 3 },
        socialEmbedCode: "<blockquote>embed</blockquote>",
        socialLinks: { instagram: "https://instagram.com/maria" },
        igAccessToken: "IGSECRET_TOKEN_SHOULD_NEVER_LEAK", igUserId: "17841400000", igTokenExpiry: daysAgo(-30),
      },
      { id: F.artisan.jose, tenantId: HOUSE, slug: "jose", name: "Jose Martinez", status: "DRAFT", craft: "Pottery" },
      { id: F.artisan.other, tenantId: OTHER, slug: "olga", name: "Olga Other", status: "ACTIVE" },
    ],
  });
  await prisma.artisanImage.createMany({
    data: [
      { id: "h_aimg_1", tenantId: HOUSE, artisanId: F.artisan.maria, url: "https://cdn.example.test/maria-1.webp", category: "PORTRAIT", position: 0 },
      { id: "h_aimg_2", tenantId: HOUSE, artisanId: F.artisan.maria, url: "https://cdn.example.test/maria-2.webp", category: "GALLERY", position: 1 },
    ],
  });
  await prisma.product.createMany({
    data: [
      { id: F.prod.hammock, tenantId: HOUSE, slug: "hammock", name: "Woven Hammock", status: "ACTIVE", price: 12000, costPrice: 4000, sku: "HAM-001", artisanName: "Maria Hernandez", tags: ["handmade"], materialsUsed: ["cotton"], showcaseImages: [] },
      { id: F.prod.mug, tenantId: HOUSE, slug: "clay-mug", name: "Clay Mug", status: "ACTIVE", price: 3500, sku: "MUG-001", showcaseImages: [] },
      { id: F.prod.draft, tenantId: HOUSE, slug: "draft-basket", name: "Draft Basket", status: "DRAFT", price: 5000, showcaseImages: [] },
      { id: F.prod.other, tenantId: OTHER, slug: "glove", name: "Baseball Glove", status: "ACTIVE", price: 9000, sku: "GLV-001", showcaseImages: [] },
    ],
  });
  await prisma.productCategory.createMany({
    data: [
      { tenantId: HOUSE, productId: F.prod.hammock, categoryId: F.cat.textiles },
      { tenantId: HOUSE, productId: F.prod.mug, categoryId: F.cat.pottery },
      { tenantId: OTHER, productId: F.prod.other, categoryId: F.cat.other },
    ],
  });
  await prisma.productArtisan.create({ data: { tenantId: HOUSE, productId: F.prod.hammock, artisanId: F.artisan.maria } });
  await prisma.productOption.create({ data: { id: "h_opt_color", tenantId: HOUSE, productId: F.prod.hammock, name: "Color", values: ["Blue", "Red"], position: 0 } });
  await prisma.productVariant.createMany({
    data: [
      { id: F.variant.hammockBlue, tenantId: HOUSE, productId: F.prod.hammock, name: "Blue", sku: "HAM-001-BLU", optionValues: { Color: "Blue" }, position: 0 },
      { id: F.variant.hammockRed, tenantId: HOUSE, productId: F.prod.hammock, name: "Red", sku: "HAM-001-RED", optionValues: { Color: "Red" }, position: 1 },
      { id: F.variant.mug, tenantId: HOUSE, productId: F.prod.mug, name: "Default", sku: "MUG-001-DEF", optionValues: {}, position: 0 },
      { id: F.variant.draft, tenantId: HOUSE, productId: F.prod.draft, name: "Default", optionValues: {}, position: 0 },
      { id: F.variant.other, tenantId: OTHER, productId: F.prod.other, name: "Default", sku: "GLV-001-DEF", optionValues: {}, position: 0 },
    ],
  });
  await prisma.inventory.createMany({
    data: [
      { id: F.inventory.hammockBlue, tenantId: HOUSE, variantId: F.variant.hammockBlue, quantity: 10, lowStockThreshold: 3 },
      { id: F.inventory.hammockRed, tenantId: HOUSE, variantId: F.variant.hammockRed, quantity: 2, lowStockThreshold: 3 },
      // F.variant.mug deliberately has NO inventory row.
      { id: F.inventory.draft, tenantId: HOUSE, variantId: F.variant.draft, quantity: 0 },
      { id: F.inventory.other, tenantId: OTHER, variantId: F.variant.other, quantity: 7 },
    ],
  });
  await prisma.inventoryLog.create({ data: { id: "h_invlog_1", tenantId: HOUSE, inventoryId: F.inventory.hammockBlue, delta: 10, reason: "Initial stock" } });
  await prisma.productImage.createMany({
    data: [
      { id: "h_pimg_1", tenantId: HOUSE, productId: F.prod.hammock, url: "https://cdn.example.test/hammock.webp", isDefault: true, position: 0 },
      { id: "h_pimg_2", tenantId: HOUSE, productId: F.prod.hammock, variantId: F.variant.hammockRed, url: "https://cdn.example.test/hammock-red.webp", position: 1 },
    ],
  });
  await prisma.productAddon.create({
    data: { id: F.addon.hammockMonogram, tenantId: HOUSE, productId: F.prod.hammock, type: "LASER_MONOGRAM", isEnabled: true, config: { price: 1500 } },
  });

  // ── customers ─────────────────────────────────────────────────────────────
  await prisma.customer.createMany({
    data: [
      { id: F.cust.ana, tenantId: HOUSE, email: "ana@example.test", firstName: "Ana", lastName: "Lopez", totalOrders: 3, totalSpent: 36000, tags: ["vip"], notes: "Prefers email", createdAt: daysAgo(60) },
      { id: F.cust.ben, tenantId: HOUSE, email: "ben@example.test", firstName: "Ben", lastName: "Ruiz", createdAt: daysAgo(2) },
      { id: F.cust.other, tenantId: OTHER, email: "oscar@example.test", firstName: "Oscar", lastName: "Other" },
    ],
  });
  await prisma.address.createMany({
    data: [
      { id: F.address.ana, tenantId: HOUSE, customerId: F.cust.ana, firstName: "Ana", lastName: "Lopez", address1: "1 Main St", city: "Austin", state: "Texas", stateCode: "TX", zip: "78701", isDefault: true },
      { id: F.address.other, tenantId: OTHER, customerId: F.cust.other, firstName: "Oscar", lastName: "Other", address1: "9 Side St", city: "Miami", state: "Florida", stateCode: "FL", zip: "33101" },
    ],
  });

  // ── orders (every status) ─────────────────────────────────────────────────
  type O = { id: string; n: string; status: Prisma.OrderCreateManyInput["status"]; fin: Prisma.OrderCreateManyInput["financialStatus"]; pi?: string; total: number; cust?: string; email?: string; days: number; tenant?: string };
  const orders: O[] = [
    { id: F.order.pending, n: "AS-1001", status: "PENDING", fin: "PENDING", pi: "pi_pending", total: 5000, cust: F.cust.ben, days: 1 },
    { id: F.order.authorized, n: "AS-1002", status: "PROCESSING", fin: "AUTHORIZED", pi: "pi_authorized", total: 15500, cust: F.cust.ana, days: 2 },
    { id: F.order.paid, n: "AS-1003", status: "PROCESSING", fin: "PAID", pi: "pi_paid", total: 12000, cust: F.cust.ana, days: 3 },
    { id: F.order.paidCancel, n: "AS-1004", status: "PROCESSING", fin: "PAID", pi: "pi_paid_cancel", total: 12000, cust: F.cust.ana, days: 4 },
    { id: F.order.paidReturn, n: "AS-1005", status: "DELIVERED", fin: "PAID", pi: "pi_paid_return", total: 15500, cust: F.cust.ana, days: 20 },
    { id: F.order.partial, n: "AS-1006", status: "DELIVERED", fin: "PARTIALLY_REFUNDED", pi: "pi_partial", total: 12000, cust: F.cust.ana, days: 30 },
    { id: F.order.fulfilled, n: "AS-1007", status: "FULFILLED", fin: "PAID", pi: "pi_fulfilled", total: 12000, cust: F.cust.ben, days: 5 },
    { id: F.order.shipped, n: "AS-1008", status: "SHIPPED", fin: "PAID", pi: "pi_shipped", total: 12000, cust: F.cust.ben, days: 6 },
    { id: F.order.delivered, n: "AS-1009", status: "DELIVERED", fin: "PAID", pi: "pi_delivered", total: 12000, cust: F.cust.ana, days: 15 },
    { id: F.order.cancelled, n: "AS-1010", status: "CANCELLED", fin: "VOIDED", total: 12000, cust: F.cust.ben, days: 40 },
    { id: F.order.refunded, n: "AS-1011", status: "REFUNDED", fin: "REFUNDED", pi: "pi_refunded", total: 12000, cust: F.cust.ana, days: 50 },
    { id: F.order.other, n: "OS-2001", status: "PROCESSING", fin: "PAID", pi: "pi_other", total: 9000, cust: F.cust.other, email: "oscar@example.test", days: 3, tenant: OTHER },
  ];
  await prisma.order.createMany({
    data: orders.map((o) => ({
      id: o.id,
      tenantId: o.tenant ?? HOUSE,
      orderNumber: o.n,
      customerId: o.cust ?? null,
      status: o.status,
      financialStatus: o.fin,
      email: o.email ?? (o.cust === F.cust.ben ? "ben@example.test" : "ana@example.test"),
      shippingAddress: ADDR,
      subtotal: o.total,
      total: o.total,
      stripePaymentIntentId: o.pi ?? null,
      createdAt: daysAgo(o.days),
      ...(o.status === "CANCELLED" ? { cancelledAt: daysAgo(o.days - 1), cancelReason: "Customer request" } : {}),
      ...(o.id === F.order.paid ? { adminNote: "Gift wrap requested" } : {}),
    })),
  });
  const item = (id: string, orderId: string, variantId: string, title: string, price: number, qty = 1, extra: Partial<Prisma.OrderItemCreateManyInput> = {}, tenant = HOUSE): Prisma.OrderItemCreateManyInput => ({
    id, tenantId: tenant, orderId, variantId, productId: variantId === F.variant.mug ? F.prod.mug : variantId === F.variant.other ? F.prod.other : F.prod.hammock,
    title, variantTitle: variantId === F.variant.hammockRed ? "Red" : variantId === F.variant.hammockBlue ? "Blue" : null,
    quantity: qty, price, total: price * qty, productSnapshot: { image: "https://cdn.example.test/hammock.webp" }, ...extra,
  });
  await prisma.orderItem.createMany({
    data: [
      item(F.orderItem.pendingHammock, F.order.pending, F.variant.hammockBlue, "Woven Hammock", 5000),
      item(F.orderItem.authorizedHammock, F.order.authorized, F.variant.hammockBlue, "Woven Hammock", 12000),
      item(F.orderItem.authorizedMug, F.order.authorized, F.variant.mug, "Clay Mug", 3500),
      item(F.orderItem.paidHammock, F.order.paid, F.variant.hammockBlue, "Woven Hammock", 12000),
      item(F.orderItem.paidCancelHammock, F.order.paidCancel, F.variant.hammockRed, "Woven Hammock", 12000),
      item(F.orderItem.paidReturnMug, F.order.paidReturn, F.variant.mug, "Clay Mug", 3500, 1, { fulfillmentStatus: "fulfilled" }),
      item(F.orderItem.paidReturnHammock, F.order.paidReturn, F.variant.hammockBlue, "Woven Hammock", 12000, 1, { fulfillmentStatus: "fulfilled" }),
      item(F.orderItem.partialHammock, F.order.partial, F.variant.hammockBlue, "Woven Hammock", 12000, 1, { fulfillmentStatus: "fulfilled" }),
      item(F.orderItem.fulfilledHammock, F.order.fulfilled, F.variant.hammockBlue, "Woven Hammock", 12000, 1, { fulfillmentStatus: "fulfilled" }),
      item(F.orderItem.shippedHammock, F.order.shipped, F.variant.hammockRed, "Woven Hammock", 12000, 1, { fulfillmentStatus: "fulfilled" }),
      item(F.orderItem.deliveredHammock, F.order.delivered, F.variant.hammockBlue, "Woven Hammock", 12000, 1, { fulfillmentStatus: "fulfilled" }),
      item(F.orderItem.cancelledHammock, F.order.cancelled, F.variant.hammockBlue, "Woven Hammock", 12000),
      item(F.orderItem.refundedHammock, F.order.refunded, F.variant.hammockBlue, "Woven Hammock", 12000, 1, { fulfillmentStatus: "fulfilled" }),
      item(F.orderItem.other, F.order.other, F.variant.other, "Baseball Glove", 9000, 1, {}, OTHER),
    ],
  });
  await prisma.fulfillment.createMany({
    data: [
      { id: F.fulfillment.fulfilled, tenantId: HOUSE, orderId: F.order.fulfilled, status: "SUCCESS", trackingCompany: "USPS", trackingNumber: "", shippedAt: daysAgo(4), items: [{ orderItemId: F.orderItem.fulfilledHammock, quantity: 1 }] },
      { id: F.fulfillment.shipped, tenantId: HOUSE, orderId: F.order.shipped, status: "SUCCESS", trackingCompany: "USPS", trackingNumber: "9400100000000000000001", shippedAt: daysAgo(5), items: [{ orderItemId: F.orderItem.shippedHammock, quantity: 1 }] },
      { id: F.fulfillment.delivered, tenantId: HOUSE, orderId: F.order.delivered, status: "SUCCESS", trackingCompany: "UPS", trackingNumber: "1Z999AA10123456784", shippedAt: daysAgo(14), items: [{ orderItemId: F.orderItem.deliveredHammock, quantity: 1 }] },
    ],
  });

  // ── returns (every status) ────────────────────────────────────────────────
  await prisma.return.createMany({
    data: [
      { id: F.ret.requested, tenantId: HOUSE, orderId: F.order.delivered, status: "REQUESTED", customerNote: "Too small", requestedAt: daysAgo(1) },
      { id: F.ret.approved, tenantId: HOUSE, orderId: F.order.fulfilled, status: "APPROVED", requestedAt: daysAgo(2) },
      { id: F.ret.rejected, tenantId: HOUSE, orderId: F.order.shipped, status: "REJECTED", adminNote: "Outside window", resolvedAt: daysAgo(1), requestedAt: daysAgo(3) },
      { id: F.ret.received, tenantId: HOUSE, orderId: F.order.paidReturn, status: "RECEIVED", requestedAt: daysAgo(4) },
      { id: F.ret.refunded, tenantId: HOUSE, orderId: F.order.partial, status: "REFUNDED", refundAmount: 2000, stripeRefundId: "re_seed_partial", resolvedAt: daysAgo(5), requestedAt: daysAgo(6) },
      { id: F.ret.other, tenantId: OTHER, orderId: F.order.other, status: "REQUESTED", requestedAt: daysAgo(1) },
    ],
  });
  await prisma.returnItem.createMany({
    data: [
      { id: "h_ri_requested", tenantId: HOUSE, returnId: F.ret.requested, orderItemId: F.orderItem.deliveredHammock, quantity: 1, reason: "CHANGED_MIND" },
      { id: "h_ri_approved", tenantId: HOUSE, returnId: F.ret.approved, orderItemId: F.orderItem.fulfilledHammock, quantity: 1, reason: "DEFECTIVE" },
      { id: "h_ri_rejected", tenantId: HOUSE, returnId: F.ret.rejected, orderItemId: F.orderItem.shippedHammock, quantity: 1, reason: "OTHER" },
      { id: "h_ri_received_mug", tenantId: HOUSE, returnId: F.ret.received, orderItemId: F.orderItem.paidReturnMug, quantity: 1, reason: "DEFECTIVE" },
      { id: "h_ri_received_hammock", tenantId: HOUSE, returnId: F.ret.received, orderItemId: F.orderItem.paidReturnHammock, quantity: 1, reason: "NOT_AS_DESCRIBED" },
      { id: "h_ri_refunded", tenantId: HOUSE, returnId: F.ret.refunded, orderItemId: F.orderItem.partialHammock, quantity: 1, reason: "WRONG_ITEM" },
      { id: "o_ri_1", tenantId: OTHER, returnId: F.ret.other, orderItemId: F.orderItem.other, quantity: 1, reason: "CHANGED_MIND" },
    ],
  });

  // ── discounts / shipping ──────────────────────────────────────────────────
  await prisma.discount.createMany({
    data: [
      { id: F.disc.save10, tenantId: HOUSE, code: "SAVE10", type: "PERCENTAGE", value: 10, usageCount: 2 },
      { id: F.disc.freeship, tenantId: HOUSE, code: "FREESHIP", type: "FREE_SHIPPING", value: 0, isActive: false },
      { id: F.disc.other, tenantId: OTHER, code: "OTHER5", type: "FIXED_AMOUNT", value: 500 },
    ],
  });
  await prisma.order.update({ where: { id: F.order.paid }, data: { discountCode: "SAVE10" } });
  await prisma.shippingZone.createMany({
    data: [
      { id: F.zone.us, tenantId: HOUSE, name: "United States", countries: ["US"], regions: ["TX", "CA"], position: 0 },
      { id: F.zone.intl, tenantId: HOUSE, name: "International", countries: ["MX", "CA"], regions: [], position: 1 },
      { id: F.zone.other, tenantId: OTHER, name: "Other Zone", countries: ["US"], regions: [], position: 0 },
    ],
  });
  await prisma.shippingRate.createMany({
    data: [
      { id: F.rate.usStandard, tenantId: HOUSE, zoneId: F.zone.us, name: "Standard", condition: "FLAT", price: 800 },
      { id: F.rate.usFree, tenantId: HOUSE, zoneId: F.zone.us, name: "Free over $100", condition: "ORDER_VALUE", minValue: 10000, price: 0 },
      { id: F.rate.intl, tenantId: HOUSE, zoneId: F.zone.intl, name: "International", condition: "FLAT", price: 2500 },
      { id: F.rate.other, tenantId: OTHER, zoneId: F.zone.other, name: "Other Flat", condition: "FLAT", price: 500 },
    ],
  });

  // ── KB / contact / email log ──────────────────────────────────────────────
  await prisma.kBArticle.createMany({
    data: [
      { id: F.kb.gettingStarted, tenantId: HOUSE, slug: "getting-started", title: "Getting Started", category: "Basics", excerpt: "Start here", content: "# Welcome\nHow the admin works." },
      { id: F.kb.shipping, tenantId: HOUSE, slug: "shipping-basics", title: "Shipping Basics", category: "Shipping", excerpt: "Zones and rates", content: "Zones then rates." },
      { id: F.kb.other, tenantId: OTHER, slug: "getting-started", title: "Other Store Secret Doc", category: "Basics", excerpt: "x", content: "other tenant only" },
    ],
  });
  await prisma.contactMessage.createMany({
    data: [
      { id: F.msg.unread, tenantId: HOUSE, name: "Carla", email: "carla@example.test", subject: "Wholesale?", message: "Do you sell wholesale?", status: "UNREAD", createdAt: daysAgo(1) },
      { id: F.msg.replied, tenantId: HOUSE, name: "Dan", email: "dan@example.test", subject: "Shipping time", message: "How long to ship?", status: "REPLIED", createdAt: daysAgo(3) },
      { id: F.msg.other, tenantId: OTHER, name: "Olly", email: "olly@example.test", subject: "Other", message: "Other store question", status: "UNREAD" },
    ],
  });
  await prisma.contactReply.create({ data: { id: F.reply.replied, tenantId: HOUSE, contactMessageId: F.msg.replied, body: "About a week.", direction: "OUTBOUND" } });
  await prisma.emailLog.createMany({
    data: [
      { id: F.email.confirmation, tenantId: HOUSE, type: "ORDER_CONFIRMATION", toEmail: "ana@example.test", subject: "Order Confirmed — AS-1003", bodyHtml: "<p>Thanks</p>", relatedId: F.order.paid, relatedType: "ORDER", createdAt: daysAgo(3) },
      { id: F.email.other, tenantId: OTHER, type: "ORDER_CONFIRMATION", toEmail: "oscar@example.test", subject: "Order Confirmed — OS-2001", bodyHtml: "<p>other</p>", relatedId: F.order.other, relatedType: "ORDER" },
    ],
  });

  // ── Link Hub / email template / landing page ──────────────────────────────
  await prisma.linkTreeSettings.create({ data: { tenantId: HOUSE, isEnabled: true, profileName: "Artisans Stories", profileBio: "Handmade in El Salvador" } });
  await prisma.linkTreeLink.createMany({
    data: [
      { id: F.link.shop, tenantId: HOUSE, title: "Shop", url: "https://artisansstories.com/shop", sortOrder: 0, clicks: 2 },
      { id: F.link.insta, tenantId: HOUSE, title: "Instagram", url: "https://instagram.com/artisansstories", sortOrder: 1, clicks: 0 },
      { id: F.link.other, tenantId: OTHER, title: "Other Link", url: "https://other.test", sortOrder: 0 },
    ],
  });
  await prisma.linkTreeClickLog.createMany({
    data: [
      { id: F.click.one, tenantId: HOUSE, linkId: F.link.shop, clickedAt: daysAgo(1), referrer: "instagram.com" },
      { id: F.click.two, tenantId: HOUSE, linkId: F.link.shop, clickedAt: daysAgo(10) },
    ],
  });
  await prisma.welcomeEmailTemplate.createMany({
    data: [
      { id: F.template.house, tenantId: HOUSE, greetingText: "Welcome, friend", bodyHtml: "<p>Thanks for joining</p>", accentColor: "#8B6914" },
      { id: F.template.other, tenantId: OTHER, greetingText: "Other welcome" },
    ],
  });
  await prisma.$executeRawUnsafe(
    `INSERT INTO "LandingPageSettings" (id, "heroTitle", "heroSubtitle", "aboutTitle", "aboutContent", "socialLinks", "updatedAt")
     VALUES ('singleton', 'Handcrafted treasures from El Salvador', 'Join the waitlist', 'Meet Anna', 'Our story', '[{"platform":"instagram","url":"https://instagram.com/artisansstories"}]'::jsonb, NOW())`,
  );
}

export async function resetAndSeed(prisma: PrismaClient): Promise<void> {
  await resetDb(prisma);
  await seed(prisma);
}
