/**
 * SKU generation utilities for Artisans Stories
 *
 * Format:
 *   Product SKU:  AS-{CAT_PREFIX}-{RANDOM6}   e.g. AS-TOT-X4K2M9
 *   Variant SKU:  {PRODUCT_SKU}-{VARIANT_SUFFIX}  e.g. AS-TOT-X4K2M9-SM-RD
 *
 * Random chars: uppercase letters + digits (no 0/O/I/L to avoid confusion)
 */

const SAFE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function randomStr(len: number): string {
  let out = "";
  for (let i = 0; i < len; i++) {
    out += SAFE_CHARS[Math.floor(Math.random() * SAFE_CHARS.length)];
  }
  return out;
}

/** Generate a candidate product SKU. Caller must verify uniqueness in DB. */
export function generateProductSKU(categoryName?: string | null): string {
  const prefix = categoryName
    ? categoryName.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4)
    : "PRD";
  return `AS-${prefix || "PRD"}-${randomStr(6)}`;
}

/** Generate a candidate variant SKU based on option values. Caller must verify uniqueness. */
export function generateVariantSKU(productSku: string, optionValues: string[]): string {
  const suffix = optionValues
    .map(v => v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3))
    .join("-");
  return `${productSku}-${suffix || randomStr(4)}`;
}
