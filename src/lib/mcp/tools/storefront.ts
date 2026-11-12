/**
 * Storefront content (house-only) — mirrors /api/admin/email-template/*,
 * /api/admin/landing-page/*, /api/admin/linktree/* and a read-only view of the
 * Instagram connection state, via src/lib/admin-services/{email-template,
 * landing-page,linktree,instagram}.ts.
 *
 * Every tool is houseOnly (matches NAV_ITEMS houseOnly in the admin UI) and
 * additionally refuses non-house contexts at call time. The landing page is a
 * single global row; the other tables are scoped by ctx.tenantId, which comes
 * only from the verified credential.
 *
 * The admin routes take full-replacement bodies. These tools take partial
 * updates: the current row is read and the provided fields are overlaid, then
 * the SAME service function the route uses writes the merged body.
 */
import { z } from "zod";
import { readTool, writeTool, zId, type McpTool, type ToolCtx } from "../kit";
import { fetchRemoteImage } from "../fetch-image";
import { fail, ok, type ServiceResult } from "@/lib/admin-services/result";
import * as email from "@/lib/admin-services/email-template";
import * as landing from "@/lib/admin-services/landing-page";
import * as linktree from "@/lib/admin-services/linktree";
import { instagramStatus } from "@/lib/admin-services/instagram";

// ── guards / helpers ────────────────────────────────────────────────────────

/** Defense in depth: houseOnly controls registration; this blocks at call time. */
function house<A, R>(fn: (ctx: ToolCtx, a: A) => Promise<R>) {
  return async (ctx: ToolCtx, a: A) =>
    ctx.isHouse ? fn(ctx, a) : fail(403, "This tool is only available to the Artisans Stories house store.");
}

type Row = Record<string, unknown>;

/** Overlay defined args onto the current row (undefined = keep current). */
function merge(base: Row, patch: Row): Row {
  const out: Row = { ...base };
  for (const [k, v] of Object.entries(patch)) if (v !== undefined) out[k] = v;
  return out;
}

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/avif": "avif",
};

/** Download an https image into the same {buffer,name,type} shape the routes get from multipart. */
async function downloadImage(imageUrl: string): Promise<ServiceResult<email.UploadFile>> {
  const r = await fetchRemoteImage(imageUrl);
  if (!r.ok) return fail(400, r.error);
  const { buffer, contentType, fileName } = r.image;
  if (!contentType.startsWith("image/")) {
    return fail(400, `URL did not return an image (content-type: ${contentType || "unknown"}).`);
  }
  const name = fileName.includes(".") ? fileName : `${fileName}.${EXT_BY_TYPE[contentType] ?? "jpg"}`;
  return ok({ buffer, name, type: contentType });
}

async function previewDownload(imageUrl: string, storesAs: string, next: string) {
  const f = await downloadImage(imageUrl);
  if (!f.ok) return f;
  return ok({
    source: imageUrl,
    fileName: f.data.name,
    contentType: f.data.type,
    bytes: f.data.buffer.byteLength,
    storesAs,
    publishes: false,
    next,
  });
}

const zImageUrl = z.string().url().describe("Public https URL of the image to upload (max 10MB)");

// ── email template ──────────────────────────────────────────────────────────

const zEmailSocialLink = z.object({
  id: z.string().describe("Stable id, e.g. instagram"),
  platform: z.string().describe("Platform key, e.g. instagram, tiktok, facebook"),
  label: z.string().nullish().describe("Display label"),
  url: z.string().describe("Profile URL"),
  color: z.string().nullish().describe("Button color, hex like #E4405F"),
  enabled: z.boolean().describe("Show this icon in the email"),
});

