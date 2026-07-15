# Phase 1 - Twilio Testing Quick Reference

## Prerequisites Checklist
- [ ] Twilio account with phone number
- [ ] TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN from Twilio Console
- [ ] ngrok installed and running: `ngrok http 3000`
- [ ] Server running: `npm start`
- [ ] OpenAI API key (optional, for Whisper transcription)

---

## 5-Minute Quick Start

### 1. Configure Credentials
```bash
cp .env.example .env
# Edit .env with Twilio credentials
```

### 2. Start Services
```bash
# Terminal 1: ngrok tunnel
ngrok http 3000

# Terminal 2: Application server
npm start
```

### 3. Update Twilio Webhook
In Twilio Console → Phone Numbers → Your Number:
- **A Call Comes In**: Webhook
- **URL**: `https://your-ngrok-url/api/integrations/twilio/voice-webhook`
- **Method**: POST

### 4. Make a Call
Call your Twilio number and speak shipment details

### 5. Check Order
```bash
curl http://localhost:3000/api/orders
```

---

## Test Commands

### Validate Setup
```bash
node validate-twilio-setup.js
```

### Health Check
```bash
curl http://localhost:3000/health
```

### List All Orders
```bash
curl http://localhost:3000/api/orders
```

### Get Order Details
```bash
curl http://localhost:3000/api/orders/{order-id}
```

### Generate Quote
```bash
curl -X POST http://localhost:3000/api/orders/{order-id}/quotes
```

### Start Email Polling (if configured)
```bash
curl -X POST http://localhost:3000/api/intake/start-email-polling
```

### Process Email Intake
```bash
curl -X POST http://localhost:3000/api/intake/email \
  -H "Content-Type: application/json" \
  -d '{
    "from": "customer@example.com",
    "subject": "Quote Request",
    "text": "Pickup Phoenix to LA, 5000kg, 40m3, electronics"
  }'
```

### Test Webhook Directly
```bash
curl -X POST http://localhost:3000/api/integrations/twilio/voice-webhook \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "From=%2B1234567890&To=%2B0987654321&CallSid=CA123456"
```

---

## Example Shipment Details (for test calls)

**Option 1: Electronics**
```
"Pickup from Phoenix to Los Angeles on July 16th.
Weight 5000 kilograms, volume 40 cubic meters.
Electronics cargo. Company is Acme Logistics."
```

**Option 2: Machinery**
```
"From Denver to Dallas on July 20th.
2500 kilograms, 15 cubic meters of machinery."
```

**Option 3: General Cargo**
```
"Ship from Chicago to Houston.
Weight 3000 kg, volume 25 cubic meters."
```

---

## Common Issues & Solutions

| Issue | Solution |
|-------|----------|
| Webhook not receiving calls | Check ngrok URL matches in Twilio console |
| No transcription | Check OPENAI_API_KEY is set (or confirm fallback is used) |
| Order not created | Check server logs for triage confidence (needs > 0.6) |
| Duplicate rejected | Call from different phone or wait 1 hour |
| DB errors | Set DATABASE_URL or confirm DB is running |
| Low confidence | Speak more clearly with complete details |

---

## What Each Component Does

```
Phone Call
    ↓
Twilio Webhook → voiceWebhookHandler
    ↓
TwiML Response (record audio)
    ↓
Recording Completes → whisperService
    ↓
Whisper API (audio → text)
    ↓
Order Intake Service
    ├─ Triage Agent (validate shipment)
    ├─ Extract Shipment Data
    ├─ Deduplicate Check
    └─ Create Order
    ↓
Order in Database ✅
```

---

## Server Log Key Messages

Watch for these in server logs:

| Message | Meaning |
|---------|---------|
| `Inbound call received` | Webhook is working |
| `Recording completed` | Twilio got the audio |
| `Whisper transcription completed` | Speech-to-text succeeded |
| `Step 1: Running triage validation` | Intake started |
| `Triage result: valid: true, confidence: X.XX` | Extraction succeeded |
| `Order created successfully` | Order in database ✅ |
| `Duplicate found` | Order already exists (dedup working) |
| `requires_review` | Low confidence, needs manual review |

---

## Environment Variables Reference

### Required for Twilio
```env
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_PHONE_NUMBER=+1234567890
TWILIO_WEBHOOK_URL=https://your-webhook-url
```

### Optional but Recommended
```env
OPENAI_API_KEY=sk-xxxx...                    # For Whisper transcription
DATABASE_URL=postgresql://user:pass@host/db # For order persistence
IMAP_POLLING_INTERVAL_MS=300000              # Email polling interval (ms)
```

### Optional: Email Configuration
```env
OUTLOOK_EMAIL=your-email@outlook.com
OUTLOOK_PASSWORD=your-app-password
IMAP_SERVER=imap-mail.outlook.com
```

---

## Success Criteria

Test is successful when:
- ✅ Call received by webhook (log message)
- ✅ Recording processed (log message)
- ✅ Transcription completed (server log)
- ✅ Order created (check `/api/orders`)
- ✅ Quote generated (check quotes response)
- ✅ Price calculated correctly
- ✅ Duplicate detected on second call

---

## ngrok Quick Reference

### Start ngrok
```bash
ngrok http 3000
```

### Output Example
```
Forwarding: https://abcd-1234-56-78.ngrok.io -> http://localhost:3000
```

### Use URL
Copy the HTTPS URL to:
1. `.env` → `TWILIO_WEBHOOK_URL`
2. Twilio Console → Phone Number → Webhook URL

### Important
- ngrok session expires every 2 hours
- Need to restart and update webhook URL
- Perfect for development, not production

---

## Useful Resources

- [Twilio Console](https://www.twilio.com/console)
- [Twilio Phone Numbers](https://www.twilio.com/console/phone-numbers)
- [ngrok Download](https://ngrok.com/download)
- [TwiML Reference](https://www.twilio.com/docs/voice/twiml)
- [OpenAI Whisper API](https://platform.openai.com/docs/guides/speech-to-text)
- [Phase 1 Full Testing Guide](./PHASE1_TWILIO_TESTING.md)

---

## Troubleshooting Help

**Need detailed help?**
```bash
# Read full testing guide
cat PHASE1_TWILIO_TESTING.md

# Run validation
node validate-twilio-setup.js

# Check server logs
npm run dev
```

**Still stuck?**
- Check logs for error messages
- Verify all credentials in `.env`
- Confirm ngrok URL is public and matches
- Try test webhook command above
