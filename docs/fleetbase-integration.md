# Fleetbase Integration Guide

Fleetbase is included in this project as a Git submodule at:

```text
external/fleetbase
```

It is not copied directly into this repository because Fleetbase is a full
platform with its own API, console, Docker stack, database, queue, cache, and
socket services. A submodule pins the Fleetbase source while keeping this
project clean and updateable.

## Services and Ports

When Fleetbase is running through its Docker Compose stack:

- Fleetbase Console: `http://localhost:4200`
- Fleetbase API: `http://localhost:8000`
- This project frontend/backend: `http://localhost:3000`

## Step-by-Step Local Setup

1. Install prerequisites:

```bash
node --version
docker --version
docker compose version
```

2. Initialize Fleetbase:

```bash
npm run fleetbase:start
```

This initializes the top-level Fleetbase submodule without trying to clone
Fleetbase's optional nested package submodules over SSH.

3. Create Fleetbase environment files:

```bash
cp external/fleetbase/api/.env.example external/fleetbase/api/.env
cp external/fleetbase/docker-compose.override.yml.example external/fleetbase/docker-compose.override.yml
```

The command also creates these files for you if they are missing.

4. Start Fleetbase if it is not already running:

```bash
npm run fleetbase:start
```

5. Open Fleetbase Console:

```text
http://localhost:4200
```

6. Configure this backend to talk to Fleetbase in `.env`:

```env
FLEETBASE_BASE_URL=http://localhost:8000
FLEETBASE_API_KEY=your-fleetbase-api-token
FLEETBASE_ORDER_ENDPOINT=/orders
```

7. Start this project:

```bash
npm start
```

8. Open the dark operations console:

```text
http://localhost:3000
```

## How the Integration Works

1. A user creates an order in this project's dark frontend.
2. `POST /api/orders` normalizes the shipment payload.
3. `FleetbaseClient.createOrder()` sends the normalized shipment to Fleetbase
   using `FLEETBASE_BASE_URL`, `FLEETBASE_API_KEY`, and `FLEETBASE_ORDER_ENDPOINT`.
4. If Fleetbase returns an order id, this backend stores it as
   `fleetbaseOrderId` and marks the order as `sent_to_fleetbase`.
5. The quote flow can then run:

```text
Triage Agent
-> Route & Capacity Agent
-> Pricing Agent
-> Load Optimization Agent
-> Quote Review Agent
```

6. Person 2 can automate Fleetbase UI gaps using Claude Computer Use in
   `automation/fleetbase_automation/`.

## Useful Commands

```bash
npm run fleetbase:start
npm run fleetbase:status
npm run fleetbase:logs
npm run fleetbase:stop
```

## Important Note About API Routes

Fleetbase is a full Laravel-based platform with extensions and configurable
resources. If your local Fleetbase instance exposes order creation at a route
different from `/orders`, change:

```env
FLEETBASE_ORDER_ENDPOINT=/orders
```

The backend does not hard-code a route beyond this default, so you can align it
with the route/token created in your Fleetbase instance.
