import { getAccountSession } from '@/lib/account-session';
import Image from 'next/image';
import AccountNav from './AccountNav';

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
            height: 80,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
          }}>
            {/* Logo */}
            <a href="/" style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
              <Image
                src="/logo-color.png"
                alt="Artisans' Stories"
                width={320}
                height={86}
                style={{ width: 'clamp(200px, 40vw, 320px)', height: 'auto' }}
                unoptimized
                priority
              />
            </a>

            {/* Account nav — client component (event handlers not allowed in server components) */}
            <nav style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
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
          padding: '20px',
          textAlign: 'center',
        }}>
          <p style={{ fontSize: 12, color: '#b09878', fontFamily: "'Inter', sans-serif" }}>
            &copy; {new Date().getFullYear()} Artisans' Stories &nbsp;&middot;&nbsp;
            <a href="/" style={{ color: '#8B6914' }}>Shop</a>
            &nbsp;&middot;&nbsp;
            <a href="mailto:hello@artisansstories.com" style={{ color: '#8B6914' }}>Contact</a>
          </p>
        </footer>

      </div>
    </>
  );
}
