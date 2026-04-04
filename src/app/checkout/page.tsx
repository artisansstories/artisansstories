"use client";

import React, { useState, useEffect, useCallback } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  CardElement,
  PaymentRequestButtonElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { useRouter } from "next/navigation";
import { useCart, formatPrice } from "@/lib/cart";
import type { CartItem } from "@/lib/cart";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

// ── US States ────────────────────────────────────────────────────────────────
const US_STATES = [
  { code: "AL", name: "Alabama" }, { code: "AK", name: "Alaska" },
  { code: "AZ", name: "Arizona" }, { code: "AR", name: "Arkansas" },
  { code: "CA", name: "California" }, { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" }, { code: "DE", name: "Delaware" },
  { code: "FL", name: "Florida" }, { code: "GA", name: "Georgia" },
  { code: "HI", name: "Hawaii" }, { code: "ID", name: "Idaho" },
  { code: "IL", name: "Illinois" }, { code: "IN", name: "Indiana" },
  { code: "IA", name: "Iowa" }, { code: "KS", name: "Kansas" },
  { code: "KY", name: "Kentucky" }, { code: "LA", name: "Louisiana" },
  { code: "ME", name: "Maine" }, { code: "MD", name: "Maryland" },
  { code: "MA", name: "Massachusetts" }, { code: "MI", name: "Michigan" },
  { code: "MN", name: "Minnesota" }, { code: "MS", name: "Mississippi" },
  { code: "MO", name: "Missouri" }, { code: "MT", name: "Montana" },
  { code: "NE", name: "Nebraska" }, { code: "NV", name: "Nevada" },
  { code: "NH", name: "New Hampshire" }, { code: "NJ", name: "New Jersey" },
  { code: "NM", name: "New Mexico" }, { code: "NY", name: "New York" },
  { code: "NC", name: "North Carolina" }, { code: "ND", name: "North Dakota" },
  { code: "OH", name: "Ohio" }, { code: "OK", name: "Oklahoma" },
  { code: "OR", name: "Oregon" }, { code: "PA", name: "Pennsylvania" },
  { code: "RI", name: "Rhode Island" }, { code: "SC", name: "South Carolina" },
  { code: "SD", name: "South Dakota" }, { code: "TN", name: "Tennessee" },
  { code: "TX", name: "Texas" }, { code: "UT", name: "Utah" },
  { code: "VT", name: "Vermont" }, { code: "VA", name: "Virginia" },
  { code: "WA", name: "Washington" }, { code: "WV", name: "West Virginia" },
  { code: "WI", name: "Wisconsin" }, { code: "WY", name: "Wyoming" },
  { code: "DC", name: "District of Columbia" },
];

const COUNTRIES = [
  { code: "US", name: "United States" },
  { code: "CA", name: "Canada" },
  { code: "GB", name: "United Kingdom" },
  { code: "AU", name: "Australia" },
  { code: "SV", name: "El Salvador" },
  { code: "MX", name: "Mexico" },
];

interface ShippingRate {
  id: string;
  name: string;
  price: number;
  condition: string;
  zoneName?: string;
}

interface FormData {
  email: string;
  phone: string;
  subscribeMarketing: boolean;
  firstName: string;
  lastName: string;
  address1: string;
  address2: string;
  city: string;
  state: string;
  stateCode: string;
  zip: string;
  country: string;
  countryCode: string;
}

// ── Input Component ───────────────────────────────────────────────────────────
function Input({
  label,
  required,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; required?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: "#7a6852",
          textTransform: "uppercase",
          letterSpacing: "0.5px",
        }}
      >
        {label}
        {required && <span style={{ color: "#c0392b", marginLeft: 2 }}>*</span>}
      </label>
      <input
        {...props}
        required={required}
        style={{
          width: "100%",
          padding: "10px 14px",
          border: "1.5px solid #ede8df",
          borderRadius: 8,
          fontSize: 15,
          color: "#3a2e24",
          background: "#ffffff",
          outline: "none",
          transition: "border-color 0.15s",
          ...(props.style || {}),
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = "#8B6914";
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = "#ede8df";
          props.onBlur?.(e);
        }}
      />
    </div>
  );
}

