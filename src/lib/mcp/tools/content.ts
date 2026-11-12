/**
 * Content & messages — mirrors /api/admin/{artisans,kb,contact,communications,email-log}/*
 * via src/lib/admin-services/{artisans,kb,contact,communications}.ts.
 *
 * Artisans and KB are house-only (see src/lib/tenant-features.ts). KB has no
 * create/delete routes, so no such tools. Artisan Instagram OAuth fields are
 * never accepted or returned.
 */
import { z } from "zod";
import { readTool, writeTool, zId, zPage, zLimit, type McpTool } from "../kit";
import * as artisans from "@/lib/admin-services/artisans";
import * as kb from "@/lib/admin-services/kb";
import * as contact from "@/lib/admin-services/contact";
import * as comms from "@/lib/admin-services/communications";
import { ok, type ServiceResult } from "@/lib/admin-services/result";

const ARTISAN_STATUS = ["DRAFT", "ACTIVE"] as const;
const IMAGE_CATEGORY = ["GALLERY", "WORKSHOP", "PROCESS", "PORTRAIT"] as const;
const CONTACT_STATUS = ["UNREAD", "READ", "REPLIED", "ARCHIVED"] as const;
const COMMS_FILTER = ["ALL", "CONVERSATIONS", "TRANSACTIONAL", "UNREAD"] as const;

const str = (d: string) => z.string().nullish().describe(d);

/** Artisan profile fields shared by create and update (no Instagram token fields). */
const artisanFields = {
  slug: str("URL slug. Defaults to one derived from the name on create. Locked once the artisan is ACTIVE."),
  status: z.enum(ARTISAN_STATUS).nullish().describe("DRAFT (hidden) or ACTIVE (publicly visible on the storefront)"),
  tagline: str("Short tagline"),
  quote: str("Pull quote"),
  story: str("Long-form story text"),
  storyLabel: str('Heading shown above the story, e.g. "Their Story"'),
  heroImageUrl: str("Hero image URL"),
  avatarUrl: str("Avatar image URL"),
  originCountry: str('Country of origin (default "El Salvador")'),
  city: str("City"),
  region: str("Region / department"),
  craft: str("Craft, e.g. Pottery"),
  practicingSince: z.number().int().nullish().describe("Year they started practicing"),
  letterToBuyer: str("Letter shown to buyers"),
  socialLinks: z
    .object({
      instagram: str("Instagram URL"),
      facebook: str("Facebook URL"),
      tiktok: str("TikTok URL"),
      youtube: str("YouTube URL"),
      website: str("Website URL"),
    })
    .nullish()
    .describe("Social profile links (replaces the whole object)"),
  socialLinksVisible: z
    .object({
      instagram: z.boolean().nullish().describe("Show Instagram link"),
      facebook: z.boolean().nullish().describe("Show Facebook link"),
      tiktok: z.boolean().nullish().describe("Show TikTok link"),
      youtube: z.boolean().nullish().describe("Show YouTube link"),
      website: z.boolean().nullish().describe("Show website link"),
    })
    .nullish()
    .describe("Which social links are shown (replaces the whole object)"),
  featuredPosts: z
    .object({
      instagram: z.array(z.string()).nullish().describe("Instagram post URLs"),
      tiktok: z.array(z.string()).nullish().describe("TikTok post URLs"),
      displayCount: z.number().int().nullish().describe("How many posts to show"),
    })
    .nullish()
    .describe("Featured social posts (replaces the whole object)"),
  socialEmbedCode: str("Raw social embed HTML"),
  showGallery: z.boolean().nullish().describe("Show the image gallery (default true)"),
  metaTitle: str("SEO title"),
  metaDescription: str("SEO description"),
  isFeatured: z.boolean().nullish().describe("Feature this artisan (sorted first)"),
};

const artisanImages = z
  .array(
    z.object({
      url: z.string().describe("Full-size image URL"),
      urlMedium: str("Medium-size URL"),
      urlThumb: str("Thumbnail URL"),
      altText: str("Alt text"),
      caption: str("Caption"),
      category: z.enum(IMAGE_CATEGORY).nullish().describe("Image category (default GALLERY)"),
    }),
  )
  .nullish()
  .describe("Replaces the ENTIRE image gallery in this order. Omit to leave images unchanged.");

/** Never hand Instagram OAuth fields to the client. */
function sanitizeArtisanResult<T>(r: ServiceResult<{ artisan: T }>) {
  if (!r.ok || !r.data.artisan) return r;
  return ok({ artisan: artisans.stripArtisanSecrets(r.data.artisan as Record<string, unknown>) });
}

const snippet = (s: string, n = 200) => (s.length > n ? `${s.slice(0, n)}…` : s);

