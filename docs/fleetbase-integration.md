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

2. Start Fleetbase containers:

```bash
npm run fleetbase:start
```

This initializes the top-level Fleetbase submodule without trying to clone
Fleetbase's optional nested package submodules over SSH.

3. Run the first-time Fleetbase setup:

```bash
npm run fleetbase:setup
```

This command:

- creates missing Fleetbase environment files
- sets a local Fleetbase app key
- uses `127.0.0.1` instead of `localhost` to avoid Fleetbase's local domain bug
- stores MySQL data in a Docker named volume instead of a macOS bind mount
- creates the required `fleetbase` and `fleetbase_storefront` databases
- runs Fleetbase migrations and seeders
- creates a local admin account
- creates a Fleetbase API key for this backend
- writes that API key to this project's `.env`

4. Open Fleetbase Console:

```text
http://localhost:4200
```

Local Fleetbase login:

```text
Email: admin@example.com
Password: Fleetbase2026!
```

5. Confirm this backend is configured in `.env`:

```env
FLEETBASE_BASE_URL=http://localhost:8000
FLEETBASE_API_KEY=flb_live_...
FLEETBASE_ORDER_ENDPOINT=/v1/orders
```

6. Start this project:

```bash
npm start
```

7. Open the dark operations console:

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
npm run fleetbase:setup
npm run fleetbase:status
npm run fleetbase:logs
npm run fleetbase:stop
```

## Important Note About API Routes

Fleetbase is a full Laravel-based platform with extensions and configurable
resources. If your local Fleetbase instance exposes order creation at a route
different from `/orders`, change:

```env
FLEETBASE_ORDER_ENDPOINT=/v1/orders
```

The backend does not hard-code a route beyond this default, so you can align it
with the route/token created in your Fleetbase instance.
