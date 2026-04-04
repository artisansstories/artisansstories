import ShopNav from "@/components/ShopNav";
import ShopFooter from "@/components/ShopFooter";
import { CartDrawerProvider } from "@/components/CartDrawerProvider";
import CartDrawer from "@/components/CartDrawer";

export const metadata = {
  title: "Shipping Policy — Artisans Stories",
  description: "Learn about our shipping times, rates, and international delivery options.",
};

export default function ShippingPolicyPage() {
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
                Shipping Policy
              </h1>
            </div>

            <div style={{ background: "#fff", border: "1px solid #ede8df", borderRadius: 16, padding: "36px 40px" }}>
              <Section title="Processing Time">
                <p>All orders are handcrafted with care. Please allow <strong>2–3 business days</strong> for us to prepare and ship your order. During peak seasons or holidays, processing may take an additional 1–2 days.</p>
                <p>You will receive a shipping confirmation email with tracking information once your order has been dispatched.</p>
              </Section>

              <Divider />

              <Section title="Domestic Shipping (United States)">
                <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8 }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid #ede8df" }}>
                      <Th>Method</Th>
                      <Th>Estimated Delivery</Th>
                      <Th>Rate</Th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={{ borderBottom: "1px solid #f5f0e8" }}>
                      <Td>Standard Shipping</Td>
                      <Td>5–7 business days</Td>
                      <Td>$8.99</Td>
                    </tr>
                    <tr>
                      <Td>Free Shipping</Td>
                      <Td>5–7 business days</Td>
                      <Td>Free on orders over $75</Td>
                    </tr>
                  </tbody>
                </table>
              </Section>

              <Divider />

              <Section title="International Shipping">
                <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8 }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid #ede8df" }}>
                      <Th>Method</Th>
                      <Th>Estimated Delivery</Th>
                      <Th>Rate</Th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <Td>International Standard</Td>
                      <Td>14–21 business days</Td>
                      <Td>$24.99</Td>
                    </tr>
                  </tbody>
                </table>
                <p style={{ marginTop: 16 }}>International orders may be subject to customs duties, import taxes, or fees imposed by the destination country. These charges are the responsibility of the recipient.</p>
              </Section>

              <Divider />

              <Section title="Handmade Items">
                <p>Because our products are handmade, each item may vary slightly in color, texture, or dimension from the photos shown. This is a natural characteristic of artisan craftsmanship — not a defect.</p>
              </Section>

              <Divider />

              <Section title="Shipping Origin">
                <p>All orders ship from El Salvador via our authorized carrier partners. Tracking information will be provided once your shipment is in transit.</p>
              </Section>

              <Divider />

              <Section title="Questions?">
                <p>If you have any questions about your shipment, please <a href="/contact" style={{ color: "#8B6914", textDecoration: "underline" }}>contact us</a> and we&apos;ll be happy to help.</p>
              </Section>
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

function Th({ children }: { children: React.ReactNode }) {
  return <th style={{ padding: "10px 12px", textAlign: "left", fontFamily: "'Inter',sans-serif", fontSize: 12, fontWeight: 600, color: "#9a876e", textTransform: "uppercase", letterSpacing: "0.04em" }}>{children}</th>;
}

function Td({ children }: { children: React.ReactNode }) {
  return <td style={{ padding: "12px 12px", fontFamily: "'Inter',sans-serif", fontSize: 14, color: "#3a2e24" }}>{children}</td>;
}
