import { buildWelcomeEmail } from './build-email';
import { getEmailBranding } from '@/lib/email-branding';
import { DEFAULT_TENANT_ID } from '@/lib/tenant-context';

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { email } = await req.json();

    if (!email || !email.includes("@")) {
      return Response.json({ error: "Valid email required" }, { status: 400 });
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return Response.json({ error: "Email service not configured" }, { status: 500 });
    }

    const audienceId = process.env.RESEND_AUDIENCE_ID;

    if (audienceId) {
      const contactRes = await fetch(`https://api.resend.com/audiences/${audienceId}/contacts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ email, unsubscribed: false }),
      });
      if (!contactRes.ok && contactRes.status !== 409) {
        console.error("Resend contact error:", await contactRes.text());
      }
    }

    const html = await buildWelcomeEmail();

    // House-only newsletter; resolve tenant-zero branding so the sender name
    // stays AS while still flowing through the shared resolver.
    const branding = await getEmailBranding(DEFAULT_TENANT_ID);

    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: `Anna at ${branding.fromName} <${branding.fromAddress}>`,
        to: [email],
        subject: "Welcome to the story 🇸🇻 | A bridge between heritage and home",
        html,
      }),
    });

    return Response.json({ success: true });
  } catch (err) {
    console.error("Subscribe error:", err);
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}
