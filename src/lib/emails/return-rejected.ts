import { EmailBranding, emailLogoHtml } from "@/lib/email-branding";

export function returnRejectedHtml(
  data: {
    orderNumber: string;
    email: string;
    reason: string;
    items: Array<{ title: string; variantTitle?: string; quantity: number }>;
  },
  branding: EmailBranding,
): string {
  const { orderNumber, email, reason, items } = data;
  const { accentColor, storeName, storeUrl, fromAddress } = branding;

  const itemsHtml = items.map((item) => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #ede8df;vertical-align:top;">
        <p style="margin:0 0 3px;font-size:14px;color:#3a2e24;font-weight:500;">${item.title}</p>
        ${item.variantTitle ? `<p style="margin:0 0 2px;font-size:12px;color:#7a6852;">${item.variantTitle}</p>` : ""}
        <p style="margin:0;font-size:12px;color:#9a876e;">Qty: ${item.quantity}</p>
      </td>
    </tr>`).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Return Update — ${orderNumber}</title></head>
<body style="margin:0;padding:0;background:#f5f0e8;font-family:'Helvetica Neue',Arial,sans-serif;">
<table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f5f0e8;padding:32px 16px;">
<tr><td align="center">
<table cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,0.08);">

  <!-- Logo header -->
  <tr><td style="padding:28px 32px;text-align:center;border-bottom:1px solid #ede8df;">
    <a href="${storeUrl}" style="display:inline-block;">
      ${emailLogoHtml(branding)}
    </a>
  </td></tr>

  <!-- Heading -->
  <tr><td style="padding:36px 40px 24px;text-align:center;border-bottom:1px solid #ede8df;">
    <h2 style="margin:0 0 8px;font-size:26px;color:#3a2e24;font-weight:700;font-family:'Helvetica Neue',Arial,sans-serif;">
      Update on your return request
    </h2>
    <p style="margin:0;font-size:15px;color:#7a6852;">
      We were unable to approve your return for order <strong style="color:${accentColor};">${orderNumber}</strong>.
    </p>
  </td></tr>

  <!-- Reason -->
  <tr><td style="padding:24px 40px;background:#faf7f2;border-bottom:1px solid #ede8df;">
    <h3 style="margin:0 0 10px;font-size:12px;color:#3a2e24;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;">Reason</h3>
    <div style="padding:14px 18px;background:#fff;border:1px solid #ede8df;border-left:4px solid #dc2626;border-radius:4px;">
      <p style="margin:0;font-size:14px;color:#3a2e24;line-height:1.6;">${reason}</p>
    </div>
  </td></tr>

  <!-- Items -->
  <tr><td style="padding:24px 40px;">
    <h3 style="margin:0 0 14px;font-size:12px;color:#3a2e24;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;">Items in Return Request</h3>
    <table cellpadding="0" cellspacing="0" border="0" width="100%">${itemsHtml}</table>
  </td></tr>

  <!-- Contact -->
  <tr><td style="padding:24px 40px;background:#faf7f2;border-top:1px solid #ede8df;text-align:center;">
    <p style="margin:0 0 12px;font-size:15px;color:#3a2e24;font-weight:600;">Questions or concerns?</p>
    <p style="margin:0 0 16px;font-size:14px;color:#7a6852;">We understand this may be disappointing. Please reach out and we'll do our best to help.</p>
    <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
      <tr><td style="background:${accentColor};border-radius:8px;">
        <a href="mailto:${fromAddress}?subject=Re: Return for Order ${orderNumber}"
          style="display:inline-block;padding:12px 28px;color:#fff;font-size:14px;font-weight:600;text-decoration:none;font-family:'Helvetica Neue',Arial,sans-serif;">
          Contact Us
        </a>
      </td></tr>
    </table>
  </td></tr>

  <!-- Footer -->
  <tr><td style="padding:16px 40px;border-top:1px solid #ede8df;text-align:center;">
    <p style="margin:0;font-size:12px;color:#b0a090;">This update was sent to ${email}</p>
  </td></tr>
  <tr><td style="padding:20px 40px;background:#3a2e24;text-align:center;">
    <p style="margin:0 0 5px;font-size:12px;color:rgba(255,255,255,0.6);"><a href="mailto:${fromAddress}" style="color:${accentColor};text-decoration:none;">${fromAddress}</a></p>
    <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.35);">&copy; ${new Date().getFullYear()} ${storeName}. All rights reserved.</p>
  </td></tr>

</table>
</td></tr></table>
</body></html>`;
}
