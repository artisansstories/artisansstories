# P4 — Stripe Connect (Standard) + hosted checkout redirect + connected-account webhooks

Implements per-tenant Stripe Connect so each tenant is **merchant-of-record**,
payments run through **Stripe-hosted Checkout** (a redirect — landing on
Stripe's domain is a trust feature), and the platform collects an **application
fee** on every charge. Tenant zero (Artisans Stories, `checkoutMode="embedded"`)
is untouched and keeps its existing embedded PaymentIntent flow.

## What changed

| File | Purpose |
|------|---------|
| `src/lib/stripe-connect.ts` | Connect client + helpers: `createConnectAccount`, `createAccountOnboardingLink`, `attachExistingAccount`, `createCheckoutSession`, and the pure `computeApplicationFee`. |
| `src/app/api/v1/store/checkout/session/route.ts` | Real checkout: same tenant-scoped validation + DB pricing as the P3 stub, then PENDING Order + Stripe-hosted session for `connect_redirect` tenants. |
| `src/app/api/platform/tenants/[id]/connect/route.ts` (POST) | Platform-admin onboarding: attach an existing account, or create one + return an onboarding link. |
| `src/app/api/platform/tenants/[id]/stripe-status/route.ts` (GET) | Platform-admin status read; syncs `tenant.stripeOnboarded` from `charges_enabled`. |
| `src/app/api/webhooks/stripe/route.ts` | Added `account.updated` and `checkout.session.completed` (Connect) handlers; embedded handlers untouched. |
| `scripts/test-payments.ts` | Gate D: unit fee math + wiring assertions + opt-in live Stripe block. |

No schema change was needed — `Order.stripeCheckoutSessionId` already existed
from P1.

## Application fee math

`computeApplicationFee(subtotal, bps) = floor(subtotal * bps / 10000)`

- `subtotal` is in cents; `bps` is basis points (`Tenant.platformFeeBps`,
  default 300 = 3%).
- **Floor**, not round: Stripe wants an integer number of cents, and flooring
  guarantees the platform never over-collects beyond the intended percentage.
- Examples: `(10000, 300) → 300`, `(2599, 250) → 64` (64.975 floored).

## Checkout endpoint contract

`POST /api/v1/store/checkout/session` (scope `checkout:create`), by tenant
`checkoutMode`:

- `"embedded"` → **409** `{ ok:false, mode:"embedded", error:"checkout_mode_embedded" }`.
  Validation + pricing still run, but no Connect session is attempted. This is
  the tenant-zero path.
- `"connect_redirect"` + onboarded → **200**
  `{ ok:true, mode:"connect_redirect", url, sessionId, orderId, orderNumber }`.
  The client redirects the browser to `url`.
- `"connect_redirect"` + **not** onboarded → **409**
  `{ ok:false, error:"tenant_stripe_not_onboarded", onboardingRequired:true }`.

Client prices are never trusted — line amounts come from `ProductVariant.price`
(falling back to `Product.price`) via the scoped client. A **PENDING** Order
(+ items, `tenantId` stamped explicitly on nested creates) is recorded with the
Stripe session id **before** returning, so the webhook can reconcile it.

## Webhooks

Connected-account events arrive on the **same** endpoint with `event.account`
set. Keyed by globally-unique Stripe ids, so they use the **raw** prisma client
(consistent with the existing embedded handlers):

- `account.updated` → if `charges_enabled`, set `stripeOnboarded=true` for the
  tenant matching `stripeConnectAccountId`.
- `checkout.session.completed` → find the PENDING Order by
  `stripeCheckoutSessionId`, mark **PAID/PROCESSING**, store the payment intent
  id, and write an `EmailLog` (`ORDER_CONFIRMATION`) with `tenantId` set
  explicitly from the order. Unknown / untracked sessions are tolerated
  (`{ received:true }`, no 500).

To receive Connect events locally:
```
stripe listen --forward-connect-to localhost:3000/api/webhooks/stripe
```

## Onboarding (platform-admin)

Both platform routes require a valid admin session belonging to the
**platform-owner** tenant (`Tenant.isPlatformOwner = true`). This is the POC
auth choice — tighten to a dedicated platform-operator role later.

```
# Create account + get onboarding link:
POST /api/platform/tenants/<tenantId>/connect
  {}                                  → { accountId, url }

# Attach an account the tenant already has:
POST /api/platform/tenants/<tenantId>/connect
  { "existingAccountId": "acct_..." } → { attached:true, onboarded }

# Check / sync status:
GET  /api/platform/tenants/<tenantId>/stripe-status
  → { chargesEnabled, payoutsEnabled, detailsSubmitted, onboarded }
```

## How to put a tenant on the redirect path (for testing)

A tenant must be `connect_redirect` AND onboarded to take payments here:

```sql
UPDATE "Tenant"
SET "checkoutMode" = 'connect_redirect',
    "stripeConnectAccountId" = 'acct_...',   -- a real test account
    "stripeOnboarded" = true
WHERE id = '<tenantId>';
```

Or via Prisma:
```ts
await prisma.tenant.update({
  where: { id: tenantId },
  data: { checkoutMode: "connect_redirect", stripeConnectAccountId: "acct_...", stripeOnboarded: true },
});
```

In practice: set `checkoutMode="connect_redirect"`, call the `connect` route to
create the account + onboarding link, complete KYC in the Stripe test dashboard,
then call `stripe-status` (or wait for the `account.updated` webhook) to flip
`stripeOnboarded`.

## Tests / gates

```
npx tsc --noEmit                  # clean
npx tsx scripts/test-payments.ts  # PAYMENTS_PASS  (live block opt-in)
npx tsx scripts/test-api.ts       # API_SMOKE_PASS
npx tsx scripts/test-isolation.ts # ISOLATION_PASS
```

`test-payments.ts` always runs the unit (fee math) + wiring (not-onboarded 409,
embedded 409) blocks. The **live Stripe** block runs only when:

```
STRIPE_SECRET_KEY=sk_test_...   # already the case (POC/test mode)
STRIPE_LIVE_TEST=1              # opt in
```

It creates a real test Connect account + onboarding link against the Stripe test
API, asserts both, then deletes the test account (best-effort). KYC can't be
automated, so it stops after link generation. Without `STRIPE_LIVE_TEST=1` it
prints `LIVE_STRIPE_SKIPPED` and the suite still passes.
