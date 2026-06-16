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
                Last updated: June 2026
              </p>
            </div>

            <div style={{ background: "#fff", border: "1px solid #ede8df", borderRadius: 16, padding: "36px 40px" }}>

              <Section title="Who We Are">
                <p>Artisans&rsquo; Stories is an online store operated by El Salvador Imports, based in California, USA. We sell handcrafted goods made by artisans in El Salvador and ship them directly to customers worldwide. Questions about this policy can be directed to <a href="mailto:hello@artisansstories.com" style={{ color: "#8B6914", textDecoration: "underline" }}>hello@artisansstories.com</a>.</p>
              </Section>

              <Divider />

              <Section title="Information We Collect">
                <p>We collect information you provide directly, and some information automatically when you use our site.</p>
                <p style={{ fontWeight: 600, marginTop: 16, marginBottom: 6 }}>When you place an order:</p>
                <ul style={{ paddingLeft: 20, margin: "0 0 12px" }}>
                  <li style={{ marginBottom: 6 }}>Name, email address, and phone number</li>
                  <li style={{ marginBottom: 6 }}>Shipping and billing address</li>
                  <li style={{ marginBottom: 6 }}>Payment information — processed securely by Stripe. We never see or store your card number.</li>
                  <li style={{ marginBottom: 6 }}>Personalization details — for example, monogram text or engraving requests you enter for a product add-on</li>
                  <li>Order history and return requests</li>
                </ul>
                <p style={{ fontWeight: 600, marginTop: 16, marginBottom: 6 }}>When you create an account:</p>
                <ul style={{ paddingLeft: 20, margin: "0 0 12px" }}>
                  <li style={{ marginBottom: 6 }}>Email address (used to send you a magic sign-in link — no password stored)</li>
                  <li>Saved addresses and communication preferences</li>
                </ul>
                <p style={{ fontWeight: 600, marginTop: 16, marginBottom: 6 }}>Automatically:</p>
                <ul style={{ paddingLeft: 20, margin: "0 0 12px" }}>
                  <li style={{ marginBottom: 6 }}>Device type, browser, and IP address</li>
                  <li>Pages visited and how you navigate the site (used to improve the shopping experience)</li>
                </ul>
              </Section>

              <Divider />

              <Section title="How We Use Your Information">
                <ul style={{ paddingLeft: 20, margin: "8px 0" }}>
                  <li style={{ marginBottom: 6 }}>Process and fulfill your orders, including handmade personalization requests</li>
                  <li style={{ marginBottom: 6 }}>Send order confirmations, shipping updates, and delivery notifications</li>
                  <li style={{ marginBottom: 6 }}>Handle returns, exchanges, and customer service inquiries</li>
                  <li style={{ marginBottom: 6 }}>Send marketing emails — only if you opted in at signup. You can unsubscribe any time.</li>
                  <li style={{ marginBottom: 6 }}>Prevent fraud and maintain the security of our platform</li>
                  <li>Comply with legal obligations (e.g., tax records, export documentation)</li>
                </ul>
                <p style={{ marginTop: 12 }}>We will never sell, rent, or trade your personal information to third parties for their own marketing purposes.</p>
              </Section>

              <Divider />

              <Section title="Third-Party Services">
                <p>We use the following trusted services to operate our store. Each has its own privacy policy governing how they handle data.</p>
                <ul style={{ paddingLeft: 20, margin: "8px 0" }}>
                  <li style={{ marginBottom: 8 }}><strong>Stripe</strong> — payment processing and fraud prevention. Your card data is handled entirely by Stripe and never touches our servers. <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer" style={{ color: "#8B6914" }}>Stripe Privacy Policy</a></li>
                  <li style={{ marginBottom: 8 }}><strong>Resend</strong> — transactional and marketing email delivery. Your email address is shared with Resend solely to send you messages you&rsquo;ve requested or agreed to receive.</li>
                  <li style={{ marginBottom: 8 }}><strong>Vercel</strong> — website hosting and delivery. Vercel processes request logs that may include your IP address.</li>
                  <li><strong>Cloudflare</strong> — content delivery and DDoS protection. Traffic to our site passes through Cloudflare&rsquo;s network.</li>
                </ul>
              </Section>

              <Divider />

              <Section title="Cookies & Tracking">
                <p>We use a small number of cookies strictly necessary to operate the site:</p>
                <ul style={{ paddingLeft: 20, margin: "8px 0" }}>
                  <li style={{ marginBottom: 6 }}>Session cookies to keep you signed in to your account</li>
                  <li style={{ marginBottom: 6 }}>Cart cookies to preserve items in your shopping session</li>
                </ul>
                <p>We do not use advertising trackers, Meta Pixel, Google Analytics, or any cross-site tracking. You can disable cookies in your browser; some features (like staying signed in) will not work without them.</p>
              </Section>

              <Divider />

              <Section title="International Orders">
                <p>Our products are handcrafted in El Salvador and shipped from the United States. If you place an order from outside the US, your personal information will be processed in the United States and is subject to US law. By placing an order, you consent to this transfer.</p>
                <p style={{ marginTop: 10 }}>For orders requiring export documentation, your name and shipping address may be shared with customs authorities as required by law.</p>
              </Section>

              <Divider />

              <Section title="Data Retention">
                <p>We retain order records (including name, address, and purchase details) for a minimum of seven years to comply with tax and accounting requirements. If you request account deletion, we will remove your account and associated personal data except where retention is required by law.</p>
              </Section>

              <Divider />

              <Section title="Your Rights">
                <p>You have the right to:</p>
                <ul style={{ paddingLeft: 20, margin: "8px 0" }}>
                  <li style={{ marginBottom: 6 }}>Access the personal data we hold about you</li>
                  <li style={{ marginBottom: 6 }}>Request correction of inaccurate data</li>
                  <li style={{ marginBottom: 6 }}>Request deletion of your account and associated data</li>
                  <li style={{ marginBottom: 6 }}>Opt out of marketing emails at any time (unsubscribe link in every email)</li>
                  <li>Lodge a complaint with a data protection authority if you believe your rights have been violated</li>
                </ul>
                <p style={{ marginTop: 12 }}>California residents have additional rights under the CCPA, including the right to know what personal information is collected, the right to deletion, and the right to opt out of sale (we do not sell personal data). To exercise any of these rights, <a href="/contact" style={{ color: "#8B6914", textDecoration: "underline" }}>contact us</a>.</p>
              </Section>

              <Divider />

              <Section title="Children">
                <p>Our store is not directed at children under 13. We do not knowingly collect personal information from children. If you believe a child has provided us with their information, please contact us and we will delete it promptly.</p>
              </Section>

              <Divider />

              <Section title="Changes to This Policy">
                <p>We may update this policy from time to time. When we do, we&rsquo;ll update the &ldquo;Last updated&rdquo; date at the top of this page. For significant changes, we&rsquo;ll notify customers by email.</p>
              </Section>

              <Divider />

              <Section title="Contact">
                <p>
                  Artisans&rsquo; Stories / El Salvador Imports<br />
                  <a href="mailto:hello@artisansstories.com" style={{ color: "#8B6914", textDecoration: "underline" }}>hello@artisansstories.com</a><br />
                  California, USA
                </p>
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
