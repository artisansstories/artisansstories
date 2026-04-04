"use client";

import ProductForm from "../../ProductForm";
import type { ProductData } from "../../ProductForm";

export default function EditProductClient({ product }: { product: ProductData }) {
  return <ProductForm product={product} />;
}
