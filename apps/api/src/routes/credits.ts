import { Hono } from "hono";
import { eq, asc } from "drizzle-orm";
import { creditPackages, photographers } from "@sabaipics/db";
import {
  requirePhotographer,
  requireConsent,
  type PhotographerVariables,
} from "../middleware";
import type { Bindings } from "../types";
import {
  createStripeClient,
  createCheckoutSession,
  createCustomer,
  findCustomerByPhotographerId,
} from "../lib/stripe";
import type { Env } from "../types";

/**
 * Credit packages API
 * GET / - Public endpoint (no auth)
 * POST /checkout - Authenticated photographers only
 */

type CheckoutEnv = {
  Bindings: Bindings;
  Variables: PhotographerVariables;
};

export const creditsRouter = new Hono<Env>()
  /**
   * GET /credit-packages
   *
   * Returns all active credit packages sorted by sortOrder.
   * Public endpoint - no authentication required.
   */
  .get("/", async (c) => {
    const db = c.var.db();

    const packages = await db
      .select({
        id: creditPackages.id,
        name: creditPackages.name,
        credits: creditPackages.credits,
        priceThb: creditPackages.priceThb,
      })
      .from(creditPackages)
      .where(eq(creditPackages.active, true))
      .orderBy(asc(creditPackages.sortOrder));

    return c.json({ data: packages });
  })
  /**
   * POST /credit-packages/checkout
   *
   * Creates a Stripe Checkout session for the selected credit package.
   * Requires authenticated photographer with PDPA consent.
   *
   * Request body: { packageId: string }
   * Response: { data: { checkoutUrl: string, sessionId: string } }
   */
  .post(
    "/checkout",
    requirePhotographer(),
    requireConsent(),
    async (c) => {
      const photographer = c.var.photographer;
      const db = c.var.db();

      // Parse request body
      const body = await c.req.json();
      const packageId = body?.packageId;

      // Validate packageId
      if (!packageId || typeof packageId !== "string") {
        return c.json(
          { error: { code: "INVALID_REQUEST", message: "packageId is required" } },
          400
        );
      }

      // Query package (must be active)
      const [pkg] = await db
        .select()
        .from(creditPackages)
        .where(eq(creditPackages.id, packageId))
        .limit(1);

      if (!pkg || !pkg.active) {
        return c.json(
          { error: { code: "NOT_FOUND", message: "Credit package not found" } },
          404
        );
      }

      // Get or create Stripe customer
      const stripe = createStripeClient(c.env);
      let customer = await findCustomerByPhotographerId(stripe, photographer.id);

      if (!customer) {
        // Fetch photographer email/name for customer creation
        const [photoRecord] = await db
          .select({ email: photographers.email, name: photographers.name })
          .from(photographers)
          .where(eq(photographers.id, photographer.id))
          .limit(1);

        customer = await createCustomer({
          stripe,
          photographerId: photographer.id,
          email: photoRecord.email,
          name: photoRecord.name ?? undefined,
        });

        // Store stripe_customer_id for future use
        await db
          .update(photographers)
          .set({ stripeCustomerId: customer.id })
          .where(eq(photographers.id, photographer.id));
      }

      // Determine redirect URLs (frontend will implement in T-12)
      // Using app origin from CORS_ORIGIN or default localhost for dev
      const origin = c.env.CORS_ORIGIN ?? "http://localhost:5173";
      const successUrl = `${origin}/credits/success`;
      const cancelUrl = `${origin}/credits/packages`;

      // Create checkout session
      const result = await createCheckoutSession({
        stripe,
        customerId: customer.id,
        lineItems: [
          {
            name: pkg.name,
            description: `${pkg.credits} credits for photo uploads`,
            amount: pkg.priceThb, // priceThb is in satang (smallest unit)
            quantity: 1,
            metadata: { package_id: pkg.id, credits: pkg.credits.toString() },
          },
        ],
        successUrl,
        cancelUrl,
        metadata: {
          photographer_id: photographer.id,
          package_id: pkg.id,
          package_name: pkg.name,
          credits: pkg.credits.toString(),
        },
        currency: "thb",
        mode: "payment",
      });

      return c.json({
        data: {
          checkoutUrl: result.url,
          sessionId: result.sessionId,
        },
      });
    }
  );