const emailUpdateInput = {
  logoUrl: z.string().nullish().describe("Header logo image URL (see email_template_upload_logo)"),
  headerBgColor: z.string().nullish().describe("Header background color, hex"),
  cardBgColor: z.string().nullish().describe("Card background color, hex"),
  greetingText: z.string().nullish().describe("Greeting line, e.g. 'Welcome to the family'"),
  greetingItalic: z.boolean().nullish().describe("Render the greeting in italics"),
  bodyHtml: z.string().nullish().describe("Main email body as HTML"),
  textColorDark: z.string().nullish().describe("Dark text color, hex"),
  textColorMedium: z.string().nullish().describe("Medium text color, hex"),
  textColorLight: z.string().nullish().describe("Light text color, hex"),
  accentColor: z.string().nullish().describe("Accent color, hex"),
  socialLinks: z.array(zEmailSocialLink).nullish().describe("Full replacement list of social icon buttons"),
  signatureData: z
    .object({
      avatarUrl: z.string().nullish().describe("Signature avatar URL (see email_template_upload_avatar); empty string removes it"),
      name: z.string().nullish().describe("Signer name"),
      subtitle: z.string().nullish().describe("Line under the name"),
      closing: z.string().nullish().describe("Closing line, e.g. 'With love,'"),
    })
    .nullish()
    .describe("Signature block; fields given here are merged into the current signature"),
};

type EmailArgs = { [K in keyof typeof emailUpdateInput]?: unknown } & {
  signatureData?: Row;
};

/** Current row + provided fields, mirroring the admin UI's save mapping for the signature. */
async function emailBody(tenantId: string, a: EmailArgs): Promise<ServiceResult<Row>> {
  const cur = await email.getEmailTemplate(tenantId);
  if (!cur.ok) return cur;
  const row = cur.data.template;
  if (!row) return fail(404, "No email template exists for this store yet; create it in the admin first.");
  const { signatureData, ...rest } = a;
  const body = merge(row, rest as Row);
  if (signatureData) {
    const sig = { ...((row.signatureData as Row | null) ?? {}), ...signatureData };
    body.signatureData = sig;
    // The admin UI always copies the signature into the legacy columns on save.
    body.avatarUrl = sig.avatarUrl;
    body.signatureName = sig.name;
    body.signatureSubtitle = sig.subtitle;
    body.signatureText = sig.closing;
  }
  return ok(body);
}

// ── landing page ────────────────────────────────────────────────────────────

const LANDING_IMAGE_FIELDS = ["heroImageUrl", "backgroundImageUrl", "aboutImageUrl"] as const;

const landingUpdateInput = {
  heroTitle: z.string().min(1).nullish().describe("Hero headline"),
  heroSubtitle: z.string().nullish().describe("Hero subtitle; empty string clears it"),
  heroCTA: z.string().nullish().describe("Hero call-to-action text"),
  heroImageUrl: z.string().nullish().describe("Hero image URL (see landing_page_upload_image); empty string clears it"),
  backgroundImageUrl: z.string().nullish().describe("Background image URL; empty string clears it"),
  aboutTitle: z.string().nullish().describe("About section title"),
  aboutContent: z.string().nullish().describe("About section content (HTML); empty string clears it"),
  aboutImageUrl: z.string().nullish().describe("About section image URL; empty string clears it"),
  footerText: z.string().nullish().describe("Footer text"),
  midSectionContent: z.string().nullish().describe("Middle section content (HTML); empty string clears it"),
  showComingSoonBadge: z.boolean().nullish().describe("Show the Coming Soon badge"),
  comingSoonText: z.string().nullish().describe("Coming Soon badge text"),
  showLogo: z.boolean().nullish().describe("Show the logo"),
  showHeroImage: z.boolean().nullish().describe("Show the hero image"),
  showAboutSection: z.boolean().nullish().describe("Show the about section"),
  showMidSection: z.boolean().nullish().describe("Show the middle section"),
  showEmailForm: z.boolean().nullish().describe("Show the email signup form"),
  showSocialIcons: z.boolean().nullish().describe("Show social icons"),
  socialLinks: z
    .array(
      z.object({
        platform: z.enum(["facebook", "instagram", "x", "tiktok", "pinterest", "email"]).describe("Platform"),
        url: z.string().nullish().describe("Profile URL (all platforms except email)"),
        value: z.string().nullish().describe("Email address (platform email only)"),
      }),
    )
    .nullish()
    .describe("Full replacement list of social icons"),
  emailButtonText: z.string().nullish().describe("Signup button text"),
  emailButtonColor: z.string().nullish().describe("Signup button color, hex"),
  emailSubText: z.string().nullish().describe("Text under the signup form"),
};

async function landingBody(a: Row): Promise<ServiceResult<Row>> {
  const cur = await landing.getLandingPageSettings();
  if (!cur.ok) return cur;
  return ok(merge(cur.data.settings ?? {}, a));
}

// ── linktree ────────────────────────────────────────────────────────────────