export const tools: McpTool[] = [
  // ── artisans (house only) ────────────────────────────────────────────────
  readTool({
    name: "artisans_list",
    title: "List artisans",
    houseOnly: true,
    description:
      "List all artisan profiles, featured first then by name. Returns id, name, slug, status (DRAFT or ACTIVE = publicly visible), craft, location, featured flag, first image, and linked product count.",
    input: {},
    run: async (ctx) => {
      const r = await artisans.listArtisans(ctx.db);
      return ok({
        artisans: r.data.artisans.map((a) => ({
          id: a.id,
          name: a.name,
          slug: a.slug,
          status: a.status,
          craft: a.craft,
          city: a.city,
          region: a.region,
          originCountry: a.originCountry,
          isFeatured: a.isFeatured,
          tagline: a.tagline,
          avatarUrl: a.avatarUrl,
          firstImageUrl: a.images[0]?.urlThumb ?? a.images[0]?.url ?? null,
          productCount: a.products.length,
          updatedAt: a.updatedAt,
        })),
      });
    },
  }),

  readTool({
    name: "artisans_get",
    title: "Get artisan",
    houseOnly: true,
    description: "Get one artisan's full profile, including all images and linked products.",
    input: { artisanId: zId("Artisan") },
    run: async (ctx, a) => sanitizeArtisanResult(await artisans.getArtisan(ctx.db, a.artisanId)),
  }),

  writeTool({
    name: "artisans_create",
    title: "Create artisan",
    kind: "sensitive",
    houseOnly: true,
    description:
      "Create an artisan profile. Status defaults to DRAFT (not public); creating with status ACTIVE publishes it on the storefront immediately. Images are added afterwards with artisans_update.",
    input: { name: z.string().min(1).describe("Artisan name"), ...artisanFields },
    preview: (ctx, a) => artisans.previewCreateArtisan(ctx.db, a),
    execute: async (ctx, a) => sanitizeArtisanResult(await artisans.createArtisan(ctx.db, a)),
  }),

  writeTool({
    name: "artisans_update",
    title: "Update artisan",
    kind: "sensitive",
    houseOnly: true,
    idempotent: true,
    description:
      "Update an artisan profile. Only fields you pass change; others keep their current values. Pass an empty string to blank a text field. Setting status to ACTIVE publishes the profile on the storefront; DRAFT hides it. Passing images replaces the whole gallery. The preview lists every field change.",
    input: {
      artisanId: zId("Artisan"),
      name: str("Artisan name"),
      ...artisanFields,
      images: artisanImages,
    },
    preview: (ctx, { artisanId, ...patch }) => artisans.previewUpdateArtisan(ctx.db, artisanId, patch),
    execute: async (ctx, { artisanId, ...patch }) => {
      const m = await artisans.mergeArtisanPatch(ctx.db, artisanId, patch);
      if (!m.ok) return m;
      return sanitizeArtisanResult(await artisans.updateArtisan(ctx.db, artisanId, m.data.body));
    },
  }),

  writeTool({
    name: "artisans_delete",
    title: "Delete artisan",
    kind: "sensitive",
    houseOnly: true,
    destructive: true,
    description:
      "Permanently delete an artisan profile with its images and product links (the products themselves stay). Consider artisans_update with status DRAFT to just hide it.",
    input: { artisanId: zId("Artisan") },
    preview: (ctx, a) => artisans.previewDeleteArtisan(ctx.db, a.artisanId),
    execute: (ctx, a) => artisans.deleteArtisan(ctx.db, a.artisanId),
  }),

  // ── knowledge base (house only) ──────────────────────────────────────────
  readTool({
    name: "kb_articles_list",
    title: "List knowledge base articles",
    houseOnly: true,
    description:
      "List internal admin knowledge base articles (newest first) without their full content, plus all categories. Search matches title, excerpt, and content; a matchSnippet is returned when the hit is only in the content.",
    input: {
      search: str("Text to search for (case-insensitive)"),
      category: str('Exact category name ("All" or omit for every category)'),
    },
    run: (ctx, a) => kb.listKbArticles(ctx.db.$tenantId, a),
  }),

  readTool({
    name: "kb_articles_get",
    title: "Get knowledge base article",
    houseOnly: true,
    description: "Get one knowledge base article by slug, including its full markdown content.",
    input: { slug: z.string().min(1).describe("Article slug (from kb_articles_list)") },
    run: (ctx, a) => kb.getKbArticle(ctx.db.$tenantId, a.slug),
  }),

  writeTool({
    name: "kb_articles_update",
    title: "Update knowledge base article",
    kind: "write",
    houseOnly: true,
    idempotent: true,
    description:
      "Edit a knowledge base article's title, category, excerpt, markdown content, or read time. Only fields you pass change. KB articles are internal admin docs; nothing is published publicly. Articles cannot be created or deleted through this server.",
    input: {
      slug: z.string().min(1).describe("Article slug (from kb_articles_list)"),
      title: str("New title"),
      category: str("New category"),
      excerpt: str("New excerpt"),
      content: str("New full markdown content (replaces the existing content)"),
      readTimeMin: z.number().int().min(1).nullish().describe("Read time in minutes"),
    },
    preview: (ctx, { slug, ...patch }) => kb.previewUpdateKbArticle(ctx.db.$tenantId, slug, patch),
    execute: async (ctx, { slug, ...patch }) => {
      const m = await kb.mergeKbPatch(ctx.db.$tenantId, slug, patch);
      if (!m.ok) return m;
      return kb.updateKbArticle(ctx.db.$tenantId, slug, m.data.body);
    },
  }),

  // ── contact messages ─────────────────────────────────────────────────────
  readTool({
    name: "contact_messages_list",
    title: "List contact messages",
    description:
      "List contact-form messages newest first, optionally filtered by status. Returns sender, subject, status, a message snippet, reply count, and the total unread count. Use contact_message_get for the full message and reply thread.",
    input: {
      status: z.enum(CONTACT_STATUS).nullish().describe("Status filter (omit for all)"),
      page: zPage,
      limit: zLimit(100, 20),
    },
    run: async (ctx, a) => {
      const r = await contact.listContactMessages(ctx.db, a);
      const { messages, ...rest } = r.data;
      return ok({
        ...rest,
        messages: messages.map(({ message, replies, ...m }) => ({
          ...m,
          messageSnippet: snippet(message),
          replyCount: replies.length,
        })),
      });
    },
  }),

  readTool({
    name: "contact_message_get",
    title: "Get contact message",
    description: "Get one contact-form message in full, with its reply thread and internal notes.",
    input: { messageId: zId("Contact message") },
    run: (ctx, a) => contact.getContactMessage(ctx.db, a.messageId),
  }),

  writeTool({
    name: "contact_message_update",
    title: "Update contact message status/notes",
    kind: "write",
    idempotent: true,
    description:
      "Set a contact message's status (UNREAD, READ, REPLIED, ARCHIVED) and/or replace its internal notes. Sends no email; the sender never sees notes.",
    input: {
      messageId: zId("Contact message"),
      status: z.enum(CONTACT_STATUS).nullish().describe("New status"),
      notes: str("Full replacement internal notes"),
    },
    preview: (ctx, { messageId, ...body }) => contact.previewUpdateContactMessage(ctx.db, messageId, body),
    execute: (ctx, { messageId, ...body }) => contact.updateContactMessage(ctx.db, messageId, body),
  }),

  writeTool({
    name: "contact_message_reply",
    title: "Reply to contact message",
    kind: "sensitive",
    openWorld: true,
    description:
      "Email a reply to the person who sent a contact message, from the store's address, quoting their original message. Records the reply in the thread and marks the message REPLIED. The preview shows the exact recipient, subject, and text, and warns if a reply was already sent.",
    input: {
      messageId: zId("Contact message"),
      replyText: z.string().min(1).describe("Plain-text reply body (greeting and sign-off are added automatically)"),
    },
    preview: (ctx, a) => contact.previewContactReply(ctx.db, a.messageId, a.replyText),
    execute: (ctx, a) => contact.sendContactReply(ctx.db, a.messageId, a.replyText),
  }),

  // ── communications / email log ───────────────────────────────────────────
  readTool({
    name: "communications_list",
    title: "List communications",
    description:
      "Unified feed, newest first, of contact-form conversations and transactional emails sent by the store (order confirmations, shipping, refunds, etc.). Email bodies are omitted; use email_log_get for one email's full HTML, or contact_message_get for a conversation.",
    input: {
      filter: z.enum(COMMS_FILTER).nullish().describe("ALL (default), CONVERSATIONS, TRANSACTIONAL, or UNREAD conversations"),
      page: zPage,
      limit: zLimit(50, 20),
    },
    run: async (ctx, a) => {
      const r = await comms.listCommunications(ctx.db, a);
      return ok({ ...r.data, items: comms.summarizeFeedItems(r.data.items) });
    },
  }),

  readTool({
    name: "email_log_get",
    title: "Get logged email",
    description: "Get one logged email by id, including recipient, subject, type, and its full HTML body (can be large).",
    input: { emailLogId: zId("Email log") },
    run: (ctx, a) => comms.getEmailLog(ctx.db, a.emailLogId),
  }),
];
