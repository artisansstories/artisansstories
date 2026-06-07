import { requireAdminSession } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import Image from "next/image";

export default async function AdminArtisansPage() {
  await requireAdminSession();

  const artisans = await prisma.artisan.findMany({
    include: {
      images: { orderBy: { position: "asc" }, take: 1 },
      products: true,
    },
    orderBy: [{ isFeatured: "desc" }, { name: "asc" }],
  });

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
        <div>
          <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 32, fontWeight: 600, color: "#2a1f14", margin: 0 }}>Artisans</h1>
          <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, color: "#9a876e", margin: "4px 0 0" }}>{artisans.length} artisan{artisans.length !== 1 ? "s" : ""}</p>
        </div>
        <Link href="/admin/artisans/new" style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "10px 20px", background: "#8B6914", color: "#fff",
          textDecoration: "none", borderRadius: 8,
          fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 600,
        }}>
          + New Artisan
        </Link>
      </div>

      <style>{`
        @media(min-width:640px){.artisan-table{display:table!important}.artisan-cards{display:none!important}}
        @media(max-width:639px){.artisan-table{display:none!important}.artisan-cards{display:flex!important}}
      `}</style>

      {artisans.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px", background: "#fff", borderRadius: 12, border: "1px solid #ede8df" }}>
          <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, color: "#9a876e" }}>No artisans yet</p>
          <Link href="/admin/artisans/new" style={{ color: "#8B6914", fontFamily: "'Inter', sans-serif", fontSize: 14 }}>Create the first artisan profile →</Link>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="artisan-table" style={{ background: "#fff", borderRadius: 12, border: "1px solid #ede8df", overflow: "hidden", display: "none" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #f0ece4" }}>
                  {["Artisan", "Status", "Craft", "Origin", "Products", ""].map((h) => (
                    <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 600, color: "#9a876e", letterSpacing: "0.08em", textTransform: "uppercase" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {artisans.map((a) => {
                  const thumb = a.avatarUrl ?? a.images[0]?.urlThumb ?? a.images[0]?.url;
                  return (
                    <tr key={a.id} style={{ borderBottom: "1px solid #f0ece4" }}>
                      <td style={{ padding: "14px 16px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <div style={{ width: 44, height: 44, borderRadius: "50%", background: "#f5f0e8", overflow: "hidden", flexShrink: 0, position: "relative" }}>
                            {thumb && <Image src={thumb} alt={a.name} fill style={{ objectFit: "cover" }} sizes="44px" />}
                          </div>
                          <div>
                            <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 600, color: "#2a1f14", margin: 0 }}>{a.name}</p>
                            {a.tagline && <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: "#9a876e", margin: "2px 0 0", fontStyle: "italic" }}>{a.tagline}</p>}
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: "14px 16px" }}>
                        <span style={{ padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, fontFamily: "'Inter', sans-serif", background: a.status === "ACTIVE" ? "rgba(39,174,96,0.1)" : "rgba(154,135,110,0.1)", color: a.status === "ACTIVE" ? "#1a8a4a" : "#9a876e" }}>{a.status}</span>
                      </td>
                      <td style={{ padding: "14px 16px", fontFamily: "'Inter', sans-serif", fontSize: 13, color: "#5a4a38" }}>{a.craft ?? "—"}</td>
                      <td style={{ padding: "14px 16px", fontFamily: "'Inter', sans-serif", fontSize: 13, color: "#5a4a38" }}>{[a.city, a.originCountry].filter(Boolean).join(", ") || "—"}</td>
                      <td style={{ padding: "14px 16px", fontFamily: "'Inter', sans-serif", fontSize: 13, color: "#5a4a38" }}>{a.products.length}</td>
                      <td style={{ padding: "14px 16px" }}>
                        <Link href={`/admin/artisans/${a.id}/edit`} style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: "#8B6914", textDecoration: "none", fontWeight: 500 }}>Edit →</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="artisan-cards" style={{ flexDirection: "column", gap: 12, display: "none" }}>
            {artisans.map((a) => {
              const thumb = a.avatarUrl ?? a.images[0]?.urlThumb ?? a.images[0]?.url;
              return (
                <div key={a.id} style={{ background: "#fff", borderRadius: 12, border: "1px solid #ede8df", padding: "16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                    <div style={{ width: 52, height: 52, borderRadius: "50%", background: "#f5f0e8", overflow: "hidden", flexShrink: 0, position: "relative" }}>
                      {thumb && <Image src={thumb} alt={a.name} fill style={{ objectFit: "cover" }} sizes="52px" />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 15, fontWeight: 700, color: "#2a1f14", margin: 0 }}>{a.name}</p>
                        <span style={{ padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 600, fontFamily: "'Inter', sans-serif", background: a.status === "ACTIVE" ? "rgba(39,174,96,0.1)" : "rgba(154,135,110,0.1)", color: a.status === "ACTIVE" ? "#1a8a4a" : "#9a876e" }}>{a.status}</span>
                      </div>
                      {a.tagline && <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: "#9a876e", margin: "3px 0 0", fontStyle: "italic" }}>{a.tagline}</p>}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 12 }}>
                    {a.craft && <div><p style={{ fontFamily: "'Inter', sans-serif", fontSize: 10, fontWeight: 600, color: "#b0a090", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 2px" }}>Craft</p><p style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: "#5a4a38", margin: 0 }}>{a.craft}</p></div>}
                    {(a.city || a.originCountry) && <div><p style={{ fontFamily: "'Inter', sans-serif", fontSize: 10, fontWeight: 600, color: "#b0a090", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 2px" }}>Origin</p><p style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: "#5a4a38", margin: 0 }}>{[a.city, a.originCountry].filter(Boolean).join(", ")}</p></div>}
                    <div><p style={{ fontFamily: "'Inter', sans-serif", fontSize: 10, fontWeight: 600, color: "#b0a090", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 2px" }}>Products</p><p style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: "#5a4a38", margin: 0 }}>{a.products.length}</p></div>
                  </div>
                  <Link href={`/admin/artisans/${a.id}/edit`} style={{ display: "block", textAlign: "center", padding: "9px", borderRadius: 8, border: "1px solid #e0d5c5", fontFamily: "'Inter', sans-serif", fontSize: 13, color: "#8B6914", textDecoration: "none", fontWeight: 600 }}>Edit Profile →</Link>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
