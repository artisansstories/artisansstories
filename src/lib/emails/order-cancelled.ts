export interface OrderCancelledData {
  orderNumber: string;
  email: string;
  firstName?: string;
  cancelReason?: string;
  refunded: boolean;
  total: number;
}

function formatPrice(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export function orderCancelledHtml(data: OrderCancelledData): string {
  const { orderNumber, firstName, cancelReason, refunded, total } = data;
  const displayName = firstName ?? "there";
  const year = new Date().getFullYear();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Order Cancelled — ${orderNumber}</title>
</head>
<body style="margin:0;padding:0;background:#f5f0e8;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f5f0e8;padding:32px 16px;">
    <tr><td align="center">
      <table cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,0.08);">

        <!-- Logo -->
        <tr>
          <td style="padding:32px 40px 20px;text-align:center;border-bottom:1px solid #ede8df;">
            <a href="https://artisansstories.com" style="display:inline-block;">
              <img src="https://pub-0225431098954524b5abd8a1b398b466.r2.dev/email/artisansstories-logo.png"
                alt="Artisans' Stories" width="240"
                style="display:block;margin:0 auto;width:240px;max-width:80%;height:auto;" />
            </a>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:36px 40px 32px;text-align:center;border-bottom:1px solid #ede8df;">
            <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 18px;">
              <tr><td align="center">
                <div style="width:56px;height:56px;background:#fef2f2;border-radius:50%;text-align:center;line-height:56px;">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
                    style="display:inline-block;vertical-align:middle;"
                    xmlns="http://www.w3.org/2000/svg">
                    <circle cx="12" cy="12" r="11" fill="#fef2f2" stroke="#dc2626" stroke-width="1.5"/>
                    <path d="M15 9l-6 6M9 9l6 6" stroke="#dc2626" stroke-width="2" stroke-linecap="round"/>
                  </svg>
                </div>
              </td></tr>
            </table>
            <h2 style="margin:0 0 10px;font-size:24px;color:#3a2e24;font-weight:700;font-family:'Helvetica Neue',Arial,sans-serif;">
              Your order has been cancelled
            </h2>
            <p style="margin:0 0 20px;font-size:15px;color:#7a6852;line-height:1.6;">
              Hi ${displayName}, your order <strong>${orderNumber}</strong> has been cancelled.
            </p>
            ${cancelReason ? `
            <div style="background:#faf7f2;border:1px solid #ede8df;border-radius:8px;padding:14px 20px;margin-bottom:20px;text-align:left;">
              <p style="margin:0 0 4px;font-size:11px;font-weight:600;color:#9a876e;text-transform:uppercase;letter-spacing:0.06em;">Reason</p>
              <p style="margin:0;font-size:14px;color:#3a2e24;">${cancelReason}</p>
            </div>` : ""}
            ${refunded && total > 0 ? `
            <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px 20px;margin-bottom:20px;text-align:left;">
              <p style="margin:0 0 4px;font-size:11px;font-weight:600;color:#15803d;text-transform:uppercase;letter-spacing:0.06em;">Refund</p>
              <p style="margin:0;font-size:14px;color:#3a2e24;">A refund of <strong>${formatPrice(total)}</strong> has been issued to your original payment method. It typically appears within 5–10 business days.</p>
            </div>` : ""}
            <p style="margin:0;font-size:14px;color:#7a6852;line-height:1.6;">
              Questions? Reply to this email or reach us at
              <a href="mailto:hello@artisansstories.com" style="color:#8B6914;text-decoration:none;">hello@artisansstories.com</a>
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:20px 40px;background:#3a2e24;text-align:center;">
            <p style="margin:0 0 6px;font-size:12px;color:rgba(255,255,255,0.6);">
              <a href="mailto:hello@artisansstories.com" style="color:#C9A84C;text-decoration:none;">hello@artisansstories.com</a>
            </p>
            <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.35);">&copy; ${year} Artisans' Stories. All rights reserved.</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
