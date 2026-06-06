import { prisma } from "@/lib/prisma";

export type EmailLogType =
  | "ORDER_CONFIRMATION"
  | "ORDER_CANCELLED"
  | "ORDER_REFUNDED"
  | "ORDER_SHIPPED"
  | "MAGIC_LINK_CUSTOMER"
  | "MAGIC_LINK_ADMIN"
  | "CONTACT_INBOUND"
  | "CONTACT_REPLY"
  | "RETURN_REQUEST"
  | "RETURN_APPROVED"
  | "RETURN_REJECTED"
  | "REFUND_ISSUED"
  | "SUBSCRIBE_WELCOME"
  | "SYSTEM";

export interface LogEmailParams {
  type: EmailLogType;
  toEmail: string;
  fromEmail?: string;
  subject: string;
  bodyHtml?: string;
  resendId?: string;
  relatedId?: string;
  relatedType?: string;
  direction?: "OUTBOUND" | "INBOUND";
}

/**
 * Fire-and-forget email logging. Never throws — failures are logged to console only.
 */
export async function logEmail(params: LogEmailParams): Promise<void> {
  try {
    await prisma.emailLog.create({
      data: {
        type: params.type,
        direction: params.direction ?? "OUTBOUND",
        toEmail: params.toEmail,
        fromEmail: params.fromEmail ?? "hello@artisansstories.com",
        subject: params.subject,
        bodyHtml: params.bodyHtml ?? null,
        resendId: params.resendId ?? null,
        relatedId: params.relatedId ?? null,
        relatedType: params.relatedType ?? null,
      },
    });
  } catch (err) {
    console.error("[email-log] Failed to log email:", err);
  }
}
