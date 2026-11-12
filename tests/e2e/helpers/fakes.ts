/**
 * In-memory stand-ins for every external service the admin touches. The e2e
 * setup (tests/e2e/setup.ts) wires them in with vi.mock, so no test can reach
 * real Stripe, Resend, R2, carriers, OpenRouter or Instagram. Tests read the
 * recorded calls to assert side effects, and can make the next call fail.
 */
import { PAYMENT_INTENTS } from "../seed";

// ── Stripe ───────────────────────────────────────────────────────────────────

interface FakeCharge { id: string; object: "charge"; amount: number; amount_refunded: number; refunded: boolean; payment_intent: string }
interface FakePI { id: string; object: "payment_intent"; amount: number; status: string; latest_charge: string | null }
export interface FakeRefund { id: string; object: "refund"; amount: number; charge: string; payment_intent: string; status: string; metadata: Record<string, string> }
export interface StripeCall { method: string; args: unknown[]; idempotencyKey?: string }

class FakeStripeError extends Error {
  type = "StripeInvalidRequestError";
  constructor(message: string, readonly code?: string, readonly statusCode = 400) {
    super(message);
  }
}

export const stripeState = {
  pis: new Map<string, FakePI>(),
  charges: new Map<string, FakeCharge>(),
  refunds: [] as FakeRefund[],
  idem: new Map<string, { params: string; result: unknown }>(),
  calls: [] as StripeCall[],
  /** Make the next call to `method` (e.g. "refunds.create") throw. */
  failNext: new Map<string, string>(),
};

export function resetStripe(): void {
  stripeState.pis.clear();
  stripeState.charges.clear();
  stripeState.refunds = [];
  stripeState.idem.clear();
  stripeState.calls = [];
  stripeState.failNext.clear();
  for (const [id, pi] of Object.entries(PAYMENT_INTENTS)) {
    const chargeId = pi.status === "requires_payment_method" ? null : `ch_${id.slice(3)}`;
    stripeState.pis.set(id, { id, object: "payment_intent", amount: pi.amount, status: pi.status, latest_charge: chargeId });
    if (chargeId) {
      const refunded = pi.refunded ?? 0;
      stripeState.charges.set(chargeId, { id: chargeId, object: "charge", amount: pi.amount, amount_refunded: refunded, refunded: refunded >= pi.amount, payment_intent: id });
    }
  }
}

/** Money actually moved by refunds.create in this test (replays don't count). */
export function stripeRefundsCreated(): FakeRefund[] {
  return stripeState.refunds;
}

function record(method: string, args: unknown[], opts?: { idempotencyKey?: string }) {
  stripeState.calls.push({ method, args, idempotencyKey: opts?.idempotencyKey });
  const failure = stripeState.failNext.get(method);
  if (failure !== undefined) {
    stripeState.failNext.delete(method);
    throw new FakeStripeError(failure, "test_failure", 500);
  }
}

function idempotent<T>(opts: { idempotencyKey?: string } | undefined, params: unknown, run: () => T): T {
  const key = opts?.idempotencyKey;
  if (!key) return run();
  const p = JSON.stringify(params);
  const prior = stripeState.idem.get(key);
  if (prior) {
    if (prior.params !== p) throw new FakeStripeError("Keys for idempotent requests can only be used with the same parameters they were first used with.", "idempotency_error");
    return prior.result as T;
  }
  const result = run();
  stripeState.idem.set(key, { params: p, result });
  return result;
}

function getPi(id: string): FakePI {
  const pi = stripeState.pis.get(id);
  if (!pi) throw new FakeStripeError(`No such payment_intent: '${id}'`, "resource_missing", 404);
  return pi;
}

export class FakeStripe {
  // Same constructor shape as the real SDK; arguments are ignored.
  constructor(...args: unknown[]) {
    void args;
  }

  paymentIntents = {
    retrieve: async (id: string, params?: { expand?: string[] }) => {
      record("paymentIntents.retrieve", [id, params]);
      const pi = getPi(id);
      const expand = params?.expand?.includes("latest_charge");
      return { ...pi, latest_charge: expand && pi.latest_charge ? { ...stripeState.charges.get(pi.latest_charge)! } : pi.latest_charge };
    },
    cancel: async (id: string, params?: unknown, opts?: { idempotencyKey?: string }) => {
      record("paymentIntents.cancel", [id, params], opts);
      return idempotent(opts, { id, params }, () => {
        const pi = getPi(id);
        if (pi.status === "succeeded") throw new FakeStripeError("This PaymentIntent could not be canceled because it has a status of succeeded.", "payment_intent_unexpected_state");
        pi.status = "canceled";
        return { ...pi };
      });
    },
    capture: async (id: string, params?: unknown, opts?: { idempotencyKey?: string }) => {
      record("paymentIntents.capture", [id, params], opts);
      return idempotent(opts, { id, params }, () => {
        const pi = getPi(id);
        if (pi.status !== "requires_capture") throw new FakeStripeError("This PaymentIntent could not be captured.", "payment_intent_unexpected_state");
        pi.status = "succeeded";
        return { ...pi };
      });
    },
  };

  charges = {
    retrieve: async (id: string) => {
      record("charges.retrieve", [id]);
      const c = stripeState.charges.get(id);
      if (!c) throw new FakeStripeError(`No such charge: '${id}'`, "resource_missing", 404);
      return { ...c };
    },
  };

