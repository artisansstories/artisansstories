import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { prisma } from "@/lib/prisma";
import { logEmail } from "@/lib/email-log";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email, subject, message } = body;

    if (!name || !email || !message) {
      return NextResponse.json({ error: "Name, email, and message are required" }, { status: 400 });
    }

    const contactNotifyResult = await resend.emails.send({
      from: "Artisans' Stories <hello@artisansstories.com>",
      to: "anna@artisansstories.com",
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

    // Save to database (non-blocking — don't fail the response if this errors)
    await prisma.contactMessage.create({
      data: {
        name,
        email,
        subject: subject || "General Inquiry",
        message,
      },
    }).catch((err: unknown) => console.error("Failed to save contact message to DB:", err));
    // Log inbound contact as email log entry
    await logEmail({ type: "CONTACT_INBOUND", direction: "INBOUND", toEmail: "anna@artisansstories.com", fromEmail: email, subject: subject || "General Inquiry", resendId: contactNotifyResult.data?.id, relatedType: "CONTACT" });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("POST /api/contact error:", error);
    return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
  }
}
