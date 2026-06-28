import { headers } from "next/headers";
import { parseTenantHost } from "@/lib/tenant-host";
import { prisma } from "@/lib/prisma";
import LoginFormClient from "./LoginFormClient";

async function resolveTenantBranding(): Promise<{ logoUrl?: string; storeName?: string }> {
  try {
    const host = (await headers()).get("host");
    const routing = parseTenantHost(host);
    if (routing.kind === "root") return {};
    const tenant = await prisma.tenant.findUnique({
      where: { slug: routing.slug },
      select: { name: true, theme: { select: { logoUrl: true } } },
    });
    return {
      logoUrl: tenant?.theme?.logoUrl ?? undefined,
      storeName: tenant?.name ?? undefined,
    };
  } catch {
    return {};
  }
}

export default async function LoginPage() {
  const { logoUrl, storeName } = await resolveTenantBranding();

  return (
    <main style={{
      minHeight: "calc(100dvh - 130px)",
      background: "linear-gradient(160deg, #fdf8f1 0%, #f5ede0 100%)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "clamp(24px,5vw,48px) 20px",
    }}>
      <LoginFormClient logoUrl={logoUrl} storeName={storeName} />
    </main>
  );
}
