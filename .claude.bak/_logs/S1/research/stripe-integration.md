# Stripe Checkout + Webhooks in Cloudflare Workers - Research

## Executive Summary

Stripe can be integrated with Cloudflare Workers using the Stripe REST API directly via `fetch()` calls. The official `stripe` npm package is NOT recommended for Workers. Use direct HTTP calls instead.

---

## 1. Stripe SDK Compatibility

**Key Finding: Direct API via fetch() Recommended**

- The `stripe` npm package has Node.js dependencies incompatible with Workers
- Use Stripe's REST API directly via native `fetch()`
- More lightweight and efficient than the full SDK

### Environment Variables

```typescript
type CloudflareBindings = {
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  STRIPE_PUBLISHABLE_KEY: string;
};
```

---

## 2. Checkout Session Flow

### Creating Checkout Sessions

```typescript
app.post('/api/credits/purchase', requireAuth(), async (c) => {
  const stripeSecretKey = c.env.STRIPE_SECRET_KEY;
  const auth = c.get('auth');
  const { packageId } = await c.req.json();

  const packages = {
    starter: { credits: 500, priceSatang: 15000 },     // 150 THB
    professional: { credits: 2000, priceSatang: 45000 }, // 450 THB
    studio: { credits: 5000, priceSatang: 100000 },    // 1000 THB
  };

  const pkg = packages[packageId];
  if (!pkg) return c.json({ error: 'Invalid package' }, 400);

  const formData = new URLSearchParams();
  formData.append('success_url', 'https://app.sabaipics.com/dashboard?purchase=success');
  formData.append('cancel_url', 'https://app.sabaipics.com/credits?cancel=true');
  formData.append('payment_method_types[]', 'card');
  formData.append('mode', 'payment');
  formData.append('line_items[0][price_data][currency]', 'thb');
  formData.append('line_items[0][price_data][unit_amount]', String(pkg.priceSatang));
  formData.append('line_items[0][price_data][product_data][name]', `${pkg.credits} Credits`);
  formData.append('line_items[0][quantity]', '1');
  formData.append('metadata[user_id]', auth.userId);
  formData.append('metadata[package_id]', packageId);
  formData.append('metadata[credits]', String(pkg.credits));
  formData.append('customer_creation', 'if_required');

  const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${stripeSecretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formData,
  });

  if (!response.ok) {
    console.error('Stripe error:', await response.text());
    return c.json({ error: 'Failed to create checkout session' }, 500);
  }

  const session = await response.json();
  return c.json({ checkoutUrl: session.url }, 201);
});
```

---

## 3. Webhook Handling

### Events to Listen For

- **Primary:** `checkout.session.completed`
- **Secondary:** `payment_intent.succeeded` (redundancy)

### Webhook Verification

```typescript
function verifyStripeSignature(
  body: string,
  signature: string,
  secret: string
): boolean {
  const parts = signature.split(',');
  let timestamp: string | null = null;
  const signatures: string[] = [];

  for (const part of parts) {
    const [key, value] = part.split('=', 2);
    if (key === 't') timestamp = value;
    else if (key === 'v1') signatures.push(value);
  }

  if (!timestamp || signatures.length === 0) return false;

  // Check timestamp freshness (5 min tolerance)
  const age = Math.floor(Date.now() / 1000) - parseInt(timestamp, 10);
  if (age > 300) return false;

  // Compute expected signature
  const signedPayload = `${timestamp}.${body}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signatureBytes = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(signedPayload)
  );
  const expected = Array.from(new Uint8Array(signatureBytes))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  return signatures.some(sig => sig === expected);
}
```

### Handler Implementation

```typescript
export const stripeWebhookRouter = new Hono<{ Bindings: CloudflareBindings }>()
  .post('/', async (c) => {
    const body = await c.req.text();
    const signature = c.req.header('stripe-signature');

    if (!signature || !verifyStripeSignature(body, signature, c.env.STRIPE_WEBHOOK_SECRET)) {
      return c.json({ error: 'Invalid signature' }, 401);
    }

    const event = JSON.parse(body);

    if (event.type === 'checkout.session.completed') {
      const { metadata } = event.data.object;
      const credits = parseInt(metadata.credits, 10);
      const userId = metadata.user_id;

      // Check idempotency - use session ID
      const sessionId = event.data.object.id;
      // TODO: Check if already processed via credit_ledger

      // Add credits to ledger
      // await db.insert(creditLedger).values({...});
    }

    return c.json({ received: true });
  });
```

---

## 4. Best Practices

### Idempotency
- Use `stripe_session_id` as unique key in credit_ledger
- Check before inserting to prevent duplicate credits on webhook retries

### Test vs Live
- Test mode: `sk_test_*` keys
- Separate webhook endpoints per environment
- Use `stripe-cli` for local testing: `stripe listen --forward-to localhost:8081/webhooks/stripe`

### Error Handling
- Return 200 immediately to Stripe
- Queue processing for reliability if DB write fails

---

## Implementation Checklist

1. [ ] Add Stripe keys to wrangler secrets
2. [ ] Create `POST /api/credits/purchase` endpoint
3. [ ] Create `POST /webhooks/stripe` endpoint
4. [ ] Add webhook signature verification
5. [ ] Implement credit ledger insertion
6. [ ] Test with Stripe test cards
