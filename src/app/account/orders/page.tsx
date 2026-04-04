import { redirect } from 'next/navigation';
import { getAccountSession } from '@/lib/account-session';
import { prisma } from '@/lib/prisma';

function formatPrice(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(date));
}

const STATUS_CONFIG: Record<string, { label: string; bg: string; color: string }> = {
  PENDING:    { label: 'Pending',    bg: '#fef9ec', color: '#b08000' },
  PROCESSING: { label: 'Processing', bg: '#fef9ec', color: '#b08000' },
  FULFILLED:  { label: 'Fulfilled',  bg: '#ecfdf5', color: '#0d6e3f' },
  SHIPPED:    { label: 'Shipped',    bg: '#ecfdfd', color: '#0e6e6e' },
  DELIVERED:  { label: 'Delivered',  bg: '#ecfdf5', color: '#0d6e3f' },
  CANCELLED:  { label: 'Cancelled',  bg: '#fff5f5', color: '#c0392b' },
  REFUNDED:   { label: 'Refunded',   bg: '#f5f5ff', color: '#5040c0' },
};

const FINANCIAL_CONFIG: Record<string, { label: string; color: string }> = {
  PENDING:            { label: 'Payment Pending', color: '#b08000' },
  PAID:               { label: 'Paid', color: '#0d6e3f' },
  PARTIALLY_PAID:     { label: 'Partially Paid', color: '#b08000' },
  REFUNDED:           { label: 'Refunded', color: '#5040c0' },
  PARTIALLY_REFUNDED: { label: 'Partially Refunded', color: '#5040c0' },
  VOIDED:             { label: 'Voided', color: '#888' },
};

