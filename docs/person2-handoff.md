# Person 2 Handoff

## Backend APIs Available

- `GET /health`: service health check.
- `POST /api/orders`: create a normalized shipment order.
- `GET /api/orders`: list orders.
- `GET /api/orders/:id`: fetch one order.
- `POST /api/orders/:orderId/quotes`: run Person 1's agent chain and create a quote.
- `GET /api/orders/:orderId/quotes`: list quotes for an order.
- `POST /api/agents/triage`: run LangChain triage against structured JSON, call transcript text, or email body text.

## LangChain Status

LangChain is now implemented in Person 1's backend.

What exists:

- `src/agents/langchainAgentPipeline.js`
- LangChain `RunnableLambda` pipeline for the full quote workflow
- LangChain triage chain for raw text or structured payloads
- Optional OpenAI extraction through `@langchain/openai`
- Deterministic fallback extraction when `OPENAI_API_KEY` is not set

The quote API now runs through this LangChain runnable sequence:

```text
Triage Agent
-> Route & Capacity Agent
-> Pricing Agent
-> Load Optimization Agent
-> Quote Review Agent
```

Person 2 can use LangChain triage for email bodies or Whisper transcripts before creating an order.

Example:

```bash
curl -X POST http://localhost:3000/api/agents/triage \
  -H "Content-Type: application/json" \
  -d '{
    "transcript": "Customer: Acme Logistics. Pickup Phoenix to Los Angeles on 2026-07-16 with 1200 kg and 8 m3 cargo: electronics. Email ops@example.com"
  }'
```

Expected result:

- `extractionSource`: `langchain_heuristic` if no OpenAI key is set
- `extractionSource`: `langchain_openai` if `OPENAI_API_KEY` is set and extraction succeeds
- `triage.valid`: `true` when required shipment fields are found

Optional `.env` values:

```env
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
```

## Person 2 Work Remaining

1. Add Twilio inbound voice webhooks and send call recordings to speech processing.
2. Add Whisper transcription and transform spoken shipment details into order JSON.
3. Add Outlook IMAP email parsing and duplicate-safe order creation.
4. Call `POST /api/agents/triage` with transcript/email text to validate extraction before creating an order.
5. Add Claude Computer Use workflows for Fleetbase UI tasks not covered by REST APIs.
6. Generate customer-facing PDF quotes from approved backend quote responses.
7. Send quote emails through Outlook SMTP and log delivery status.
8. Build a basic Angular dashboard or extend the current dashboard for intake, quote status, and failures.
9. Run end-to-end tests for phone-to-order, email-to-order, quote generation, Fleetbase updates, and email delivery.

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
