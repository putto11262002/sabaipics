/**
 * Stripe Customer Management
 *
 * Utilities for creating and managing Stripe customers linked to photographers.
 */

import type Stripe from 'stripe';

// =============================================================================
// Types
// =============================================================================

/**
 * Parameters for getting or creating a customer
 */
export interface GetOrCreateCustomerParams {
  /** Stripe client instance */
  stripe: Stripe;
  /** Internal photographer ID (stored in customer metadata) */
  photographerId: string;
  /** Customer email (optional but recommended for receipts) */
  email?: string;
  /** Customer display name */
  name?: string;
  /** Existing Stripe customer ID to retrieve (skip creation if valid) */
  existingCustomerId?: string;
}

/**
 * Parameters for creating a new customer
 */
export interface CreateCustomerParams {
  /** Stripe client instance */
  stripe: Stripe;
  /** Internal photographer ID (stored in customer metadata) */
  photographerId: string;
  /** Customer email (optional but recommended for receipts) */
  email?: string;
  /** Customer display name */
  name?: string;
  /** Additional metadata to store */
  metadata?: Record<string, string>;
}

/**
 * Parameters for updating a customer
 */
export interface UpdateCustomerParams {
  /** Stripe client instance */
  stripe: Stripe;
  /** Stripe customer ID (cus_xxx) */
  customerId: string;
  /** Updated email */
  email?: string;
  /** Updated name */
  name?: string;
  /** Additional metadata to merge */
  metadata?: Record<string, string>;
}

// =============================================================================
// Functions
// =============================================================================

/**
 * Gets an existing customer or creates a new one
 *
 * If existingCustomerId is provided and valid, returns that customer.
 * Otherwise, creates a new customer with the provided details.
 *
 * @param params - Customer parameters
 * @returns Stripe Customer object
 *
 * @example
 * ```typescript
 * // First time - creates new customer
 * const customer = await getOrCreateCustomer({
 *   stripe,
 *   photographerId: 'photo_123',
 *   email: 'photographer@example.com',
 *   name: 'John Doe',
 * });
 *
 * // Store customer.id in database, then later:
 * const sameCustomer = await getOrCreateCustomer({
 *   stripe,
 *   photographerId: 'photo_123',
 *   existingCustomerId: 'cus_xxx',
 * });
 * ```
 */
export async function getOrCreateCustomer({
  stripe,
  photographerId,
  email,
  name,
  existingCustomerId,
}: GetOrCreateCustomerParams): Promise<Stripe.Customer> {
  // Try to retrieve existing customer if ID provided
  if (existingCustomerId) {
    try {
      const customer = await stripe.customers.retrieve(existingCustomerId);
      // Check if customer was deleted
      if (!customer.deleted) {
        return customer as Stripe.Customer;
      }
    } catch {
      // Customer not found or error - fall through to create new one
    }
  }

  // Create new customer
  return createCustomer({ stripe, photographerId, email, name });
}

/**
 * Creates a new Stripe customer
 *
 * @param params - Customer creation parameters
 * @returns Newly created Stripe Customer
 *
 * @example
 * ```typescript
 * const customer = await createCustomer({
 *   stripe,
 *   photographerId: 'photo_123',
 *   email: 'new@example.com',
 *   name: 'New Photographer',
 * });
 * ```
 */
export async function createCustomer({
  stripe,
  photographerId,
  email,
  name,
  metadata = {},
}: CreateCustomerParams): Promise<Stripe.Customer> {
  return stripe.customers.create({
    email,
    name,
    metadata: {
      photographer_id: photographerId,
      source: 'sabaipics',
      created_via: 'api',
      ...metadata,
    },
  });
}

/**
 * Updates an existing Stripe customer
 *
 * @param params - Customer update parameters
 * @returns Updated Stripe Customer
 *
 * @example
 * ```typescript
 * const updated = await updateCustomer({
 *   stripe,
 *   customerId: 'cus_xxx',
 *   email: 'newemail@example.com',
 * });
 * ```
 */
export async function updateCustomer({
  stripe,
  customerId,
  email,
  name,
  metadata,
}: UpdateCustomerParams): Promise<Stripe.Customer> {
  const updateData: Stripe.CustomerUpdateParams = {};

  if (email !== undefined) updateData.email = email;
  if (name !== undefined) updateData.name = name;
  if (metadata !== undefined) updateData.metadata = metadata;

  return stripe.customers.update(customerId, updateData);
}

/**
 * Retrieves a customer by Stripe ID
 *
 * @param stripe - Stripe client instance
 * @param customerId - Stripe customer ID (cus_xxx)
 * @returns Stripe Customer or null if not found/deleted
 */
export async function getCustomer(
  stripe: Stripe,
  customerId: string,
): Promise<Stripe.Customer | null> {
  try {
    const customer = await stripe.customers.retrieve(customerId);
    if (customer.deleted) {
      return null;
    }
    return customer as Stripe.Customer;
  } catch {
    return null;
  }
}

/**
 * Searches for a customer by photographer ID in metadata
 *
 * @param stripe - Stripe client instance
 * @param photographerId - Internal photographer ID
 * @returns Stripe Customer or null if not found
 *
 * @example
 * ```typescript
 * const customer = await findCustomerByPhotographerId(stripe, 'photo_123');
 * if (customer) {
 *   console.log('Found existing customer:', customer.id);
 * }
 * ```
 */
export async function findCustomerByPhotographerId(
  stripe: Stripe,
  photographerId: string,
): Promise<Stripe.Customer | null> {
  const customers = await stripe.customers.search({
    query: `metadata['photographer_id']:'${photographerId}'`,
    limit: 1,
  });

  if (customers.data.length > 0) {
    return customers.data[0];
  }

  return null;
}
