interface OrderEmailItem {
  title: string;
  variantTitle?: string;
  quantity: number;
  price: number;
  total: number;
  image?: string;
}

interface OrderEmailData {
  orderNumber: string;
  email: string;
  items: OrderEmailItem[];
  subtotal: number;
  shippingTotal: number;
  taxTotal: number;
  discountTotal: number;
  total: number;
  viewOrderUrl?: string;
  shippingAddress: {
    firstName: string;
    lastName: string;
    address1: string;
    address2?: string;
    city: string;
    state: string;
    zip: string;
    country: string;
  };
}

function formatPrice(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export function orderConfirmationHtml(order: OrderEmailData): string {
  const { orderNumber, items, subtotal, shippingTotal, taxTotal, viewOrderUrl, discountTotal, total, shippingAddress } = order;

  const itemsHtml = items.map((item) => `
    <tr>
      <td style="padding: 12px 0; border-bottom: 1px solid #ede8df; vertical-align: top;">
        <table cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr>
            ${item.image
              ? `<td style="width: 64px; padding-right: 16px; vertical-align: top;">
                  <img src="${item.image}" alt="${item.title}" width="64" height="64"
                    style="width: 64px; height: 64px; object-fit: cover; border-radius: 6px; border: 1px solid #ede8df;" />
                </td>`
              : `<td style="width: 64px; padding-right: 16px; vertical-align: top;">
                  <div style="width: 64px; height: 64px; background: #f5f0e8; border-radius: 6px; border: 1px solid #ede8df;"></div>
                </td>`
            }
            <td style="vertical-align: top;">
              <p style="margin: 0 0 4px; font-size: 15px; color: #3a2e24; font-weight: 500;">${item.title}</p>
              ${item.variantTitle ? `<p style="margin: 0 0 4px; font-size: 13px; color: #7a6852;">${item.variantTitle}</p>` : ""}
              <p style="margin: 0; font-size: 13px; color: #7a6852;">Qty: ${item.quantity} × ${formatPrice(item.price)}</p>
            </td>
            <td style="vertical-align: top; text-align: right; white-space: nowrap;">
              <p style="margin: 0; font-size: 15px; color: #3a2e24; font-weight: 500;">${formatPrice(item.total)}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `).join("");

  const totalsHtml = `
    <tr>
      <td style="padding: 8px 0; color: #7a6852; font-size: 14px;">Subtotal</td>
      <td style="padding: 8px 0; text-align: right; color: #3a2e24; font-size: 14px;">${formatPrice(subtotal)}</td>
    </tr>
    ${discountTotal > 0 ? `
    <tr>
      <td style="padding: 8px 0; color: #5a8a5a; font-size: 14px;">Discount</td>
      <td style="padding: 8px 0; text-align: right; color: #5a8a5a; font-size: 14px;">−${formatPrice(discountTotal)}</td>
    </tr>` : ""}
    <tr>
      <td style="padding: 8px 0; color: #7a6852; font-size: 14px;">Shipping</td>
      <td style="padding: 8px 0; text-align: right; color: #3a2e24; font-size: 14px;">${shippingTotal === 0 ? "Free" : formatPrice(shippingTotal)}</td>
    </tr>
    <tr>
      <td style="padding: 8px 0; color: #7a6852; font-size: 14px;">Tax (est.)</td>
      <td style="padding: 8px 0; text-align: right; color: #3a2e24; font-size: 14px;">${formatPrice(taxTotal)}</td>
    </tr>
    <tr>
      <td colspan="2" style="padding: 0;"><div style="height: 1px; background: #8B6914; margin: 4px 0 0;"></div></td>
    </tr>
    <tr>
      <td style="padding: 12px 0 4px; color: #3a2e24; font-size: 16px; font-weight: 700;">Total</td>
      <td style="padding: 12px 0 4px; text-align: right; color: #8B6914; font-size: 20px; font-weight: 700;">${formatPrice(total)}</td>
    </tr>
  `;

  const addr = shippingAddress;
  const siteUrl = "https://artisansstories.com";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Order Confirmed — ${orderNumber}</title>
</head>
<body style="margin:0;padding:0;background:#f5f0e8;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f5f0e8;padding:32px 16px;">
    <tr><td align="center">
      <table cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,0.08);">

        <!-- Logo header — plain white, no color -->
        <tr>
          <td style="padding:32px 40px 20px;text-align:center;border-bottom:1px solid #ede8df;">
            <a href="${siteUrl}" style="display:inline-block;">
              <img src="https://pub-0225431098954524b5abd8a1b398b466.r2.dev/email/artisansstories-logo.png"
                alt="Artisans' Stories" width="240"
                style="display:block;margin:0 auto;width:240px;max-width:80%;height:auto;" />
            </a>
          </td>
        </tr>

        <!-- Thank You -->
        <tr>
          <td style="padding:36px 40px 24px;text-align:center;border-bottom:1px solid #ede8df;">
            <!-- Clean SVG checkmark circle — properly centered -->
            <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 18px;">
              <tr><td align="center">
                <div style="width:56px;height:56px;background:#f0faf0;border-radius:50%;text-align:center;line-height:56px;">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
                    style="display:inline-block;vertical-align:middle;"
                    xmlns="http://www.w3.org/2000/svg">
                    <circle cx="12" cy="12" r="11" fill="#dcfce7" stroke="#16a34a" stroke-width="1.5"/>
                    <path d="M7 12.5l3.5 3.5 6.5-7" stroke="#16a34a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </div>
              </td></tr>
            </table>
            <h2 style="margin:0 0 8px;font-size:26px;color:#3a2e24;font-weight:700;font-family:'Helvetica Neue',Arial,sans-serif;">
              Thank you for your order!
            </h2>
            <p style="margin:0 0 20px;font-size:15px;color:#7a6852;">
              Your handcrafted items are being prepared with care.
            </p>
            <div style="display:inline-block;background:#faf7f2;border:1px solid #ede8df;border-radius:8px;padding:10px 28px;">
              <p style="margin:0;font-size:12px;color:#9a876e;text-transform:uppercase;letter-spacing:0.06em;">Order number</p>
              <p style="margin:4px 0 0;font-size:19px;color:#8B6914;font-weight:700;letter-spacing:1px;">${orderNumber}</p>
            </div>
          </td>
        </tr>

        <!-- Items -->
        <tr>
          <td style="padding:24px 40px;">
            <h3 style="margin:0 0 16px;font-size:13px;color:#3a2e24;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;">
              Order Summary
            </h3>
            <table cellpadding="0" cellspacing="0" border="0" width="100%">
              ${itemsHtml}
            </table>
          </td>
        </tr>

        <!-- Totals -->
        <tr>
          <td style="padding:0 40px 28px;">
            <table cellpadding="0" cellspacing="0" border="0" width="100%" style="border-top:1px solid #ede8df;padding-top:8px;">
              ${totalsHtml}
            </table>
          </td>
        </tr>

        <!-- Shipping Address -->
        <tr>
          <td style="padding:24px 40px;background:#faf7f2;border-top:1px solid #ede8df;">
            <h3 style="margin:0 0 10px;font-size:13px;color:#3a2e24;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;">
              Shipping To
            </h3>
            <p style="margin:0;font-size:14px;color:#3a2e24;line-height:1.7;">
              ${addr.firstName} ${addr.lastName}<br />
              ${addr.address1}${addr.address2 ? `<br />${addr.address2}` : ""}<br />
              ${addr.city}, ${addr.state} ${addr.zip}<br />
              ${addr.country}
            </p>
          </td>
        </tr>

        <!-- View Order CTA -->
        <tr>
          <td style="padding:28px 40px;text-align:center;border-top:1px solid #ede8df;">
            <p style="margin:0 0 16px;font-size:14px;color:#7a6852;">
              Track your order or view your order history anytime:
            </p>
            <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
              <tr>
                <td style="background:#8B6914;border-radius:8px;">
                  <a href="${viewOrderUrl || `${siteUrl}/account/orders/${orderNumber}`}"
                    style="display:inline-block;padding:14px 36px;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;letter-spacing:0.04em;font-family:'Helvetica Neue',Arial,sans-serif;">
                    View Your Order
                  </a>
                </td>
              </tr>
            </table>
            ${!viewOrderUrl ? `<p style="margin:12px 0 0;font-size:12px;color:#9a876e;">You'll be asked to verify your email — we'll send a quick sign-in link, no password needed.</p>` : ""}
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:20px 40px;background:#3a2e24;text-align:center;">
            <p style="margin:0 0 6px;font-size:12px;color:rgba(255,255,255,0.6);">
              Questions?
              <a href="mailto:hello@artisansstories.com?subject=Order%20${encodeURIComponent(orderNumber)}"
                style="color:#C9A84C;text-decoration:none;">
                hello@artisansstories.com
              </a>
            </p>
            <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.35);">
              &copy; ${new Date().getFullYear()} Artisans' Stories. All rights reserved.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
