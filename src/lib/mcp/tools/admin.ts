/**
 * Store admin core — mirrors /api/admin/{dashboard,reports/*,settings,team/*}
 * via src/lib/admin-services/{dashboard,reports,settings,team}.ts.
 */
import { z } from "zod";
import { readTool, writeTool, zId, type McpTool, type ToolCtx } from "../kit";
import { getDashboard } from "@/lib/admin-services/dashboard";
import * as reports from "@/lib/admin-services/reports";
import * as settings from "@/lib/admin-services/settings";
import * as team from "@/lib/admin-services/team";
import { fail } from "@/lib/admin-services/result";

const TEAM_ROLE = ["ADMIN", "EDITOR"] as const;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_SALES_RANGE_DAYS = 731;

const actorOf = (ctx: ToolCtx): team.TeamActor => ({ id: ctx.actorId, role: ctx.role, name: ctx.actorLabel });

const zDay = (desc: string) => z.string().regex(DAY, "Use YYYY-MM-DD").nullish().describe(desc);
const zText = (desc: string) => z.string().nullish().describe(desc);

/** Editable StoreSettings fields (the admin Settings page). No MCP on/off field, by design. */
const SETTINGS_INPUT = {
  storeName: z.string().min(1).nullish().describe("Store name"),
  storeDescription: zText("Store description"),
  storeLogo: zText("Store logo image URL"),
  storeFavicon: zText("Favicon image URL"),
  primaryColor: z.string().min(1).nullish().describe("Primary brand color, hex e.g. #8B6914"),
  accentColor: z.string().min(1).nullish().describe("Accent color, hex e.g. #C9A84C"),
  fontHeading: z.string().min(1).nullish().describe("Heading font family"),
  fontBody: z.string().min(1).nullish().describe("Body font family"),
  contactEmail: z.string().min(1).nullish().describe("Public contact email"),
  contactPhone: zText("Public contact phone"),
  storeEnabled: z
    .boolean()
    .nullish()
    .describe("true = store LIVE (published), false = Coming Soon mode (unpublished)"),
  returnPolicyDays: z.number().int().min(0).nullish().describe("Return window in days"),
  returnPolicyText: zText("Return policy text"),
  orderNotificationEmail: zText("Address that receives new-order notifications"),
  lowStockAlertEmail: zText("Address that receives low-stock alerts"),
  lowStockThreshold: z.number().int().min(0).nullish().describe("Default low-stock threshold (units)"),
  adminLogoSize: z.number().int().min(1).nullish().describe("Admin logo width in pixels"),
  instagramUrl: zText("Instagram URL"),
  tiktokUrl: zText("TikTok URL"),
  facebookUrl: zText("Facebook URL"),
  pinterestUrl: zText("Pinterest URL"),
  metaTitle: zText("SEO meta title"),
  metaDescription: zText("SEO meta description"),
  googleAnalyticsId: zText("Google Analytics measurement id"),
  productDisclaimer: zText("Disclaimer shown on product pages"),
};

const EMAIL_BRANDING_INPUT = {
  emailFromName: zText("Sender display name. Empty string clears it (falls back to store name)."),
  emailReplyTo: zText("Reply-to address. Empty string clears it."),
  emailAccentColor: zText("Hex color for email buttons. Empty string clears it (falls back to theme accent)."),
  emailLogoUrl: zText("Email logo image URL. Empty string clears it (falls back to theme logo)."),
};

/**
 * Resolve and bound the sales range. Omitted dates are passed to the service as
 * omitted so the route's own explicit default (last 30 days incl. today, server
 * local time) applies; the resolved range is echoed back.
 */
function salesRange(a: { startDate?: string; endDate?: string }) {
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - 29);
  const startDate = a.startDate ?? fmt(start);
  const endDate = a.endDate ?? fmt(today);
  const days = (Date.parse(endDate) - Date.parse(startDate)) / 86_400_000;
  if (Number.isNaN(days)) return fail(400, "Invalid startDate or endDate");
  if (days < 0) return fail(400, "startDate must be on or before endDate");
  if (days > MAX_SALES_RANGE_DAYS) return fail(400, `Date range too long (max ${MAX_SALES_RANGE_DAYS} days)`);
  return { startDate, endDate, defaulted: { startDate: !a.startDate, endDate: !a.endDate } };
}

