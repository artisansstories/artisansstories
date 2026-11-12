/**
 * mcp/kit.ts — tool definition helpers shared by every tool module.
 *
 * Conventions enforced here so individual tools can't drift:
 *   - Description starts with a factual "[Read]" / "[Write]" / "[Sensitive write]" tag.
 *   - MCP annotations (title, readOnlyHint, destructiveHint, idempotentHint,
 *     openWorldHint) are set on every tool.
 *   - Optional input fields are `.nullish()`; null is normalized to undefined
 *     before the handler runs.
 *   - Writes are two-call preview → confirm with an HMAC confirm token (spec §5).
 *     The preview is recomputed on the confirm call too, so a state change in
 *     between (e.g. order already refunded) blocks instead of executing.
 *   - Confirm tokens are single-use: the token is claimed in McpNonce BEFORE
 *     the side effect and never released, so a replay is blocked.
 *   - Expected failures come back as structured `{done:false, blocked:true, reason}`
 *     results with retry guidance (spec §6), never `isError`.
 */
import { z } from "zod";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { TenantPrisma } from "@/lib/tenant-prisma";
import type { ServiceResult } from "@/lib/admin-services/result";
import type { McpContext } from "./auth";
import { signConfirmToken, verifyConfirmToken, idempotencyKeyFor, confirmTokenExpiry } from "./confirm-token";
import { claimNonce } from "./nonce";
import { auditMcpWrite } from "./audit";

export type ToolKind = "read" | "write" | "sensitive";

export interface ToolCtx extends McpContext {
  db: TenantPrisma;
}

export interface ExecuteExtra {
  /** Deterministic per confirm token; pass to Stripe where supported. */
  idempotencyKey: string;
}

type Shape = z.ZodRawShape;
/** Deeply strip `null` from a type — matches what normalizeNulls does at runtime. */
export type NoNull<T> = T extends null
  ? never
  : T extends (infer U)[]
    ? NoNull<U>[]
    : T extends Date
      ? T
      : T extends object
        ? { [K in keyof T]: NoNull<T[K]> }
        : T;
/** Handler args: the parsed input with every null normalized to undefined. */
type Args<S extends Shape> = NoNull<z.infer<z.ZodObject<S>>>;

/** Tools may return a ServiceResult or a bare value (treated as success). */
type Outcome = ServiceResult<unknown> | { ok?: undefined; [k: string]: unknown } | unknown[];

interface BaseDef<S extends Shape> {
  name: string;
  title: string;
  /** Factual description WITHOUT the [Read]/[Write] tag — the kit prepends it. */
  description: string;
  input: S;
  /** Only register for the house (platform-owner) tenant, matching the admin UI. */
  houseOnly?: boolean;
}

export interface ReadDef<S extends Shape> extends BaseDef<S> {
  run: (ctx: ToolCtx, args: Args<S>) => Promise<Outcome>;
  /** Reads that reach an external service (e.g. carrier APIs). */
  openWorld?: boolean;
}

export interface WriteDef<S extends Shape> extends BaseDef<S> {
  kind: "write" | "sensitive";
  destructive?: boolean;
  idempotent?: boolean;
  /** True for anything that emails a customer or moves money. */
  openWorld?: boolean;
  /** Read-only. Compute the REAL effect (amounts, recipients, rows affected). */
  preview: (ctx: ToolCtx, args: Args<S>) => Promise<Outcome>;
  execute: (ctx: ToolCtx, args: Args<S>, extra: ExecuteExtra) => Promise<Outcome>;
  /** Read tool to check the outcome if execute fails midway. Defaults by name prefix (statusToolFor). */
  checkWith?: string;
}

export interface McpTool {
  name: string;
  title: string;
  kind: ToolKind;
  description: string;
  houseOnly: boolean;
  inputShape: Shape;
  annotations: {
    title: string;
    readOnlyHint: boolean;
    destructiveHint: boolean;
    idempotentHint: boolean;
    openWorldHint: boolean;
  };
  handler: (ctx: ToolCtx, rawArgs: Record<string, unknown>) => Promise<CallToolResult>;
}

// ── helpers ─────────────────────────────────────────────────────────────────

/** Recursively turn null into undefined (models pad optional fields with null). */
export function normalizeNulls<T>(value: T): T {
  if (value === null) return undefined as T;
  if (Array.isArray(value)) return value.map((v) => normalizeNulls(v)) as T;
  if (value && typeof value === "object" && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const n = normalizeNulls(v);
      if (n !== undefined) out[k] = n;
    }
    return out as T;
  }
  return value;
}