  refunds = {
    list: async (params: { payment_intent?: string; charge?: string; limit?: number }) => {
      record("refunds.list", [params]);
      const data = stripeState.refunds.filter((r) => (!params.payment_intent || r.payment_intent === params.payment_intent) && (!params.charge || r.charge === params.charge));
      return { object: "list", data: data.map((r) => ({ ...r })), has_more: false };
    },
    create: async (params: { charge?: string; payment_intent?: string; amount?: number; metadata?: Record<string, string> }, opts?: { idempotencyKey?: string }) => {
      record("refunds.create", [params], opts);
      return idempotent(opts, params, () => {
        let chargeId = params.charge;
        if (!chargeId && params.payment_intent) chargeId = getPi(params.payment_intent).latest_charge ?? undefined;
        if (!chargeId) throw new FakeStripeError("This PaymentIntent does not have a successful charge to refund.", "charge_not_found");
        const charge = stripeState.charges.get(chargeId);
        if (!charge) throw new FakeStripeError(`No such charge: '${chargeId}'`, "resource_missing", 404);
        const remaining = charge.amount - charge.amount_refunded;
        if (remaining <= 0) throw new FakeStripeError(`Charge ${chargeId} has already been refunded.`, "charge_already_refunded");
        const amount = params.amount ?? remaining;
        if (amount > remaining) throw new FakeStripeError(`Refund amount ($${amount / 100}) is greater than unrefunded amount on charge ($${remaining / 100})`, "amount_too_large");
        charge.amount_refunded += amount;
        charge.refunded = charge.amount_refunded >= charge.amount;
        const refund: FakeRefund = {
          id: `re_test_${stripeState.refunds.length + 1}`, object: "refund", amount, charge: chargeId,
          payment_intent: charge.payment_intent, status: "succeeded", metadata: params.metadata ?? {},
        };
        stripeState.refunds.push(refund);
        return { ...refund };
      });
    },
  };
}

// ── Resend ───────────────────────────────────────────────────────────────────

export interface SentEmail { from: string; to: string | string[]; subject: string; html: string; replyTo?: string }

export const resendState = {
  sent: [] as SentEmail[],
  /** When set, the next send returns { error } (Resend reports failures this way). */
  failNext: null as string | null,
};

export function resetResend(): void {
  resendState.sent = [];
  resendState.failNext = null;
}

export class FakeResend {
  constructor(...args: unknown[]) {
    void args;
  }
  emails = {
    send: async (payload: SentEmail) => {
      if (resendState.failNext !== null) {
        const message = resendState.failNext;
        resendState.failNext = null;
        return { data: null, error: { name: "application_error", message } };
      }
      resendState.sent.push(payload);
      return { data: { id: `email_${resendState.sent.length}` }, error: null };
    },
  };
  contacts = { create: async () => ({ data: { id: "contact_1" }, error: null }) };
}

export function sentTo(address: string): SentEmail[] {
  return resendState.sent.filter((e) => (Array.isArray(e.to) ? e.to : [e.to]).includes(address));
}

// ── R2 (S3) ──────────────────────────────────────────────────────────────────

export const s3State = { puts: [] as { Key: string; ContentType?: string; size: number }[], commands: [] as string[] };

export function resetS3(): void {
  s3State.puts = [];
  s3State.commands = [];
}

class Command {
  constructor(readonly input: Record<string, unknown>) {}
}
export class PutObjectCommand extends Command {}
export class ListObjectsV2Command extends Command {}
export class DeleteObjectsCommand extends Command {}
export class GetObjectCommand extends Command {}
export class DeleteObjectCommand extends Command {}
export class FakeS3Client {
  constructor(...args: unknown[]) {
    void args;
  }
  async send(cmd: Command) {
    s3State.commands.push(cmd.constructor.name);
    if (cmd instanceof PutObjectCommand) {
      const body = cmd.input.Body as Buffer | Uint8Array | string | undefined;
      s3State.puts.push({ Key: String(cmd.input.Key), ContentType: cmd.input.ContentType as string | undefined, size: body ? (body as Buffer).length : 0 });
      return { ETag: '"fake"' };
    }
    if (cmd instanceof ListObjectsV2Command) return { Contents: [], IsTruncated: false };
    return {};
  }
}

// ── Carriers ─────────────────────────────────────────────────────────────────

export const carrierState = {
  /** tracking number → status the fake carrier reports. Default: in_transit. */
  statuses: new Map<string, "delivered" | "in_transit">(),
  calls: [] as { carrier: string; trackingNumber: string }[],
};

export function resetCarriers(): void {
  carrierState.statuses.clear();
  carrierState.calls = [];
}

export async function fakeCheckTracking(carrier: string, trackingNumber: string) {
  carrierState.calls.push({ carrier, trackingNumber });
  const status = carrierState.statuses.get(trackingNumber) ?? "in_transit";
  return { trackingNumber, status, description: status === "delivered" ? "Delivered, In/At Mailbox" : "In transit" };
}

// ── Outbound HTTP guard ──────────────────────────────────────────────────────

/** A 1x1 PNG, served for https://images.example.test/*. */
export const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

export const fetchState = { blocked: [] as string[], served: [] as string[] };

export function resetFetch(): void {
  fetchState.blocked = [];
  fetchState.served = [];
}

/** Replaces global fetch: serves the fake image host, refuses everything else. */
export async function guardedFetch(input: RequestInfo | URL): Promise<Response> {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  const host = new URL(url).hostname;
  if (host === "images.example.test") {
    fetchState.served.push(url);
    if (url.endsWith("/missing.png")) return new Response("not found", { status: 404 });
    return new Response(PNG_1PX, { status: 200, headers: { "content-type": "image/png", "content-length": String(PNG_1PX.length) } });
  }
  fetchState.blocked.push(url);
  throw new Error(`[e2e] blocked outbound fetch to ${url}`);
}

export function resetAllFakes(): void {
  resetStripe();
  resetResend();
  resetS3();
  resetCarriers();
  resetFetch();
}
