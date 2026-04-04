export const runtime = "edge";

const welcomeEmailHtml = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#f5ede0;font-family:Georgia,Garamond,serif;">
  <div style="max-width:560px;margin:0 auto;padding:40px 20px;">

    <!-- Top border -->
    <div style="height:3px;background:linear-gradient(90deg,transparent,#8b5e3c,#c8956c,#8b5e3c,transparent);margin-bottom:40px;border-radius:2px;"></div>

    <!-- Card -->
    <div style="background:linear-gradient(160deg,#fdf8f3 0%,#faf4ec 100%);border-radius:16px;padding:48px 40px;border:1px solid rgba(139,94,60,0.15);">

      <!-- Brand name as text -->
      <div style="text-align:center;margin-bottom:28px;">
        <span style="font-size:11px;font-family:system-ui,sans-serif;font-weight:700;letter-spacing:0.25em;text-transform:uppercase;color:#8b5e3c;">Artisans&rsquo; Stories</span>
      </div>

      <!-- Divider -->
      <div style="width:60px;height:1px;background:linear-gradient(90deg,transparent,#c8956c,transparent);margin:0 auto 36px;"></div>

      <!-- Greeting -->
      <p style="font-size:20px;color:#4a3728;line-height:1.6;margin:0 0 24px;font-style:italic;text-align:center;">
        You&rsquo;re on the list.
      </p>

      <!-- Body copy -->
      <p style="font-size:15px;color:#7a5c44;line-height:1.85;margin:0 0 16px;">
        Thank you for being among the first to join us on this journey. What we&rsquo;re building is something we&rsquo;ve put our hearts into &mdash; a home for handcrafted goods made by El Salvador&rsquo;s most talented artisans.
      </p>

      <p style="font-size:15px;color:#7a5c44;line-height:1.85;margin:0 0 16px;">
        Every product tells a story &mdash; of the hands that made it, the community it came from, and the tradition it carries forward. We can&rsquo;t wait to share those stories with you.
      </p>

      <p style="font-size:15px;color:#7a5c44;line-height:1.85;margin:0 0 36px;">
        You&rsquo;ll be the first to know when we launch.
      </p>

      <!-- Divider -->
      <div style="width:40px;height:1px;background:linear-gradient(90deg,transparent,#c8956c,transparent);margin:0 auto 32px;"></div>

      <!-- Sign-off -->
      <p style="font-size:13px;color:#a89070;text-align:center;margin:0;font-family:system-ui,sans-serif;letter-spacing:0.04em;">
        With gratitude,<br/>
        <span style="color:#6b4c30;font-family:Georgia,serif;font-size:16px;font-style:italic;">The Artisans' Stories Team</span>
      </p>

    </div>

    <!-- Footer -->
    <p style="text-align:center;font-size:11px;color:#b8967a;margin:24px 0 0;font-family:system-ui,sans-serif;letter-spacing:0.04em;line-height:1.8;">
      &copy; 2026 Artisans' Stories &nbsp;&middot;&nbsp; Handcrafted with care from El Salvador<br/>
      <a href="https://artisansstories.com" style="color:#8b5e3c;text-decoration:none;">artisansstories.com</a>
    </p>

    <!-- Bottom border -->
    <div style="height:3px;background:linear-gradient(90deg,transparent,#8b5e3c,#c8956c,#8b5e3c,transparent);margin-top:24px;border-radius:2px;"></div>

  </div>
</body>
</html>`;

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

    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: "Artisans' Stories <hello@artisansstories.com>",
        to: [email],
        subject: "You\u2019re on the list \u2728",
        html: welcomeEmailHtml,
      }),
    });

    return Response.json({ success: true });
  } catch (err) {
    console.error("Subscribe error:", err);
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}
