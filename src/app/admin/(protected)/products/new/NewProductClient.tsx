"use client";

import ProductForm from "../ProductForm";

interface ArtisanOption { id: string; name: string; }

export default function NewProductClient({ artisans }: { artisans: ArtisanOption[] }) {
  return <ProductForm artisans={artisans} />;
}
