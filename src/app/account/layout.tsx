import { getAccountSession } from '@/lib/account-session';
import Image from 'next/image';
import AccountNav from './AccountNav';
import { headers } from 'next/headers';
import { parseTenantHost } from '@/lib/tenant-host';
import { prisma } from '@/lib/prisma';

async function resolveTenantBranding(): Promise<{ logoUrl: string | null; storeName: string; contactEmail: string }> {
  try {
    const host = (await headers()).get('host');
    const routing = parseTenantHost(host);
    if (routing.kind === 'root') return { logoUrl: null, storeName: "Artisans' Stories", contactEmail: 'hello@artisansstories.com' };
    const tenant = await prisma.tenant.findUnique({
      where: { slug: routing.slug },
      select: { id: true, name: true, theme: { select: { logoUrl: true } } },
    });
    const storeSettings = tenant
      ? await prisma.storeSettings.findFirst({
          where: { tenantId: tenant.id },
          select: { contactEmail: true },
        })
      : null;
    return {
      logoUrl: tenant?.theme?.logoUrl ?? null,
      storeName: tenant?.name ?? 'Store',
      contactEmail: storeSettings?.contactEmail ?? 'hello@artisansstories.com',
    };
  } catch {
    return { logoUrl: null, storeName: "Artisans' Stories", contactEmail: 'hello@artisansstories.com' };
  }
}

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const [session, { logoUrl, storeName, contactEmail }] = await Promise.all([
    getAccountSession(),
    resolveTenantBranding(),
  ]);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400&family=Inter:wght@300;400;500;600&display=swap');
        *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
        html, body { min-height: 100%; }
        body { font-family: 'Inter', sans-serif; background: #faf7f2; color: #3a2e24; }
        a { color: inherit; text-decoration: none; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #d8cfc0; border-radius: 4px; }
        /* Mobile-first header sizing */
        .acct-header-inner { height: 56px; padding: 0 16px; }
        @media (min-width: 640px) { .acct-header-inner { height: 72px; padding: 0 24px; } }
      `}</style>

      <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: '#faf7f2' }}>

        {/* Header */}
        <header style={{
          background: '#fff',
          borderBottom: '1px solid #ede8df',
          position: 'sticky',
          top: 0,
          zIndex: 30,
        }}>
          <div className="acct-header-inner" style={{
            maxWidth: 1000,
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}>
            {/* Logo */}
            <a href="/" style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
              {logoUrl ? (
                <Image
                  src={logoUrl}
                  alt={storeName}
                  width={320}
                  height={86}
                  style={{ width: 'clamp(130px, 34vw, 260px)', height: 'auto' }}
                  unoptimized
                  priority
                />
              ) : (
                <Image
                  src="/logo-color.png"
                  alt="Artisans' Stories"
                  width={320}
                  height={86}
                  style={{ width: 'clamp(130px, 34vw, 260px)', height: 'auto' }}
                  unoptimized
                  priority
                />
              )}
            </a>

            {/* Account nav — client component (event handlers not allowed in server components) */}
            <nav style={{ display: 'flex', alignItems: 'center' }}>
              <AccountNav hasSession={!!session} />
            </nav>
          </div>
        </header>

        {/* Page content */}
        <main style={{ flex: 1 }}>
          {children}
        </main>

        {/* Footer */}
        <footer style={{
          borderTop: '1px solid #ede8df',
          background: '#fff',
          padding: '20px 16px',
          textAlign: 'center',
        }}>
          <p style={{ fontSize: 12, color: '#b09878', fontFamily: "'Inter', sans-serif" }}>
            &copy; {new Date().getFullYear()} {storeName} &nbsp;&middot;&nbsp;
            <a href="/" style={{ color: '#8B6914' }}>Shop</a>
            &nbsp;&middot;&nbsp;
            <a href={`mailto:${contactEmail}`} style={{ color: '#8B6914' }}>Contact</a>
          </p>
        </footer>

      </div>
    </>
  );
}
