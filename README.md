# AI-Powered Multi-Agent Logistics Automation System

This project is a logistics quotation system that connects a Node.js backend, a dark operations frontend, Fleetbase, and a chain of backend agents for shipment validation, route/capacity checks, pricing, load optimization, and quote review.

Person 1's backend work is complete. Person 2 should now finish the automation layer that turns phone calls and emails into backend orders, generates customer quote PDFs, sends emails, and validates the full end-to-end workflow.

## Working Links

After starting the project, open:

- Main frontend: `http://localhost:3000`
- Backend health: `http://localhost:3000/health`
- Fleetbase status API: `http://localhost:3000/api/integrations/fleetbase/status`
- Fleetbase Console: `http://localhost:4200`
- Fleetbase API: `http://localhost:8000`

Fleetbase local login:

```text
Email: admin@example.com
Password: Fleetbase2026!
```

## Quick Start

Install dependencies:

```bash
npm install
```

Start Colima/Docker:

```bash
colima start
```

Start and prepare Fleetbase:

```bash
npm run fleetbase:start
npm run fleetbase:setup
```

Start this backend/frontend:

```bash
npm start
```

If `npm start` says `EADDRINUSE: address already in use :::3000`, the app is already running. Check it with:

```bash
lsof -i :3000 -P -n
curl http://localhost:3000/health
```

Stop the old server if needed:

```bash
kill <PID>
npm start
```

## What Person 1 Completed

Person 1 completed the backend, agent logic, Fleetbase connection, frontend testing console, and local setup automation.

Completed items:

- Node.js and Express backend
- Dark mode operations frontend served from `http://localhost:3000`
- Order creation API
- Order listing API
- Quote generation API
- Shipment normalization
- Fleetbase Git submodule integration at `external/fleetbase`
- Fleetbase local Docker setup automation
- Fleetbase API key generation for local development
- Fleetbase order sync through `POST /v1/orders`
- LangChain runnable pipeline for backend agents
- LangChain triage endpoint for structured payloads, email text, and call transcripts
- Optional OpenAI extraction through `@langchain/openai`
- Triage Agent
- Route and Capacity Agent
- Pricing Agent
- Load Optimization Agent
- Quote Review Agent
- Backend test coverage for normalization and agent logic
- Person 2 automation skeleton folders
- Person 2 handoff documentation

Important files:

- Backend entry: `src/server.js`
- Express app: `src/app.js`
- Frontend: `public/index.html`, `public/app.js`, `public/styles.css`
- Agents: `src/agents/`
- Fleetbase client: `src/services/fleetbaseClient.js`
- Order service: `src/services/orderService.js`
- Quote service: `src/services/quoteService.js`
- Fleetbase setup guide: `docs/fleetbase-integration.md`
- Person 2 handoff: `docs/person2-handoff.md`

## What Person 2 Must Finish

Person 2 owns the customer workflow and automation layer around Person 1's backend.

Required remaining work:

1. Twilio voice integration
   - Add inbound call webhook handlers.
   - Capture caller metadata and recordings.
   - Send recordings to speech processing.

2. Speech-to-text processing
   - Use OpenAI Whisper or another STT service.
   - Convert phone call audio into text.
   - Extract shipment fields from spoken requests.

3. Email parser
   - Connect Outlook IMAP or Microsoft Graph.
   - Read incoming shipment request emails.
   - Extract customer, origin, destination, cargo, weight, volume, pickup date, and email.
   - Prevent duplicate order creation.

4. Backend integration
   - Submit cleaned phone/email payloads to `POST /api/orders`.
   - Trigger quote generation with `POST /api/orders/:orderId/quotes`.
   - Handle validation errors and manual review cases.

5. PDF quote generation
   - Use PDFKit or another PDF generator.
   - Turn approved quote responses into customer-facing PDF quotations.
   - Include price, discount, route, shipment details, and quote status.

6. Email automation
   - Use Outlook SMTP, Microsoft Graph, or SMTP credentials.
   - Send approved quote PDFs to customers.
   - Log delivery success/failure.

7. Human review workflow
   - If quote status is `requires_manual_review`, do not email automatically.
   - Add a way to approve/reject/send manually.

8. Fleetbase UI automation if needed
   - Use Claude Computer Use only for Fleetbase steps not available through API.
   - Keep API integration as the preferred path.

