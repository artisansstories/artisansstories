import ShopNav from "@/components/ShopNav";
import ShopFooter from "@/components/ShopFooter";
import { CartDrawerProvider } from "@/components/CartDrawerProvider";
import CartDrawer from "@/components/CartDrawer";

export const metadata = {
  title: "Privacy Policy — Artisans' Stories",
  description: "Learn how Artisans' Stories collects, uses, and protects your personal information.",
};

export default function PrivacyPage() {
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
                Privacy Policy
              </h1>
              <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 14, color: "#9a876e", margin: 0 }}>
                Last updated: April 2026
              </p>
            </div>

            <div style={{ background: "#fff", border: "1px solid #ede8df", borderRadius: 16, padding: "36px 40px" }}>
              <Section title="What We Collect">
                <p>When you visit our site or make a purchase, we may collect:</p>
                <ul style={{ paddingLeft: 20, margin: "8px 0" }}>
                  <li style={{ marginBottom: 6 }}>Contact information (name, email address, phone number)</li>
                  <li style={{ marginBottom: 6 }}>Shipping and billing addresses</li>
                  <li style={{ marginBottom: 6 }}>Payment information (processed securely by Stripe — we do not store card details)</li>
                  <li style={{ marginBottom: 6 }}>Order history and preferences</li>
                  <li>Device and browser information for analytics</li>
                </ul>
              </Section>

              <Divider />

              <Section title="How We Use Your Information">
                <p>We use your information to:</p>
                <ul style={{ paddingLeft: 20, margin: "8px 0" }}>
                  <li style={{ marginBottom: 6 }}>Process and fulfill your orders</li>
                  <li style={{ marginBottom: 6 }}>Send order confirmations and shipping updates</li>
                  <li style={{ marginBottom: 6 }}>Respond to customer service inquiries</li>
                  <li style={{ marginBottom: 6 }}>Improve our website and services</li>
                  <li>Send marketing emails, if you have opted in</li>
                </ul>
                <p>We will never sell or rent your personal information to third parties.</p>
              </Section>

              <Divider />

              <Section title="Cookies">
                <p>We use cookies and similar technologies to:</p>
                <ul style={{ paddingLeft: 20, margin: "8px 0" }}>
                  <li style={{ marginBottom: 6 }}>Keep you logged in to your account</li>
                  <li style={{ marginBottom: 6 }}>Maintain your shopping cart</li>
                  <li>Understand how visitors use our site (analytics)</li>
                </ul>
                <p>You can disable cookies in your browser settings, though some features may not function properly.</p>
              </Section>

              <Divider />

              <Section title="Third Parties">
                <p>We use trusted third-party services including:</p>
                <ul style={{ paddingLeft: 20, margin: "8px 0" }}>
                  <li style={{ marginBottom: 6 }}><strong>Stripe</strong> — payment processing</li>
                  <li style={{ marginBottom: 6 }}><strong>Resend</strong> — transactional email delivery</li>
                  <li>These services have their own privacy policies and are responsible for their data practices.</li>
                </ul>
              </Section>

              <Divider />

              <Section title="Data Retention">
                <p>We retain your personal data for as long as necessary to fulfill the purposes outlined in this policy, comply with legal obligations, or resolve disputes.</p>
              </Section>

              <Divider />

              <Section title="Your Rights">
                <p>You have the right to:</p>
                <ul style={{ paddingLeft: 20, margin: "8px 0" }}>
                  <li style={{ marginBottom: 6 }}>Access the personal data we hold about you</li>
                  <li style={{ marginBottom: 6 }}>Request correction of inaccurate data</li>
                  <li style={{ marginBottom: 6 }}>Request deletion of your data</li>
                  <li>Opt out of marketing communications at any time</li>
                </ul>
                <p>To exercise these rights, please <a href="/contact" style={{ color: "#8B6914", textDecoration: "underline" }}>contact us</a>.</p>
              </Section>

              <Divider />

              <Section title="Contact">
                <p>If you have any questions about this Privacy Policy, please contact us at <a href="mailto:hello@artisansstories.com" style={{ color: "#8B6914", textDecoration: "underline" }}>hello@artisansstories.com</a>.</p>
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
