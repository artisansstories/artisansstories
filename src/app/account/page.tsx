import { redirect } from 'next/navigation';
import { getAccountSession } from '@/lib/account-session';
import { prisma } from '@/lib/prisma';

function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(date));
}

export default async function AccountPage() {
  const session = await getAccountSession();
  if (!session) {
    redirect('/account/login');
  }

  const customer = await prisma.customer.findUnique({
    where: { id: session.id },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      createdAt: true,
    },
  });

  if (!customer) {
    redirect('/account/login');
  }

  const displayName = customer.firstName ?? customer.email.split('@')[0];

  const quickLinks = [
    { href: '/account/orders', label: 'View Your Orders', description: 'Track shipments, request returns', icon: '📦' },
    { href: '/account/addresses', label: 'Manage Addresses', description: 'Add or edit shipping addresses', icon: '📍' },
    { href: '/account/profile', label: 'Edit Profile', description: 'Update your name and contact info', icon: '✏️' },
  ];

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: 'clamp(20px,4vw,48px) 16px' }}>

      {/* Welcome header */}
      <div style={{ marginBottom: 40 }}>
        <h1 style={{
          fontFamily: "'Cormorant Garamond', Georgia, serif",
          fontSize: 'clamp(28px,5vw,42px)',
          fontWeight: 400,
          color: '#3a2e24',
          marginBottom: 8,
          lineHeight: 1.2,
        }}>
          Welcome back, {displayName}
        </h1>
        <p style={{ fontSize: 14, color: '#9a876e', fontFamily: "'Inter',sans-serif" }}>
          Member since {formatDate(customer.createdAt)}
        </p>
      </div>

      {/* Decorative divider */}
      <div style={{ width: '100%', height: 1, background: 'linear-gradient(90deg,transparent,#c8a84c40,transparent)', marginBottom: 36 }} />

      {/* Quick links */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {quickLinks.map(link => (
          <a
            key={link.href}
            href={link.href}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              padding: '18px 20px',
              background: '#fff',
              borderRadius: 14,
              border: '1px solid #ede8df',
              textDecoration: 'none',
              transition: 'border-color 0.15s, box-shadow 0.15s',
            }}
          >
            <span style={{ fontSize: 26, flexShrink: 0, lineHeight: 1 }}>{link.icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 15, fontWeight: 600, color: '#3a2e24', fontFamily: "'Inter',sans-serif", margin: '0 0 3px' }}>
                {link.label}
              </p>
              <p style={{ fontSize: 13, color: '#9a876e', fontFamily: "'Inter',sans-serif", margin: 0, lineHeight: 1.4 }}>
                {link.description}
              </p>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#c4b5a0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <path d="m9 18 6-6-6-6" />
            </svg>
          </a>
        ))}
      </div>

      {/* Sign out */}
      <div style={{ marginTop: 40, textAlign: 'center' }}>
        <a
          href="/api/auth/customer/logout"
          style={{
            fontSize: 13,
            color: '#9a876e',
            fontFamily: "'Inter',sans-serif",
            textDecoration: 'underline',
            textUnderlineOffset: 3,
          }}
        >
          Sign out of your account
        </a>
      </div>

    </div>
  );
}


