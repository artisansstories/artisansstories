"use client";

export default function AccountNav({ hasSession }: { hasSession: boolean }) {
  if (!hasSession) {
    return (
      <a
        href="/account/login"
        style={{
          padding: '10px 20px', borderRadius: 10, fontSize: 14, fontWeight: 500,
          color: '#fff', background: 'linear-gradient(135deg, #8B6914 0%, #C9A84C 100%)',
          fontFamily: "'Inter', sans-serif", boxShadow: '0 2px 8px rgba(139,105,20,0.25)',
        }}
      >
        Sign In
      </a>
    );
  }

  const linkStyle: React.CSSProperties = {
    padding: '8px 12px', borderRadius: 8, fontSize: 13, fontWeight: 500,
    color: '#5a4a38', fontFamily: "'Inter', sans-serif",
    transition: 'background 0.15s', whiteSpace: 'nowrap',
  };

  const hover = (e: React.MouseEvent<HTMLAnchorElement>) => {
    (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(139,105,20,0.08)';
  };
  const unhover = (e: React.MouseEvent<HTMLAnchorElement>) => {
    (e.currentTarget as HTMLAnchorElement).style.background = 'transparent';
  };

  return (
    <>
      <a href="/account/orders" style={linkStyle} onMouseEnter={hover} onMouseLeave={unhover}>Orders</a>
      <a href="/account/addresses" style={linkStyle} onMouseEnter={hover} onMouseLeave={unhover}>Addresses</a>
      <a href="/account/profile" style={linkStyle} onMouseEnter={hover} onMouseLeave={unhover}>Profile</a>
      <a
        href="/api/auth/customer/logout"
        style={{
          padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 500,
          color: '#8B6914', fontFamily: "'Inter', sans-serif",
          border: '1px solid rgba(139,105,20,0.3)', transition: 'background 0.15s', whiteSpace: 'nowrap',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(139,105,20,0.06)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.background = 'transparent'; }}
      >
        Sign Out
      </a>
    </>
  );
}
