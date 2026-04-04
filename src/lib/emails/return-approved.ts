export function returnApprovedHtml(data: {
  orderNumber: string;
  email: string;
  returnId: string;
  items: Array<{ title: string; variantTitle?: string; quantity: number }>;
}): string {
  const { orderNumber, email, returnId, items } = data;

  const shortId = returnId.slice(-8).toUpperCase();

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
  <title>Return Approved — ${orderNumber}</title>
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
              <div style="width: 64px; height: 64px; background: linear-gradient(135deg, #dbeafe, #bfdbfe); border: 2px solid #3b82f6; border-radius: 50%; margin: 0 auto 18px;">
                <span style="font-size: 30px; line-height: 64px; display: block; text-align: center;">&#10003;</span>
              </div>
              <h2 style="margin: 0 0 10px; font-size: 26px; color: #3a2e24; font-weight: 700;">
                Your return has been approved!
              </h2>
              <p style="margin: 0 0 6px; font-size: 15px; color: #7a6852;">
                We've approved your return request for order <strong style="color: #8B6914;">${orderNumber}</strong>.
              </p>
              <p style="margin: 0; font-size: 13px; color: #9a876e;">Return reference: <strong>${shortId}</strong></p>
            </td>
          </tr>

          <!-- Instructions -->
          <tr>
            <td style="padding: 28px 40px; background: #faf7f2; border-bottom: 1px solid #ede8df;">
              <h3 style="margin: 0 0 16px; font-size: 14px; color: #3a2e24; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">
                Next Steps
              </h3>
              <table cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="padding: 8px 0; vertical-align: top;">
                    <span style="display: inline-block; width: 24px; height: 24px; background: #8B6914; color: #fff; border-radius: 50%; text-align: center; line-height: 24px; font-size: 12px; font-weight: 700; margin-right: 12px;">1</span>
                    <span style="font-size: 14px; color: #3a2e24;">Pack your item(s) securely in their original packaging if possible.</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; vertical-align: top;">
                    <span style="display: inline-block; width: 24px; height: 24px; background: #8B6914; color: #fff; border-radius: 50%; text-align: center; line-height: 24px; font-size: 12px; font-weight: 700; margin-right: 12px;">2</span>
                    <span style="font-size: 14px; color: #3a2e24;">Include your order number <strong>${orderNumber}</strong> inside the package.</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; vertical-align: top;">
                    <span style="display: inline-block; width: 24px; height: 24px; background: #8B6914; color: #fff; border-radius: 50%; text-align: center; line-height: 24px; font-size: 12px; font-weight: 700; margin-right: 12px;">3</span>
                    <span style="font-size: 14px; color: #3a2e24;">Ship your items to the address below.</span>
                  </td>
                </tr>
              </table>

              <!-- Return address -->
              <div style="margin-top: 20px; padding: 16px 20px; background: #fff; border: 1px solid #ede8df; border-radius: 8px;">
                <p style="margin: 0 0 4px; font-size: 12px; color: #9a876e; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Return Address</p>
                <p style="margin: 0; font-size: 14px; color: #3a2e24; line-height: 1.7;">
                  Artisans Stories Returns<br />
                  Please include your order number ${orderNumber} on the outside of the package<br />
                  Contact us at <a href="mailto:hello@artisansstories.com" style="color: #8B6914; text-decoration: none;">hello@artisansstories.com</a> for the return shipping address.
                </p>
              </div>

              <p style="margin: 16px 0 0; font-size: 13px; color: #9a876e;">
                Once we receive and inspect your return, we'll process your refund within 3-5 business days.
              </p>
            </td>
          </tr>

          <!-- Items -->
          <tr>
            <td style="padding: 24px 40px;">
              <h3 style="margin: 0 0 16px; font-size: 14px; color: #3a2e24; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">
                Items Being Returned
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
                A copy of this approval was sent to <strong style="color: #3a2e24;">${email}</strong>
              </p>
              <p style="margin: 0; font-size: 13px; color: #9a876e;">
                Questions?
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
