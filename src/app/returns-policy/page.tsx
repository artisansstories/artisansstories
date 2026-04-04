import ShopNav from "@/components/ShopNav";
import ShopFooter from "@/components/ShopFooter";
import { CartDrawerProvider } from "@/components/CartDrawerProvider";
import CartDrawer from "@/components/CartDrawer";
import { prisma } from "@/lib/prisma";

export const metadata = {
  title: "Returns Policy — Artisans' Stories",
  description: "Learn about our return policy and how to start a return.",
};

async function getReturnPolicy() {
  try {
    const settings = await prisma.storeSettings.findUnique({ where: { id: "singleton" } });
    return {
      days: settings?.returnPolicyDays ?? 30,
      text: settings?.returnPolicyText ?? null,
    };
  } catch {
    return { days: 30, text: null };
  }
}

export default async function ReturnsPolicyPage() {
  const { days, text } = await getReturnPolicy();

  return (
    <CartDrawerProvider>
      <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", background: "#faf7f2" }}>
        <ShopNav />
        <CartDrawer />

        <main style={{ flex: 1 }}>
          <section style={{ maxWidth: 760, margin: "0 auto", padding: "56px 24px 80px" }}>
            <div style={{ marginBottom: 40 }}>
              <p style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 13, fontWeight: 500, color: "#C9A84C", letterSpacing: "0.12em", textTransform: "uppercase", margin: "0 0 10px" }}>
                Policies
              </p>
              <h1 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "clamp(34px,5vw,52px)", fontWeight: 600, color: "#3a2e24", margin: 0 }}>
                Returns Policy
              </h1>
            </div>

            <div style={{ background: "#fff", border: "1px solid #ede8df", borderRadius: 16, padding: "36px 40px" }}>
              {text ? (
                <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 15, color: "#5a4a38", lineHeight: 1.8, whiteSpace: "pre-wrap" }}>
                  {text}
                </div>
              ) : (
                <>
                  <Section title={`${days}-Day Return Window`}>
                    <p>We want you to love your purchase. If you&apos;re not completely satisfied, you may return eligible items within <strong>{days} days</strong> of the delivery date.</p>
                  </Section>

                  <Divider />

                  <Section title="Return Conditions">
                    <ul style={{ paddingLeft: 20, margin: "0 0 12px" }}>
                      <li style={{ marginBottom: 8 }}>Items must be unused and in original condition</li>
                      <li style={{ marginBottom: 8 }}>Items must be in their original packaging</li>
                      <li style={{ marginBottom: 8 }}>Items must not be washed, altered, or damaged</li>
                      <li>Sale items and custom orders are final sale and cannot be returned</li>
                    </ul>
                  </Section>

                  <Divider />

                  <Section title="Return Shipping">
                    <p>The customer is responsible for return shipping costs. We recommend using a tracked shipping method, as we cannot be responsible for returns lost in transit.</p>
                  </Section>

                  <Divider />

                  <Section title="Refund Processing">
                    <p>Once we receive and inspect your return, refunds are processed within <strong>5–7 business days</strong>. The refund will be issued to your original payment method.</p>
                    <p>You will receive an email confirmation once your refund has been processed.</p>
                  </Section>

                  <Divider />

                  <Section title="Damaged or Defective Items">
                    <p>If you receive a damaged or defective item, please <a href="/contact" style={{ color: "#8B6914", textDecoration: "underline" }}>contact us</a> within 7 days of delivery with photos. We will arrange a replacement or full refund at no cost to you.</p>
                  </Section>

                  <Divider />

                  <Section title="Start a Return">
                    <p>To begin a return, please <a href="/contact" style={{ color: "#8B6914", textDecoration: "underline" }}>contact our team</a> with your order number and the reason for the return. We will guide you through the process.</p>
                    <div style={{ marginTop: 20 }}>
                      <a href="/contact" style={{ display: "inline-block", padding: "12px 28px", borderRadius: 8, background: "#8B6914", color: "#fff", fontFamily: "'Inter',sans-serif", fontSize: 14, fontWeight: 600, textDecoration: "none" }}>
                        Start a Return
                      </a>
                    </div>
                  </Section>
                </>
              )}
            </div>
          </section>
        </main>

        <ShopFooter />
      </div>
    </CartDrawerProvider>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 22, fontWeight: 600, color: "#3a2e24", margin: "0 0 12px" }}>{title}</h2>
      <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 15, color: "#5a4a38", lineHeight: 1.8 }}>
        {children}
      </div>
    </div>
  );
}

function Divider() {
  return <hr style={{ border: "none", borderTop: "1px solid #ede8df", margin: "28px 0" }} />;
}
