/**
 * Promo Code API Types
 *
 * Defines request/response types for gift code and discount code creation.
 */

// ============================================================================
// Gift Code Types (100% off, limited redemptions)
// ============================================================================

export interface CreateGiftCodeRequest {
  /** Number of credits the gift code provides */
  credits: number;
  /** How many days until the code expires (1-365) */
  expiresInDays?: number;
  /** Maximum number of times this code can be used across all customers */
  maxRedemptions?: number;
  /** Optional: Customer-specific code (if provided, only that customer can use it) */
  customerId?: string;
}

export interface CreateGiftCodeResponse {
  /** The generated gift code (e.g., "GIFT-ABC12345") */
  code: string;
  /** Full gift link URL for sharing */
  url: string;
  /** ISO timestamp when code expires */
  expiresAt: string;
  /** Number of credits this code provides */
  credits: number;
  /** Stripe coupon ID */
  couponId: string;
  /** Stripe promotion code ID */
  promoCodeId: string;
  /** Maximum THB value (for Stripe) */
  maxAmountThb: number;
  /** Maximum redemptions (null = unlimited) */
  maxRedemptions: number | null;
  /** Whether code is customer-specific */
  customerSpecific: boolean;
}

// ============================================================================
// Discount Code Types (partial discount)
// ============================================================================

export interface CreateDiscountCodeRequest {
  /** The promotional code string (e.g., "SAVE15", "WELCOME10") */
  code: string;
  /** Type of discount: percentage or fixed amount */
  discountType: 'percent' | 'amount';
  /** Discount value (1-99 for percent, THB amount for 'amount') */
  discountValue: number;
  /** How long the discount applies */
  duration: 'once' | 'repeating' | 'forever';
  /** Optional: Total usage limit across all customers */
  maxRedemptions?: number;
  /** Optional: How many days until code expires */
  expiresInDays?: number;
  /** Optional: Minimum purchase amount in THB to use code */
  minAmountThb?: number;
  /** Optional: Customer-specific code (if provided, only that customer can use it) */
  customerId?: string;
}

export interface CreateDiscountCodeResponse {
  /** The discount code string */
  code: string;
  /** Stripe coupon ID */
  couponId: string;
  /** Stripe promotion code ID */
  promoCodeId: string;
  /** Type of discount */
  discountType: 'percent' | 'amount';
  /** Discount value */
  discountValue: number;
  /** Duration */
  duration: 'once' | 'repeating' | 'forever';
  /** ISO timestamp when code expires (null = no expiration) */
  expiresAt: string | null;
  /** Maximum redemptions (null = unlimited) */
  maxRedemptions: number | null;
  /** Minimum purchase amount in THB (null = no minimum) */
  minAmountThb: number | null;
  /** Whether code is customer-specific */
  customerSpecific: boolean;
}

// ============================================================================
// Promo Code Validation (used by frontend)
// ============================================================================

export interface ValidatePromoCodeResponse {
  data: GiftCodeData | DiscountCodeData;
}

export interface GiftCodeData {
  type: 'gift';
  code: string;
  credits: number;
  maxAmountThb: number;
  expiresAt: string | null;
}

export interface DiscountCodeData {
  type: 'discount';
  code: string;
  discountPercent: number;
  discountAmount: number;
  discountType: 'percent' | 'amount';
  minAmountThb: number | null;
}
