/**
 * Apple IAP Product Catalog
 *
 * Maps App Store Connect product IDs to credit amounts.
 * API-driven so credit amounts can be updated without an app release.
 *
 * Pricing model:
 * - Apple base rate: 0.15 THB/credit
 * - Discount tiers: 0% (100 THB), 8% (300 THB), 17% (1000 THB)
 * - Apple commission: 15% (Small Business Program)
 */

export interface AppleProduct {
  productId: string;
  credits: number;
  priceTHB: number;
  discount: number;
  label: string;
}

export const APPLE_PRODUCTS: Record<string, AppleProduct> = {
  'sabaipics.credits.100': {
    productId: 'sabaipics.credits.100',
    credits: 666,
    priceTHB: 100,
    discount: 0,
    label: '666 credits',
  },
  'sabaipics.credits.300': {
    productId: 'sabaipics.credits.300',
    credits: 2173,
    priceTHB: 300,
    discount: 8,
    label: '2,173 credits',
  },
  'sabaipics.credits.1000': {
    productId: 'sabaipics.credits.1000',
    credits: 8000,
    priceTHB: 1000,
    discount: 17,
    label: '8,000 credits',
  },
} as const;

/**
 * Look up credit amount for an Apple product ID.
 * Returns null if product ID is unknown.
 */
export function getAppleProductCredits(productId: string): number | null {
  return APPLE_PRODUCTS[productId]?.credits ?? null;
}

/**
 * Get all Apple products as an array (for API response).
 */
export function getAppleProductList(): AppleProduct[] {
  return Object.values(APPLE_PRODUCTS);
}
