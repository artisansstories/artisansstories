function formatPrice(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export function refundIssuedHtml(data: {
  orderNumber: string;
  email: string;
  refundAmount: number;
  items: Array<{ title: string; variantTitle?: string; quantity: number }>;
}): string {
  const { orderNumber, email, refundAmount, items } = data;

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
<title>Refund Issued — ${orderNumber}</title></head>
<body style="margin:0;padding:0;background:#f5f0e8;font-family:'Helvetica Neue',Arial,sans-serif;">
<table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f5f0e8;padding:32px 16px;">
<tr><td align="center">
<table cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,0.08);">

  <!-- Logo header -->
  <tr><td style="padding:28px 32px;text-align:center;border-bottom:1px solid #ede8df;">
    <a href="https://artisansstories.com" style="display:inline-block;">
      <img src="https://pub-0225431098954524b5abd8a1b398b466.r2.dev/email/artisansstories-logo.png"
        alt="Artisans' Stories" width="400"
        style="display:block;margin:0 auto;width:400px;max-width:90%;height:auto;"/>
    </a>
  </td></tr>

  <!-- Heading -->
  <tr><td style="padding:36px 40px 24px;text-align:center;border-bottom:1px solid #ede8df;">
    <h2 style="margin:0 0 10px;font-size:26px;color:#3a2e24;font-weight:700;font-family:'Helvetica Neue',Arial,sans-serif;">
      Your refund has been issued
    </h2>
    <p style="margin:0 0 20px;font-size:15px;color:#7a6852;">
      A refund for order <strong style="color:#8B6914;">${orderNumber}</strong> has been processed.
    </p>
    <div style="display:inline-block;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px 28px;">
      <p style="margin:0;font-size:11px;font-weight:600;color:#15803d;text-transform:uppercase;letter-spacing:0.06em;">Refund amount</p>
      <p style="margin:4px 0 0;font-size:28px;color:#15803d;font-weight:700;">${formatPrice(refundAmount)}</p>
    </div>
  </td></tr>

  <!-- Timeline -->
  <tr><td style="padding:24px 40px;background:#faf7f2;border-bottom:1px solid #ede8df;">
    <p style="margin:0 0 10px;font-size:14px;color:#7a6852;line-height:1.6;">
      Your refund of <strong style="color:#3a2e24;">${formatPrice(refundAmount)}</strong> has been submitted to your original payment method.
      Please allow <strong style="color:#3a2e24;">3–5 business days</strong> for funds to appear, depending on your bank.
    </p>
    <p style="margin:0;font-size:13px;color:#9a876e;">If you don't see the refund after 7 business days, please contact your bank or reach out to us.</p>
  </td></tr>

  <!-- Items -->
  <tr><td style="padding:24px 40px;">
    <h3 style="margin:0 0 14px;font-size:12px;color:#3a2e24;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;">Returned Items</h3>
    <table cellpadding="0" cellspacing="0" border="0" width="100%">${itemsHtml}</table>
  </td></tr>

  <!-- Footer -->
  <tr><td style="padding:16px 40px;border-top:1px solid #ede8df;text-align:center;">
    <p style="margin:0;font-size:13px;color:#9a876e;">Questions? <a href="mailto:hello@artisansstories.com" style="color:#8B6914;text-decoration:none;">hello@artisansstories.com</a></p>
    <p style="margin:6px 0 0;font-size:12px;color:#b0a090;">Confirmation sent to ${email}</p>
  </td></tr>
  <tr><td style="padding:20px 40px;background:#3a2e24;text-align:center;">
    <p style="margin:0 0 5px;font-size:12px;color:rgba(255,255,255,0.6);"><a href="mailto:hello@artisansstories.com" style="color:#C9A84C;text-decoration:none;">hello@artisansstories.com</a></p>
    <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.35);">&copy; ${new Date().getFullYear()} Artisans' Stories. All rights reserved.</p>
  </td></tr>

</table>
</td></tr></table>
</body></html>`;
}