// ── Select Component ──────────────────────────────────────────────────────────
function Select({
  label,
  required,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string; required?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: "#7a6852",
          textTransform: "uppercase",
          letterSpacing: "0.5px",
        }}
      >
        {label}
        {required && <span style={{ color: "#c0392b", marginLeft: 2 }}>*</span>}
      </label>
      <select
        {...props}
        required={required}
        style={{
          width: "100%",
          padding: "10px 14px",
          border: "1.5px solid #ede8df",
          borderRadius: 8,
          fontSize: 15,
          color: "#3a2e24",
          background: "#ffffff",
          outline: "none",
          appearance: "none",
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238B6914' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
          backgroundRepeat: "no-repeat",
          backgroundPosition: "right 12px center",
          paddingRight: 36,
          cursor: "pointer",
          ...(props.style || {}),
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = "#8B6914";
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = "#ede8df";
          props.onBlur?.(e);
        }}
      >
        {children}
      </select>
    </div>
  );
}

// ── Section Header ────────────────────────────────────────────────────────────
function SectionHeader({ number, title }: { number: number; title: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: "50%",
          background: "#8B6914",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 13,
          fontWeight: 700,
          flexShrink: 0,
        }}
      >
        {number}
      </div>
      <h2
        style={{
          fontSize: 17,
          fontWeight: 600,
          color: "#3a2e24",
          fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
          letterSpacing: "0.3px",
        }}
      >
        {title}
      </h2>
    </div>
  );
}

