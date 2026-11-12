/**
 * Commerce config — customers, discounts, shipping zones/rates, tax settings.
 * Mirrors /api/admin/{customers,discounts,shipping,tax}/* via
 * src/lib/admin-services/{customers,discounts,shipping,tax}.ts.
 */
import { z } from "zod";
import { readTool, writeTool, zId, zPage, zLimit, type McpTool } from "../kit";
import { fail } from "@/lib/admin-services/result";
import * as customers from "@/lib/admin-services/customers";
import * as discounts from "@/lib/admin-services/discounts";
import * as shipping from "@/lib/admin-services/shipping";
import * as tax from "@/lib/admin-services/tax";

const DISCOUNT_TYPE = ["PERCENTAGE", "FIXED_AMOUNT", "FREE_SHIPPING"] as const;
const RATE_CONDITION = ["FLAT", "WEIGHT", "ORDER_VALUE", "FREE"] as const;
const DISCOUNT_CLEARABLE = ["minimumOrderAmount", "usageLimit", "perCustomerLimit", "startsAt", "endsAt"] as const;
const RATE_CLEARABLE = ["minValue", "maxValue"] as const;

const VALUE_DESC =
  "Discount value. PERCENTAGE: whole percent 1-100 (20 = 20% off). FIXED_AMOUNT: amount off in cents (1500 = $15.00). FREE_SHIPPING: 0.";
const RATE_MIN_MAX_DESC =
  "ORDER_VALUE and FREE rates: order subtotal threshold in cents. WEIGHT rates: ounces.";

/** Mirrors the admin form's value validation (the API itself does not check). */
function checkDiscountValue(type: string | undefined, value: number | undefined) {
  if (type === "PERCENTAGE" && value !== undefined && (value < 1 || value > 100)) {
    return fail(400, "Percentage must be 1–100");
  }
  if (type === "FIXED_AMOUNT" && value !== undefined && value <= 0) {
    return fail(400, "Amount must be greater than 0");
  }
  return null;
}

/** Turn the `clear` list into explicit nulls (MCP args can't carry null). */
function withClears<T extends object>(body: T, clear: readonly string[] | undefined): T {
  const out: Record<string, unknown> = { ...(body as Record<string, unknown>) };
  for (const k of clear ?? []) out[k] = null;
  return out as T;
}

const notFound = (what: string) => fail(404, `${what} not found. Provide an id or use the list tool to find one.`);

const discountFields = {
  minimumOrderAmount: z.number().int().min(0).nullish().describe("Minimum order subtotal in cents"),
  appliesToAll: z.boolean().nullish().describe("Applies to every product (default true). If false, set categoryIds."),
  productIds: z.array(z.string()).nullish().describe("Product ids the discount is limited to (admin UI leaves this empty)"),
  categoryIds: z.array(z.string()).nullish().describe("Category ids the discount is limited to when appliesToAll is false"),
  usageLimit: z.number().int().min(1).nullish().describe("Max total redemptions"),
  perCustomerLimit: z.number().int().min(1).nullish().describe("Max redemptions per customer"),
  startsAt: z.string().nullish().describe("Start of validity, ISO 8601 date-time"),
  endsAt: z.string().nullish().describe("End of validity, ISO 8601 date-time"),
  isActive: z.boolean().nullish().describe("Whether the code can be redeemed"),
};

const rateFields = {
  condition: z.enum(RATE_CONDITION).nullish().describe("FLAT, WEIGHT, ORDER_VALUE, or FREE (FREE forces price 0)"),
  minValue: z.number().min(0).nullish().describe(`Lower bound. ${RATE_MIN_MAX_DESC}`),
  maxValue: z.number().min(0).nullish().describe(`Upper bound. ${RATE_MIN_MAX_DESC}`),
  price: z.number().int().min(0).nullish().describe("Shipping price in cents"),
  isActive: z.boolean().nullish().describe("Whether the rate is offered at checkout"),
};

