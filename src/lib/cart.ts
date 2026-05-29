import { create } from "zustand";
import { persist } from "zustand/middleware";

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
}

interface CartStore {
  items: CartItem[];
  addItem: (item: CartItem, maxQty?: number) => void;
  removeItem: (variantId: string) => void;
  updateQuantity: (variantId: string, quantity: number, maxQty?: number) => void;
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
          const existing = state.items.find(i => i.variantId === item.variantId);
          if (existing) {
            const newQty = existing.quantity + item.quantity;
            const capped = maxQty !== undefined ? Math.min(newQty, maxQty) : newQty;
            return {
              items: state.items.map(i =>
                i.variantId === item.variantId
                  ? { ...i, quantity: capped }
                  : i
              ),
            };
          }
          const initialQty = maxQty !== undefined ? Math.min(item.quantity, maxQty) : item.quantity;
          return { items: [...state.items, { ...item, quantity: initialQty }] };
        });
      },

      removeItem: (variantId: string) => {
        set(state => ({
          items: state.items.filter(i => i.variantId !== variantId),
        }));
      },

      updateQuantity: (variantId: string, quantity: number, maxQty?: number) => {
        if (quantity <= 0) {
          get().removeItem(variantId);
          return;
        }
        const capped = maxQty !== undefined ? Math.min(quantity, maxQty) : quantity;
        set(state => ({
          items: state.items.map(i =>
            i.variantId === variantId ? { ...i, quantity: capped } : i
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
      // Only persist items and discount info (not computed values)
      partialize: (state) => ({
        items: state.items,
        discountCode: state.discountCode,
        discountAmount: state.discountAmount,
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
