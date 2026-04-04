import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();

    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Valid email required" }, { status: 400 });
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Email service not configured" }, { status: 500 });
    }

    // Add contact to Resend audience
    const audienceId = process.env.RESEND_AUDIENCE_ID;

    if (audienceId) {
      // Add to Resend contacts/audience
      const contactRes = await fetch(`https://api.resend.com/audiences/${audienceId}/contacts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          email,
          unsubscribed: false,
        }),
      });

      if (!contactRes.ok) {
        const err = await contactRes.json().catch(() => ({}));
        // 409 = already subscribed, that's fine
        if (contactRes.status !== 409) {
          console.error("Resend contact error:", err);
          return NextResponse.json({ error: "Failed to subscribe" }, { status: 500 });
        }
      }
    }

    // Send welcome email
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: "Artisans Stories <hello@artisansstories.com>",
        to: [email],
        subject: "You're on the list ✨",
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:40px 20px;color:#2c1810">
            <h2 style="margin:0 0 16px;font-size:24px">You're on the list.</h2>
            <p style="margin:0 0 16px;color:#6b5744;line-height:1.6">
              Thank you for your interest in Artisans Stories. We're putting the finishing touches on something special — handcrafted goods from El Salvador's most talented artisans.
            </p>
            <p style="margin:0 0 32px;color:#6b5744;line-height:1.6">
              We'll reach out as soon as we're ready to launch.
            </p>
            <p style="margin:0;color:#a89070;font-size:13px">
              — The Artisans Stories Team
            </p>
          </div>
        `,
      }),
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Subscribe error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
