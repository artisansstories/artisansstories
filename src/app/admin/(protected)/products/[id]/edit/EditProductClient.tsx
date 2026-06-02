"use client";

import ProductForm from "../../ProductForm";
import type { ProductData } from "../../ProductForm";

interface ArtisanOption { id: string; name: string; }

export default function EditProductClient({ product, artisans }: { product: ProductData; artisans?: ArtisanOption[] }) {
  return <ProductForm product={product} artisans={artisans} />;
}
