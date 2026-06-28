"use client";

/**
 * CartContext — localStorage-backed cart for the white-label tenant storefront.
 *
 * Keyed per tenant via `cart:{tenantSlug}` so carts don't bleed between stores.
 * Provides: items, addItem, removeItem, updateQty, clearCart, totalItems, totalAmount.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

export interface CartItem {
  variantId: string;
  productId: string;
  productSlug: string;
  name: string;       // product name
  variantName: string;
  price: number;      // unit price in cents
  quantity: number;
  imageUrl?: string;
}

interface CartContextValue {
  items: CartItem[];
  totalItems: number;
  totalAmount: number; // cents
  addItem: (item: Omit<CartItem, "quantity"> & { quantity?: number }) => void;
  removeItem: (variantId: string) => void;
  updateQty: (variantId: string, qty: number) => void;
  clearCart: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

function storageKey(tenantSlug: string) {
  return `cart:${tenantSlug}`;
}

function load(tenantSlug: string): CartItem[] {
  try {
    const raw = localStorage.getItem(storageKey(tenantSlug));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function save(tenantSlug: string, items: CartItem[]) {
  try {
    localStorage.setItem(storageKey(tenantSlug), JSON.stringify(items));
  } catch {}
}

export function CartProvider({ tenantSlug, children }: { tenantSlug: string; children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const slugRef = useRef(tenantSlug);
  slugRef.current = tenantSlug;

  // Load from localStorage on mount (client only)
  useEffect(() => {
    setItems(load(tenantSlug));
  }, [tenantSlug]);

  // Persist on every change
  useEffect(() => {
    save(slugRef.current, items);
  }, [items]);

  const addItem = useCallback((item: Omit<CartItem, "quantity"> & { quantity?: number }) => {
    const qty = item.quantity ?? 1;
    setItems(prev => {
      const idx = prev.findIndex(i => i.variantId === item.variantId);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + qty };
        return next;
      }
      return [...prev, { ...item, quantity: qty }];
    });
  }, []);

  const removeItem = useCallback((variantId: string) => {
    setItems(prev => prev.filter(i => i.variantId !== variantId));
  }, []);

  const updateQty = useCallback((variantId: string, qty: number) => {
    if (qty < 1) {
      setItems(prev => prev.filter(i => i.variantId !== variantId));
    } else {
      setItems(prev => prev.map(i => i.variantId === variantId ? { ...i, quantity: qty } : i));
    }
  }, []);

  const clearCart = useCallback(() => setItems([]), []);

  const totalItems = useMemo(() => items.reduce((s, i) => s + i.quantity, 0), [items]);
  const totalAmount = useMemo(() => items.reduce((s, i) => s + i.price * i.quantity, 0), [items]);

  return (
    <CartContext.Provider value={{ items, totalItems, totalAmount, addItem, removeItem, updateQty, clearCart }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside CartProvider");
  return ctx;
}
