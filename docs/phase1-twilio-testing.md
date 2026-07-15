# Phase 1 - Real Twilio Integration Testing Guide

## Overview

This guide walks you through testing Phase 1 (Data Ingestion Infrastructure) with real Twilio integration end-to-end.

**What we'll test:**
- Inbound phone call to Twilio number ✓
- Call recording and transcription ✓
- Order creation from transcript ✓
- Order validation and deduplication ✓
- Quote generation ✓

**Time required:** ~30 minutes setup + testing time

---

## Prerequisites

1. **Twilio Account**
   - Sign up at https://www.twilio.com/console
   - Account SID (visible in console)
   - Auth Token (visible in console)
   - Phone number (purchase or use trial number)

2. **Local Development Setup**
   - Node.js v22+
   - npm installed
   - Git configured
   - Text editor (VS Code)

3. **Public URL for Local Development**
   - ngrok (https://ngrok.com) - recommended
   - OR localtunnel (npm install -g localtunnel)
   - OR deployed server URL

4. **OpenAI API Key** (optional, for Whisper transcription)
   - Get key from https://platform.openai.com/api-keys
   - Required for speech-to-text; without it, transcription returns placeholder

5. **Database** (optional)
   - PostgreSQL running locally or accessible
   - If not set, in-memory storage is used for testing

---

## Step 1: Configure Environment Variables

### Copy and Edit .env File

```bash
cp .env.example .env
```

### Add Twilio Credentials

Edit `.env` and fill in:

```env
# Twilio Configuration
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_PHONE_NUMBER=+1234567890
TWILIO_WEBHOOK_URL=https://your-webhook-url.ngrok.io

# Optional: OpenAI for Whisper transcription
OPENAI_API_KEY=sk-xxxx...

# Optional: Database (defaults to in-memory)
DATABASE_URL=postgresql://user:password@localhost:5432/logistics_db
```

**To get Twilio credentials:**
1. Go to https://www.twilio.com/console
2. Copy "Account SID" from main dashboard
3. Click the eye icon to reveal "Auth Token"
4. Go to Phone Numbers > Manage > Active Numbers
5. Select your number (or buy one if needed) and note its E.164 format

---

## Step 2: Set Up Public Webhook URL (ngrok)

### Install ngrok

```bash
# macOS with homebrew
brew install ngrok

# or download from https://ngrok.com/download
```

### Start ngrok

```bash
ngrok http 3000
```

You'll see output like:
```
ngrok                                                  (Ctrl+C to quit)
                                                        
Session Status                online
Session Expires               2 hours, 0 minutes
Version                       3.3.5
Region                        us
Forwarding                    https://abcd-12-34-56-78.ngrok.io -> http://localhost:3000
```

**Copy the HTTPS URL** (e.g., `https://abcd-12-34-56-78.ngrok.io`)

### Update .env

```env
TWILIO_WEBHOOK_URL=https://abcd-12-34-56-78.ngrok.io
```

---

## Step 3: Configure Twilio Phone Number Webhook

### In Twilio Console

1. Go to https://www.twilio.com/console/phone-numbers/incoming
2. Click your active phone number
3. Under "Voice Configuration":
   - **A Call Comes In**: Select "Webhook"
   - **URL**: Enter `https://your-ngrok-url/api/integrations/twilio/voice-webhook`
   - **Method**: POST
   - **Fallback URL**: (leave empty for now)
4. Click "Save"

### Verify Configuration

Make a test request to your webhook:

```bash
curl -X POST https://your-ngrok-url/api/integrations/twilio/voice-webhook \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "From=%2B1234567890&To=%2B1987654321&CallSid=CA1234567890abcdef"
```

Expected response: TwiML XML with `<Say>` and `<Record>` instructions

---

## Step 4: Start the Application

### Terminal 1: Start ngrok

```bash
ngrok http 3000
```

Keep this running throughout testing.

### Terminal 2: Start the Server

```bash
cd /home/kavin/Desktop/Multi-Agent-Project
npm start
```

Expected output:
```
Logistics backend listening on port 3000
```

### Verify Server Health

```bash
curl http://localhost:3000/health
```

Expected response:
```json
{
  "status": "ok",
  "service": "multi-agent-logistics-backend"
}
```

---

## Step 5: Make a Test Call

### Call Your Twilio Number

From any phone, dial the Twilio number you configured.

### Speak Shipment Details

After the system answers, you'll hear:
> "Thank you for contacting our shipping center. Please hold while we record your shipment details."

Then speak clearly for 30+ seconds:

**Example script:**
```
"Pickup from Phoenix to Los Angeles on July 16th. 
Weight 5000 kilograms, volume 40 cubic meters. 
Cargo is electronics. Customer name is Acme Logistics."
```

**Or try:**
```
"I need to ship from Denver to Dallas. 
2500 kilos, 12 cubic meters of machinery."
```

Press `#` to end recording, or wait for automatic timeout.

### Watch Server Logs

Monitor the server terminal for:

```
Inbound call received: {
  from: '+1-caller-number',
  to: '+1-your-twilio-number',
  callSid: 'CA1234567890abcdef...',
  timestamp: '2026-07-15T...'
}

Recording completed: {
  callSid: 'CA1234567890abcdef...',
  recordingSid: 'RE1234567890abcdef...',
  recordingUrl: 'https://api.twilio.com/...'
}

Whisper transcription completed: {
  recordingSid: 'RE1234567890abcdef...',
  transcriptionLength: 246
}

Processing intake: {
  source: 'twilio_voice',
  textLength: 246,
  metadata: ['phone', 'timestamp']
}

Step 1: Running triage validation...

Triage result: {
  valid: true,
  confidence: 0.85,
  missingFields: []
}

Step 4: Checking for duplicate orders...

Step 5: Creating order...

Order created successfully: {
  orderId: '550e8400-e29b-41d4-a716-446655440000',
  status: 'sent_to_fleetbase'
}
```

---

## Step 6: Verify Order Creation

### Check All Orders

```bash
curl http://localhost:3000/api/orders
```

Expected response (sample):
```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "customer_name": "Acme Logistics",
    "customer_email": "",
    "customer_phone": "+1-caller-number",
    "origin": "Phoenix",
    "destination": "Los Angeles",
    "pickup_date": "2026-07-16",
    "weight_kg": 5000,
    "volume_m3": 40,
    "cargo_type": "electronics",
    "status": "normalized",
    "fleetbase_order_id": null,
    "created_at": "2026-07-15T...",
    "updated_at": "2026-07-15T..."
  }
]
```

### Get Specific Order

```bash
curl http://localhost:3000/api/orders/550e8400-e29b-41d4-a716-446655440000
```

---

## Step 7: Generate Quote

### Create Quote from Order

```bash
curl -X POST http://localhost:3000/api/orders/550e8400-e29b-41d4-a716-446655440000/quotes
```

Expected response:
```json
{
  "id": "660f9511-f39c-52e5-b827-557766551111",
  "order_id": "550e8400-e29b-41d4-a716-446655440000",
  "vehicle_id": "truck_001",
  "base_price": 1332.50,
  "discount_amount": 199.88,
  "final_price": 1132.62,
  "currency": "USD",
  "status": "approved",
  "created_at": "2026-07-15T...",
  "updated_at": "2026-07-15T..."
}
```

**Price breakdown:**
- Base rate: 600 km × $1.85/km = $1,110
- Weight rate: 5,000 kg × $0.18/kg = $900  
- Volume rate: 40 m³ × $12/m³ = $480
- **Total**: $2,490
- Discount (9%): -$199.88 (from load optimization)
- **Final**: $1,132.62 (capped at minimum $225)

---

## Step 8: Test Deduplication

### Make Same Call Twice

Call the same Twilio number again within 1 hour using the exact same details.

### Verify Duplicate Detection

Server logs will show:
```
Step 4: Checking for duplicate orders...

Duplicate found: 550e8400-e29b-41d4-a716-446655440000

Duplicate order detected. Skipping creation.
```

API will return:
```json
{
  "success": false,
  "status": "duplicate",
  "duplicateOrderId": "550e8400-e29b-41d4-a716-446655440000"
}
```

---

## Step 9: Test Low Confidence Extraction

### Speak Ambiguous Details

Call again and say something vague:
```
"I need to send something somewhere"
```

### Verify Manual Review Queue

Server logs will show:
```
Triage result: {
  valid: false,
  confidence: 0.35,
  missingFields: ['pickup', 'dropoff', 'weight', 'volume']
}

Triage validation failed or low confidence. Flagging for manual review.

Stored for manual review: {
  source: 'twilio_voice',
  status: 'requires_review',
  reason: 'invalid_extraction'
}
```

API response:
```json
{
  "success": false,
  "status": "requires_review",
  "reason": "invalid_extraction"
}
```

---

## Step 10: Email Integration Testing (Optional)

### Configure Outlook IMAP

Add to `.env`:
```env
OUTLOOK_EMAIL=your-email@outlook.com
OUTLOOK_PASSWORD=your-app-password
IMAP_POLLING_INTERVAL_MS=300000
```

**Note:** Use an [app-specific password](https://support.microsoft.com/en-us/account-billing/using-app-passwords-with-accounts-that-have-two-step-verification-enabled-097b67a2-892a-8dec-1d18-9f7680cc936e) for Outlook, not your main password.

### Start Email Polling

```bash
curl -X POST http://localhost:3000/api/intake/start-email-polling
```

### Send Test Email

Send an email to your configured Outlook address:

```
Subject: Quote Request

Hi,
I need to ship 3000 kg from Chicago to Houston.
Volume is about 20 cubic meters.
Cargo: machinery

Thanks
```

### Check for Order

Within 5 minutes (or next polling interval), run:

```bash
curl http://localhost:3000/api/orders
```

You should see a new order created from the email!

---

## Troubleshooting

### Issue: Webhook Not Receiving Calls

**Check:**
- [ ] ngrok is running: `ngrok http 3000`
- [ ] Webhook URL in Twilio matches ngrok URL
- [ ] Server is running: `npm start`
- [ ] Firewall allows HTTPS port 443

**Test:**
```bash
curl -v -X POST https://your-ngrok-url/api/integrations/twilio/voice-webhook \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "From=%2B1234567890&CallSid=CA123"
```

Should return HTTP 200 with TwiML XML.

### Issue: Recording Not Transcribed

**Check:**
- [ ] Recording completed webhook was received (check logs)
- [ ] OPENAI_API_KEY is set (or fallback is used)
- [ ] Audio quality is good (clear speech, no heavy background noise)

**Log message without OpenAI key:**
```
OpenAI API key not configured. Using fallback transcription.
```

### Issue: Triage Confidence Too Low

**Solution:**
Speak more clearly with complete shipment information:
- "Pickup city" and "Dropoff city"
- "Weight in kilograms" and "Volume in cubic meters"
- "Cargo type"

**Example of good input:**
```
"Pickup from Phoenix Arizona to Los Angeles California on July 20th.
Weight is 5000 kilograms. Volume is 40 cubic meters.
Cargo is electronics."
```

### Issue: Order Not Created (Database Error)

**Check:**
- [ ] If DATABASE_URL is set, PostgreSQL is running
- [ ] Database has required tables: `psql -c "\dt"`
- [ ] Run schema migration: `npm run db:migrate`

If using in-memory mode (no DATABASE_URL), orders are stored in memory and lost on restart.

### Issue: Duplicate Order Incorrectly Detected

**Note:** Deduplication checks for same caller phone + within 1 hour window.

**Reset for testing:**
- Call from different phone number
- Or wait 1+ hour
- Or change origin/destination slightly

---

## Monitoring & Debugging

### Watch Real-Time Logs

```bash
npm run dev
```

Logs include timestamps and module names for debugging.

### Check Endpoint Status

```bash
# Health check
curl http://localhost:3000/health

# List all orders
curl http://localhost:3000/api/orders

# Get specific order
curl http://localhost:3000/api/orders/{id}

# Get order quotes
curl http://localhost:3000/api/orders/{id}/quotes

# Intake status
curl http://localhost:3000/api/intake/status
```

### Enable Detailed Logging

Set environment variable:
```bash
DEBUG=* npm start
```

---

## Next Steps After Testing

1. **Phase 4: PDF Quote Generation**
   - Generate customer-facing PDFs from approved quotes
   - Add branding and terms

2. **Email Delivery**
   - Send quote PDFs via Outlook SMTP
   - Track delivery status with retries

3. **Dashboard**
   - Build monitoring UI for orders, quotes, delivery status
   - Real-time updates on intake metrics

4. **Production Deployment**
   - Deploy to staging/production server
   - Set up monitoring and alerting
   - Configure database backups

---

## Files Modified for Twilio Testing

- `src/config/env.js` - Added Twilio configuration
- `automation/twilio/voiceWebhookHandler.js` - Webhook implementation
- `src/routes/integrationsRoutes.js` - Twilio endpoints
- `src/controllers/integrationsController.js` - Webhook handlers
- `.env.example` - Template with Twilio vars

---

## Quick Reference Commands

```bash
# Start server
npm start

# Start with live reload
npm run dev

# Start ngrok in new terminal
ngrok http 3000

# Test webhook
curl -X POST http://localhost:3000/api/integrations/twilio/voice-webhook \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "From=%2B1234567890&To=%2B0987654321&CallSid=CA123"

# List orders
curl http://localhost:3000/api/orders

# Create quote
curl -X POST http://localhost:3000/api/orders/{order-id}/quotes

# Start email polling
curl -X POST http://localhost:3000/api/intake/start-email-polling

# Stop email polling
curl -X POST http://localhost:3000/api/intake/stop-email-polling
```

---

## Success Criteria

✅ Test passed if:
- [ ] Inbound call is received by webhook
- [ ] Call recording is processed
- [ ] Transcript is cleaned
- [ ] Order is created with correct fields
- [ ] Quote is generated with correct pricing
- [ ] Duplicate order is rejected
- [ ] Low-confidence extraction is flagged
- [ ] All server logs show successful flow
- [ ] API returns correct JSON responses

Congratulations! Phase 1 is working end-to-end! 🎉
