interface OrderShippedItem {
  title: string;
  variantTitle?: string;
  quantity: number;
  image?: string;
}

interface OrderShippedData {
  orderNumber: string;
  email: string;
  trackingCompany: string;
  trackingNumber: string;
  trackingUrl?: string;
  estimatedDelivery?: string;
  items: OrderShippedItem[];
}

export function orderShippedHtml(data: OrderShippedData): string {
  const {
    orderNumber,
    email,
    trackingCompany,
    trackingNumber,
    trackingUrl,
    estimatedDelivery,
    items,
  } = data;

  const trackingLink = trackingUrl ?? "#";

  const estimatedDeliveryFormatted = estimatedDelivery
    ? new Intl.DateTimeFormat("en-US", { dateStyle: "long" }).format(new Date(estimatedDelivery))
    : null;

  const itemsHtml = items
    .map(
      (item) => `
    <tr>
      <td style="padding: 12px 0; border-bottom: 1px solid #ede8df; vertical-align: top;">
        <table cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr>
            ${
              item.image
                ? `<td style="width: 56px; padding-right: 14px; vertical-align: top;">
                    <img src="${item.image}" alt="${item.title}" width="56" height="56"
                      style="width: 56px; height: 56px; object-fit: cover; border-radius: 6px; border: 1px solid #ede8df;" />
                  </td>`
                : `<td style="width: 56px; padding-right: 14px; vertical-align: top;">
                    <div style="width: 56px; height: 56px; background: #f5f0e8; border-radius: 6px; border: 1px solid #ede8df;"></div>
                  </td>`
            }
            <td style="vertical-align: middle;">
              <p style="margin: 0 0 3px; font-size: 14px; color: #3a2e24; font-weight: 500;">${item.title}</p>
              ${item.variantTitle ? `<p style="margin: 0; font-size: 12px; color: #7a6852;">${item.variantTitle}</p>` : ""}
              <p style="margin: 2px 0 0; font-size: 12px; color: #9a876e;">Qty: ${item.quantity}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Your Order Has Shipped — ${orderNumber}</title>
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

          <!-- Shipped banner -->
          <tr>
            <td style="padding: 40px 40px 28px; text-align: center; border-bottom: 1px solid #ede8df;">
              <div style="width: 64px; height: 64px; background: linear-gradient(135deg, #fef9ec, #fdf3d0); border: 2px solid #C9A84C; border-radius: 50%; margin: 0 auto 18px; display: flex; align-items: center; justify-content: center;">
                <span style="font-size: 30px; line-height: 64px; display: block; text-align: center;">&#128666;</span>
              </div>
              <h2 style="margin: 0 0 10px; font-size: 28px; color: #3a2e24; font-weight: 700;">
                Your order is on its way!
              </h2>
              <p style="margin: 0 0 6px; font-size: 15px; color: #7a6852;">
                Great news — your handcrafted items have shipped.
              </p>
              <p style="margin: 0; font-size: 13px; color: #9a876e;">Order <strong style="color: #8B6914;">${orderNumber}</strong></p>
            </td>
          </tr>

          <!-- Tracking info -->
          <tr>
            <td style="padding: 28px 40px; background: #faf7f2; border-bottom: 1px solid #ede8df;">
              <h3 style="margin: 0 0 16px; font-size: 14px; color: #3a2e24; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">
                Tracking Information
              </h3>
              <table cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="padding: 6px 0;">
                    <span style="font-size: 13px; color: #9a876e; display: inline-block; width: 140px;">Carrier</span>
                    <span style="font-size: 14px; color: #3a2e24; font-weight: 500;">${trackingCompany}</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 6px 0;">
                    <span style="font-size: 13px; color: #9a876e; display: inline-block; width: 140px;">Tracking #</span>
                    <span style="font-size: 14px; color: #3a2e24; font-weight: 500;">${trackingNumber}</span>
                  </td>
                </tr>
                ${
                  estimatedDeliveryFormatted
                    ? `<tr>
                  <td style="padding: 6px 0;">
                    <span style="font-size: 13px; color: #9a876e; display: inline-block; width: 140px;">Est. Delivery</span>
                    <span style="font-size: 14px; color: #3a2e24; font-weight: 500;">${estimatedDeliveryFormatted}</span>
                  </td>
                </tr>`
                    : ""
                }
              </table>

              <!-- Track button -->
              <div style="margin-top: 20px; text-align: center;">
                <a href="${trackingLink}" target="_blank"
                  style="display: inline-block; background: linear-gradient(135deg, #8B6914 0%, #C9A84C 100%); color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 600; padding: 14px 36px; border-radius: 8px; letter-spacing: 0.5px;">
                  Track Your Package
                </a>
              </div>
            </td>
          </tr>

          <!-- Items -->
          <tr>
            <td style="padding: 24px 40px;">
              <h3 style="margin: 0 0 16px; font-size: 14px; color: #3a2e24; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">
                Items Shipped
              </h3>
              <table cellpadding="0" cellspacing="0" border="0" width="100%">
                ${itemsHtml}
              </table>
            </td>
          </tr>

          <!-- Footer note -->
          <tr>
            <td style="padding: 20px 40px; text-align: center; border-top: 1px solid #ede8df; background: #faf7f2;">
              <p style="margin: 0 0 8px; font-size: 14px; color: #7a6852;">
                A confirmation was sent to <strong style="color: #3a2e24;">${email}</strong>
              </p>
              <p style="margin: 0; font-size: 13px; color: #9a876e;">
                Questions about your order?
                <a href="mailto:hello@artisansstories.com" style="color: #8B6914; text-decoration: none;">Contact us</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px; background: #3a2e24; text-align: center;">
              <p style="margin: 0 0 8px; font-size: 13px; color: rgba(255,255,255,0.7);">
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