9. Monitoring/dashboard improvements
   - Add a basic view for phone/email intake status.
   - Show failed parsing attempts.
   - Show quote delivery status.

10. End-to-end testing
   - Test phone-to-order.
   - Test email-to-order.
   - Test order-to-Fleetbase.
   - Test quote-to-PDF.
   - Test PDF-to-customer-email.

Automation skeleton folders are already created:

```text
automation/
├── dashboard/
├── email_automation/
├── email_parser/
├── fleetbase_automation/
├── pdf_quotes/
├── speech_processing/
└── twilio/
```

## API Endpoints

Health:

```http
GET /health
```

Fleetbase status:

```http
GET /api/integrations/fleetbase/status
```

Orders:

```http
POST /api/orders
GET /api/orders
GET /api/orders/:id
```

Quotes:

```http
POST /api/orders/:orderId/quotes
GET /api/orders/:orderId/quotes
```

Agents:

```http
POST /api/agents/triage
```

## Example Order Payload

Person 2 should send cleaned phone/email data to the backend in this shape:

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
    "weight": "1200 kg",
    "volume": "8 m3",
    "commodity": "electronics"
  }
}
```

Create an order:

```bash
curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -d '{
    "customer": {
      "name": "Acme Logistics",
      "email": "ops@example.com"
    },
    "shipment": {
      "pickup": "Phoenix",
      "dropoff": "Los Angeles",
      "pickupDate": "2026-07-16",
      "weight": "1200 kg",
      "volume": "8 m3",
      "commodity": "electronics"
    }
  }'
```

Expected result:

- Backend order is created.
- Fleetbase order is created.
- Response includes `fleetbaseOrderId`.
- Order status becomes `sent_to_fleetbase`.

Generate quote:

```bash
curl -X POST http://localhost:3000/api/orders/<ORDER_ID>/quotes
```

Expected result:

- Quote is created.
- Agent output is returned.
- Approved quotes have status `approved`.

## How The Agents Work

The current agents are real backend logic and are orchestrated through a LangChain runnable pipeline.

The core business logic is deterministic and rule-based so the project works locally without an API key. If `OPENAI_API_KEY` is set, the triage chain can use `@langchain/openai` to extract shipment fields from raw email or transcript text. If no key is set, the chain uses a local heuristic extractor.

LangChain file:

```text
src/agents/langchainAgentPipeline.js
```

Optional `.env` values:

```env
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
```

Person 2 can test transcript/email triage with:

```bash
curl -X POST http://localhost:3000/api/agents/triage \
  -H "Content-Type: application/json" \
  -d '{
    "transcript": "Customer: Acme Logistics. Pickup Phoenix to Los Angeles on 2026-07-16 with 1200 kg and 8 m3 cargo: electronics. Email ops@example.com"
  }'
```

### 1. Triage Agent

File: `src/agents/triageAgent.js`

Responsibilities:

- Normalize shipment payload.
- Convert values like `"1200 kg"` into `1200`.
- Check required fields.
- Return missing fields when order data is incomplete.
- Decide next action:
  - `route_capacity_check`
  - `request_missing_information`

### 2. Route and Capacity Agent

File: `src/agents/routeCapacityAgent.js`

Responsibilities:

- Check if a route is supported.
- Check vehicle remaining weight capacity.
- Check vehicle remaining volume capacity.
- Select a compatible vehicle.
- Reject unsupported routes or overloaded shipments.

### 3. Pricing Agent

File: `src/agents/pricingAgent.js`

Responsibilities:

- Estimate route distance.
- Apply per-km pricing.
- Apply weight pricing.
- Apply volume pricing.
- Enforce minimum quote amount.

### 4. Load Optimization Agent

File: `src/agents/loadOptimizationAgent.js`

Responsibilities:

- Check spare vehicle capacity.
- Calculate controlled spare-capacity discount.
- Cap discount to business-safe limits.
- Produce final optimized price.

### 5. Quote Review Agent

File: `src/agents/quoteReviewAgent.js`

Responsibilities:

- Validate capacity.
- Validate minimum margin.
- Validate discount limit.
- Approve quote or send to manual review.

## Test Cases

Run automated tests:

```bash
npm test
```

Manual test 1, backend health:

```bash
curl http://localhost:3000/health
```

Manual test 2, Fleetbase connection:

```bash
curl http://localhost:3000/api/integrations/fleetbase/status
```

Manual test 3, create valid order:

```bash
curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -d '{
    "customer": {
      "name": "Valid Order",
      "email": "valid@example.com"
    },
    "shipment": {
      "pickup": "Phoenix",
      "dropoff": "Los Angeles",
      "pickupDate": "2026-07-16",
      "weight": "1200 kg",
      "volume": "8 m3",
      "commodity": "electronics"
    }
  }'
