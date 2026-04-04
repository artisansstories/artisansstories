import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email, subject, message } = body;

    if (!name || !email || !message) {
      return NextResponse.json({ error: "Name, email, and message are required" }, { status: 400 });
    }

    await resend.emails.send({
      from: "Artisans Stories <hello@artisansstories.com>",
      to: "hello@artisansstories.com",
      replyTo: email,
      subject: `Contact Form: ${subject || "General Inquiry"} — from ${name}`,
      text: `Name: ${name}\nEmail: ${email}\nSubject: ${subject || "General Inquiry"}\n\nMessage:\n${message}`,
      html: `
        <div style="font-family: Inter, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #3a2e24; font-family: 'Cormorant Garamond', Georgia, serif;">New Contact Form Submission</h2>
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 8px 0; color: #9a876e; font-size: 14px; width: 120px;"><strong>Name</strong></td><td style="padding: 8px 0; font-size: 14px; color: #3a2e24;">${name}</td></tr>
            <tr><td style="padding: 8px 0; color: #9a876e; font-size: 14px;"><strong>Email</strong></td><td style="padding: 8px 0; font-size: 14px; color: #3a2e24;"><a href="mailto:${email}">${email}</a></td></tr>
            <tr><td style="padding: 8px 0; color: #9a876e; font-size: 14px;"><strong>Subject</strong></td><td style="padding: 8px 0; font-size: 14px; color: #3a2e24;">${subject || "General Inquiry"}</td></tr>
          </table>
          <hr style="border: none; border-top: 1px solid #ede8df; margin: 16px 0;" />
          <p style="color: #9a876e; font-size: 13px; margin: 0 0 8px;">Message:</p>
          <p style="font-size: 15px; color: #3a2e24; white-space: pre-wrap;">${message}</p>
        </div>
      `,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("POST /api/contact error:", error);
    return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
  }
}
