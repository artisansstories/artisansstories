import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CartItemAddon } from "@/types/addons";

export interface CartItem {
  productId: string;
  variantId: string;
  name: string;
  variantName: string;
  price: number; // in cents
  quantity: number;
  image?: string;
  slug: string;
  sku?: string;
  addons?: CartItemAddon[];
  addonKey?: string; // composite dedup key: `${variantId}-${stableAddonHash}`
}

function stableAddonHash(addons?: CartItemAddon[]): string {
  if (!addons || addons.length === 0) return '';
  const sorted = [...addons].sort((a, b) => a.type.localeCompare(b.type));
  return btoa(JSON.stringify(sorted)).replace(/[^a-z0-9]/gi, '').slice(0, 16);
}

export { stableAddonHash };

interface CartStore {
  items: CartItem[];
  addItem: (item: CartItem, maxQty?: number) => void;
  removeItem: (key: string) => void;
  updateQuantity: (key: string, quantity: number, maxQty?: number) => void;
  clearCart: () => void;
  discountCode?: string;
  discountAmount: number;
  setDiscount: (code: string, amount: number) => void;
  clearDiscount: () => void;
}

export const useCart = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      discountAmount: 0,
      discountCode: undefined,

      addItem: (item: CartItem, maxQty?: number) => {
        set(state => {
          // Compute addonKey if not provided
          const itemKey = item.addonKey ?? item.variantId + (item.addons?.length ? '-' + stableAddonHash(item.addons) : '');
          const existing = state.items.find(i => (i.addonKey ?? i.variantId) === itemKey);
          if (existing) {
            const newQty = existing.quantity + item.quantity;
            const capped = maxQty !== undefined ? Math.min(newQty, maxQty) : newQty;
            return {
              items: state.items.map(i =>
                (i.addonKey ?? i.variantId) === itemKey
                  ? { ...i, quantity: capped }
                  : i
              ),
            };
          }
          const initialQty = maxQty !== undefined ? Math.min(item.quantity, maxQty) : item.quantity;
          return { items: [...state.items, { ...item, addonKey: itemKey, quantity: initialQty }] };
        });
      },

      removeItem: (key: string) => {
        set(state => ({
          items: state.items.filter(i => (i.addonKey ?? i.variantId) !== key),
        }));
      },

      updateQuantity: (key: string, quantity: number, maxQty?: number) => {
        if (quantity <= 0) {
          get().removeItem(key);
          return;
        }
        const capped = maxQty !== undefined ? Math.min(quantity, maxQty) : quantity;
        set(state => ({
          items: state.items.map(i =>
            (i.addonKey ?? i.variantId) === key ? { ...i, quantity: capped } : i
          ),
        }));
      },

      clearCart: () => set({ items: [], discountCode: undefined, discountAmount: 0 }),

      setDiscount: (code: string, amount: number) => {
        set({ discountCode: code, discountAmount: amount });
      },

      clearDiscount: () => {
        set({ discountCode: undefined, discountAmount: 0 });
      },
    }),
    {
      name: "artisans-cart",
      // Only persist cart items — discount codes are session-only, never auto-applied
      partialize: (state) => ({
        items: state.items,
      }),
    }
  )
);

export function formatPrice(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}
