CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY,
  customer_name TEXT NOT NULL,
  customer_email TEXT,
  origin TEXT NOT NULL,
  destination TEXT NOT NULL,
  pickup_date DATE,
  delivery_date DATE,
  weight_kg NUMERIC(10, 2) NOT NULL DEFAULT 0,
  volume_m3 NUMERIC(10, 2) NOT NULL DEFAULT 0,
  cargo_type TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  raw_request JSONB NOT NULL DEFAULT '{}'::jsonb,
  normalized_request JSONB NOT NULL DEFAULT '{}'::jsonb,
  fleetbase_order_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS quotes (
  id UUID PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  vehicle_id TEXT,
  base_price NUMERIC(10, 2) NOT NULL,
  discount_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
  final_price NUMERIC(10, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'draft',
  review_notes JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_quotes_order_id ON quotes(order_id);
