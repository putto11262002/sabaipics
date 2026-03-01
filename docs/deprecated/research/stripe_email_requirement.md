# Stripe Customer Email Requirement Research

**Research Date:** December 3, 2025
**Question:** Is email required when creating a Stripe Customer?

---

## Summary

**Email is NOT required** when creating a Stripe Customer. The `email` parameter is **optional** in the Stripe API.

---

## Key Findings

### 1. Email Parameter is Optional

According to the official Stripe API documentation for [Create a customer](https://docs.stripe.com/api/customers/create):

- **Parameter:** `email` (string)
- **Required:** No
- **Description:** "Customer's email address. It's displayed alongside the customer in your dashboard and can be useful for searching and tracking. This may be up to 512 characters."

The email field is listed under optional parameters, not required parameters. Only `address` is marked as "Required if calculating taxes" and `tax` is marked as "Recommended if calculating taxes."

### 2. You Can Create a Customer with No Email

From the API documentation, a minimal customer creation request can be:

```bash
curl https://api.stripe.com/v1/customers \
  -u "sk_test_xxx:" \
  -d name="Customer Name"
```

Or even with no parameters at all - Stripe will create a customer with just an ID.

### 3. Implications of Not Having an Email

When a customer has no email address:

- **Dashboard:** Customer will appear without an email in your Stripe Dashboard
- **Receipts:** Stripe cannot automatically send email receipts for successful payments
- **Invoices:** Email invoices cannot be sent automatically
- **Payment confirmations:** No email notifications for payment events
- **Search/filtering:** Cannot filter or search customers by email in the Dashboard
- **Customer communication:** You lose Stripe's built-in email communication channel

### 4. Best Practices for LINE-only Users

For customers who only provide LINE contact information (no email):

#### Option A: Create Customer Without Email (Recommended)

```javascript
const customer = await stripe.customers.create({
  name: customerName,
  metadata: {
    line_user_id: lineUserId,
    communication_channel: 'line',
  },
});
```

**Advantages:**

- Clean data model - no fake emails
- Metadata can store LINE ID for your own reference
- Still get full Stripe Customer benefits (payment methods, history, etc.)

**Handle receipts yourself:**

- Send payment confirmations via LINE messages
- Store payment records in your database
- Generate receipts/invoices in-app or via LINE

#### Option B: Use a Generated Email (Not Recommended)

```javascript
const customer = await stripe.customers.create({
  name: customerName,
  email: `${lineUserId}@noemail.facelink.local`,
  metadata: { line_user_id: lineUserId },
});
```

**Why this is discouraged:**

- Pollutes email field with non-deliverable addresses
- Stripe may attempt to send emails that will bounce
- Creates confusion in Dashboard
- No real benefit since emails won't be received

#### Recommended Approach

1. **Create customer without email** when user signs up via LINE
2. **Store LINE user ID in metadata** for your reference
3. **Send all notifications via LINE** (payment confirmations, receipts, etc.)
4. **Allow optional email collection** later if user wants email receipts
5. **Update customer with email** when/if user provides it:
   ```javascript
   await stripe.customers.update(customerId, {
     email: userProvidedEmail,
   });
   ```

### 5. Receipt Handling Without Email

For LINE-only users, implement your own receipt system:

- **Payment success webhook:** Listen to `payment_intent.succeeded`
- **Generate receipt data:** From PaymentIntent and Customer objects
- **Send via LINE:** Use LINE Messaging API to deliver receipt
- **Store in database:** Keep payment records for customer reference
- **Provide in-app access:** Let customers view payment history in your app

---

## Technical Implementation Notes

### Creating Customer Without Email

```javascript
// Minimal customer creation
const customer = await stripe.customers.create({
  name: photographerName,
  metadata: {
    line_user_id: lineUserId,
    communication_preference: 'line',
    event_id: eventId,
  },
});

// Store mapping in your database
await db.photographers.create({
  line_user_id: lineUserId,
  stripe_customer_id: customer.id,
  name: photographerName,
});
```

### Handling Payment Confirmations

```javascript
// In your webhook handler
stripe.webhooks.on('payment_intent.succeeded', async (paymentIntent) => {
  const customer = await stripe.customers.retrieve(paymentIntent.customer);
  const lineUserId = customer.metadata.line_user_id;

  // Send LINE message instead of email
  await lineClient.pushMessage(lineUserId, {
    type: 'text',
    text: `Payment successful! Amount: ${paymentIntent.amount / 100} THB`,
  });
});
```

### Optional Email Collection Flow

```javascript
// If user later provides email (e.g., wants email receipts)
async function updateCustomerEmail(stripeCustomerId, email) {
  await stripe.customers.update(stripeCustomerId, {
    email: email,
  });

  // Enable Stripe's automatic email receipts if desired
  await stripe.invoices.update(invoiceId, {
    auto_advance: true,
  });
}
```

---

## Conclusion

For FaceLink's LINE-first user base:

1. **Do NOT require email** when creating Stripe Customers
2. **Store LINE user ID in metadata** for your reference
3. **Handle all receipts/confirmations via LINE** using your own system
4. **Offer optional email collection** for users who want email receipts
5. **Keep customer data clean** - don't use fake emails

This approach aligns with FaceLink's vision of being LINE-native and eliminates friction for photographers who don't want to provide email addresses.

---

## Sources

- [Stripe API - Create a customer](https://docs.stripe.com/api/customers/create)
- [Stripe API - Update a customer](https://docs.stripe.com/api/customers/update)
- [Stripe API - The Customer object](https://docs.stripe.com/api/customers/object)
- [Stripe Documentation - Accept a payment (iOS)](https://docs.stripe.com/payments/accept-a-payment?platform=ios)
- [Stripe Documentation - Accept a payment (Android)](https://docs.stripe.com/payments/accept-a-payment?platform=android)