/** Admin UI defaults, used only if the tenant has no settings row yet. */
const LINKTREE_DEFAULTS: Row = {
  isEnabled: false,
  profileName: "Artisans Stories",
  backgroundColor: "#FFFBF0",
  buttonColor: "#8B6914",
  textColor: "#1F2937",
};

const linktreeSettingsInput = {
  isEnabled: z.boolean().nullish().describe("Publish the Link Hub page at /links"),
  profileName: z.string().min(1).nullish().describe("Profile name shown at the top"),
  profileBio: z.string().nullish().describe("Short bio; empty string clears it"),
  profileImageUrl: z.string().nullish().describe("Profile image URL; empty string clears it"),
  customSlug: z.string().nullish().describe("Custom slug; empty string clears it"),
  backgroundColor: z.string().nullish().describe("Page background color, hex"),
  buttonColor: z.string().nullish().describe("Button color, hex"),
  textColor: z.string().nullish().describe("Text color, hex"),
};

async function linktreeSettingsBody(tenantId: string, a: Row): Promise<ServiceResult<Row>> {
  const cur = await linktree.getLinkTreeSettings(tenantId);
  if (!cur.ok) return cur;
  return ok(merge(cur.data.settings ?? LINKTREE_DEFAULTS, a));
}

interface LinkUpdateArgs {
  linkId: string;
  title?: string;
  url?: string;
  description?: string;
  isEnabled?: boolean;
}

/** The route always overwrites description; keep the current one unless a new value is given. */
async function linkUpdateBody(tenantId: string, a: LinkUpdateArgs): Promise<ServiceResult<linktree.LinkUpdateBody>> {
  const link = await linktree.getLinkTreeLink(tenantId, a.linkId);
  if (!link) return fail(404, "Link not found");
  return ok({
    id: a.linkId,
    title: a.title,
    url: a.url,
    description: a.description !== undefined ? a.description : link.description,
    isEnabled: a.isEnabled,
  });
}

// ── tools ───────────────────────────────────────────────────────────────────

