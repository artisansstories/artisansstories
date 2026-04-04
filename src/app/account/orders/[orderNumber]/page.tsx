import { redirect, notFound } from 'next/navigation';
import { getAccountSession } from '@/lib/account-session';
import { prisma } from '@/lib/prisma';

function formatPrice(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(date));
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

type TimelineStep = {
  key: string;
  label: string;
  statuses: string[];
};

const TIMELINE_STEPS: TimelineStep[] = [
  { key: 'placed',    label: 'Order Placed',  statuses: ['PENDING', 'PROCESSING', 'FULFILLED', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED'] },
  { key: 'paid',      label: 'Payment',       statuses: ['PROCESSING', 'FULFILLED', 'SHIPPED', 'DELIVERED', 'REFUNDED'] },
  { key: 'shipped',   label: 'Shipped',       statuses: ['SHIPPED', 'DELIVERED'] },
  { key: 'delivered', label: 'Delivered',     statuses: ['DELIVERED'] },
];

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ orderNumber: string }>;
}) {
  const session = await getAccountSession();
  if (!session) {
    redirect('/account/login');
  }

  const { orderNumber } = await params;

  const order = await prisma.order.findFirst({
    where: {
      orderNumber,
      customerId: session.id,
    },
    include: {
      items: {
        include: {
          product: {
            select: {
              images: {
                where: { isDefault: true },
                take: 1,
                select: { url: true, urlThumb: true, urlMedium: true, altText: true },
              },
            },
          },
        },
      },
      fulfillments: {
        orderBy: { createdAt: 'desc' },
      },
      returns: {
        include: {
          items: { include: { orderItem: true } },
        },
        orderBy: { requestedAt: 'desc' },
      },
    },
  });

  if (!order) {
    notFound();
  }

  const statusCfg = STATUS_CONFIG[order.status] ?? { label: order.status, bg: '#f5f5f5', color: '#666' };
  const shippingAddress = order.shippingAddress as Record<string, string>;

  // Can request return if DELIVERED and within 30 days
  const canReturn =
    order.status === 'DELIVERED' &&
    order.returns.filter(r => r.status !== 'REJECTED').length === 0 &&
    Date.now() - new Date(order.createdAt).getTime() < 30 * 24 * 60 * 60 * 1000;

  const tracking = order.fulfillments[0];

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: 'clamp(24px,4vw,48px) 20px' }}>

      {/* Back link */}
      <a href="/account/orders" style={{ fontSize: 13, color: '#9a876e', fontFamily: "'Inter',sans-serif", display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 24 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m15 18-6-6 6-6" />
        </svg>
        Back to orders
      </a>

      {/* Order header */}
      <div style={{
        background: '#fff',
        borderRadius: 16,
        border: '1px solid #ede8df',
        padding: '20px 24px',
        marginBottom: 20,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        flexWrap: 'wrap',
        gap: 16,
      }}>
        <div>
          <h1 style={{
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            fontSize: 'clamp(22px,4vw,28px)',
            fontWeight: 500,
            color: '#3a2e24',
            marginBottom: 6,
          }}>
            Order {order.orderNumber}
          </h1>
          <p style={{ fontSize: 13, color: '#9a876e', fontFamily: "'Inter',sans-serif", margin: 0 }}>
            Placed {formatDate(order.createdAt)}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{
            padding: '5px 14px',
            borderRadius: 20,
            fontSize: 12,
            fontWeight: 600,
            fontFamily: "'Inter',sans-serif",
            background: statusCfg.bg,
            color: statusCfg.color,
          }}>
            {statusCfg.label}
          </span>
          <span style={{ fontSize: 18, fontWeight: 700, color: '#8B6914', fontFamily: "'Inter',sans-serif" }}>
            {formatPrice(order.total)}
          </span>
        </div>
      </div>

      {/* Status timeline */}
      <div style={{
        background: '#fff',
        borderRadius: 16,
        border: '1px solid #ede8df',
        padding: '20px 24px',
        marginBottom: 20,
      }}>
        <h2 style={{ fontSize: 13, fontWeight: 600, color: '#6b5540', fontFamily: "'Inter',sans-serif", letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 20 }}>
          Order Status
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
          {TIMELINE_STEPS.map((step, idx) => {
            const isComplete = step.statuses.includes(order.status);
            const isCancelled = order.status === 'CANCELLED';
            const stepColor = isCancelled && idx > 0 ? '#ddd' : isComplete ? '#8B6914' : '#ddd';
            const isLast = idx === TIMELINE_STEPS.length - 1;

            return (
              <div key={step.key} style={{ display: 'flex', alignItems: 'center', flex: isLast ? 'none' : 1, minWidth: 0 }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  <div style={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    background: isComplete && !isCancelled ? 'linear-gradient(135deg, #8B6914, #C9A84C)' : '#f0ece4',
                    border: `2px solid ${stepColor}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    {isComplete && !isCancelled && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </div>
                  <span style={{ fontSize: 11, color: isComplete && !isCancelled ? '#8B6914' : '#b09878', fontFamily: "'Inter',sans-serif", fontWeight: isComplete ? 600 : 400, whiteSpace: 'nowrap' }}>
                    {step.label}
                  </span>
                </div>
                {!isLast && (
                  <div style={{
                    flex: 1,
                    height: 2,
                    background: isComplete && !isCancelled ? 'linear-gradient(90deg, #C9A84C, #8B691440)' : '#ede8df',
                    marginBottom: 22,
                    marginLeft: 4,
                    marginRight: 4,
                  }} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Tracking */}
      {tracking && tracking.trackingNumber && (
        <div style={{
          background: '#f0fdfc',
          borderRadius: 16,
          border: '1px solid rgba(14,110,110,0.2)',
          padding: '18px 24px',
          marginBottom: 20,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
        }}>
          <div>
            <p style={{ fontSize: 13, fontWeight: 600, color: '#0e6e6e', fontFamily: "'Inter',sans-serif", marginBottom: 4 }}>
              {tracking.trackingCompany ?? 'Carrier'} — {tracking.trackingNumber}
            </p>
            {tracking.shippedAt && (
              <p style={{ fontSize: 12, color: '#5a8a8a', fontFamily: "'Inter',sans-serif", margin: 0 }}>
                Shipped {formatDate(tracking.shippedAt)}
              </p>
            )}
          </div>
          {tracking.trackingUrl && (
            <a
              href={tracking.trackingUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                padding: '8px 18px',
                borderRadius: 8,
                background: '#0e6e6e',
                color: '#fff',
                fontSize: 13,
                fontWeight: 600,
                fontFamily: "'Inter',sans-serif",
                textDecoration: 'none',
              }}
            >
              Track Package
            </a>
          )}
        </div>
      )}

      {/* Line items */}
      <div style={{
        background: '#fff',
        borderRadius: 16,
        border: '1px solid #ede8df',
        overflow: 'hidden',
        marginBottom: 20,
      }}>
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #f0ece4', background: '#fdfaf6' }}>
          <h2 style={{ fontSize: 13, fontWeight: 600, color: '#6b5540', fontFamily: "'Inter',sans-serif", letterSpacing: '0.06em', textTransform: 'uppercase', margin: 0 }}>
            Items ({order.items.length})
          </h2>
        </div>

        <div>
          {order.items.map((item, idx) => {
            const imgUrl = item.product?.images[0]?.urlMedium ?? item.product?.images[0]?.url;
            const snapshot = item.productSnapshot as Record<string, unknown>;
            const snapshotImg = snapshot?.imageUrl as string | undefined;
            const displayImg = imgUrl ?? snapshotImg;

            return (
              <div key={item.id} style={{
                padding: '16px 24px',
                borderBottom: idx < order.items.length - 1 ? '1px solid #f0ece4' : 'none',
                display: 'flex',
                gap: 16,
                alignItems: 'flex-start',
              }}>
                <div style={{
                  width: 72, height: 72,
                  borderRadius: 10,
                  background: displayImg ? 'transparent' : '#f5f0e8',
                  border: '1px solid #ede8df',
                  flexShrink: 0,
                  overflow: 'hidden',
                }}>
                  {displayImg && (
                    <img src={displayImg} alt={item.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  )}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 15, fontWeight: 600, color: '#3a2e24', fontFamily: "'Inter',sans-serif", margin: '0 0 4px' }}>
                    {item.title}
                  </p>
                  {item.variantTitle && (
                    <p style={{ fontSize: 13, color: '#9a876e', fontFamily: "'Inter',sans-serif", margin: '0 0 4px' }}>
                      {item.variantTitle}
                    </p>
                  )}
                  <p style={{ fontSize: 13, color: '#b09878', fontFamily: "'Inter',sans-serif", margin: 0 }}>
                    Qty {item.quantity} &times; {formatPrice(item.price)}
                  </p>
                </div>

                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <p style={{ fontSize: 15, fontWeight: 700, color: '#3a2e24', fontFamily: "'Inter',sans-serif", margin: 0 }}>
                    {formatPrice(item.total)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Totals */}
        <div style={{ padding: '16px 24px', borderTop: '2px solid #f0ece4', background: '#fdfaf6' }}>
          <div style={{ maxWidth: 300, marginLeft: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <TotalRow label="Subtotal" value={formatPrice(order.subtotal)} />
            {order.discountTotal > 0 && (
              <TotalRow label="Discount" value={`-${formatPrice(order.discountTotal)}`} valueColor="#0d6e3f" />
            )}
            <TotalRow label="Shipping" value={order.shippingTotal === 0 ? 'Free' : formatPrice(order.shippingTotal)} />
            <TotalRow label="Tax" value={formatPrice(order.taxTotal)} />
            <div style={{ borderTop: '1.5px solid #c8a84c', paddingTop: 10, marginTop: 4 }}>
              <TotalRow label="Total" value={formatPrice(order.total)} bold />
            </div>
          </div>
        </div>
      </div>

      {/* Shipping address */}
      <div style={{
        background: '#fff',
        borderRadius: 16,
        border: '1px solid #ede8df',
        padding: '20px 24px',
        marginBottom: 20,
      }}>
        <h2 style={{ fontSize: 13, fontWeight: 600, color: '#6b5540', fontFamily: "'Inter',sans-serif", letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 12 }}>
          Shipping Address
        </h2>
        <p style={{ fontSize: 14, color: '#3a2e24', fontFamily: "'Inter',sans-serif", lineHeight: 1.7, margin: 0 }}>
          {shippingAddress.firstName} {shippingAddress.lastName}<br />
          {shippingAddress.address1}{shippingAddress.address2 ? `, ${shippingAddress.address2}` : ''}<br />
          {shippingAddress.city}, {shippingAddress.state} {shippingAddress.zip}<br />
          {shippingAddress.country}
        </p>
      </div>

      {/* Return actions */}
      {canReturn && (
        <div style={{
          background: '#fff',
          borderRadius: 16,
          border: '1px solid rgba(139,105,20,0.2)',
          padding: '20px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
        }}>
          <div>
            <p style={{ fontSize: 14, fontWeight: 600, color: '#3a2e24', fontFamily: "'Inter',sans-serif", marginBottom: 4 }}>
              Need to return something?
            </p>
            <p style={{ fontSize: 13, color: '#9a876e', fontFamily: "'Inter',sans-serif", margin: 0 }}>
              Returns accepted within 30 days of delivery.
            </p>
          </div>
          <a
            href={`/account/returns/new?order=${order.id}`}
            style={{
              padding: '10px 22px',
              borderRadius: 10,
              background: 'linear-gradient(135deg, #8B6914 0%, #C9A84C 100%)',
              color: '#fff',
              fontSize: 14,
              fontWeight: 600,
              fontFamily: "'Inter',sans-serif",
              textDecoration: 'none',
              boxShadow: '0 2px 10px rgba(139,105,20,0.25)',
              whiteSpace: 'nowrap',
            }}
          >
            Request Return
          </a>
        </div>
      )}

      {/* Existing returns */}
      {order.returns.length > 0 && (
        <div style={{ marginTop: 20 }}>
          {order.returns.map(ret => (
            <div key={ret.id} style={{
              background: '#fdfaf6',
              borderRadius: 12,
              border: '1px solid #ede8df',
              padding: '16px 20px',
              marginBottom: 12,
            }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#3a2e24', fontFamily: "'Inter',sans-serif", marginBottom: 6 }}>
                Return Request — <span style={{ fontWeight: 400, color: '#9a876e' }}>{ret.status}</span>
              </p>
              {ret.customerNote && (
                <p style={{ fontSize: 13, color: '#7a6852', fontFamily: "'Inter',sans-serif", margin: '0 0 6px', lineHeight: 1.5 }}>
                  Note: {ret.customerNote}
                </p>
              )}
              <p style={{ fontSize: 12, color: '#b09878', fontFamily: "'Inter',sans-serif", margin: 0 }}>
                {ret.items.length} item{ret.items.length !== 1 ? 's' : ''} &middot; Requested {formatDate(ret.requestedAt)}
              </p>
            </div>
          ))}
        </div>
      )}

    </div>
  );
}

function TotalRow({ label, value, valueColor, bold }: { label: string; value: string; valueColor?: string; bold?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: bold ? 15 : 14, color: bold ? '#3a2e24' : '#7a6852', fontFamily: "'Inter',sans-serif", fontWeight: bold ? 700 : 400 }}>
        {label}
      </span>
      <span style={{ fontSize: bold ? 16 : 14, color: bold ? '#8B6914' : (valueColor ?? '#3a2e24'), fontFamily: "'Inter',sans-serif", fontWeight: bold ? 700 : 500 }}>
        {value}
      </span>
    </div>
  );
}
