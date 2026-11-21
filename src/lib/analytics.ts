/**
 * analytics.ts — storefront ecommerce events for the store's own GA4 and Meta
 * Pixel (StoreAnalytics loads them). Every call is a no-op unless a tracker is
 * configured for this page, so pages can call these unconditionally.
 *
 * Events fired before StoreAnalytics configures (child effects run before the
 * layout's) wait in a short queue and go out right after the first page_view.
 * Never pass customer PII (email, name, address) — only product/order data.
 */

export interface AnalyticsItem {
  id: string;
  name: string;
  /** Unit price in cents. */
  price: number;
  quantity: number;
  variant?: string;
}

export interface PurchaseSummary {
  orderNumber: string;
  /** Cents. */
  value: number;
  tax: number;
  shipping: number;
  items: AnalyticsItem[];
}

interface TrackerConfig {
  gaId: string | null;
  pixelId: string | null;
}

type Gtag = (...args: unknown[]) => void;
type Fbq = ((...args: unknown[]) => void) & { queue?: unknown[]; callMethod?: (...a: unknown[]) => void };
type AnalyticsWindow = Window & {
  dataLayer?: unknown[];
  gtag?: Gtag;
  fbq?: Fbq;
  _fbq?: Fbq;
  __asTrackers?: Set<string>;
};

/** Cart line (src/lib/cart.ts or the /t/ storefront cart) → analytics item. */
export function toAnalyticsItem(line: {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  variantName?: string | null;
}): AnalyticsItem {
  return {
    id: line.productId,
    name: line.name,
    price: line.price,
    quantity: line.quantity,
    ...(line.variantName ? { variant: line.variantName } : {}),
  };
}

const CURRENCY = "USD";
const MAX_QUEUE = 20;

let config: TrackerConfig | null = null;
let queue: Array<() => void> = [];

const win = () => (typeof window === "undefined" ? null : (window as AnalyticsWindow));
const dollars = (cents: number) => Math.round(cents) / 100;

/** Install the gtag / fbq stubs (they buffer until the real scripts load) and init each ID once. */
export function configureAnalytics(next: TrackerConfig): void {
  const w = win();
  if (!w || (!next.gaId && !next.pixelId)) return;
  const seen = (w.__asTrackers ??= new Set());

  if (next.gaId) {
    w.dataLayer ??= [];
    w.gtag ??= function gtag() {
      // gtag.js reads the `arguments` object itself, not an array.
      // eslint-disable-next-line prefer-rest-params
      w.dataLayer!.push(arguments);
    };
    if (!seen.has(`ga:${next.gaId}`)) {
      seen.add(`ga:${next.gaId}`);
      w.gtag("js", new Date());
      // Page views are sent by hand on every App Router navigation.
      w.gtag("config", next.gaId, { send_page_view: false });
    }
  }

  if (next.pixelId) {
    if (!w.fbq) {
      // Meta's standard stub: buffer calls until fbevents.js sets callMethod.
      const fbq: Fbq = (...args: unknown[]) => {
        if (fbq.callMethod) fbq.callMethod(...args);
        else fbq.queue!.push(args);
      };
      Object.assign(fbq, { queue: [], loaded: true, version: "2.0", push: fbq });
      w.fbq = fbq;
      w._fbq ??= fbq;
    }
    if (!seen.has(`px:${next.pixelId}`)) {
      seen.add(`px:${next.pixelId}`);
      w.fbq("init", next.pixelId);
    }
  }

  config = next;
}

/** Stop sending (StoreAnalytics unmounted, e.g. navigating into admin). */
export function resetAnalytics(): void {
  config = null;
  queue = [];
}

function send(gaEvent: string, gaParams: Record<string, unknown>, pixelEvent?: string, pixelParams?: Record<string, unknown>) {
  const fire = () => {
    const w = win();
    if (!w || !config) return;
    if (config.gaId && w.gtag) w.gtag("event", gaEvent, { ...gaParams, send_to: config.gaId });
    if (config.pixelId && w.fbq && pixelEvent) w.fbq("trackSingle", config.pixelId, pixelEvent, pixelParams ?? {});
  };
  if (config) fire();
  else if (queue.length < MAX_QUEUE) queue.push(fire);
}

const PII_PARAM = /e-?mail|name|phone|address|token|session/i;

