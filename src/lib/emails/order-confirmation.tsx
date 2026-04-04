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
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

export function orderConfirmationHtml(order: OrderEmailData): string {
  const {
    orderNumber,
    email,
    items,
    subtotal,
    shippingTotal,
    taxTotal,
    discountTotal,
    total,
    shippingAddress,
  } = order;

  const itemsHtml = items
    .map(
      (item) => `
    <tr>
      <td style="padding: 12px 0; border-bottom: 1px solid #ede8df; vertical-align: top;">
        <table cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr>
            ${
              item.image
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
  `
    )
    .join("");

  const totalsHtml = `
    <tr>
      <td style="padding: 8px 0; color: #7a6852; font-size: 14px;">Subtotal</td>
      <td style="padding: 8px 0; text-align: right; color: #3a2e24; font-size: 14px;">${formatPrice(subtotal)}</td>
    </tr>
    ${
      discountTotal > 0
        ? `<tr>
        <td style="padding: 8px 0; color: #5a8a5a; font-size: 14px;">Discount</td>
        <td style="padding: 8px 0; text-align: right; color: #5a8a5a; font-size: 14px;">−${formatPrice(discountTotal)}</td>
      </tr>`
        : ""
    }
    <tr>
      <td style="padding: 8px 0; color: #7a6852; font-size: 14px;">Shipping</td>
      <td style="padding: 8px 0; text-align: right; color: #3a2e24; font-size: 14px;">
        ${shippingTotal === 0 ? "Free" : formatPrice(shippingTotal)}
      </td>
    </tr>
    <tr>
      <td style="padding: 8px 0; color: #7a6852; font-size: 14px;">Tax (est.)</td>
      <td style="padding: 8px 0; text-align: right; color: #3a2e24; font-size: 14px;">${formatPrice(taxTotal)}</td>
    </tr>
    <tr style="border-top: 2px solid #8B6914;">
      <td style="padding: 12px 0 4px; color: #3a2e24; font-size: 16px; font-weight: 700;">Total</td>
      <td style="padding: 12px 0 4px; text-align: right; color: #8B6914; font-size: 20px; font-weight: 700;">${formatPrice(total)}</td>
    </tr>
  `;

  const addr = shippingAddress;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Order Confirmed — ${orderNumber}</title>
</head>
<body style="margin: 0; padding: 0; background: #f5f0e8; font-family: 'Helvetica Neue', Arial, sans-serif;">
  <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background: #f5f0e8; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table cellpadding="0" cellspacing="0" border="0" width="600" style="max-width: 600px; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 16px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #8B6914 0%, #C9A84C 100%); padding: 32px 40px; text-align: center;">
              <h1 style="margin: 0 0 4px; font-size: 26px; font-weight: 700; color: #ffffff; letter-spacing: 2px; text-transform: uppercase;">
                Artisans' Stories
              </h1>
              <p style="margin: 0; font-size: 13px; color: rgba(255,255,255,0.8); letter-spacing: 1px;">
                Handcrafted with care
              </p>
            </td>
          </tr>

          <!-- Thank You -->
          <tr>
            <td style="padding: 40px 40px 24px; text-align: center; border-bottom: 1px solid #ede8df;">
              <div style="width: 56px; height: 56px; background: #f0faf0; border-radius: 50%; margin: 0 auto 16px; display: flex; align-items: center; justify-content: center;">
                <span style="font-size: 28px; line-height: 56px; display: block; text-align: center;">&#10003;</span>
              </div>
              <h2 style="margin: 0 0 8px; font-size: 28px; color: #3a2e24; font-weight: 700;">
                Thank you for your order!
              </h2>
              <p style="margin: 0 0 16px; font-size: 15px; color: #7a6852;">
                Your handcrafted items are being prepared with care.
              </p>
              <div style="display: inline-block; background: #faf7f2; border: 1px solid #ede8df; border-radius: 8px; padding: 10px 24px;">
                <p style="margin: 0; font-size: 13px; color: #7a6852;">Order number</p>
                <p style="margin: 4px 0 0; font-size: 20px; color: #8B6914; font-weight: 700; letter-spacing: 1px;">${orderNumber}</p>
              </div>
            </td>
          </tr>

          <!-- Items -->
          <tr>
            <td style="padding: 24px 40px;">
              <h3 style="margin: 0 0 16px; font-size: 16px; color: #3a2e24; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">
                Order Summary
              </h3>
              <table cellpadding="0" cellspacing="0" border="0" width="100%">
                ${itemsHtml}
              </table>
            </td>
          </tr>

          <!-- Totals -->
          <tr>
            <td style="padding: 0 40px 24px;">
              <table cellpadding="0" cellspacing="0" border="0" width="100%" style="border-top: 1px solid #ede8df; padding-top: 16px;">
                ${totalsHtml}
              </table>
            </td>
          </tr>

          <!-- Shipping Address -->
          <tr>
            <td style="padding: 24px 40px; background: #faf7f2; border-top: 1px solid #ede8df;">
              <h3 style="margin: 0 0 12px; font-size: 16px; color: #3a2e24; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">
                Shipping To
              </h3>
              <p style="margin: 0; font-size: 14px; color: #3a2e24; line-height: 1.6;">
                ${addr.firstName} ${addr.lastName}<br />
                ${addr.address1}${addr.address2 ? `<br />${addr.address2}` : ""}<br />
                ${addr.city}, ${addr.state} ${addr.zip}<br />
                ${addr.country}
              </p>
            </td>
          </tr>

          <!-- Confirmation note -->
          <tr>
            <td style="padding: 24px 40px; text-align: center; border-top: 1px solid #ede8df;">
              <p style="margin: 0 0 8px; font-size: 14px; color: #7a6852;">
                A confirmation email has been sent to <strong style="color: #3a2e24;">${email}</strong>
              </p>
              <p style="margin: 0; font-size: 14px; color: #7a6852;">
                We'll notify you when your order ships.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; background: #3a2e24; text-align: center;">
              <p style="margin: 0 0 8px; font-size: 13px; color: rgba(255,255,255,0.7);">
                Questions? Contact us at
                <a href="mailto:hello@artisansstories.com" style="color: #C9A84C; text-decoration: none;">
                  hello@artisansstories.com
                </a>
              </p>
              <p style="margin: 0; font-size: 12px; color: rgba(255,255,255,0.4);">
                &copy; ${new Date().getFullYear()} Artisans' Stories. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
