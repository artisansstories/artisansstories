export const runtime = "edge";

const welcomeEmailHtml = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#f5ede0;font-family:Georgia,Garamond,serif;">
  <div style="max-width:560px;margin:0 auto;padding:40px 20px;">

    <!-- Top border -->
    <div style="height:3px;background:linear-gradient(90deg,transparent,#8b5e3c,#c8956c,#8b5e3c,transparent);margin-bottom:40px;border-radius:2px;"></div>

    <!-- Card -->
    <div style="background:linear-gradient(160deg,#fdf8f3 0%,#faf4ec 100%);border-radius:16px;padding:48px 40px;border:1px solid rgba(139,94,60,0.15);box-shadow:0 8px 40px rgba(139,94,60,0.08);">

      <!-- Logo -->
      <div style="text-align:center;margin-bottom:36px;">
        <img
          src="https://artisansstories.com/logo-web.webp"
          alt="Artisans of Stories"
          width="320"
          style="width:min(320px,80%);height:auto;filter:invert(1) sepia(0.3) saturate(0.8) brightness(0.4);"
        />
      </div>

      <!-- Divider -->
      <div style="width:60px;height:1px;background:linear-gradient(90deg,transparent,#c8956c,transparent);margin:0 auto 36px;"></div>

      <!-- Greeting -->
      <p style="font-size:20px;color:#4a3728;line-height:1.6;margin:0 0 20px;font-style:italic;text-align:center;">
        You&rsquo;re on the list.
      </p>

      <!-- Body copy -->
      <p style="font-size:15px;color:#7a5c44;line-height:1.85;margin:0 0 16px;">
        Thank you for joining us on this journey. We&rsquo;re putting the finishing touches on something truly special &mdash; handcrafted goods from El Salvador&rsquo;s most talented artisans.
      </p>

      <p style="font-size:15px;color:#7a5c44;line-height:1.85;margin:0 0 32px;">
        Every product has a story, and we are so excited to share those products and stories with you&hellip; You&rsquo;ll be among the first to know when we launch.
      </p>

      <!-- Divider -->
      <div style="width:40px;height:1px;background:linear-gradient(90deg,transparent,#c8956c,transparent);margin:0 auto 32px;"></div>

      <!-- Sign-off -->
      <p style="font-size:13px;color:#a89070;text-align:center;margin:0;font-family:system-ui,sans-serif;letter-spacing:0.05em;">
        With gratitude,<br/>
        <strong style="color:#8b5e3c;font-family:Georgia,serif;font-size:15px;">The Artisans Stories Team</strong>
      </p>

    </div>

    <!-- Footer -->
    <p style="text-align:center;font-size:11px;color:#b8967a;margin:24px 0 0;font-family:system-ui,sans-serif;letter-spacing:0.05em;">
      &copy; 2026 Artisans Stories &nbsp;&middot;&nbsp; Handcrafted with care from El Salvador<br/>
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
        from: "Artisans Stories <hello@artisansstories.com>",
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
