import ShopNav from "@/components/ShopNav";
import ShopFooter from "@/components/ShopFooter";
import { CartDrawerProvider } from "@/components/CartDrawerProvider";
import CartDrawer from "@/components/CartDrawer";

export const metadata = {
  title: "Terms of Service — Artisans' Stories",
  description: "Read the terms and conditions governing the use of Artisans' Stories.",
};

export default function TermsPage() {
  return (
    <CartDrawerProvider>
      <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", background: "#faf7f2" }}>
        <ShopNav />
        <CartDrawer />

        <main style={{ flex: 1 }}>
          <section style={{ maxWidth: 760, margin: "0 auto", padding: "56px 24px 80px" }}>
            <div style={{ marginBottom: 40 }}>
              <p style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 13, fontWeight: 500, color: "#C9A84C", letterSpacing: "0.12em", textTransform: "uppercase", margin: "0 0 10px" }}>
                Legal
              </p>
              <h1 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "clamp(34px,5vw,52px)", fontWeight: 600, color: "#3a2e24", margin: "0 0 8px" }}>
                Terms of Service
              </h1>
              <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 14, color: "#9a876e", margin: 0 }}>
                Last updated: April 2026
              </p>
            </div>

            <div style={{ background: "#fff", border: "1px solid #ede8df", borderRadius: 16, padding: "36px 40px" }}>
              <Section title="Use of This Site">
                <p>By accessing and using artisansstories.com, you agree to be bound by these Terms of Service. If you do not agree, please do not use our site.</p>
                <p>You must be at least 18 years old to make a purchase. By placing an order, you confirm that you meet this requirement.</p>
              </Section>

              <Divider />

              <Section title="Orders and Payments">
                <p>When you place an order, you are making an offer to purchase the item at the stated price. We reserve the right to cancel orders at our discretion, including in cases of pricing errors or suspected fraud.</p>
                <p>All prices are listed in US dollars. Payment is processed securely via Stripe. We accept major credit and debit cards.</p>
                <p>Taxes and duties may apply depending on your location. International customers are responsible for any applicable import duties or customs fees.</p>
              </Section>

              <Divider />

              <Section title="Returns and Refunds">
                <p>Our return and refund policy is outlined in our <a href="/returns-policy" style={{ color: "#8B6914", textDecoration: "underline" }}>Returns Policy</a>. By making a purchase, you agree to those terms.</p>
              </Section>

              <Divider />

              <Section title="Intellectual Property">
                <p>All content on this site — including text, images, logos, and designs — is the property of Artisans' Stories or its content suppliers and is protected by copyright laws.</p>
                <p>You may not reproduce, distribute, or create derivative works from our content without prior written permission.</p>
              </Section>

              <Divider />

              <Section title="Accuracy of Information">
                <p>We make every effort to display product colors, dimensions, and descriptions accurately. However, because our products are handmade, slight variations are expected and are not considered defects.</p>
                <p>We reserve the right to correct any errors or inaccuracies on our site without prior notice.</p>
              </Section>

              <Divider />

              <Section title="Limitation of Liability">
                <p>Artisans' Stories shall not be liable for any indirect, incidental, or consequential damages arising from the use of our site or products, to the fullest extent permitted by law.</p>
                <p>Our total liability shall not exceed the amount you paid for the specific item giving rise to the claim.</p>
              </Section>

              <Divider />

              <Section title="Governing Law">
                <p>These Terms of Service are governed by the laws applicable in El Salvador. Any disputes shall be resolved in the competent courts of that jurisdiction.</p>
              </Section>

              <Divider />

              <Section title="Changes to These Terms">
                <p>We reserve the right to update these Terms of Service at any time. Continued use of the site following any changes constitutes your acceptance of the new terms.</p>
              </Section>

              <Divider />

              <Section title="Contact">
                <p>If you have questions about these Terms of Service, please <a href="/contact" style={{ color: "#8B6914", textDecoration: "underline" }}>contact us</a> or email <a href="mailto:hello@artisansstories.com" style={{ color: "#8B6914", textDecoration: "underline" }}>hello@artisansstories.com</a>.</p>
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
