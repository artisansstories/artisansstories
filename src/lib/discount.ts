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

export type PromoTheme = "WARM" | "COOL" | "BOLD" | "SOFT" | "DARK";

export const promoThemeStyles: Record<PromoTheme, { background: string; color: string }> = {
  WARM: { background: "#8B6914", color: "#fff" }, // warm gold
  COOL: { background: "#2a7a6e", color: "#fff" }, // teal
  BOLD: { background: "#c0392b", color: "#fff" }, // crimson
  SOFT: { background: "#d4728a", color: "#fff" }, // blush
  DARK: { background: "#2c2c2c", color: "#fff" }, // charcoal
};

export function getPromoThemeStyle(theme?: string | null) {
  return promoThemeStyles[(theme as PromoTheme) ?? "WARM"] ?? promoThemeStyles.WARM;
}
