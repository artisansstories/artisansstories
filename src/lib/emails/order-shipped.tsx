import { EmailBranding, emailLogoHtml } from "@/lib/email-branding";

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
  viewOrderUrl?: string;
}

export function orderShippedHtml(data: OrderShippedData, branding: EmailBranding): string {
  const { orderNumber, trackingCompany, trackingNumber, trackingUrl, estimatedDelivery, items, viewOrderUrl } = data;
  const { accentColor, storeName, storeUrl, fromAddress } = branding;

  const trackingLink = trackingUrl ?? "#";
  const orderLink = viewOrderUrl ?? `${storeUrl}/account/orders/${orderNumber}`;
  const estimatedDeliveryFormatted = estimatedDelivery
    ? new Intl.DateTimeFormat("en-US", { dateStyle: "long" }).format(new Date(estimatedDelivery))
    : null;

  const itemsHtml = items.map((item) => `
    <tr>
      <td style="padding:12px 0;border-bottom:1px solid #ede8df;vertical-align:top;">
        <table cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
          ${item.image
            ? `<td style="width:56px;padding-right:14px;vertical-align:top;">
                <img src="${item.image}" alt="${item.title}" width="56" height="56"
                  style="width:56px;height:56px;object-fit:cover;border-radius:6px;border:1px solid #ede8df;" />
              </td>`
            : `<td style="width:56px;padding-right:14px;vertical-align:top;">
                <div style="width:56px;height:56px;background:#f5f0e8;border-radius:6px;border:1px solid #ede8df;"></div>
              </td>`}
          <td style="vertical-align:middle;">
            <p style="margin:0 0 3px;font-size:14px;color:#3a2e24;font-weight:500;">${item.title}</p>
            ${item.variantTitle ? `<p style="margin:0;font-size:12px;color:#7a6852;">${item.variantTitle}</p>` : ""}
            <p style="margin:2px 0 0;font-size:12px;color:#9a876e;">Qty: ${item.quantity}</p>
          </td>
        </tr></table>
      </td>
    </tr>`).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Your Order Has Shipped — ${orderNumber}</title></head>
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
      Your order is on its way!
    </h2>
    <p style="margin:0 0 6px;font-size:15px;color:#7a6852;">Great news — your handcrafted items have shipped.</p>
    <p style="margin:0;font-size:13px;color:#9a876e;">Order <strong style="color:${accentColor};">${orderNumber}</strong></p>
  </td></tr>

  <!-- Tracking info -->
  <tr><td style="padding:28px 40px;background:#faf7f2;border-bottom:1px solid #ede8df;">
    <h3 style="margin:0 0 14px;font-size:12px;color:#3a2e24;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;">Tracking Information</h3>
    <table cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr><td style="padding:5px 0;font-size:13px;color:#9a876e;width:130px;">Carrier</td><td style="padding:5px 0;font-size:14px;color:#3a2e24;font-weight:500;">${trackingCompany}</td></tr>
      <tr><td style="padding:5px 0;font-size:13px;color:#9a876e;">Tracking #</td><td style="padding:5px 0;font-size:14px;color:#3a2e24;font-weight:500;">${trackingNumber}</td></tr>
      ${estimatedDeliveryFormatted ? `<tr><td style="padding:5px 0;font-size:13px;color:#9a876e;">Est. Delivery</td><td style="padding:5px 0;font-size:14px;color:#3a2e24;font-weight:500;">${estimatedDeliveryFormatted}</td></tr>` : ""}
    </table>
    <div style="margin-top:20px;text-align:center;">
      <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;display:inline-table;">
        <tr>
          <td style="padding-right:8px;">
            <a href="${trackingLink}" target="_blank"
              style="display:inline-block;background:${accentColor};color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 28px;border-radius:8px;font-family:'Helvetica Neue',Arial,sans-serif;">
              Track Package
            </a>
          </td>
          <td>
            <a href="${orderLink}"
              style="display:inline-block;background:#fff;border:1.5px solid ${accentColor};color:${accentColor};text-decoration:none;font-size:14px;font-weight:600;padding:11px 22px;border-radius:8px;font-family:'Helvetica Neue',Arial,sans-serif;">
              View Order
            </a>
          </td>
        </tr>
      </table>
    </div>
  </td></tr>

  <!-- Items -->
  <tr><td style="padding:24px 40px;">
    <h3 style="margin:0 0 14px;font-size:12px;color:#3a2e24;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;">Items Shipped</h3>
    <table cellpadding="0" cellspacing="0" border="0" width="100%">${itemsHtml}</table>
  </td></tr>

  <!-- Footer -->
  <tr><td style="padding:16px 40px;border-top:1px solid #ede8df;text-align:center;">
    <p style="margin:0;font-size:13px;color:#9a876e;">Questions? <a href="mailto:${fromAddress}" style="color:${accentColor};text-decoration:none;">${fromAddress}</a></p>
  </td></tr>
  <tr><td style="padding:20px 40px;background:#3a2e24;text-align:center;">
    <p style="margin:0 0 5px;font-size:12px;color:rgba(255,255,255,0.6);"><a href="mailto:${fromAddress}" style="color:${accentColor};text-decoration:none;">${fromAddress}</a></p>
    <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.35);">&copy; ${new Date().getFullYear()} ${storeName}. All rights reserved.</p>
  </td></tr>

</table>
</td></tr></table>
</body></html>`;
}