```

Manual test 4, invalid order:

```bash
curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -d '{
    "customer": {
      "name": "Invalid Order"
    },
    "shipment": {
      "pickup": "Phoenix"
    }
  }'
```

Expected: missing required shipment fields.

Manual test 5, unsupported route:

```bash
curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -d '{
    "customer": {
      "name": "Unsupported Route",
      "email": "route@example.com"
    },
    "shipment": {
      "pickup": "Miami",
      "dropoff": "Seattle",
      "weight": "1000 kg",
      "volume": "5 m3",
      "commodity": "furniture"
    }
  }'
```

Then generate a quote for the returned order id. Expected: no compatible vehicle capacity is available.

## Fleetbase Notes

Fleetbase is included as a Git submodule:

```text
external/fleetbase
```

The setup command handles local Fleetbase fixes:

- uses `127.0.0.1` internally to avoid a Fleetbase local domain parsing issue
- uses a Docker named volume for MySQL data
- creates `fleetbase` and `fleetbase_storefront` databases
- runs migrations and seeders
- creates local admin credentials
- creates and writes a Fleetbase API key to `.env`

Fleetbase setup details:

```text
docs/fleetbase-integration.md
```

## Phone-to-Email Quote Matching

Inbound calls are matched against a CSV of known customers (`data/customers.csv`, gitignored -- copy `data/customers.example.csv` and fill in real rows locally, path configurable via `CUSTOMER_CSV_PATH`):

- **Match found**: the caller's email is attached to the order at creation time, so the auto-generated quote is emailed immediately.
- **No match**: the order and quote are still created, but delivery is held (no recipient email yet). The caller is told by voice to text the messaging number; texting in looks up their pending registration and replies with a link (`/register/:token`) to submit name/email/phone, which attaches the email to the order and resends the held quote.

### Known Issue: Twilio Trial Messaging Is Blocked

The SMS half of this flow (texting the registration link) is fully implemented and covered by automated tests, but **could not be demoed live** on the current Twilio trial account. Both directions fail, for two separate reasons:

- `TWILIO_PHONE_NUMBER` (a toll-free number) needs **Toll-Free Verification** before it can send any SMS. Until verified, Twilio's Console routes messaging tests to a separate auto-assigned sandbox number instead.
- That sandbox number is a regular 10DLC local number, and **trial accounts cannot register for A2P 10DLC**. US carriers silently filter unregistered A2P traffic on 10DLC numbers at the network level -- this blocks both proactive (`messages.create()`) sends and TwiML `<Message>` replies equally, with no error surfaced back through Twilio's API.

This is a carrier/account-level compliance restriction, not a bug -- the CSV-match path (call in with a number that's in `customers.csv`) was demoed live end-to-end, including a real email delivery. Fixing SMS delivery requires completing Toll-Free Verification or upgrading off trial and completing A2P 10DLC registration; both are outside a coding session and are left for later.

## Tech Stack

Implemented:

- Node.js
- Express.js
- HTML/CSS/JavaScript frontend
- LangChain
- Optional OpenAI model integration
- Fleetbase
- Docker/Colima
- REST APIs
- Node test runner

Planned or Person 2-owned:

- Twilio
- OpenAI Whisper
- Outlook SMTP/IMAP or Microsoft Graph
- PDFKit
- Claude Computer Use
- Angular dashboard improvements, if required

## Current Status

Person 1 is complete.

Person 2 should start from `automation/` and connect phone/email/PDF/email delivery around the existing backend APIs.

## Person 2 Final Handoff

This is the section Person 2 should follow to download, run, and finish the project.

### Download The Project

Clone the repository:

```bash
git clone https://github.com/x-anudeep/Multi-Agent-Project.git
cd Multi-Agent-Project
```

Initialize the Fleetbase submodule:

```bash
git submodule update --init --recursive
```

Install Node dependencies:

```bash
npm install
```

### Start The Project

Start Docker/Colima:

```bash
colima start
```

Start Fleetbase:

```bash
npm run fleetbase:start
```

Prepare local Fleetbase login, roles, database setup, and API key:

```bash
npm run fleetbase:setup
```

Start Person 1's backend and frontend:

```bash
npm start
```

Open these links:

- Main project frontend: `http://localhost:3000`
- Backend health check: `http://localhost:3000/health`
- Fleetbase Console: `http://localhost:4200`
- Fleetbase API: `http://localhost:8000`