export const tools: McpTool[] = [
  // Email template
  readTool({
    name: "email_template_get",
    title: "Get welcome email template",
    houseOnly: true,
    description:
      "Get the welcome email template sent to new subscribers: logo, colors, greeting, bodyHtml, socialLinks, signatureData, plus legacy fields. Returns template null if none exists.",
    input: {},
    run: house((ctx) => email.getEmailTemplate(ctx.tenantId)),
  }),

  writeTool({
    name: "email_template_update",
    title: "Update welcome email template",
    kind: "sensitive",
    idempotent: true,
    houseOnly: true,
    description:
      "Change the welcome email that new subscribers receive. Only the fields you pass change; everything else keeps its current value. socialLinks replaces the whole list. The preview shows a before/after diff of every column that changes (unset colors fall back to built-in defaults).",
    input: emailUpdateInput,
    preview: house(async (ctx, a) => {
      const b = await emailBody(ctx.tenantId, a as EmailArgs);
      return b.ok ? email.previewEmailTemplateUpdate(ctx.tenantId, b.data) : b;
    }),
    execute: house(async (ctx, a) => {
      const b = await emailBody(ctx.tenantId, a as EmailArgs);
      return b.ok ? email.saveEmailTemplate(ctx.tenantId, b.data) : b;
    }),
  }),

  writeTool({
    name: "email_template_upload_logo",
    title: "Upload email logo",
    kind: "write",
    openWorld: true,
    houseOnly: true,
    description:
      "Download an image from an https URL and store it as an email logo. Returns the hosted url; nothing in the email changes until you pass that url as logoUrl to email_template_update.",
    input: { imageUrl: zImageUrl },
    preview: house((_ctx, a) =>
      previewDownload(a.imageUrl, "email/logo-<timestamp>.<ext>", "After confirming, pass result.url as logoUrl to email_template_update."),
    ),
    execute: house(async (_ctx, a) => {
      const f = await downloadImage(a.imageUrl);
      return f.ok ? email.uploadEmailTemplateImage("logo", f.data) : f;
    }),
  }),

  writeTool({
    name: "email_template_upload_avatar",
    title: "Upload email signature avatar",
    kind: "write",
    openWorld: true,
    houseOnly: true,
    description:
      "Download an image from an https URL and store it as the email signature avatar. Returns the hosted url; nothing in the email changes until you pass it as signatureData.avatarUrl to email_template_update.",
    input: { imageUrl: zImageUrl },
    preview: house((_ctx, a) =>
      previewDownload(a.imageUrl, "email/avatar-<timestamp>.<ext>", "After confirming, pass result.url as signatureData.avatarUrl to email_template_update."),
    ),
    execute: house(async (_ctx, a) => {
      const f = await downloadImage(a.imageUrl);
      return f.ok ? email.uploadEmailTemplateImage("avatar", f.data) : f;
    }),
  }),

  // Landing page
  readTool({
    name: "landing_page_get",
    title: "Get landing page settings",
    houseOnly: true,
    description:
      "Get the public landing page content: hero, about and middle sections, footer, section visibility toggles, social links, and email signup form text.",
    input: {},
    run: house(() => landing.getLandingPageSettings()),
  }),

  writeTool({
    name: "landing_page_update",
    title: "Update landing page",
    kind: "sensitive",
    idempotent: true,
    houseOnly: true,
    description:
      "Change the public landing page. Only the fields you pass change; everything else keeps its current value. socialLinks replaces the whole list. Changes are live for visitors immediately. The preview shows a before/after diff of each changed field.",
    input: landingUpdateInput,
    preview: house(async (_ctx, a) => {
      const b = await landingBody(a as Row);
      return b.ok ? landing.previewLandingPageUpdate(b.data) : b;
    }),
    execute: house(async (_ctx, a) => {
      const b = await landingBody(a as Row);
      return b.ok ? landing.saveLandingPageSettings(b.data) : b;
    }),
  }),

  writeTool({
    name: "landing_page_upload_image",
    title: "Upload landing page image",
    kind: "write",
    openWorld: true,
    houseOnly: true,
    description:
      "Download an image from an https URL, convert rasters to WebP (max 2000px wide; SVG stored as-is), and store it for a landing page image slot. Returns the hosted url; the page does not change until you pass it in that field to landing_page_update.",
    input: {
      imageUrl: zImageUrl,
      field: z.enum(LANDING_IMAGE_FIELDS).describe("Which image slot this is for (used in the file name)"),
    },
    preview: house((ctx, a) =>
      previewDownload(
        a.imageUrl,
        `tenants/${ctx.tenantId}/landing-page/${a.field}-<uuid>.webp`,
        `After confirming, pass result.url as ${a.field} to landing_page_update.`,
      ),
    ),
    execute: house(async (ctx, a) => {
      const f = await downloadImage(a.imageUrl);
      return f.ok ? landing.uploadLandingPageImage(ctx.tenantId, a.field, f.data) : f;
    }),
  }),

  // Link Hub
  readTool({
    name: "linktree_settings_get",
    title: "Get Link Hub settings",
    houseOnly: true,
    description:
      "Get the Link Hub page settings: whether it is published, profile name, bio, image, custom slug, and colors. Returns settings null if never saved.",
    input: {},
    run: house((ctx) => linktree.getLinkTreeSettings(ctx.tenantId)),
  }),

  writeTool({
    name: "linktree_settings_update",
    title: "Update Link Hub settings",
    kind: "sensitive",
    idempotent: true,
    houseOnly: true,
    description:
      "Change the Link Hub page profile and colors, or publish/unpublish it with isEnabled. Only the fields you pass change. The preview shows a before/after diff.",
    input: linktreeSettingsInput,
    preview: house(async (ctx, a) => {
      const b = await linktreeSettingsBody(ctx.tenantId, a as Row);
      return b.ok ? linktree.previewLinkTreeSettings(ctx.tenantId, b.data) : b;
    }),
    execute: house(async (ctx, a) => {
      const b = await linktreeSettingsBody(ctx.tenantId, a as Row);
      return b.ok ? linktree.saveLinkTreeSettings(ctx.tenantId, b.data) : b;
    }),
  }),

  readTool({
    name: "linktree_links_list",
    title: "List Link Hub links",
    houseOnly: true,
    description:
      "List all Link Hub links in display order with id, title, url, description, icon, isEnabled, sortOrder and click count. Disabled links are hidden from visitors.",
    input: {},
    run: house((ctx) => linktree.listLinkTreeLinks(ctx.tenantId)),
  }),

  writeTool({
    name: "linktree_link_create",
    title: "Add Link Hub link",
    kind: "sensitive",
    houseOnly: true,
    description: "Add an enabled link at the bottom of the Link Hub page. Visible to visitors immediately.",
    input: {
      title: z.string().min(1).describe("Button text"),
      url: z.string().min(1).describe("Destination URL"),
      description: z.string().nullish().describe("Optional line under the title"),
      icon: z.string().nullish().describe("Optional emoji icon, e.g. 🛍️"),
    },
    preview: house((ctx, a) => linktree.previewCreateLinkTreeLink(ctx.tenantId, a)),
    execute: house((ctx, a) => linktree.createLinkTreeLink(ctx.tenantId, a)),
  }),

  writeTool({
    name: "linktree_link_update",
    title: "Update Link Hub link",
    kind: "sensitive",
    idempotent: true,
    houseOnly: true,
    description:
      "Change a link's title, url, or description, or show/hide it with isEnabled. Fields you omit keep their value; pass description as an empty string to remove it. The icon cannot be changed here (delete and re-create the link instead).",
    input: {
      linkId: zId("Link"),
      title: z.string().min(1).nullish().describe("New button text"),
      url: z.string().min(1).nullish().describe("New destination URL"),
      description: z.string().nullish().describe("New description; empty string removes it"),
      isEnabled: z.boolean().nullish().describe("Show (true) or hide (false) the link"),
    },
    preview: house(async (ctx, a) => {
      const b = await linkUpdateBody(ctx.tenantId, a);
      return b.ok ? linktree.previewUpdateLinkTreeLink(ctx.tenantId, b.data) : b;
    }),
    execute: house(async (ctx, a) => {
      const b = await linkUpdateBody(ctx.tenantId, a);
      return b.ok ? linktree.updateLinkTreeLink(ctx.tenantId, b.data) : b;
    }),
  }),

  writeTool({
    name: "linktree_link_delete",
    title: "Delete Link Hub link",
    kind: "sensitive",
    destructive: true,
    houseOnly: true,
    description:
      "Permanently delete a link and its click history. To hide it temporarily use linktree_link_update with isEnabled false instead. The preview shows the link and how many click records go with it.",
    input: { linkId: zId("Link") },
    preview: house((ctx, a) => linktree.previewDeleteLinkTreeLink(ctx.tenantId, a.linkId)),
    execute: house((ctx, a) => linktree.deleteLinkTreeLink(ctx.tenantId, a.linkId)),
  }),

  writeTool({
    name: "linktree_links_reorder",
    title: "Reorder Link Hub links",
    kind: "sensitive",
    idempotent: true,
    houseOnly: true,
    description:
      "Set the display order of Link Hub links. linkIds must contain every link id exactly once, top to bottom (get them from linktree_links_list). The preview shows the old and new order.",
    input: {
      linkIds: z.array(z.string().min(1)).min(1).describe("All link ids in the new top-to-bottom order"),
    },
    preview: house((ctx, a) => linktree.previewReorderLinkTreeLinks(ctx.tenantId, a.linkIds)),
    execute: house((ctx, a) => linktree.reorderLinkTreeLinks(ctx.tenantId, a.linkIds)),
  }),

  readTool({
    name: "linktree_analytics",
    title: "Link Hub click analytics",
    houseOnly: true,
    description:
      "Link Hub clicks: all-time and last-7-days clicks per link, daily totals for the last 7 days, the 20 most recent clicks (time, referrer, link), and the all-time total. Visitor IP addresses are omitted.",
    input: {},
    run: house(async (ctx) => {
      const r = await linktree.getLinkTreeAnalytics(ctx.tenantId);
      if (!r.ok) return r;
      return ok({
        ...r.data,
        recentLog: r.data.recentLog.map((row: Row) => {
          const { ip: _ip, ...rest } = row;
          void _ip;
          return rest;
        }),
      });
    }),
  }),

  // Instagram (read-only)
  readTool({
    name: "instagram_status",
    title: "Instagram connection status",
    houseOnly: true,
    description:
      "For each artisan, whether an Instagram account is connected, the Instagram user id, and when the access token expires (tokens last about 60 days). Connecting and disconnecting are done in the admin UI on the artisan's edit page.",
    input: {},
    run: house((ctx) => instagramStatus(ctx.db)),
  }),
];
