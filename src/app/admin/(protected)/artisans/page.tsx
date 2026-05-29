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

      {artisans.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px", background: "#fff", borderRadius: 12, border: "1px solid #ede8df" }}>
          <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, color: "#9a876e" }}>No artisans yet</p>
          <Link href="/admin/artisans/new" style={{ color: "#8B6914", fontFamily: "'Inter', sans-serif", fontSize: 14 }}>Create the first artisan profile →</Link>
        </div>
      ) : (
        <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #ede8df", overflow: "hidden" }}>
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
                      <span style={{
                        padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, fontFamily: "'Inter', sans-serif",
                        background: a.status === "ACTIVE" ? "rgba(39,174,96,0.1)" : "rgba(154,135,110,0.1)",
                        color: a.status === "ACTIVE" ? "#1a8a4a" : "#9a876e",
                      }}>
                        {a.status}
                      </span>
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
      )}
    </div>
  );
}
