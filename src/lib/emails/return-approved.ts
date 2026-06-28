import { EmailBranding, emailLogoHtml } from "@/lib/email-branding";

export function returnApprovedHtml(
  data: {
    orderNumber: string;
    email: string;
    returnId: string;
    items: Array<{ title: string; variantTitle?: string; quantity: number }>;
  },
  branding: EmailBranding,
): string {
  const { orderNumber, email, returnId, items } = data;
  const { accentColor, storeName, storeUrl, fromAddress } = branding;
  const shortId = returnId.slice(-8).toUpperCase();

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
<title>Return Approved — ${orderNumber}</title></head>
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
      Your return has been approved
    </h2>
    <p style="margin:0 0 6px;font-size:15px;color:#7a6852;">
      We've approved your return for order <strong style="color:${accentColor};">${orderNumber}</strong>.
    </p>
    <p style="margin:0;font-size:13px;color:#9a876e;">Return reference: <strong>${shortId}</strong></p>
  </td></tr>

  <!-- Next steps -->
  <tr><td style="padding:28px 40px;background:#faf7f2;border-bottom:1px solid #ede8df;">
    <h3 style="margin:0 0 14px;font-size:12px;color:#3a2e24;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;">Next Steps</h3>
    <table cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr><td style="padding:7px 0;font-size:14px;color:#3a2e24;">
        <span style="display:inline-block;width:22px;height:22px;background:${accentColor};color:#fff;border-radius:50%;text-align:center;line-height:22px;font-size:11px;font-weight:700;margin-right:10px;">1</span>
        Pack your item(s) securely in original packaging if possible.
      </td></tr>
      <tr><td style="padding:7px 0;font-size:14px;color:#3a2e24;">
        <span style="display:inline-block;width:22px;height:22px;background:${accentColor};color:#fff;border-radius:50%;text-align:center;line-height:22px;font-size:11px;font-weight:700;margin-right:10px;">2</span>
        Include your order number <strong>${orderNumber}</strong> inside the package.
      </td></tr>
      <tr><td style="padding:7px 0;font-size:14px;color:#3a2e24;">
        <span style="display:inline-block;width:22px;height:22px;background:${accentColor};color:#fff;border-radius:50%;text-align:center;line-height:22px;font-size:11px;font-weight:700;margin-right:10px;">3</span>
        Reply to this email for the return shipping address.
      </td></tr>
    </table>
    <p style="margin:16px 0 0;font-size:13px;color:#9a876e;">Once received and inspected, your refund will be processed within 3–5 business days.</p>
  </td></tr>

  <!-- Items -->
  <tr><td style="padding:24px 40px;">
    <h3 style="margin:0 0 14px;font-size:12px;color:#3a2e24;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;">Items Being Returned</h3>
    <table cellpadding="0" cellspacing="0" border="0" width="100%">${itemsHtml}</table>
  </td></tr>

  <!-- Footer -->
  <tr><td style="padding:16px 40px;border-top:1px solid #ede8df;text-align:center;">
    <p style="margin:0;font-size:13px;color:#9a876e;">Questions? <a href="mailto:${fromAddress}" style="color:${accentColor};text-decoration:none;">${fromAddress}</a></p>
    <p style="margin:6px 0 0;font-size:12px;color:#b0a090;">Confirmation sent to ${email}</p>
  </td></tr>
  <tr><td style="padding:20px 40px;background:#3a2e24;text-align:center;">
    <p style="margin:0 0 5px;font-size:12px;color:rgba(255,255,255,0.6);"><a href="mailto:${fromAddress}" style="color:${accentColor};text-decoration:none;">${fromAddress}</a></p>
    <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.35);">&copy; ${new Date().getFullYear()} ${storeName}. All rights reserved.</p>
  </td></tr>

</table>
</td></tr></table>
</body></html>`;
}
