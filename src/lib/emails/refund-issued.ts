function formatPrice(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export function refundIssuedHtml(data: {
  orderNumber: string;
  email: string;
  refundAmount: number; // in cents
  items: Array<{ title: string; variantTitle?: string; quantity: number }>;
}): string {
  const { orderNumber, email, refundAmount, items } = data;

  const itemsHtml = items
    .map(
      (item) => `
    <tr>
      <td style="padding: 10px 0; border-bottom: 1px solid #ede8df; vertical-align: top;">
        <p style="margin: 0 0 3px; font-size: 14px; color: #3a2e24; font-weight: 500;">${item.title}</p>
        ${item.variantTitle ? `<p style="margin: 0 0 2px; font-size: 12px; color: #7a6852;">${item.variantTitle}</p>` : ""}
        <p style="margin: 0; font-size: 12px; color: #9a876e;">Qty: ${item.quantity}</p>
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
  <title>Refund Issued — ${orderNumber}</title>
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
                Artisans Stories
              </h1>
              <p style="margin: 0; font-size: 13px; color: rgba(255,255,255,0.8); letter-spacing: 1px;">
                Handcrafted with care
              </p>
            </td>
          </tr>

          <!-- Banner -->
          <tr>
            <td style="padding: 40px 40px 28px; text-align: center; border-bottom: 1px solid #ede8df;">
              <div style="width: 64px; height: 64px; background: #dcfce7; border: 2px solid #16a34a; border-radius: 50%; margin: 0 auto 18px;">
                <span style="font-size: 30px; line-height: 64px; display: block; text-align: center;">&#36;</span>
              </div>
              <h2 style="margin: 0 0 10px; font-size: 26px; color: #3a2e24; font-weight: 700;">
                Your refund has been issued!
              </h2>
              <p style="margin: 0 0 16px; font-size: 15px; color: #7a6852;">
                A refund for order <strong style="color: #8B6914;">${orderNumber}</strong> has been processed.
              </p>
              <div style="display: inline-block; background: #dcfce7; border: 1px solid #bbf7d0; border-radius: 8px; padding: 12px 28px;">
                <p style="margin: 0; font-size: 13px; color: #15803d;">Refund amount</p>
                <p style="margin: 4px 0 0; font-size: 28px; color: #15803d; font-weight: 700;">${formatPrice(refundAmount)}</p>
              </div>
            </td>
          </tr>

          <!-- Timeline -->
          <tr>
            <td style="padding: 28px 40px; background: #faf7f2; border-bottom: 1px solid #ede8df;">
              <h3 style="margin: 0 0 12px; font-size: 14px; color: #3a2e24; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">
                What happens next?
              </h3>
              <p style="margin: 0 0 12px; font-size: 14px; color: #7a6852; line-height: 1.6;">
                Your refund of <strong style="color: #3a2e24;">${formatPrice(refundAmount)}</strong> has been submitted to your original payment method.
                Please allow <strong style="color: #3a2e24;">3–5 business days</strong> for the funds to appear in your account, depending on your bank or card issuer.
              </p>
              <p style="margin: 0; font-size: 13px; color: #9a876e;">
                If you don't see the refund after 7 business days, please contact your bank or reach out to us.
              </p>
            </td>
          </tr>

          <!-- Items -->
          <tr>
            <td style="padding: 24px 40px;">
              <h3 style="margin: 0 0 16px; font-size: 14px; color: #3a2e24; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">
                Returned Items
              </h3>
              <table cellpadding="0" cellspacing="0" border="0" width="100%">
                ${itemsHtml}
              </table>
            </td>
          </tr>

          <!-- Thank you -->
          <tr>
            <td style="padding: 24px 40px; background: #faf7f2; border-top: 1px solid #ede8df; text-align: center;">
              <p style="margin: 0 0 8px; font-size: 15px; color: #3a2e24; font-weight: 600;">Thank you for shopping with us</p>
              <p style="margin: 0 0 16px; font-size: 14px; color: #7a6852; line-height: 1.6;">
                We value every customer and appreciate your patience throughout this process.
                We hope to serve you again soon.
              </p>
              <p style="margin: 0; font-size: 13px; color: #9a876e;">
                Questions?
                <a href="mailto:hello@artisansstories.com" style="color: #8B6914; text-decoration: none;">Contact us</a>
              </p>
            </td>
          </tr>

          <!-- Footer note -->
          <tr>
            <td style="padding: 16px 40px; text-align: center; border-top: 1px solid #ede8df;">
              <p style="margin: 0; font-size: 13px; color: #9a876e;">
                This confirmation was sent to <strong style="color: #3a2e24;">${email}</strong>
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
                &copy; ${new Date().getFullYear()} Artisans Stories. All rights reserved.
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