/** URL without query params that could carry PII (e.g. the success page's ?email=). */
export function scrubUrl(url: string): string {
  try {
    const u = new URL(url, "https://placeholder.invalid");
    for (const [k, v] of [...u.searchParams]) if (PII_PARAM.test(k) || v.includes("@")) u.searchParams.delete(k);
    return url.startsWith("/") ? u.pathname + u.search + u.hash : u.toString();
  } catch {
    return url.split("?")[0];
  }
}

/** Page view for the current URL, then anything queued before configuration. */
export function trackPageView(path: string): void {
  if (!config) return;
  const w = win();
  send(
    "page_view",
    { page_path: scrubUrl(path), page_location: w && scrubUrl(w.location.href), page_title: w?.document.title },
    "PageView",
  );
  const pending = queue;
  queue = [];
  pending.forEach((fire) => fire());
}

const gaItems = (items: AnalyticsItem[]) =>
  items.map((i) => ({
    item_id: i.id,
    item_name: i.name,
    price: dollars(i.price),
    quantity: i.quantity,
    ...(i.variant ? { item_variant: i.variant } : {}),
  }));

const pixelContents = (items: AnalyticsItem[]) => ({
  content_ids: items.map((i) => i.id),
  contents: items.map((i) => ({ id: i.id, quantity: i.quantity, item_price: dollars(i.price) })),
  content_type: "product",
  num_items: items.reduce((n, i) => n + i.quantity, 0),
});

const itemsValue = (items: AnalyticsItem[]) => items.reduce((sum, i) => sum + i.price * i.quantity, 0);

function commerce(gaEvent: string, pixelEvent: string, items: AnalyticsItem[], valueCents = itemsValue(items)) {
  if (items.length === 0) return;
  const value = dollars(valueCents);
  send(
    gaEvent,
    { currency: CURRENCY, value, items: gaItems(items) },
    pixelEvent,
    { currency: CURRENCY, value, ...pixelContents(items) },
  );
}

export const trackViewItem = (item: AnalyticsItem) => commerce("view_item", "ViewContent", [item]);
export const trackAddToCart = (item: AnalyticsItem) => commerce("add_to_cart", "AddToCart", [item]);
/** Pixel has no standard cart-view event, so view_cart is GA4-only. */
export function trackViewCart(items: AnalyticsItem[], valueCents?: number) {
  if (items.length === 0) return;
  send("view_cart", { currency: CURRENCY, value: dollars(valueCents ?? itemsValue(items)), items: gaItems(items) });
}
export const trackBeginCheckout = (items: AnalyticsItem[], valueCents?: number) =>
  commerce("begin_checkout", "InitiateCheckout", items, valueCents);

const PENDING_KEY = (order: string) => `as-analytics:pending-purchase:${order}`;
const SENT_KEY = (order: string) => `as-analytics:purchase-sent:${order}`;

function storage(): Storage | null {
  try {
    return win()?.localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * Checkout stores the order summary just before redirecting to the success
 * page (which only knows the order number). Product/order data only.
 */
export function stashPurchase(summary: PurchaseSummary): void {
  try {
    storage()?.setItem(PENDING_KEY(summary.orderNumber), JSON.stringify(summary));
  } catch {
    // storage full / blocked: the purchase event is simply skipped
  }
}

/**
 * Send `purchase` for this order once: a reload, back-navigation or second
 * visit to the success page never sends it again. Returns whether it was sent.
 */
export function trackPurchaseOnce(orderNumber: string): boolean {
  const store = storage();
  if (!store || !orderNumber) return false;
  if (store.getItem(SENT_KEY(orderNumber))) return false;
  const raw = store.getItem(PENDING_KEY(orderNumber));
  if (!raw) return false;
  let summary: PurchaseSummary;
  try {
    summary = JSON.parse(raw) as PurchaseSummary;
  } catch {
    store.removeItem(PENDING_KEY(orderNumber));
    return false;
  }
  store.setItem(SENT_KEY(orderNumber), "1");
  store.removeItem(PENDING_KEY(orderNumber));
  const value = dollars(summary.value);
  send(
    "purchase",
    {
      transaction_id: orderNumber,
      currency: CURRENCY,
      value,
      tax: dollars(summary.tax),
      shipping: dollars(summary.shipping),
      items: gaItems(summary.items),
    },
    "Purchase",
    { currency: CURRENCY, value, ...pixelContents(summary.items) },
  );
  return true;
}