export const tools: McpTool[] = [
  // ── dashboard / reports ───────────────────────────────────────────────────
  readTool({
    name: "dashboard_summary",
    title: "Dashboard summary",
    description:
      "Store dashboard: all-time order count, this calendar month's paid revenue (cents), active product count, number of low-stock tracked variants, and the 5 most recent orders.",
    input: {},
    run: (ctx) => getDashboard(ctx.db),
  }),

  readTool({
    name: "reports_sales",
    title: "Sales report",
    description:
      "Paid-order sales for a date range: daily revenue and order counts, totals, average order value (cents), and % change vs the previous period of equal length. Defaults to the last 30 days ending today when dates are omitted; max range 731 days. The response echoes the range used.",
    input: {
      startDate: zDay("First day, YYYY-MM-DD (default: 29 days before today)"),
      endDate: zDay("Last day inclusive, YYYY-MM-DD (default: today)"),
    },
    run: async (ctx, a) => {
      const range = salesRange(a);
      if ("ok" in range) return range;
      const r = await reports.salesReport(ctx.db, { startDate: a.startDate, endDate: a.endDate });
      return r.ok ? { range, ...(r.data as Record<string, unknown>) } : r;
    },
  }),

  readTool({
    name: "reports_products",
    title: "Product performance report",
    description:
      "All-time product performance: top 10 products by revenue and by units sold (cents), plus every tracked variant at or below its low-stock threshold.",
    input: {},
    run: (ctx) => reports.productsReport(ctx.db),
  }),

  readTool({
    name: "reports_customers",
    title: "Customer report",
    description:
      "Customer summary: total customers, new this calendar month, returning this month (ordered this month but created earlier), and the top 10 customers by lifetime spend (cents).",
    input: {},
    run: (ctx) => reports.customersReport(ctx.db),
  }),

  readTool({
    name: "reports_discounts",
    title: "Discount report",
    description:
      "Every discount code with type, value, usage count, active flag, and all-time revenue (cents) from PAID orders that used it, most used first.",
    input: {},
    run: (ctx) => reports.discountsReport(ctx.db),
  }),

  // ── settings ──────────────────────────────────────────────────────────────
  readTool({
    name: "settings_get",
    title: "Get store settings",
    description:
      "Current store settings (name, branding, contact, live/Coming Soon status, return policy, notifications, social links, SEO) plus email branding (sender name, reply-to, email accent color, email logo).",
    input: {},
    run: (ctx) => settings.readSettings(ctx.db),
  }),

  writeTool({
    name: "settings_update",
    title: "Update store settings",
    kind: "sensitive",
    idempotent: true,
    description:
      "Change one or more store settings. Only fields you pass are changed; omitted fields stay as they are. Setting storeEnabled publishes the store (true, goes live) or unpublishes it (false, Coming Soon). The preview lists each field's before/after value. Email branding is changed with settings_update_email_branding.",
    input: SETTINGS_INPUT,
    preview: (ctx, a) => settings.previewUpdateSettings(ctx.db, { ...a }),
    execute: (ctx, a) => settings.updateSettings(ctx.db, { ...a }),
  }),

  writeTool({
    name: "settings_update_email_branding",
    title: "Update email branding",
    kind: "sensitive",
    idempotent: true,
    description:
      "Change the branding used on all transactional emails: sender display name, reply-to address, button accent color, and logo. Only fields you pass are changed; pass an empty string to clear a field back to the store default. The preview lists before/after values.",
    input: EMAIL_BRANDING_INPUT,
    preview: async (ctx, a) => {
      const { current, body } = await settings.mergeEmailBranding(ctx.db, a);
      return settings.previewUpdateEmailBranding(ctx.db, body, current);
    },
    execute: async (ctx, a) => {
      const { body } = await settings.mergeEmailBranding(ctx.db, a);
      return settings.updateEmailBranding(ctx.db, body);
    },
  }),

  // ── team ──────────────────────────────────────────────────────────────────
  readTool({
    name: "team_list",
    title: "List admin team",
    description: "All admin users for this store, oldest first: id, name, email, role (SUPER_ADMIN, ADMIN, EDITOR), and active flag.",
    input: {},
    run: (ctx) => team.listTeam(ctx.db),
  }),

  writeTool({
    name: "team_add",
    title: "Add admin team member",
    kind: "sensitive",
    openWorld: true,
    description:
      "Grant a person admin access as ADMIN or EDITOR and email them an admin sign-in link. Requires the caller to be SUPER_ADMIN or ADMIN. Fails if the email already belongs to an admin of this store. The preview shows the new member, role, and invite recipient.",
    input: {
      name: z.string().min(1).describe("Full name"),
      email: z.string().email().describe("Email address (used to sign in)"),
      role: z.enum(TEAM_ROLE).describe("ADMIN or EDITOR"),
    },
    preview: (ctx, a) => team.previewAddTeamMember(ctx.db, actorOf(ctx), a),
    execute: (ctx, a) => team.addTeamMember(ctx.db, actorOf(ctx), a),
  }),

  writeTool({
    name: "team_update",
    title: "Update admin team member",
    kind: "sensitive",
    idempotent: true,
    description:
      "Change an admin's role (ADMIN/EDITOR) and/or deactivate or reactivate them (inactive admins cannot sign in). Requires the caller to be SUPER_ADMIN or ADMIN. A SUPER_ADMIN's role cannot be changed. Get ids from team_list. Sends no email.",
    input: {
      adminId: zId("Admin user"),
      role: z.enum(TEAM_ROLE).nullish().describe("New role; omit to keep"),
      isActive: z.boolean().nullish().describe("false = deactivate, true = reactivate; omit to keep"),
    },
    preview: (ctx, { adminId, ...body }) => team.previewUpdateTeamMember(ctx.db, actorOf(ctx), adminId, body),
    execute: (ctx, { adminId, ...body }) => team.updateTeamMember(ctx.db, actorOf(ctx), adminId, body),
  }),

  writeTool({
    name: "team_remove",
    title: "Remove admin team member",
    kind: "sensitive",
    destructive: true,
    description:
      "Permanently delete an admin user from this store. Only a SUPER_ADMIN may do this (API keys act as ADMIN and are always refused), and never on their own account. Consider team_update with isActive=false to suspend instead. Sends no email.",
    input: { adminId: zId("Admin user") },
    preview: (ctx, a) => team.previewRemoveTeamMember(ctx.db, actorOf(ctx), a.adminId),
    execute: (ctx, a) => team.removeTeamMember(ctx.db, actorOf(ctx), a.adminId),
  }),
];
