import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/admin-auth";
import { redirect } from "next/navigation";

export default async function SKUsPage() {
  let session: Awaited<ReturnType<typeof requireAdminSession>>;
  try { session = await requireAdminSession(); } catch { redirect("/admin/login"); return; }
  const tenantId = session!.tenantId;

  const products = await prisma.product.findMany({
    where: { sku: { not: null }, ...(tenantId ? { tenantId } : {}) },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      sku: true,
      status: true,
      variants: {
        where: { sku: { not: null } },
        select: { id: true, name: true, sku: true },
      },
    },
  });

  const all = await prisma.product.findMany({
    where: tenantId ? { tenantId } : {},
    orderBy: { name: "asc" },
    select: { id: true, name: true, sku: true, status: true },
  });

  const totalProducts = all.length;
  const withSKU = all.filter(p => p.sku).length;
  const withoutSKU = all.filter(p => !p.sku);

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#3a2e24", fontFamily: "'Cormorant Garamond', serif", marginBottom: 6 }}>
          SKU Registry
        </h1>
        <p style={{ fontSize: 13, color: "#9a876e", fontFamily: "'Inter', sans-serif" }}>
          {withSKU} of {totalProducts} products have SKUs assigned
        </p>
      </div>

      {/* Products missing SKUs — alert */}
      {withoutSKU.length > 0 && (
        <div style={{ background: "#fff8ec", border: "1px solid #f0d080", borderRadius: 10, padding: "14px 18px", marginBottom: 20 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: "#7a5a00", fontFamily: "'Inter', sans-serif", marginBottom: 8 }}>
            {withoutSKU.length} product{withoutSKU.length > 1 ? "s" : ""} missing SKU
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {withoutSKU.map(p => (
              <a key={p.id} href={`/admin/products/${p.id}/edit`}
                style={{ fontSize: 12, padding: "3px 10px", borderRadius: 20, background: "#fff", border: "1px solid #e8d5a3", color: "#7a5a00", fontFamily: "'Inter', sans-serif", textDecoration: "none" }}>
                {p.name}
              </a>
            ))}
          </div>
        </div>
      )}

      {/* SKU table */}
      <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #ede8df", overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontFamily: "'Inter', sans-serif" }}>
            <thead>
              <tr style={{ background: "#faf7f2", borderBottom: "1px solid #ede8df" }}>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "#6b5540", fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase" }}>Product</th>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "#6b5540", fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase" }}>Product SKU</th>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "#6b5540", fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase" }}>Variant SKUs</th>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "#6b5540", fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase" }}>Status</th>
                <th style={{ padding: "10px 16px" }}></th>
              </tr>
            </thead>
            <tbody>
              {products.map((p, i) => (
                <tr key={p.id} style={{ borderBottom: i < products.length - 1 ? "1px solid #f0ece4" : "none" }}>
                  <td style={{ padding: "12px 16px", color: "#3a2e24", fontWeight: 500 }}>{p.name}</td>
                  <td style={{ padding: "12px 16px" }}>
                    <code style={{ background: "#f5f0e8", padding: "3px 8px", borderRadius: 5, fontSize: 12, color: "#7a5a00", letterSpacing: "0.04em" }}>{p.sku}</code>
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    {p.variants.length === 0 ? (
                      <span style={{ color: "#c8b89a", fontSize: 12 }}>—</span>
                    ) : (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {p.variants.map(v => (
                          <span key={v.id} title={v.name ?? ""} style={{ background: "#eef6ff", padding: "2px 7px", borderRadius: 4, fontSize: 11, color: "#2563a8", fontFamily: "monospace" }}>
                            {v.sku}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <span style={{
                      padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 600,
                      background: p.status === "ACTIVE" ? "#ecfdf5" : "#f5f5f5",
                      color: p.status === "ACTIVE" ? "#0d6e3f" : "#888",
                    }}>{p.status}</span>
                  </td>
                  <td style={{ padding: "12px 16px", textAlign: "right" }}>
                    <a href={`/admin/products/${p.id}/edit`}
                      style={{ fontSize: 12, color: "#8B6914", fontFamily: "'Inter', sans-serif", textDecoration: "underline" }}>
                      Edit
                    </a>
                  </td>
                </tr>
              ))}
              {products.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: "40px 16px", textAlign: "center", color: "#9a876e" }}>
                    No SKUs assigned yet. Open a product and click ⚡ Generate.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
