import { getAccountSession } from '@/lib/account-session';
import Image from 'next/image';

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const session = await getAccountSession();

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
          <div style={{
            maxWidth: 1000,
            margin: '0 auto',
            padding: '0 20px',
            height: 64,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
          }}>
            {/* Logo */}
            <a href="/" style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
              <Image
                src="/logo-color.png"
                alt="Artisans Stories"
                width={160}
                height={43}
                style={{ width: 'clamp(120px, 30vw, 160px)', height: 'auto' }}
                unoptimized
                priority
              />
            </a>

            {/* Account nav */}
            <nav style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {session ? (
                <>
                  <a
                    href="/account/orders"
                    style={{
                      padding: '8px 12px',
                      borderRadius: 8,
                      fontSize: 13,
                      fontWeight: 500,
                      color: '#5a4a38',
                      fontFamily: "'Inter', sans-serif",
                      transition: 'background 0.15s',
                      whiteSpace: 'nowrap',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(139,105,20,0.08)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                  >
                    Orders
                  </a>
                  <a
                    href="/account/addresses"
                    style={{
                      padding: '8px 12px',
                      borderRadius: 8,
                      fontSize: 13,
                      fontWeight: 500,
                      color: '#5a4a38',
                      fontFamily: "'Inter', sans-serif",
                      transition: 'background 0.15s',
                      whiteSpace: 'nowrap',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(139,105,20,0.08)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                  >
                    Addresses
                  </a>
                  <a
                    href="/account/profile"
                    style={{
                      padding: '8px 12px',
                      borderRadius: 8,
                      fontSize: 13,
                      fontWeight: 500,
                      color: '#5a4a38',
                      fontFamily: "'Inter', sans-serif",
                      transition: 'background 0.15s',
                      whiteSpace: 'nowrap',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(139,105,20,0.08)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                  >
                    Profile
                  </a>
                  <a
                    href="/api/auth/customer/logout"
                    style={{
                      padding: '8px 14px',
                      borderRadius: 8,
                      fontSize: 13,
                      fontWeight: 500,
                      color: '#8B6914',
                      fontFamily: "'Inter', sans-serif",
                      border: '1px solid rgba(139,105,20,0.3)',
                      transition: 'background 0.15s',
                      whiteSpace: 'nowrap',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(139,105,20,0.06)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                  >
                    Sign Out
                  </a>
                </>
              ) : (
                <a
                  href="/account/login"
                  style={{
                    padding: '10px 20px',
                    borderRadius: 10,
                    fontSize: 14,
                    fontWeight: 500,
                    color: '#fff',
                    background: 'linear-gradient(135deg, #8B6914 0%, #C9A84C 100%)',
                    fontFamily: "'Inter', sans-serif",
                    boxShadow: '0 2px 8px rgba(139,105,20,0.25)',
                  }}
                >
                  Sign In
                </a>
              )}
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
          padding: '20px',
          textAlign: 'center',
        }}>
          <p style={{ fontSize: 12, color: '#b09878', fontFamily: "'Inter', sans-serif" }}>
            &copy; {new Date().getFullYear()} Artisans Stories &nbsp;&middot;&nbsp;
            <a href="/" style={{ color: '#8B6914' }}>Shop</a>
            &nbsp;&middot;&nbsp;
            <a href="mailto:hello@artisansstories.com" style={{ color: '#8B6914' }}>Contact</a>
          </p>
        </footer>

      </div>
    </>
  );
}
