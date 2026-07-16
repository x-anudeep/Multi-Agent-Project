CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY,
  customer_name TEXT NOT NULL,
  customer_email TEXT,
  customer_phone TEXT,
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
  verified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Safe to re-run against a database that already has the orders table
-- from before this column existed.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS verified BOOLEAN NOT NULL DEFAULT false;

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

-- Speech transcription records for tracking Whisper transcriptions
CREATE TABLE IF NOT EXISTS speech_transcriptions (
  id UUID PRIMARY KEY,
  recording_sid TEXT NOT NULL UNIQUE,
  call_sid TEXT,
  caller_phone TEXT,
  raw_transcript TEXT,
  cleaned_transcript TEXT,
  source TEXT NOT NULL DEFAULT 'twilio_voice',
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Delivery logs for tracking email and notification delivery
CREATE TABLE IF NOT EXISTS delivery_logs (
  id UUID PRIMARY KEY,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  quote_id UUID REFERENCES quotes(id) ON DELETE SET NULL,
  recipient_email TEXT NOT NULL,
  delivery_type TEXT NOT NULL DEFAULT 'email',
  subject TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  last_attempt_at TIMESTAMPTZ,
  last_error TEXT,
  delivered_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Manual review queue for orders/transcriptions that need human review
CREATE TABLE IF NOT EXISTS order_review_queue (
  id UUID PRIMARY KEY,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  transcription_id UUID REFERENCES speech_transcriptions(id) ON DELETE SET NULL,
  review_type TEXT NOT NULL DEFAULT 'extraction_validation',
  reason TEXT NOT NULL,
  raw_data JSONB NOT NULL,
  triage_result JSONB,
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT,
  review_notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Pending registrations: correlates a "no phone match" caller's SMS
-- registration link back to the order/quote it should attach an email to.
CREATE TABLE IF NOT EXISTS pending_registrations (
  token UUID PRIMARY KEY,
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_quotes_order_id ON quotes(order_id);
CREATE INDEX IF NOT EXISTS idx_speech_transcriptions_recording_sid ON speech_transcriptions(recording_sid);
CREATE INDEX IF NOT EXISTS idx_speech_transcriptions_status ON speech_transcriptions(status);
CREATE INDEX IF NOT EXISTS idx_delivery_logs_order_id ON delivery_logs(order_id);
CREATE INDEX IF NOT EXISTS idx_delivery_logs_status ON delivery_logs(status);
CREATE INDEX IF NOT EXISTS idx_order_review_queue_status ON order_review_queue(status);
CREATE INDEX IF NOT EXISTS idx_pending_registrations_order_id ON pending_registrations(order_id);
