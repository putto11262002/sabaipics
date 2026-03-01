export interface DiscountResult {
  originalAmount: number;
  finalAmount: number;
  discountPercent: number;
  bonusCredits: number;
  creditAmount: number;
  effectiveRate: number;
}

/**
 * Calculate tiered discount and credit amount for flexible top-up
 * Model: Pay full price, get MORE credits with bulk discount
 *
 * Base rate: 0.12 THB per credit (no discount)
 * Discount tiers (on per-credit rate) - matches competitor:
 * - 50-299 THB: 0% off → 0.12฿/credit
 * - 300-599 THB: 8% off → 0.11฿/credit
 * - 600+ THB: 17% off → 0.10฿/credit
 */
export function calculateTieredDiscount(amount: number): DiscountResult {
  const BASE_RATE = 0.12; // THB per credit at 0% discount

  // Determine effective rate based on amount (exact rates to match competitor)
  let effectiveRate: number;
  let discountPercent: number;

  if (amount >= 600) {
    effectiveRate = 0.1; // 0.12 * (1 - 0.1667) = 0.10
    discountPercent = 17;
  } else if (amount >= 300) {
    effectiveRate = 0.11; // 0.12 * (1 - 0.0833) = 0.11
    discountPercent = 8;
  } else {
    effectiveRate = 0.12; // Base rate
    discountPercent = 0;
  }

  // Calculate credits at discounted rate (always round DOWN)
  const creditAmount = Math.floor(amount / effectiveRate);

  // Calculate how many credits they would get at base rate (no discount)
  const baseCredits = Math.floor(amount / BASE_RATE);

  // Bonus credits from discount
  const bonusCredits = creditAmount - baseCredits;

  // User pays full amount (no discount on payment)
  const finalAmount = amount;

  return {
    originalAmount: amount,
    finalAmount, // Same as original (no payment discount)
    discountPercent,
    bonusCredits, // Extra credits from bulk discount
    creditAmount, // Total credits (includes bonus)
    effectiveRate: parseFloat(effectiveRate.toFixed(4)),
  };
}
