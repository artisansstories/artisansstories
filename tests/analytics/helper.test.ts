import { describe, it, expect, beforeEach } from "vitest";

// The storefront analytics helper: a no-op without IDs, queued until the
// layout configures, and `purchase` sent once per order.

class MemoryStorage {
  private m = new Map<string, string>();
  getItem(k: string) {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, String(v));
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}

type FakeWindow = {
  localStorage: MemoryStorage;
  location: { href: string };
  document: { title: string };
  dataLayer?: unknown[];
  gtag?: (...a: unknown[]) => void;
  fbq?: ((...a: unknown[]) => void) & { queue?: unknown[][] };
  __asTrackers?: Set<string>;
};

let w: FakeWindow;

async function load() {
  // Fresh module state per test.
  const { vi } = await import("vitest");
  vi.resetModules();
  return import("@/lib/analytics");
}

/** Every gtag("event", …) call, as [name, params]. */
function gaEvents(): Array<[string, Record<string, unknown>]> {
  return (w.dataLayer ?? [])
    .map((a) => Array.from(a as ArrayLike<unknown>))
    .filter((a) => a[0] === "event")
    .map((a) => [a[1] as string, a[2] as Record<string, unknown>]);
}
const pixelEvents = () => (w.fbq?.queue ?? []).filter((a) => a[0] === "trackSingle").map((a) => a[2]);

const item = { id: "p1", name: "Bag", price: 2500, quantity: 2, variant: "Red" };

beforeEach(() => {
  w = { localStorage: new MemoryStorage(), location: { href: "https://x.test/shop" }, document: { title: "Shop" } };
  (globalThis as unknown as { window: FakeWindow }).window = w;
});

describe("analytics helper", () => {
  it("is a no-op when no IDs are configured", async () => {
    const a = await load();
    a.trackViewItem(item);
    a.trackAddToCart(item);
    a.configureAnalytics({ gaId: null, pixelId: null });
    a.trackPageView("/shop");
    expect(w.gtag).toBeUndefined();
    expect(w.fbq).toBeUndefined();
    expect(w.dataLayer).toBeUndefined();
  });

  it("queues events fired before configuration and sends them after the page view", async () => {
    const a = await load();
    a.trackViewItem(item);
    a.configureAnalytics({ gaId: "G-AB12CD34EF", pixelId: "123456789012345" });
    a.trackPageView("/shop/bag");
    expect(gaEvents().map((e) => e[0])).toEqual(["page_view", "view_item"]);
    const [, params] = gaEvents()[1];
    expect(params).toMatchObject({ currency: "USD", value: 50, send_to: "G-AB12CD34EF" });
    expect(params.items).toEqual([{ item_id: "p1", item_name: "Bag", price: 25, quantity: 2, item_variant: "Red" }]);
    expect(pixelEvents()).toEqual(["PageView", "ViewContent"]);
  });

  it("initializes each ID once across remounts", async () => {
    const a = await load();
    a.configureAnalytics({ gaId: "G-AB12CD34EF", pixelId: "123456789012345" });
    a.resetAnalytics();
    a.configureAnalytics({ gaId: "G-AB12CD34EF", pixelId: "123456789012345" });
    const configs = (w.dataLayer ?? []).map((x) => Array.from(x as ArrayLike<unknown>)).filter((x) => x[0] === "config");
    expect(configs).toHaveLength(1);
    expect(configs[0][2]).toEqual({ send_page_view: false });
    expect((w.fbq?.queue ?? []).filter((x) => x[0] === "init")).toHaveLength(1);
  });

  it("stops sending after reset (e.g. navigating into admin)", async () => {
    const a = await load();
    a.configureAnalytics({ gaId: "G-AB12CD34EF", pixelId: null });
    a.resetAnalytics();
    a.trackAddToCart(item);
    expect(gaEvents()).toHaveLength(0);
  });

  it("sends purchase once per order, with no customer PII", async () => {
    const a = await load();
    a.configureAnalytics({ gaId: "G-AB12CD34EF", pixelId: "123456789012345" });
    a.stashPurchase({ orderNumber: "AS-1001", value: 5913, tax: 413, shipping: 500, items: [item] });
    expect(a.trackPurchaseOnce("AS-1001")).toBe(true);
    expect(a.trackPurchaseOnce("AS-1001")).toBe(false); // reload
    const purchases = gaEvents().filter((e) => e[0] === "purchase");
    expect(purchases).toHaveLength(1);
    expect(purchases[0][1]).toMatchObject({ transaction_id: "AS-1001", value: 59.13, tax: 4.13, shipping: 5, currency: "USD" });
    expect(pixelEvents().filter((e) => e === "Purchase")).toHaveLength(1);
    expect(JSON.stringify(w.dataLayer) + JSON.stringify(w.fbq?.queue)).not.toMatch(/@|email|address/i);
  });

  it("survives a fresh page load: the sent marker persists", async () => {
    let a = await load();
    a.stashPurchase({ orderNumber: "AS-2", value: 100, tax: 0, shipping: 0, items: [item] });
    expect(a.trackPurchaseOnce("AS-2")).toBe(true);
    a = await load();
    a.configureAnalytics({ gaId: "G-AB12CD34EF", pixelId: null });
    expect(a.trackPurchaseOnce("AS-2")).toBe(false);
  });

  it("skips purchase when checkout left no summary", async () => {
    const a = await load();
    a.configureAnalytics({ gaId: "G-AB12CD34EF", pixelId: null });
    expect(a.trackPurchaseOnce("AS-UNKNOWN")).toBe(false);
    expect(gaEvents()).toHaveLength(0);
  });
});

describe("scrubUrl", () => {
  it("drops PII query params but keeps campaign params", async () => {
    const { scrubUrl } = await load();
    expect(scrubUrl("/checkout/success/AS-1?email=a%40b.com&utm_source=ig")).toBe("/checkout/success/AS-1?utm_source=ig");
    expect(scrubUrl("https://x.test/p?ref=a@b.com&q=bag")).toBe("https://x.test/p?q=bag");
    expect(scrubUrl("/shop")).toBe("/shop");
  });
});