export function jsonResult(obj: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(obj, null, 2) }] };
}

export function blocked(reason: string, extra?: Record<string, unknown>) {
  return { done: false, blocked: true, reason, ...(extra ?? {}) };
}

/** Map an HTTP-shaped failure onto explicit retry guidance (spec §6). */
export function failureToResult(status: number, error: string, extra?: Record<string, unknown>) {
  let retry: string;
  if (status === 401) retry = "Not authorized. Do not retry; the connection needs to be re-established.";
  else if (status === 402 || status === 403) retry = "Permission or billing boundary. Do not retry; tell the user.";
  else if (status === 404) retry = "Not found. Recheck the identifier (use a list/search tool) instead of retrying.";
  else if (status === 409) retry = "Conflicting state. Re-read the record and tell the user; do not retry blindly.";
  else if (status >= 500) retry = "Server-side failure. You may retry once; if it fails again, tell the user.";
  else retry = "The request was rejected as invalid. Fix the input; do not retry unchanged.";
  return blocked(error, { status, retry, ...(extra ?? {}) });
}

function isServiceResult(x: unknown): x is ServiceResult<unknown> {
  return !!x && typeof x === "object" && "ok" in x && typeof (x as { ok: unknown }).ok === "boolean"
    && ("data" in x || "body" in x);
}

function unwrap(outcome: Outcome): { ok: true; data: unknown } | { ok: false; result: Record<string, unknown> } {
  if (isServiceResult(outcome)) {
    if (outcome.ok) return { ok: true, data: outcome.data };
    const { error, ...rest } = outcome.body;
    return { ok: false, result: failureToResult(outcome.status, error, rest) };
  }
  // Tool already produced a structured blocked result.
  if (outcome && typeof outcome === "object" && (outcome as { blocked?: unknown }).blocked === true) {
    return { ok: false, result: outcome as Record<string, unknown> };
  }
  return { ok: true, data: outcome };
}

function unexpected(err: unknown) {
  console.error("[mcp] tool error:", err);
  return failureToResult(500, "Unexpected server error");
}

/** Read tool that shows the current state a write tool changes, by name prefix. */
const STATUS_TOOLS: Array<[prefix: string, tool: string]> = [
  ["orders_check_tracking", "orders_list"],
  ["orders_", "orders_get"],
  ["returns_", "returns_get"],
  ["products_", "products_get"],
  ["categories_", "categories_get"],
  ["inventory_", "inventory_list"],
  ["customers_", "customers_get"],
  ["discounts_", "discounts_get"],
  ["shipping_", "shipping_zones_list"],
  ["tax_", "tax_get"],
  ["settings_", "settings_get"],
  ["team_", "team_list"],
  ["artisans_", "artisans_get"],
  ["kb_", "kb_articles_get"],
  ["contact_", "contact_message_get"],
  ["email_template_", "email_template_get"],
  ["landing_page_", "landing_page_get"],
  ["linktree_settings_", "linktree_settings_get"],
  ["linktree_", "linktree_links_list"],
];

export function statusToolFor(toolName: string): string | undefined {
  return STATUS_TOOLS.find(([prefix]) => toolName.startsWith(prefix))?.[1];
}

export const ALREADY_USED_REASON = "This confirmation was already used. Request a new preview.";

const TAG: Record<ToolKind, string> = {
  read: "[Read]",
  write: "[Write]",
  sensitive: "[Sensitive write]",
};

const WRITE_SUFFIX =
  " Two-step: call without confirmToken to get a preview (nothing changes), show it to the user, and only after they approve call again with identical arguments plus the returned confirmToken (valid 10 minutes).";

const confirmTokenField = z
  .string()
  .nullish()
  .describe("Token returned by the preview call. Omit to get a preview.");

// ── builders ────────────────────────────────────────────────────────────────

export function readTool<S extends Shape>(def: ReadDef<S>): McpTool {
  const schema = z.object(def.input);
  return {
    name: def.name,
    title: def.title,
    kind: "read",
    description: `${TAG.read} ${def.description}`,
    houseOnly: !!def.houseOnly,
    inputShape: def.input,
    annotations: {
      title: def.title,
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: !!def.openWorld,
    },
    handler: async (ctx, rawArgs) => {
      try {
        const args = schema.parse(normalizeNulls(rawArgs)) as unknown as Args<S>;
        const r = unwrap(await def.run(ctx, args));
        return jsonResult(r.ok ? r.data : r.result);
      } catch (err) {
        if (err instanceof z.ZodError) {
          return jsonResult(failureToResult(400, "Invalid arguments", { issues: err.issues }));
        }
        return jsonResult(unexpected(err));
      }
    },
  };
}

