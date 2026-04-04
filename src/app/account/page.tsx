import { redirect } from 'next/navigation';
import { getAccountSession } from '@/lib/account-session';
import { prisma } from '@/lib/prisma';

function formatPrice(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

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
      totalOrders: true,
      totalSpent: true,
      createdAt: true,
      lastOrderAt: true,
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
    <div style={{ maxWidth: 800, margin: '0 auto', padding: 'clamp(24px,4vw,48px) 20px' }}>

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

      {/* Stats */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: 16,
        marginBottom: 40,
      }}>
        <StatCard label="Total Orders" value={customer.totalOrders.toString()} />
        <StatCard
          label="Total Spent"
          value={formatPrice(customer.totalSpent)}
        />
        <StatCard
          label="Last Order"
          value={customer.lastOrderAt ? formatDate(customer.lastOrderAt) : '—'}
        />
      </div>

      {/* Decorative divider */}
      <div style={{ width: '100%', height: 1, background: 'linear-gradient(90deg,transparent,#c8a84c40,transparent)', marginBottom: 36 }} />

      {/* Quick links */}
      <div>
        <h2 style={{
          fontFamily: "'Cormorant Garamond', Georgia, serif",
          fontSize: 'clamp(18px,3vw,22px)',
          fontWeight: 500,
          color: '#3a2e24',
          marginBottom: 20,
        }}>
          Your Account
        </h2>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 16,
        }}>
          {quickLinks.map(link => (
            <a
              key={link.href}
              href={link.href}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                padding: '20px 22px',
                background: '#fff',
                borderRadius: 14,
                border: '1px solid #ede8df',
                textDecoration: 'none',
                transition: 'box-shadow 0.2s, border-color 0.2s, transform 0.15s',
              }}
              onMouseEnter={e => {
                const el = e.currentTarget as HTMLElement;
                el.style.boxShadow = '0 4px 24px rgba(139,105,20,0.12)';
                el.style.borderColor = 'rgba(139,105,20,0.3)';
                el.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={e => {
                const el = e.currentTarget as HTMLElement;
                el.style.boxShadow = 'none';
                el.style.borderColor = '#ede8df';
                el.style.transform = 'translateY(0)';
              }}
            >
              <span style={{ fontSize: 24 }}>{link.icon}</span>
              <span style={{ fontSize: 15, fontWeight: 600, color: '#3a2e24', fontFamily: "'Inter',sans-serif" }}>
                {link.label}
              </span>
              <span style={{ fontSize: 13, color: '#9a876e', fontFamily: "'Inter',sans-serif", lineHeight: 1.4 }}>
                {link.description}
              </span>
            </a>
          ))}
        </div>
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

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      background: '#fff',
      borderRadius: 14,
      border: '1px solid #ede8df',
      padding: '18px 20px',
    }}>
      <p style={{ fontSize: 11, fontWeight: 600, color: '#9a876e', fontFamily: "'Inter',sans-serif", letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
        {label}
      </p>
      <p style={{ fontSize: 'clamp(18px,3vw,22px)', fontWeight: 700, color: '#8B6914', fontFamily: "'Inter',sans-serif", margin: 0 }}>
        {value}
      </p>
    </div>
  );
}