export const tools: McpTool[] = [
  // ── customers ─────────────────────────────────────────────────────────────
  readTool({
    name: "customers_list",
    title: "List customers",
    description:
      "List customers ordered by total spent, with optional search over email, first name, and last name. Returns id, email, name, last order date, and live order count / total spent (cents) excluding cancelled, refunded, and voided orders.",
    input: {
      search: z.string().nullish().describe("Matches email, first name, or last name (case-insensitive)"),
      page: zPage,
      limit: zLimit(100, 20),
    },
    run: (ctx, a) => customers.listCustomers(ctx.db, a),
  }),

  readTool({
    name: "customers_get",
    title: "Get customer",
    description:
      "Get one customer with addresses, internal notes and tags, full order history with line items, and live spend stats (cents). Pass either the customer id or email.",
    input: {
      customerId: z.string().nullish().describe("Customer id"),
      email: z.string().nullish().describe("Customer email"),
    },
    run: async (ctx, a) => {
      const id = a.customerId ?? (a.email ? await customers.findCustomerIdByEmail(ctx.db, a.email) : null);
      if (!id) return notFound("Customer");
      return customers.getCustomer(ctx.db, id);
    },
  }),

  writeTool({
    name: "customers_update",
    title: "Update customer notes/tags",
    kind: "write",
    idempotent: true,
    description:
      "Replace a customer's internal notes and/or tags. Only these two fields are editable. Tags replace the whole list. The customer is not notified.",
    input: {
      customerId: zId("Customer"),
      notes: z.string().nullish().describe("Full replacement note text (empty string clears it)"),
      tags: z.array(z.string()).nullish().describe("Full replacement tag list (empty array clears it)"),
    },
    preview: (ctx, { customerId, ...body }) => customers.previewCustomerUpdate(ctx.db, customerId, body),
    execute: (ctx, { customerId, ...body }) => customers.updateCustomer(ctx.db, customerId, body),
  }),

  // ── discounts ─────────────────────────────────────────────────────────────
  readTool({
    name: "discounts_list",
    title: "List discounts",
    description:
      "List discount codes newest first. value is a whole percent for PERCENTAGE and cents for FIXED_AMOUNT; minimumOrderAmount is cents. Includes usageCount, limits, validity window, and isActive.",
    input: { page: zPage, limit: zLimit(100, 20) },
    run: (ctx, a) => discounts.listDiscounts(ctx.db, a),
  }),

  readTool({
    name: "discounts_get",
    title: "Get discount",
    description: "Get one discount by id or by code.",
    input: {
      discountId: z.string().nullish().describe("Discount id"),
      code: z.string().nullish().describe("Discount code (case-insensitive)"),
    },
    run: async (ctx, a) => {
      const id = a.discountId ?? (a.code ? await discounts.findDiscountIdByCode(ctx.db, a.code) : null);
      if (!id) return notFound("Discount");
      return discounts.getDiscount(ctx.db, id);
    },
  }),

  readTool({
    name: "discounts_generate_code",
    title: "Suggest a discount code",
    description:
      "Return a random suggested code such as SAVE20. Creates nothing and does not check that the code is unused (discounts_create does).",
    input: {},
    run: async () => discounts.generateDiscountCode(),
  }),

  writeTool({
    name: "discounts_create",
    title: "Create discount",
    kind: "write",
    description:
      "Create a discount code. The code is stored trimmed and upper-cased and must be unique. Defaults: applies to all products, no limits, no validity window, active. The preview shows the value in plain terms and whether it is live now.",
    input: {
      code: z.string().min(1).describe("Code customers enter at checkout"),
      type: z.enum(DISCOUNT_TYPE).describe("PERCENTAGE, FIXED_AMOUNT, or FREE_SHIPPING"),
      value: z.number().int().min(0).describe(VALUE_DESC),
      ...discountFields,
    },
    preview: async (ctx, a) => checkDiscountValue(a.type, a.value) ?? discounts.previewCreateDiscount(ctx.db, a),
    execute: (ctx, a) => discounts.createDiscount(ctx.db, a),
  }),

  writeTool({
    name: "discounts_update",
    title: "Update discount",
    kind: "write",
    idempotent: true,
    description:
      "Change fields on a discount; omitted fields are left as they are. To remove a limit or date, list it in `clear`. Set isActive=false to disable a code reversibly. The preview shows a before/after diff.",
    input: {
      discountId: zId("Discount"),
      code: z.string().min(1).nullish().describe("New code (stored upper-cased; must be unique)"),
      type: z.enum(DISCOUNT_TYPE).nullish().describe("PERCENTAGE, FIXED_AMOUNT, or FREE_SHIPPING"),
      value: z.number().int().min(0).nullish().describe(VALUE_DESC),
      ...discountFields,
      clear: z
        .array(z.enum(DISCOUNT_CLEARABLE))
        .nullish()
        .describe("Fields to reset to empty (no minimum, no limit, no start/end date)"),
    },
    preview: async (ctx, { discountId, clear, ...body }) => {
      const current = await discounts.getDiscount(ctx.db, discountId);
      if (!current.ok) return current;
      if (body.type !== undefined || body.value !== undefined) {
        const d = current.data.discount;
        const bad = checkDiscountValue(body.type ?? d.type, body.value ?? d.value);
        if (bad) return bad;
      }
      return discounts.previewUpdateDiscount(ctx.db, discountId, withClears(body, clear));
    },
    execute: (ctx, { discountId, clear, ...body }) => discounts.updateDiscount(ctx.db, discountId, withClears(body, clear)),
  }),

  writeTool({
    name: "discounts_delete",
    title: "Delete discount",
    kind: "sensitive",
    destructive: true,
    idempotent: true,
    description:
      "Permanently delete a discount code. The preview shows its usage and how many orders used it. Past orders are unaffected. Prefer discounts_update with isActive=false to disable reversibly.",
    input: { discountId: zId("Discount") },
    preview: (ctx, a) => discounts.previewDeleteDiscount(ctx.db, a.discountId),
    execute: (ctx, a) => discounts.deleteDiscount(ctx.db, a.discountId),
  }),

  // ── shipping zones ────────────────────────────────────────────────────────
  readTool({
    name: "shipping_zones_list",
    title: "List shipping zones",
    description:
      "List all shipping zones in checkout priority order, each with its countries (ISO-2), US state regions, and rates. Rate price is cents; minValue/maxValue are cents for ORDER_VALUE/FREE rates and ounces for WEIGHT rates.",
    input: {},
    run: (ctx) => shipping.listZones(ctx.db),
  }),

  writeTool({
    name: "shipping_zone_create",
    title: "Create shipping zone",
    kind: "write",
    description:
      "Create a shipping zone, optionally with initial rates. It is placed last in priority order. Defaults: no countries, no regions, active.",
    input: {
      name: z.string().min(1).describe("Zone name"),
      countries: z.array(z.string()).nullish().describe("ISO 3166-1 alpha-2 country codes, e.g. [\"US\"]"),
      regions: z.array(z.string()).nullish().describe("US state codes, e.g. [\"CA\",\"NY\"] (used when countries includes US)"),
      isActive: z.boolean().nullish().describe("Whether the zone is used at checkout (default true)"),
      rates: z
        .array(
          z.object({
            name: z.string().min(1).describe("Rate name shown at checkout"),
            condition: rateFields.condition,
            minValue: rateFields.minValue,
            maxValue: rateFields.maxValue,
            price: z.number().int().min(0).describe("Shipping price in cents (pass 0 for FREE rates; zone creation does not force it)"),
            isActive: rateFields.isActive,
          }),
        )
        .nullish()
        .describe("Initial rates for the zone"),
    },
    preview: (ctx, a) => shipping.previewCreateZone(ctx.db, a),
    execute: (ctx, a) => shipping.createZone(ctx.db, a),
  }),

  writeTool({
    name: "shipping_zone_update",
    title: "Update shipping zone",
    kind: "write",
    idempotent: true,
    description:
      "Change a shipping zone's name, countries, regions, active flag, or priority position. Omitted fields are unchanged; arrays replace the whole list. Rates are edited with the shipping_rate_* tools.",
    input: {
      zoneId: zId("Shipping zone"),
      name: z.string().min(1).nullish().describe("Zone name"),
      countries: z.array(z.string()).nullish().describe("Full replacement list of ISO-2 country codes"),
      regions: z.array(z.string()).nullish().describe("Full replacement list of US state codes"),
      isActive: z.boolean().nullish().describe("Whether the zone is used at checkout"),
      position: z.number().int().min(0).nullish().describe("Priority order (lower first)"),
    },
    preview: (ctx, { zoneId, ...body }) => shipping.previewUpdateZone(ctx.db, zoneId, body),
    execute: (ctx, { zoneId, ...body }) => shipping.updateZone(ctx.db, zoneId, body),
  }),

  writeTool({
    name: "shipping_zone_delete",
    title: "Delete shipping zone",
    kind: "sensitive",
    destructive: true,
    idempotent: true,
    description:
      "Permanently delete a shipping zone AND all of its rates. The preview lists every rate that will be deleted and warns if no other active zone remains. Prefer shipping_zone_update with isActive=false to disable reversibly.",
    input: { zoneId: zId("Shipping zone") },
    preview: (ctx, a) => shipping.previewDeleteZone(ctx.db, a.zoneId),
    execute: (ctx, a) => shipping.deleteZone(ctx.db, a.zoneId),
  }),

  // ── shipping rates ────────────────────────────────────────────────────────
  writeTool({
    name: "shipping_rate_create",
    title: "Add shipping rate",
    kind: "write",
    description:
      "Add a rate to a shipping zone. Defaults: FLAT, no bounds, price 0, active. A FREE rate always has price 0; its minValue is the 'free over' subtotal threshold in cents.",
    input: {
      zoneId: zId("Shipping zone"),
      name: z.string().min(1).describe("Rate name shown at checkout"),
      ...rateFields,
    },
    preview: (ctx, { zoneId, ...body }) => shipping.previewCreateRate(ctx.db, zoneId, body),
    execute: (ctx, { zoneId, ...body }) => shipping.createRate(ctx.db, zoneId, body),
  }),

  writeTool({
    name: "shipping_rate_update",
    title: "Update shipping rate",
    kind: "write",
    idempotent: true,
    description:
      "Change fields on a shipping rate; omitted fields are unchanged. To remove a bound, list it in `clear`. When price is given together with condition FREE, price is stored as 0. Find rate ids with shipping_zones_list.",
    input: {
      rateId: zId("Shipping rate"),
      name: z.string().min(1).nullish().describe("Rate name shown at checkout"),
      ...rateFields,
      clear: z.array(z.enum(RATE_CLEARABLE)).nullish().describe("Bounds to remove (set to no limit)"),
    },
    preview: (ctx, { rateId, clear, ...body }) => shipping.previewUpdateRate(ctx.db, rateId, withClears(body, clear)),
    execute: (ctx, { rateId, clear, ...body }) => shipping.updateRate(ctx.db, rateId, withClears(body, clear)),
  }),

  writeTool({
    name: "shipping_rate_delete",
    title: "Delete shipping rate",
    kind: "sensitive",
    destructive: true,
    idempotent: true,
    description:
      "Permanently delete a shipping rate. The preview shows the rate and warns if its zone would be left with no active rates. Prefer shipping_rate_update with isActive=false to disable reversibly.",
    input: { rateId: zId("Shipping rate") },
    preview: (ctx, a) => shipping.previewDeleteRate(ctx.db, a.rateId),
    execute: (ctx, a) => shipping.deleteRate(ctx.db, a.rateId),
  }),

  // ── tax ───────────────────────────────────────────────────────────────────
  readTool({
    name: "tax_get",
    title: "Get tax settings",
    description:
      "Get the store's tax settings: whether Stripe Tax is enabled, the default tax rate (percent, e.g. 8.25), and nexus states (US state codes). Returns defaults if never saved.",
    input: {},
    run: (ctx) => tax.getTaxSettings(ctx.db),
  }),

  writeTool({
    name: "tax_update",
    title: "Update tax settings",
    kind: "write",
    idempotent: true,
    description:
      "Update tax settings. Omitted fields keep their current value. The preview shows a before/after diff.",
    input: {
      stripeTaxEnabled: z.boolean().nullish().describe("Use Stripe Tax to calculate tax at checkout"),
      defaultTaxRate: z.number().min(0).max(100).nullish().describe("Default tax rate in percent, e.g. 8.25"),
      nexusStates: z.array(z.string()).nullish().describe("Full replacement list of US state codes with tax nexus, e.g. [\"CA\"]"),
    },
    preview: async (ctx, a) => tax.previewTaxUpdate(ctx.db, await mergeTax(ctx.db, a)),
    execute: async (ctx, a) => tax.updateTaxSettings(ctx.db, await mergeTax(ctx.db, a)),
  }),
];

/** The route replaces all three fields; the tool fills omitted ones from current settings. */
async function mergeTax(
  db: Parameters<typeof tax.readTaxSettings>[0],
  a: { stripeTaxEnabled?: boolean; defaultTaxRate?: number; nexusStates?: string[] },
): Promise<tax.TaxSettings> {
  const current = (await tax.readTaxSettings(db)) as tax.TaxSettings;
  return {
    stripeTaxEnabled: a.stripeTaxEnabled ?? current.stripeTaxEnabled,
    defaultTaxRate: a.defaultTaxRate ?? current.defaultTaxRate,
    nexusStates: a.nexusStates ?? current.nexusStates,
  };
}