export function writeTool<S extends Shape>(def: WriteDef<S>): McpTool {
  const schema = z.object(def.input);
  return {
    name: def.name,
    title: def.title,
    kind: def.kind,
    description: `${TAG[def.kind]} ${def.description}${WRITE_SUFFIX}`,
    houseOnly: !!def.houseOnly,
    inputShape: { ...def.input, confirmToken: confirmTokenField },
    annotations: {
      title: def.title,
      readOnlyHint: false,
      destructiveHint: !!def.destructive,
      idempotentHint: !!def.idempotent,
      openWorldHint: !!def.openWorld,
    },
    handler: async (ctx, rawArgs) => {
      try {
        const normalized = normalizeNulls(rawArgs) as Record<string, unknown>;
        const { confirmToken, ...rest } = normalized;
        const args = schema.parse(rest) as unknown as Args<S>;

        const pv = unwrap(await def.preview(ctx, args));
        if (!pv.ok) return jsonResult(pv.result);

        if (typeof confirmToken !== "string" || !confirmToken) {
          return jsonResult({
            done: false,
            status: "pending_confirmation",
            preview: pv.data,
            confirmToken: signConfirmToken(ctx.tenantId, def.name, args),
            next: `Nothing has changed yet. Show this preview to the user and wait for an explicit yes. Then call ${def.name} again with the same arguments plus this confirmToken.`,
          });
        }

        const verdict = verifyConfirmToken(confirmToken, ctx.tenantId, def.name, args);
        if (verdict !== "ok") {
          return jsonResult(
            blocked(
              verdict === "expired"
                ? "Confirmation expired. Request a new preview and ask the user again."
                : "Confirmation token does not match these arguments. Request a new preview; never invent a token.",
              { status: "failed" },
            ),
          );
        }

        // Claim the token BEFORE any side effect. Only one caller can win the
        // insert; a DB error here means nothing ran, so refuse (fail closed).
        let claim: Awaited<ReturnType<typeof claimNonce>>;
        try {
          claim = await claimNonce("confirm", confirmToken, ctx.tenantId, confirmTokenExpiry(confirmToken));
        } catch (err) {
          console.error("[mcp] confirm-token claim failed:", err);
          return jsonResult(
            failureToResult(503, "Could not record this confirmation, so nothing was changed. Try confirming again shortly.", {
              status: "failed",
            }),
          );
        }
        if (claim === "already_used") {
          return jsonResult(blocked(ALREADY_USED_REASON, { status: "failed" }));
        }

        let outcome: Outcome;
        try {
          outcome = await def.execute(ctx, args, { idempotencyKey: idempotencyKeyFor(def.name, confirmToken) });
        } catch (err) {
          // The token stays claimed: the side effect may have partly happened.
          await auditMcpWrite(ctx, def.name, args, "failed", { error: err instanceof Error ? err.message : String(err) });
          const check = def.checkWith ?? statusToolFor(def.name);
          console.error("[mcp] tool error:", err);
          return jsonResult({
            done: false,
            blocked: true,
            status: "unknown",
            reason: "The write failed partway, so its status is unknown. It may or may not have taken effect.",
            retry: check
              ? `Check the current state with ${check} before retrying. If a retry is needed, request a new preview; this confirmation is used up.`
              : "Check the current state with a read tool before retrying. If a retry is needed, request a new preview; this confirmation is used up.",
            ...(check ? { checkWith: check } : {}),
          });
        }
        const r = unwrap(outcome);
        await auditMcpWrite(ctx, def.name, args, r.ok ? "confirmed" : "failed", r.ok ? undefined : r.result);
        if (!r.ok) return jsonResult({ ...r.result, outcome: "failed" });
        return jsonResult({ done: true, status: "confirmed", result: r.data });
      } catch (err) {
        if (err instanceof z.ZodError) {
          return jsonResult(failureToResult(400, "Invalid arguments", { issues: err.issues }));
        }
        return jsonResult(unexpected(err));
      }
    },
  };
}

// ── shared zod pieces ───────────────────────────────────────────────────────

export const zId = (what: string) => z.string().min(1).describe(`${what} id`);
export const zPage = z.number().int().min(1).nullish().describe("Page number (default 1)");
export const zLimit = (max = 100, def = 20) =>
  z.number().int().min(1).max(max).nullish().describe(`Page size (default ${def}, max ${max})`);
/** Money in cents. */
export const zCents = (desc: string) => z.number().int().describe(`${desc} (in cents)`);
