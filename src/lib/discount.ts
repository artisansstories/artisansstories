/** Returns the badge label to show customers ("Save 20%" or "Save $9") */
export function discountBadge(
  salePrice: number,
  compareAtPrice: number,
  discountType: "PERCENTAGE" | "FIXED" | null | undefined
): string {
  if (!compareAtPrice || compareAtPrice <= salePrice) return "";
  if (discountType === "FIXED") {
    const dollars = (compareAtPrice - salePrice) / 100;
    return `Save $${dollars % 1 === 0 ? dollars.toFixed(0) : dollars.toFixed(2)}`;
  }
  // Default: PERCENTAGE
  return `Save ${Math.round((1 - salePrice / compareAtPrice) * 100)}%`;
}
