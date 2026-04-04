import { Client } from "pg";

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  await client.query(`
    CREATE TABLE IF NOT EXISTS "KBArticle" (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      title TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL DEFAULT 'General',
      excerpt TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      "readTimeMin" INTEGER NOT NULL DEFAULT 5,
      "publishedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  console.log("KBArticle table created (or already exists).");

  // Seed starter articles
  const articles = [
    {
      id: "kb-getting-started",
      title: "Getting Started with Your Admin Panel",
      slug: "getting-started-with-your-admin-panel",
      category: "Getting Started",
      excerpt: "An overview of all sections in the Artisans Stories admin panel and how to navigate them.",
      readTimeMin: 5,
      content: `# Getting Started with Your Admin Panel

Welcome to the Artisans Stories admin panel. This guide walks you through every section so you can hit the ground running.

## Dashboard

The **Dashboard** is your home base. It shows key metrics at a glance:

- **Recent orders** — latest orders with status and value
- **Revenue summary** — today, this week, this month
- **Low stock alerts** — products approaching or below threshold
- **Quick actions** — jump to common tasks

## Products

Manage your product catalogue from the **Products** section. You can:

- Add, edit, and archive products
- Upload images and set featured photos
- Define product variants (size, color, material)
- Set pricing, compare-at prices, and SKUs

## Categories

Organise products into a hierarchical category structure. Categories appear in the storefront navigation and help customers browse by type.

## Inventory

Track stock levels across all variants. The **Inventory** section shows:

- Current quantity on hand
- Low-stock threshold per variant
- Inventory adjustment logs

## Orders

All customer orders flow into the **Orders** section. See order lifecycle, fulfillment status, and customer details. You can process fulfillments, add tracking numbers, and manage returns.

## Customers

View customer profiles, order history, and lifetime value in the **Customers** section.

## Returns

Process return requests, approve or reject them, and mark items as received.

## Discounts

Create and manage discount codes — percentage off, fixed amount, or free shipping.

## Shipping

Define shipping zones and rates. Configure flat rates or per-item pricing per zone.

## Tax

Set tax rates by region. Mark products as taxable or tax-exempt.

## Reports

The **Reports** dashboard provides charts and data exports for sales, top products, customer metrics, and discount performance.

## Team

Invite and manage admin team members. Assign roles: Super Admin, Admin, or Editor.

## Settings

Configure store-wide settings: store name, contact email, brand colors, and more.

## Knowledge Base

You're reading it! Use the **Knowledge Base** to find guides and documentation for the admin panel.

---

*If you have questions not covered here, reach out to your store administrator.*`,
    },
    {
      id: "kb-managing-products",
      title: "Managing Products and Inventory",
      slug: "managing-products-and-inventory",
      category: "Products",
      excerpt: "How to add products, set up variants, upload images, and track inventory levels.",
      readTimeMin: 7,
      content: `# Managing Products and Inventory

This guide covers everything you need to know about the Products and Inventory sections.

## Adding a New Product

1. Go to **Products** → click **Add Product**
2. Fill in the product details:
   - **Title** — the product name shown to customers
   - **Description** — rich text description with features, care instructions, etc.
   - **Category** — assign to a category for storefront browsing
   - **Status** — Draft (hidden) or Active (visible)

## Setting Prices

- **Price** — the selling price
- **Compare-at price** — the "was" price shown with a strikethrough (optional)
- **Cost** — your cost of goods (used for profit reporting, not shown to customers)

## Product Variants

Most artisan products come in variations. To add variants:

1. Under the **Variants** section, add options like Size, Color, or Material
2. Each combination becomes a variant with its own SKU, price, and stock level

> **Tip:** You can bulk-edit variant prices from the variant table.

## Uploading Images

- Click **Add Image** to upload product photos
- Drag to reorder — the first image becomes the featured image
- Images are automatically optimised and served via CDN
- Recommended size: at least **1200 × 1200px**, square aspect ratio

## Tracking Inventory

Each variant has an individual stock count. From **Inventory**:

- View current quantity on hand
- Set a **low-stock threshold** — you'll see alerts when stock drops below this
- Make **manual adjustments** with a reason note (receiving stock, write-offs, corrections)
- Review the full **adjustment log** for audit trail

## Low Stock Alerts

The Dashboard surfaces low-stock variants automatically. You can also see them in:

- **Inventory** → filter by "Low Stock"
- **Reports** → Products tab → Low Stock Alerts section

## Archiving Products

To remove a product from the storefront without deleting it, set its status to **Archived**. Archived products are hidden from customers but remain in your records and order history.

---

*For bulk product imports, contact your store administrator.*`,
    },
    {
      id: "kb-processing-orders",
      title: "Processing Orders and Fulfillments",
      slug: "processing-orders-and-fulfillments",
      category: "Orders",
      excerpt: "The full order lifecycle — from new order to fulfilled shipment, plus handling returns.",
      readTimeMin: 8,
      content: `# Processing Orders and Fulfillments

This guide explains the complete order lifecycle from placement to delivery and returns.

## Order Statuses

| Status | Meaning |
|--------|---------|
| **Pending** | Order placed, payment not yet confirmed |
| **Processing** | Payment confirmed, preparing for fulfilment |
| **Fulfilled** | Shipped with tracking number |
| **Completed** | Delivered and closed |
| **Cancelled** | Cancelled before shipment |
| **Refunded** | Payment returned to customer |

## Viewing an Order

From **Orders**, click any order to see:

- Customer details and shipping address
- Line items with images, variants, quantities, and prices
- Payment summary (subtotal, shipping, tax, discounts, total)
- Fulfilment history
- Internal notes

## Processing a Fulfilment

1. Open the order
2. Click **Fulfil Order** (or **Fulfil Items** for partial shipments)
3. Select the items being shipped
4. Enter the **courier name** and **tracking number**
5. Click **Confirm Fulfilment** — the customer receives a shipping notification email

> **Tip:** You can fulfil an order in multiple shipments if items are coming from different locations.

## Adding Tracking

If you have a tracking number but haven't fulfilled yet, you can add it after the fact:

1. Open the fulfilment record
2. Click **Add Tracking**
3. Enter courier and tracking number

The customer's shipping notification will be updated.

## Cancelling an Order

1. Open the order
2. Click **Cancel Order**
3. Choose whether to **refund** the payment (recommended if payment was captured)
4. Add an optional cancellation reason

Cancellations trigger an email to the customer.

## Handling Returns

Returns are managed in the **Returns** section:

1. A customer submits a return request (or you create one manually)
2. Review the request — approve or reject
3. If approved, the customer ships items back
4. Mark items as **received** once they arrive
5. Process the **refund** (partial or full)

### Return Statuses

- **Requested** — awaiting your review
- **Approved** — customer can send items back
- **Rejected** — return denied
- **Received** — items back in warehouse
- **Refunded** — payment returned

## Refunds

Refunds are processed through Stripe. You can issue:

- **Full refunds** — entire order amount
- **Partial refunds** — specific line items or custom amount

Refund confirmation emails are sent automatically.

---

*For questions about Stripe payouts or disputes, check your Stripe dashboard directly.*`,
    },
  ];

  for (const article of articles) {
    await client.query(
      `INSERT INTO "KBArticle" (id, title, slug, category, excerpt, content, "readTimeMin")
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (slug) DO NOTHING`,
      [article.id, article.title, article.slug, article.category, article.excerpt, article.content, article.readTimeMin]
    );
    console.log(`  ✓ Seeded: ${article.title}`);
  }

  await client.end();
  console.log("Done.");
}

main().catch((err) => { console.error(err); process.exit(1); });