export default async function OrdersPage() {
  const session = await getAccountSession();
  if (!session) {
    redirect('/account/login');
  }

  const orders = await prisma.order.findMany({
    where: { customerId: session.customerId },
    orderBy: { createdAt: 'desc' },
    include: {
      items: {
        take: 3,
        select: {
          id: true,
          title: true,
          variantTitle: true,
          quantity: true,
          price: true,
          total: true,
          product: {
            select: {
              images: {
                where: { isDefault: true },
                take: 1,
                select: { urlThumb: true, url: true, altText: true },
              },
            },
          },
        },
      },
      fulfillments: {
        select: {
          trackingCompany: true,
          trackingNumber: true,
          trackingUrl: true,
          shippedAt: true,
        },
        take: 1,
        orderBy: { createdAt: 'desc' },
      },
      _count: { select: { items: true } },
    },
  });

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: 'clamp(24px,4vw,48px) 20px' }}>

      {/* Page header */}
      <div style={{ marginBottom: 32 }}>
        <a href="/account" style={{ fontSize: 13, color: '#9a876e', fontFamily: "'Inter',sans-serif", display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 16 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
          Back to account
        </a>
        <h1 style={{
          fontFamily: "'Cormorant Garamond', Georgia, serif",
          fontSize: 'clamp(26px,5vw,38px)',
          fontWeight: 400,
          color: '#3a2e24',
          marginBottom: 6,
        }}>
          Your Orders
        </h1>
        <p style={{ fontSize: 14, color: '#9a876e', fontFamily: "'Inter',sans-serif" }}>
          {orders.length === 0 ? "You haven't placed any orders yet" : `${orders.length} order${orders.length === 1 ? '' : 's'}`}
        </p>
      </div>

      {orders.length === 0 ? (
        <div style={{
          background: '#fff',
          borderRadius: 16,
          border: '1px solid #ede8df',
          padding: '60px 40px',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🛍️</div>
          <h2 style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 24, fontWeight: 400, color: '#3a2e24', marginBottom: 10 }}>
            No orders yet
          </h2>
          <p style={{ fontSize: 14, color: '#9a876e', fontFamily: "'Inter',sans-serif", marginBottom: 24 }}>
            Discover handcrafted goods from El Salvador&apos;s most talented artisans.
          </p>
          <a
            href="/shop"
            style={{
              display: 'inline-block',
              padding: '14px 32px',
              background: 'linear-gradient(135deg, #8B6914 0%, #C9A84C 100%)',
              color: '#fff',
              borderRadius: 10,
              fontSize: 14,
              fontWeight: 600,
              fontFamily: "'Inter',sans-serif",
              textDecoration: 'none',
              boxShadow: '0 3px 12px rgba(139,105,20,0.25)',
            }}
          >
            Shop Now
          </a>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {orders.map(order => {
            const statusCfg = STATUS_CONFIG[order.status] ?? { label: order.status, bg: '#f5f5f5', color: '#666' };
            const financialCfg = FINANCIAL_CONFIG[order.financialStatus] ?? { label: order.financialStatus, color: '#666' };
            const tracking = order.fulfillments[0];
            const extraItems = order._count.items - order.items.length;

            return (
              <div
                key={order.id}
                style={{
                  background: '#fff',
                  borderRadius: 16,
                  border: '1px solid #ede8df',
                  overflow: 'hidden',
                }}
              >
                {/* Order header */}
                <div style={{
                  padding: '16px 20px',
                  borderBottom: '1px solid #f0ece4',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 10,
                  background: '#fdfaf6',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#3a2e24', fontFamily: "'Inter',sans-serif" }}>
                      {order.orderNumber}
                    </span>
                    <span style={{
                      padding: '3px 10px',
                      borderRadius: 20,
                      fontSize: 11,
                      fontWeight: 600,
                      fontFamily: "'Inter',sans-serif",
                      letterSpacing: '0.04em',
                      background: statusCfg.bg,
                      color: statusCfg.color,
                    }}>
                      {statusCfg.label}
                    </span>
                    <span style={{ fontSize: 12, color: financialCfg.color, fontFamily: "'Inter',sans-serif", fontWeight: 500 }}>
                      {financialCfg.label}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <span style={{ fontSize: 13, color: '#9a876e', fontFamily: "'Inter',sans-serif" }}>
                      {formatDate(order.createdAt)}
                    </span>
                    <span style={{ fontSize: 15, fontWeight: 700, color: '#8B6914', fontFamily: "'Inter',sans-serif" }}>
                      {formatPrice(order.total)}
                    </span>
                  </div>
                </div>

                {/* Items preview */}
                <div style={{ padding: '16px 20px' }}>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: tracking ? 14 : 0 }}>
                    {order.items.map(item => {
                      const imgUrl = item.product?.images[0]?.urlThumb ?? item.product?.images[0]?.url;
                      return (
                        <div key={item.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', width: '100%' }}>
                          <div style={{
                            width: 56, height: 56, borderRadius: 8,
                            background: imgUrl ? 'transparent' : '#f5f0e8',
                            border: '1px solid #ede8df',
                            flexShrink: 0,
                            overflow: 'hidden',
                          }}>
                            {imgUrl && (
                              <img src={imgUrl} alt={item.product?.images[0]?.altText ?? item.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            )}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: 14, fontWeight: 500, color: '#3a2e24', fontFamily: "'Inter',sans-serif", margin: '0 0 3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {item.title}
                            </p>
                            {item.variantTitle && (
                              <p style={{ fontSize: 12, color: '#9a876e', fontFamily: "'Inter',sans-serif", margin: '0 0 3px' }}>
                                {item.variantTitle}
                              </p>
                            )}
                            <p style={{ fontSize: 12, color: '#b09878', fontFamily: "'Inter',sans-serif", margin: 0 }}>
                              Qty {item.quantity} &times; {formatPrice(item.price)}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                    {extraItems > 0 && (
                      <p style={{ fontSize: 12, color: '#9a876e', fontFamily: "'Inter',sans-serif", margin: '4px 0 0' }}>
                        + {extraItems} more item{extraItems > 1 ? 's' : ''}
                      </p>
                    )}
                  </div>

                  {/* Tracking info */}
                  {tracking && tracking.trackingNumber && (
                    <div style={{
                      padding: '10px 14px',
                      background: '#f0fdfc',
                      borderRadius: 8,
                      border: '1px solid rgba(14,110,110,0.15)',
                      marginTop: 14,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      flexWrap: 'wrap',
                    }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0e6e6e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 17H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v3" /><rect x="9" y="11" width="14" height="10" rx="2" /><circle cx="12" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
                      </svg>
                      <span style={{ fontSize: 13, color: '#0e6e6e', fontFamily: "'Inter',sans-serif" }}>
                        {tracking.trackingCompany ?? 'Carrier'}: {tracking.trackingNumber}
                      </span>
                      {tracking.trackingUrl && (
                        <a href={tracking.trackingUrl} target="_blank" rel="noopener noreferrer"
                          style={{ fontSize: 12, color: '#8B6914', fontFamily: "'Inter',sans-serif", textDecoration: 'underline', marginLeft: 'auto' }}>
                          Track Package
                        </a>
                      )}
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div style={{
                  padding: '12px 20px',
                  borderTop: '1px solid #f0ece4',
                  display: 'flex',
                  justifyContent: 'flex-end',
                }}>
                  <a
                    href={`/account/orders/${order.orderNumber}`}
                    style={{
                      padding: '8px 18px',
                      borderRadius: 8,
                      border: '1.5px solid rgba(139,105,20,0.3)',
                      color: '#8B6914',
                      fontSize: 13,
                      fontWeight: 600,
                      fontFamily: "'Inter',sans-serif",
                      textDecoration: 'none',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(139,105,20,0.06)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                  >
                    View Details
                  </a>
                </div>

              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}
