import ShopNav from "@/components/ShopNav";
import ShopFooter from "@/components/ShopFooter";
import { CartDrawerProvider } from "@/components/CartDrawerProvider";
import CartDrawer from "@/components/CartDrawer";

export const metadata = {
  title: "Our Story — Artisans' Stories",
  description: "Learn about Artisans' Stories and our mission to support skilled artisans from El Salvador.",
};

const PILLARS = [
  {
    title: "Authentic Craftsmanship",
    desc: "Every piece is made by hand using techniques passed down through generations. No mass production — just honest, skilled work.",
    icon: "✦",
  },
  {
    title: "Fair Trade",
    desc: "We pay artisans fairly for their time and skill. Every purchase directly supports an artisan family in El Salvador.",
    icon: "◈",
  },
  {
    title: "Unique Pieces",
    desc: "Because each item is handmade, no two are exactly alike. You receive something truly one-of-a-kind.",
    icon: "◇",
  },
];

export default function AboutPage() {
  return (
    <CartDrawerProvider>
      <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", background: "#faf7f2" }}>
        <ShopNav />
        <CartDrawer />

        <main style={{ flex: 1 }}>
          {/* Hero */}
          <section style={{ background: "linear-gradient(135deg, #3a2e24 0%, #5a4030 100%)", padding: "80px 24px 72px", textAlign: "center" }}>
            <div style={{ maxWidth: 720, margin: "0 auto" }}>
              <p style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 14, fontWeight: 500, color: "#C9A84C", letterSpacing: "0.14em", textTransform: "uppercase", margin: "0 0 16px" }}>
                Who We Are
              </p>
              <h1 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "clamp(42px,7vw,72px)", fontWeight: 600, color: "#fff", margin: "0 0 20px", lineHeight: 1.1 }}>
                Our Story
              </h1>
              <p style={{ fontFamily: "'Inter',sans-serif", fontSize: "clamp(15px,2vw,18px)", color: "#c9b99a", lineHeight: 1.7, margin: 0 }}>
                Artisans' Stories was born from a belief that the hands that create should be celebrated and supported.
              </p>
            </div>
          </section>

          {/* Story */}
          <section style={{ maxWidth: 720, margin: "0 auto", padding: "64px 24px" }}>
            <p style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "clamp(20px,2.5vw,26px)", color: "#3a2e24", lineHeight: 1.6, marginBottom: 28, fontStyle: "italic" }}>
              &ldquo;We partner with skilled artisans from El Salvador, connecting their centuries-old craftsmanship with homes around the world.&rdquo;
            </p>
            <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 16, color: "#5a4a38", lineHeight: 1.8, marginBottom: 20 }}>
              El Salvador has a rich tradition of handmade goods — from intricate textiles and ceramics to hand-carved wood and woven baskets. For generations, artisan families have perfected their crafts, pouring care and pride into every piece they create.
            </p>
            <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 16, color: "#5a4a38", lineHeight: 1.8, marginBottom: 20 }}>
              We founded Artisans' Stories because we believe these traditions deserve a global audience. Modern retail has made it harder for independent artisans to reach customers directly — so we built a bridge.
            </p>
            <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 16, color: "#5a4a38", lineHeight: 1.8 }}>
              When you shop with us, you&apos;re not just buying a beautiful object. You&apos;re investing in a family, a community, and a living tradition.
            </p>
          </section>

          {/* Mission */}
          <section style={{ background: "#fff", borderTop: "1px solid #ede8df", borderBottom: "1px solid #ede8df" }}>
            <div style={{ maxWidth: 720, margin: "0 auto", padding: "56px 24px", textAlign: "center" }}>
              <div style={{ width: 48, height: 3, background: "#C9A84C", margin: "0 auto 28px", borderRadius: 2 }} />
              <h2 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "clamp(28px,4vw,40px)", fontWeight: 600, color: "#3a2e24", margin: "0 0 20px" }}>
                Our Mission
              </h2>
              <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 17, color: "#5a4a38", lineHeight: 1.8, margin: 0 }}>
                Every purchase supports an artisan family and helps preserve traditional craft techniques passed down through generations. We are committed to fair wages, sustainable practices, and telling the stories behind each piece.
              </p>
            </div>
          </section>

          {/* Pillars */}
          <section style={{ maxWidth: 1100, margin: "0 auto", padding: "64px 24px" }}>
            <h2 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "clamp(28px,3.5vw,38px)", fontWeight: 600, color: "#3a2e24", textAlign: "center", marginBottom: 48 }}>
              Handmade with Heart
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 24 }}>
              {PILLARS.map((p) => (
                <div key={p.title} style={{ background: "#fff", border: "1px solid #ede8df", borderRadius: 16, padding: "36px 28px", textAlign: "center" }}>
                  <div style={{ fontSize: 28, color: "#C9A84C", marginBottom: 16 }}>{p.icon}</div>
                  <h3 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 22, fontWeight: 600, color: "#3a2e24", margin: "0 0 12px" }}>{p.title}</h3>
                  <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 14, color: "#7a6a58", lineHeight: 1.7, margin: 0 }}>{p.desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* CTA */}
          <section style={{ background: "#3a2e24", padding: "60px 24px", textAlign: "center" }}>
            <h2 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "clamp(28px,4vw,42px)", fontWeight: 600, color: "#fff", margin: "0 0 16px" }}>
              Explore Our Collection
            </h2>
            <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 16, color: "#c9b99a", margin: "0 0 28px" }}>
              Every piece tells a story. Find yours.
            </p>
            <a href="/shop" style={{ display: "inline-block", padding: "14px 36px", borderRadius: 8, background: "#C9A84C", color: "#3a2e24", fontFamily: "'Inter',sans-serif", fontSize: 15, fontWeight: 600, textDecoration: "none", transition: "background 0.15s" }}>
              Shop Now
            </a>
          </section>
        </main>

        <ShopFooter />
      </div>
    </CartDrawerProvider>
  );
}