Fleetbase login:

```text
Email: admin@example.com
Password: Fleetbase2026!
```

If port `3000` is already in use:

```bash
lsof -i :3000 -P -n
kill <PID>
npm start
```

### Confirm It Works

Run automated tests:

```bash
npm test
```

Check backend health:

```bash
curl http://localhost:3000/health
```

Check Fleetbase connection:

```bash
curl http://localhost:3000/api/integrations/fleetbase/status
```

Test LangChain triage with raw text:

```bash
curl -X POST http://localhost:3000/api/agents/triage \
  -H "Content-Type: application/json" \
  -d '{
    "transcript": "Customer: Acme Logistics. Pickup Phoenix to Los Angeles on 2026-07-16 with 1200 kg and 8 m3 cargo: electronics. Email ops@example.com"
  }'
```

Create an order:

```bash
curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -d '{
    "customer": {
      "name": "Acme Logistics",
      "email": "ops@example.com"
    },
    "shipment": {
      "pickup": "Phoenix",
      "dropoff": "Los Angeles",
      "pickupDate": "2026-07-16",
      "weight": "1200 kg",
      "volume": "8 m3",
      "commodity": "electronics"
    }
  }'
```

Use the returned order id to generate a quote:

```bash
curl -X POST http://localhost:3000/api/orders/<ORDER_ID>/quotes
```

The quote response should include:

- `orchestration: "langchain_runnable_pipeline"`
- `agents.triage`
- `agents.routeCapacity`
- `agents.pricing`
- `agents.loadOptimization`
- `agents.review`

### What Person 1 Already Finished

Person 1 completed:

- Node/Express backend
- Dark frontend at `http://localhost:3000`
- Fleetbase submodule integration
- Fleetbase local Docker setup and API key setup
- Order creation and listing APIs
- Fleetbase order sync
- Quote generation API
- LangChain orchestration for the backend agent pipeline
- LangChain triage endpoint for email/call transcript text
- Optional OpenAI extraction through `OPENAI_API_KEY`
- Triage, route/capacity, pricing, load optimization, and quote review agents
- Automated tests for normalizer, agents, and LangChain pipeline
- Skeleton folders under `automation/`

### What Person 2 Must Add

Person 2 should add new work inside the existing `automation/` folders:

```text
automation/
├── dashboard/
├── email_automation/
├── email_parser/
├── fleetbase_automation/
├── pdf_quotes/
├── speech_processing/
└── twilio/
```

Required Person 2 tasks:

1. Add Twilio inbound voice webhooks in `automation/twilio/`.
2. Send call recordings to `automation/speech_processing/`.
3. Use Whisper or another speech-to-text service to create transcripts.
4. Send transcripts to `POST /api/agents/triage`.
5. Convert valid triage output into `POST /api/orders`.
6. Connect Outlook IMAP, SMTP, or Microsoft Graph in `automation/email_parser/` and `automation/email_automation/`.
7. Parse shipment request emails and prevent duplicate orders.
8. Generate quotes through `POST /api/orders/:orderId/quotes`.
9. Build customer-facing PDF quotes in `automation/pdf_quotes/`.
10. Email approved quote PDFs to customers.
11. Hold `requires_manual_review` quotes for human approval instead of sending automatically.
12. Add Fleetbase UI automation in `automation/fleetbase_automation/` only for steps not covered by Fleetbase APIs.
13. Add intake, quote, and delivery status views in `automation/dashboard/` or extend the current frontend.
14. Add end-to-end tests for phone-to-order, email-to-order, order-to-Fleetbase, quote-to-PDF, and PDF-to-email.

Person 2 should treat Person 1's backend APIs as the source of truth and build automation around them instead of replacing them.

## License

This project is developed for academic purposes as a demonstration of an AI-powered multi-agent logistics automation system.