// ── CheckoutForm (inner, uses stripe hooks) ───────────────────────────────────
function CheckoutForm({
  items,
  subtotal,
  cartDiscountCode,
  cartDiscountAmount,
}: {
  items: CartItem[];
  subtotal: number;
  cartDiscountCode?: string;
  cartDiscountAmount: number;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();
  const { clearCart, setDiscount } = useCart();

  const [form, setForm] = useState<FormData>({
    email: "",
    phone: "",
    subscribeMarketing: false,
    firstName: "",
    lastName: "",
    address1: "",
    address2: "",
    city: "",
    state: "",
    stateCode: "",
    zip: "",
    country: "United States",
    countryCode: "US",
  });

  const [shippingRates, setShippingRates] = useState<ShippingRate[]>([]);
  const [selectedRateId, setSelectedRateId] = useState<string>("");
  const [loadingRates, setLoadingRates] = useState(false);

  const [discountCode, setDiscountCode] = useState(cartDiscountCode || "");
  const [discountInput, setDiscountInput] = useState(cartDiscountCode || "");
  const [discountAmount, setDiscountAmount] = useState(cartDiscountAmount);
  const [discountType, setDiscountType] = useState<string | null>(null);
  const [discountError, setDiscountError] = useState("");
  const [discountLoading, setDiscountLoading] = useState(false);

  const [summaryOpen, setSummaryOpen] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");

  // PaymentRequest (Apple Pay / Google Pay)
  const [paymentRequest, setPaymentRequest] = useState<ReturnType<NonNullable<typeof stripe>["paymentRequest"]> | null>(null);
  const [canMakePayment, setCanMakePayment] = useState(false);

  // Computed totals
  const selectedRate = shippingRates.find((r) => r.id === selectedRateId);
  const shippingTotal = discountType === "FREE_SHIPPING" ? 0 : (selectedRate?.price ?? 0);
  const effectiveDiscount = discountType === "FREE_SHIPPING" ? (selectedRate?.price ?? 0) : discountAmount;
  const taxableAmount = Math.max(0, subtotal - (discountType === "FREE_SHIPPING" ? 0 : discountAmount));
  const taxTotal = Math.round(taxableAmount * 0.0825);
  const total = Math.max(0, subtotal - effectiveDiscount + shippingTotal + taxTotal);

  // Fetch shipping rates when country changes
  const fetchShippingRates = useCallback(async (countryCode: string) => {
    setLoadingRates(true);
    try {
      const res = await fetch(`/api/checkout/shipping-rates?countryCode=${countryCode}`);
      const rates: ShippingRate[] = await res.json();
      setShippingRates(rates);
      if (rates.length > 0 && !selectedRateId) {
        setSelectedRateId(rates[0].id);
      }
    } catch {
      setShippingRates([]);
    } finally {
      setLoadingRates(false);
    }
  }, [selectedRateId]);

  useEffect(() => {
    fetchShippingRates(form.countryCode || "US");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.countryCode]);

  // Setup PaymentRequest for Apple Pay / Google Pay
  useEffect(() => {
    if (!stripe || total === 0) return;

    const pr = stripe.paymentRequest({
      country: "US",
      currency: "usd",
      total: { label: "Artisans' Stories", amount: total },
      requestPayerName: true,
      requestPayerEmail: true,
    });

    pr.canMakePayment().then((result) => {
      if (result) {
        setPaymentRequest(pr);
        setCanMakePayment(true);
      }
    });
  }, [stripe, total]);

  const handleFieldChange = (field: keyof FormData, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleStateChange = (stateCode: string) => {
    const found = US_STATES.find((s) => s.code === stateCode);
    setForm((prev) => ({
      ...prev,
      state: found?.name || stateCode,
      stateCode,
    }));
  };

  const handleCountryChange = (countryCode: string) => {
    const found = COUNTRIES.find((c) => c.code === countryCode);
    setForm((prev) => ({
      ...prev,
      country: found?.name || countryCode,
      countryCode,
      state: "",
      stateCode: "",
    }));
  };

  const applyDiscount = async () => {
    if (!discountInput.trim()) return;
    setDiscountLoading(true);
    setDiscountError("");
    try {
      const res = await fetch("/api/checkout/validate-discount", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: discountInput.trim(), subtotal }),
      });
      const data = await res.json();
      if (data.valid) {
        setDiscountCode(data.code);
        setDiscountAmount(data.discountAmount);
        setDiscountType(data.type);
        setDiscount(data.code, data.discountAmount);
      } else {
        setDiscountError(data.error || "Invalid discount code");
        setDiscountCode("");
        setDiscountAmount(0);
        setDiscountType(null);
      }
    } catch {
      setDiscountError("Failed to validate discount code");
    } finally {
      setDiscountLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    const cardElement = elements.getElement(CardElement);
    if (!cardElement) return;

    setProcessing(true);
    setCheckoutError("");

    try {
      // Step 1: Create payment intent
      const piRes = await fetch("/api/checkout/create-payment-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((i) => ({
            variantId: i.variantId,
            quantity: i.quantity,
            price: i.price,
          })),
          email: form.email,
          shippingAddress: {
            firstName: form.firstName,
            lastName: form.lastName,
            address1: form.address1,
            address2: form.address2 || undefined,
            city: form.city,
            state: form.state,
            stateCode: form.stateCode,
            zip: form.zip,
            country: form.country,
            countryCode: form.countryCode,
          },
          shippingRateId: selectedRateId,
          discountCode: discountCode || undefined,
        }),
      });

      const piData = await piRes.json();
      if (!piRes.ok || !piData.clientSecret) {
        setCheckoutError(piData.error || "Failed to initialize payment");
        setProcessing(false);
        return;
      }

      // Step 2: Confirm card payment
      const { error: stripeError, paymentIntent } = await stripe.confirmCardPayment(
        piData.clientSecret,
        {
          payment_method: {
            card: cardElement,
            billing_details: {
              name: `${form.firstName} ${form.lastName}`,
              email: form.email,
              phone: form.phone || undefined,
              address: {
                line1: form.address1,
                line2: form.address2 || undefined,
                city: form.city,
                state: form.stateCode,
                postal_code: form.zip,
                country: form.countryCode,
              },
            },
          },
        }
      );

      if (stripeError) {
        setCheckoutError(stripeError.message || "Payment failed. Please try again.");
        setProcessing(false);
        return;
      }

      if (paymentIntent?.status !== "succeeded") {
        setCheckoutError("Payment was not completed. Please try again.");
        setProcessing(false);
        return;
      }

      // Step 3: Confirm order
      const confirmRes = await fetch("/api/checkout/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentIntentId: paymentIntent.id,
          email: form.email,
          phone: form.phone || undefined,
          items,
          shippingAddress: {
            firstName: form.firstName,
            lastName: form.lastName,
            address1: form.address1,
            address2: form.address2 || undefined,
            city: form.city,
            state: form.state,
            stateCode: form.stateCode,
            zip: form.zip,
            country: form.country,
            countryCode: form.countryCode,
          },
          shippingRateId: selectedRateId,
          discountCode: discountCode || undefined,
        }),
      });

      const confirmData = await confirmRes.json();
      if (!confirmRes.ok || !confirmData.orderNumber) {
        setCheckoutError(confirmData.error || "Order creation failed. Contact support.");
        setProcessing(false);
        return;
      }

      // Step 4: Clear cart and redirect
      clearCart();
      router.push(`/checkout/success/${confirmData.orderNumber}?email=${encodeURIComponent(form.email)}`);
    } catch (err) {
      console.error("Checkout error:", err);
      setCheckoutError("An unexpected error occurred. Please try again.");
      setProcessing(false);
    }
  };

  const isFormValid =
    form.email &&
    form.firstName &&
    form.lastName &&
    form.address1 &&
    form.city &&
    form.state &&
    form.zip &&
    form.country &&
    selectedRateId;

  return (
    <div
      style={{
        maxWidth: 1100,
        margin: "0 auto",
        padding: "32px 16px 64px",
        display: "grid",
        gridTemplateColumns: "1fr",
        gap: 32,
      }}
    >
      <style>{`
        @media (min-width: 900px) {
          .checkout-grid { grid-template-columns: 1fr 400px !important; }
        }
        @media (max-width: 899px) {
          .summary-panel { display: none; }
          .summary-panel.open { display: block !important; }
        }
      `}</style>

      <div className="checkout-grid" style={{
        display: "grid",
        gridTemplateColumns: "1fr",
        gap: 32,
        alignItems: "start",
      }}>

        {/* ── Left Column: Form ─────────────────────────────── */}
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 24 }}>

          {/* Mobile Order Summary Toggle */}
          <div
            style={{
              display: "none",
              background: "#ffffff",
              border: "1px solid #ede8df",
              borderRadius: 12,
              overflow: "hidden",
            }}
            className="mobile-summary-toggle"
          >
            <button
              type="button"
              onClick={() => setSummaryOpen(!summaryOpen)}
              style={{
                width: "100%",
                padding: "16px 20px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "#8B6914",
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              <span>{summaryOpen ? "Hide" : "Show"} order summary</span>
              <span>{formatPrice(total)}</span>
            </button>
            {summaryOpen && (
              <div style={{ padding: "0 20px 20px" }}>
                <OrderSummaryContent
                  items={items}
                  subtotal={subtotal}
                  discountAmount={effectiveDiscount}
                  discountCode={discountCode}
                  shippingTotal={shippingTotal}
                  taxTotal={taxTotal}
                  total={total}
                  selectedRate={selectedRate}
                  discountInput={discountInput}
                  setDiscountInput={setDiscountInput}
                  discountError={discountError}
                  discountLoading={discountLoading}
                  applyDiscount={applyDiscount}
                />
              </div>
            )}
          </div>

          {/* Express Checkout */}
          {canMakePayment && paymentRequest && (
            <div
              style={{
                background: "#ffffff",
                border: "1px solid #ede8df",
                borderRadius: 12,
                padding: 24,
              }}
            >
              <SectionHeader number={1} title="Express Checkout" />
              <PaymentRequestButtonElement
                options={{ paymentRequest, style: { paymentRequestButton: { theme: "dark", height: "48px" } } }}
              />
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  margin: "16px 0 0",
                  color: "#9a876e",
                  fontSize: 13,
                }}
              >
                <div style={{ flex: 1, height: 1, background: "#ede8df" }} />
                or pay with card
                <div style={{ flex: 1, height: 1, background: "#ede8df" }} />
              </div>
            </div>
          )}

          {/* Contact */}
          <div
            style={{
              background: "#ffffff",
              border: "1px solid #ede8df",
              borderRadius: 12,
              padding: 24,
            }}
          >
            <SectionHeader number={canMakePayment ? 2 : 1} title="Contact Information" />
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <Input
                label="Email"
                type="email"
                required
                value={form.email}
                onChange={(e) => handleFieldChange("email", e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
              />
              <Input
                label="Phone (optional)"
                type="tel"
                value={form.phone}
                onChange={(e) => handleFieldChange("phone", e.target.value)}
                placeholder="+1 (555) 000-0000"
                autoComplete="tel"
              />
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  cursor: "pointer",
                  fontSize: 14,
                  color: "#7a6852",
                }}
              >
                <input
                  type="checkbox"
                  checked={form.subscribeMarketing}
                  onChange={(e) => handleFieldChange("subscribeMarketing", e.target.checked)}
                  style={{ accentColor: "#8B6914", width: 16, height: 16 }}
                />
                Keep me updated on new arrivals and artisan stories
              </label>
            </div>
          </div>

          {/* Shipping Address */}
          <div
            style={{
              background: "#ffffff",
              border: "1px solid #ede8df",
              borderRadius: 12,
              padding: 24,
            }}
          >
            <SectionHeader number={canMakePayment ? 3 : 2} title="Shipping Address" />
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Input
                  label="First Name"
                  required
                  value={form.firstName}
                  onChange={(e) => handleFieldChange("firstName", e.target.value)}
                  autoComplete="given-name"
                />
                <Input
                  label="Last Name"
                  required
                  value={form.lastName}
                  onChange={(e) => handleFieldChange("lastName", e.target.value)}
                  autoComplete="family-name"
                />
              </div>
              <Input
                label="Address Line 1"
                required
                value={form.address1}
                onChange={(e) => handleFieldChange("address1", e.target.value)}
                placeholder="123 Main St"
                autoComplete="address-line1"
              />
              <Input
                label="Address Line 2 (optional)"
                value={form.address2}
                onChange={(e) => handleFieldChange("address2", e.target.value)}
                placeholder="Apt, suite, floor..."
                autoComplete="address-line2"
              />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                <Input
                  label="City"
                  required
                  value={form.city}
                  onChange={(e) => handleFieldChange("city", e.target.value)}
                  autoComplete="address-level2"
                />
                {form.countryCode === "US" ? (
                  <Select
                    label="State"
                    required
                    value={form.stateCode}
                    onChange={(e) => handleStateChange(e.target.value)}
                  >
                    <option value="">Select state</option>
                    {US_STATES.map((s) => (
                      <option key={s.code} value={s.code}>{s.name}</option>
                    ))}
                  </Select>
                ) : (
                  <Input
                    label="State / Province"
                    required
                    value={form.state}
                    onChange={(e) => {
                      handleFieldChange("state", e.target.value);
                      handleFieldChange("stateCode", e.target.value);
                    }}
                  />
                )}
                <Input
                  label="ZIP / Postal"
                  required
                  value={form.zip}
                  onChange={(e) => handleFieldChange("zip", e.target.value)}
                  autoComplete="postal-code"
                />
              </div>
              <Select
                label="Country"
                required
                value={form.countryCode}
                onChange={(e) => handleCountryChange(e.target.value)}
              >
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>{c.name}</option>
                ))}
              </Select>
            </div>
          </div>

          {/* Shipping Method */}
          <div
            style={{
              background: "#ffffff",
              border: "1px solid #ede8df",
              borderRadius: 12,
              padding: 24,
            }}
          >
            <SectionHeader number={canMakePayment ? 4 : 3} title="Shipping Method" />
            {loadingRates ? (
              <p style={{ fontSize: 14, color: "#9a876e" }}>Loading shipping options...</p>
            ) : shippingRates.length === 0 ? (
              <p style={{ fontSize: 14, color: "#c0392b" }}>
                No shipping rates available for your region.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {shippingRates.map((rate) => (
                  <label
                    key={rate.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "12px 16px",
                      border: `1.5px solid ${selectedRateId === rate.id ? "#8B6914" : "#ede8df"}`,
                      borderRadius: 8,
                      cursor: "pointer",
                      background: selectedRateId === rate.id ? "#fdf9f3" : "#ffffff",
                      transition: "border-color 0.15s, background 0.15s",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <input
                        type="radio"
                        name="shippingRate"
                        value={rate.id}
                        checked={selectedRateId === rate.id}
                        onChange={() => setSelectedRateId(rate.id)}
                        style={{ accentColor: "#8B6914" }}
                      />
                      <span style={{ fontSize: 14, color: "#3a2e24", fontWeight: 500 }}>
                        {rate.name}
                      </span>
                    </div>
                    <span style={{ fontSize: 14, color: "#8B6914", fontWeight: 600 }}>
                      {rate.price === 0 || discountType === "FREE_SHIPPING" ? "Free" : formatPrice(rate.price)}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Payment */}
          <div
            style={{
              background: "#ffffff",
              border: "1px solid #ede8df",
              borderRadius: 12,
              padding: 24,
            }}
          >
            <SectionHeader number={canMakePayment ? 5 : 4} title="Payment" />

            <div
              style={{
                border: "1.5px solid #C9A84C",
                borderRadius: 8,
                padding: "14px 16px",
                background: "#fdfcf8",
              }}
            >
              <CardElement
                options={{
                  style: {
                    base: {
                      fontSize: "16px",
                      color: "#3a2e24",
                      fontFamily: "'Inter', sans-serif",
                      "::placeholder": { color: "#9a876e" },
                      iconColor: "#8B6914",
                    },
                    invalid: { color: "#c0392b", iconColor: "#c0392b" },
                  },
                }}
              />
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginTop: 10,
                color: "#9a876e",
                fontSize: 12,
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              Your payment information is encrypted and secure.
            </div>
          </div>

          {/* Error */}
          {checkoutError && (
            <div
              style={{
                padding: "14px 16px",
                background: "#fef2f2",
                border: "1px solid #fecaca",
                borderRadius: 8,
                color: "#b91c1c",
                fontSize: 14,
              }}
            >
              {checkoutError}
            </div>
          )}

          {/* Place Order */}
          <button
            type="submit"
            disabled={processing || !isFormValid || !stripe}
            style={{
              width: "100%",
              height: 56,
              background: processing || !isFormValid ? "#c9b890" : "#8B6914",
              color: "#ffffff",
              border: "none",
              borderRadius: 10,
              fontSize: 17,
              fontWeight: 700,
              cursor: processing || !isFormValid ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              transition: "background 0.2s",
              letterSpacing: "0.3px",
            }}
          >
            {processing ? (
              <>
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  style={{ animation: "spin 1s linear infinite" }}
                >
                  <path d="M21 12a9 9 0 11-6.219-8.56" />
                </svg>
                Processing...
              </>
            ) : (
              <>
                Place Order — {formatPrice(total)}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </>
            )}
          </button>
          <style>{`
            @keyframes spin { to { transform: rotate(360deg); } }
          `}</style>
        </form>

        {/* ── Right Column: Order Summary ────────────────────── */}
        <div
          className="summary-panel"
          style={{
            position: "sticky",
            top: 24,
          }}
        >
          <div
            style={{
              background: "#ffffff",
              border: "1px solid #ede8df",
              borderRadius: 12,
              padding: 24,
            }}
          >
            <h2
              style={{
                fontSize: 17,
                fontWeight: 600,
                color: "#3a2e24",
                marginBottom: 20,
                fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
              }}
            >
              Order Summary
            </h2>
            <OrderSummaryContent
              items={items}
              subtotal={subtotal}
              discountAmount={effectiveDiscount}
              discountCode={discountCode}
              shippingTotal={shippingTotal}
              taxTotal={taxTotal}
              total={total}
              selectedRate={selectedRate}
              discountInput={discountInput}
              setDiscountInput={setDiscountInput}
              discountError={discountError}
              discountLoading={discountLoading}
              applyDiscount={applyDiscount}
            />
          </div>

          {/* Trust badges */}
          <div
            style={{
              marginTop: 16,
              padding: "16px 20px",
              background: "#fff",
              border: "1px solid #ede8df",
              borderRadius: 12,
            }}
          >
            {[
              { icon: "🔒", text: "SSL Encrypted Checkout" },
              { icon: "↩️", text: "30-Day Return Policy" },
              { icon: "🤝", text: "Handcrafted with Care" },
            ].map(({ icon, text }) => (
              <div
                key={text}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "6px 0",
                  fontSize: 13,
                  color: "#7a6852",
                }}
              >
                <span style={{ fontSize: 16 }}>{icon}</span>
                {text}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Order Summary Content (shared between desktop panel & mobile accordion) ──
function OrderSummaryContent({
  items,
  subtotal,
  discountAmount,
  discountCode,
  shippingTotal,
  taxTotal,
  total,
  selectedRate,
  discountInput,
  setDiscountInput,
  discountError,
  discountLoading,
  applyDiscount,
}: {
  items: CartItem[];
  subtotal: number;
  discountAmount: number;
  discountCode: string;
  shippingTotal: number;
  taxTotal: number;
  total: number;
  selectedRate?: ShippingRate;
  discountInput: string;
  setDiscountInput: (v: string) => void;
  discountError: string;
  discountLoading: boolean;
  applyDiscount: () => void;
}) {
  return (
    <div>
      {/* Items */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
        {items.map((item) => (
          <div key={item.variantId} style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 6,
                background: "#f5f0e8",
                border: "1px solid #ede8df",
                flexShrink: 0,
                overflow: "hidden",
                position: "relative",
              }}
            >
              {item.image ? (
                <img src={item.image} alt={item.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : null}
              <span
                style={{
                  position: "absolute",
                  top: -6,
                  right: -6,
                  background: "#8B6914",
                  color: "#fff",
                  borderRadius: "50%",
                  width: 18,
                  height: 18,
                  fontSize: 10,
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {item.quantity}
              </span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 13, color: "#3a2e24", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {item.name}
              </p>
              {item.variantName && (
                <p style={{ margin: "2px 0 0", fontSize: 12, color: "#9a876e" }}>{item.variantName}</p>
              )}
            </div>
            <p style={{ margin: 0, fontSize: 13, color: "#3a2e24", fontWeight: 500, flexShrink: 0 }}>
              {formatPrice(item.price * item.quantity)}
            </p>
          </div>
        ))}
      </div>

      {/* Discount Code */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="text"
            placeholder="Discount code"
            value={discountInput}
            onChange={(e) => setDiscountInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), applyDiscount())}
            style={{
              flex: 1,
              padding: "9px 12px",
              border: "1.5px solid #ede8df",
              borderRadius: 8,
              fontSize: 14,
              color: "#3a2e24",
              outline: "none",
            }}
            disabled={!!discountCode}
          />
          <button
            type="button"
            onClick={applyDiscount}
            disabled={discountLoading || !!discountCode || !discountInput.trim()}
            style={{
              padding: "9px 16px",
              background: discountCode ? "#e8f5e9" : "#8B6914",
              color: discountCode ? "#2e7d32" : "#ffffff",
              border: "none",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              cursor: discountCode ? "default" : "pointer",
              flexShrink: 0,
            }}
          >
            {discountCode ? "Applied" : discountLoading ? "..." : "Apply"}
          </button>
        </div>
        {discountError && (
          <p style={{ margin: "6px 0 0", fontSize: 12, color: "#c0392b" }}>{discountError}</p>
        )}
        {discountCode && !discountError && (
          <p style={{ margin: "6px 0 0", fontSize: 12, color: "#2e7d32" }}>
            Code &ldquo;{discountCode}&rdquo; applied!
          </p>
        )}
      </div>

      {/* Divider */}
      <div style={{ borderTop: "1px solid #ede8df", marginBottom: 12 }} />

      {/* Totals */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: "#7a6852" }}>
          <span>Subtotal</span>
          <span style={{ color: "#3a2e24" }}>{formatPrice(subtotal)}</span>
        </div>
        {discountAmount > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: "#2e7d32" }}>
            <span>Discount {discountCode ? `(${discountCode})` : ""}</span>
            <span>−{formatPrice(discountAmount)}</span>
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: "#7a6852" }}>
          <span>Shipping</span>
          <span style={{ color: "#3a2e24" }}>
            {selectedRate
              ? shippingTotal === 0
                ? "Free"
                : formatPrice(shippingTotal)
              : "Select shipping method"}
          </span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: "#7a6852" }}>
          <span>Tax (est. 8.25%)</span>
          <span style={{ color: "#3a2e24" }}>{formatPrice(taxTotal)}</span>
        </div>
      </div>

      <div style={{ borderTop: "2px solid #8B6914", marginTop: 12, paddingTop: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: "#3a2e24" }}>Total</span>
          <span style={{ fontSize: 22, fontWeight: 800, color: "#8B6914" }}>{formatPrice(total)}</span>
        </div>
        <p style={{ margin: "4px 0 0", fontSize: 11, color: "#9a876e" }}>USD incl. taxes</p>
      </div>
    </div>
  );
}

// ── Empty Cart State ──────────────────────────────────────────────────────────
function EmptyCartMessage() {
  return (
    <div
      style={{
        maxWidth: 480,
        margin: "80px auto",
        textAlign: "center",
        padding: "0 24px",
      }}
    >
      <div style={{ fontSize: 64, marginBottom: 16 }}>🛒</div>
      <h1
        style={{
          fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
          fontSize: 32,
          color: "#3a2e24",
          marginBottom: 12,
        }}
      >
        Your cart is empty
      </h1>
      <p style={{ color: "#7a6852", fontSize: 15, marginBottom: 32 }}>
        Add some handcrafted items to your cart before checking out.
      </p>
      <a
        href="/shop"
        style={{
          display: "inline-block",
          padding: "14px 32px",
          background: "#8B6914",
          color: "#fff",
          borderRadius: 8,
          textDecoration: "none",
          fontWeight: 600,
          fontSize: 15,
        }}
      >
        Browse Shop
      </a>
    </div>
  );
}

// ── Page Component ────────────────────────────────────────────────────────────
export default function CheckoutPage() {
  const { items, subtotal, discountCode, discountAmount } = useCart();
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  if (!hydrated) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: 300 }}>
        <div style={{ color: "#9a876e", fontSize: 14 }}>Loading checkout...</div>
      </div>
    );
  }

  if (items.length === 0) {
    return <EmptyCartMessage />;
  }

  return (
    <Elements
      stripe={stripePromise}
      options={{
        appearance: {
          theme: "stripe",
          variables: {
            colorPrimary: "#8B6914",
            colorBackground: "#ffffff",
            colorText: "#3a2e24",
            colorDanger: "#c0392b",
            fontFamily: "Inter, sans-serif",
            spacingUnit: "4px",
            borderRadius: "8px",
          },
        },
      }}
    >
      <CheckoutForm
        items={items}
        subtotal={subtotal}
        cartDiscountCode={discountCode}
        cartDiscountAmount={discountAmount}
      />
    </Elements>
  );
}
