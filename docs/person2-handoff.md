# Person 2 Handoff

## Backend APIs Available

- `GET /health`: service health check.
- `POST /api/orders`: create a normalized shipment order.
- `GET /api/orders`: list orders.
- `GET /api/orders/:id`: fetch one order.
- `POST /api/orders/:orderId/quotes`: run Person 1's agent chain and create a quote.
- `GET /api/orders/:orderId/quotes`: list quotes for an order.

## Person 2 Work Remaining

1. Add Twilio inbound voice webhooks and send call recordings to speech processing.
2. Add Whisper transcription and transform spoken shipment details into order JSON.
3. Add Outlook IMAP email parsing and duplicate-safe order creation.
4. Add Claude Computer Use workflows for Fleetbase UI tasks not covered by REST APIs.
5. Generate customer-facing PDF quotes from approved backend quote responses.
6. Send quote emails through Outlook SMTP and log delivery status.
7. Build a basic Angular monitoring dashboard for orders, quotes, review status, and failures.
8. Run end-to-end tests for phone-to-order, email-to-order, quote generation, Fleetbase updates, and email delivery.

## Expected Order Payload

```json
{
  "customer": {
    "name": "Acme Logistics",
    "email": "ops@example.com"
  },
  "shipment": {
    "pickup": "Phoenix",
    "dropoff": "Los Angeles",
    "pickupDate": "2026-07-16",
    "weight": "2500 kg",
    "volume": "12.5 m3",
    "commodity": "electronics"
  }
}
```
