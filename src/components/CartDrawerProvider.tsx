"use client";

import React, { createContext, useContext, useState, useCallback } from "react";

interface CartDrawerContextValue {
  isOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
  toggleCart: () => void;
}

const CartDrawerContext = createContext<CartDrawerContextValue>({
  isOpen: false,
  openCart: () => {},
  closeCart: () => {},
  toggleCart: () => {},
});

export function CartDrawerProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  const openCart = useCallback(() => setIsOpen(true), []);
  const closeCart = useCallback(() => setIsOpen(false), []);
  const toggleCart = useCallback(() => setIsOpen(v => !v), []);

  return (
    <CartDrawerContext.Provider value={{ isOpen, openCart, closeCart, toggleCart }}>
      {children}
    </CartDrawerContext.Provider>
  );
}

export function useCartDrawer() {
  return useContext(CartDrawerContext);
}
