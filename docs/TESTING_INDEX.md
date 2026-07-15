# Phase 1 Testing Documentation Index

This folder contains comprehensive guides for testing Phase 1 (Data Ingestion Infrastructure) with real Twilio integration.

---

## Quick Start

**Start here:** [Twilio Quick Reference](./twilio-quick-reference.md) (5-minute setup)

---

## Testing Guides

### 📱 Phase 1 - Twilio Integration Testing
**File:** [phase1-twilio-testing.md](./phase1-twilio-testing.md)

Complete end-to-end testing guide covering:
- Twilio account setup
- Environment configuration
- ngrok webhook tunneling
- Making test calls
- Verifying order creation
- Testing deduplication
- Troubleshooting

**Time:** ~30 minutes setup + testing

---

### 🚀 Twilio Quick Reference
**File:** [twilio-quick-reference.md](./twilio-quick-reference.md)

Quick reference card with:
- 5-minute quick start
- Common test commands
- Example shipment details
- Common issues & solutions
- Server log key messages
- Environment variables reference

**Best for:** Quick lookups and command reference

---

### 🛠️ Setup & Validation Guide
**File:** [twilio-testing-guide.sh](./twilio-testing-guide.sh)

Interactive bash guide covering:
- Prerequisites verification
- Twilio credential setup
- Public webhook URL setup (ngrok)
- Phone number configuration
- Application startup
- Health checks
- Monitoring & logs

**Run with:** `bash docs/twilio-testing-guide.sh`

---

### ✅ Twilio Setup Validator
**File:** [validate-twilio-setup.js](./validate-twilio-setup.js)

Node.js validation script that checks:
- .env file configuration
- All required credentials
- Project file structure
- NPM dependencies
- Database configuration
- Webhook URL validity

**Run with:** `node docs/validate-twilio-setup.js`

---

## Testing Workflow

### Step 1: Validate Setup
```bash
node docs/validate-twilio-setup.js
```
Checks all prerequisites and configuration.

### Step 2: Read Quick Reference
```bash
cat docs/twilio-quick-reference.md
```
Understand the 5-minute setup and common commands.

### Step 3: Follow Full Testing Guide
```bash
cat docs/phase1-twilio-testing.md
```
Complete step-by-step guide for end-to-end testing.

### Step 4: Start Testing
- Start ngrok: `ngrok http 3000`
- Start server: `npm start`
- Make a call to your Twilio number
- Check `/api/orders` endpoint

---

## Key Files Modified in Phase 1

| File | Purpose |
|------|---------|
| `automation/twilio/voiceWebhookHandler.js` | Twilio webhook handler |
| `automation/email_parser/imapPoller.js` | IMAP email polling |
| `automation/speech_processing/whisperService.js` | Whisper transcription |
| `src/services/orderIntakeService.js` | Order intake orchestration |
| `src/controllers/intakeController.js` | API controllers |
| `src/routes/intakeRoutes.js` | Intake route endpoints |
| `src/config/env.js` | Environment configuration |
| `src/db/schema.sql` | Database schema extensions |

---

## Test Data Examples

### Example 1: Electronics Shipment
```
"Pickup from Phoenix to Los Angeles on July 16th.
Weight 5000 kilograms, volume 40 cubic meters.
Electronics cargo. Company is Acme Logistics."
```

### Example 2: Machinery Shipment
```
"From Denver to Dallas on July 20th.
2500 kilograms, 15 cubic meters of machinery."
```

### Example 3: General Cargo
```
"Ship from Chicago to Houston.
Weight 3000 kg, volume 25 cubic meters."
```

---

## Quick Command Reference

```bash
# Validate setup
node docs/validate-twilio-setup.js

# Start services
ngrok http 3000                          # Terminal 1
npm start                                # Terminal 2

# Test endpoints
curl http://localhost:3000/health
curl http://localhost:3000/api/orders
curl -X POST http://localhost:3000/api/orders/{id}/quotes

# Email (if configured)
curl -X POST http://localhost:3000/api/intake/start-email-polling
curl -X POST http://localhost:3000/api/intake/stop-email-polling
```

---

## Troubleshooting

**See detailed troubleshooting in:**
- [Twilio Quick Reference - Common Issues](./twilio-quick-reference.md#common-issues--solutions)
- [Full Testing Guide - Troubleshooting](./phase1-twilio-testing.md#troubleshooting)

---

## Success Criteria

Phase 1 testing is successful when:
- ✅ Inbound call received and logged
- ✅ Recording processed by Twilio
- ✅ Transcription completed (speech-to-text)
- ✅ Order created with correct fields
- ✅ Quote generated with correct pricing
- ✅ Duplicate orders rejected
- ✅ Low-confidence extractions flagged for review
- ✅ All API endpoints return expected responses

---

## Next Phases

After Phase 1 testing passes:

1. **Phase 4:** PDF Quote Generation
   - Generate customer-facing quote PDFs
   - Add branding and professional styling

2. **Email Delivery**
   - Send quotes via Outlook SMTP
   - Track delivery status with retries

3. **Phase 5:** Angular Dashboard
   - Monitor orders and quotes
   - View delivery status
   - Real-time updates

4. **Production Deployment**
   - Deploy to staging/production
   - Set up monitoring and alerting
   - Configure database backups

---

## Environment Variables Required

### Essential (Twilio)
```env
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_PHONE_NUMBER=+1234567890
TWILIO_WEBHOOK_URL=https://your-webhook-url
```

### Recommended (Speech-to-Text)
```env
OPENAI_API_KEY=sk-xxxx...
```

### Optional (Database & Email)
```env
DATABASE_URL=postgresql://user:pass@host:5432/db
OUTLOOK_EMAIL=your-email@outlook.com
OUTLOOK_PASSWORD=your-app-password
```

---

## Resources

- **Twilio Console:** https://www.twilio.com/console
- **Twilio Phone Numbers:** https://www.twilio.com/console/phone-numbers
- **ngrok Download:** https://ngrok.com/download
- **OpenAI Whisper Docs:** https://platform.openai.com/docs/guides/speech-to-text
- **TwiML Reference:** https://www.twilio.com/docs/voice/twiml

---

## Document Index

| Document | Purpose | Time |
|----------|---------|------|
| phase1-twilio-testing.md | Full end-to-end testing guide | 30 min |
| twilio-quick-reference.md | Quick reference & commands | 5 min |
| twilio-testing-guide.sh | Interactive setup guide | 10 min |
| validate-twilio-setup.js | Automatic setup validation | 1 min |

---

**Status:** ✅ Phase 1 Ready for Real-World Testing

Start with: `node docs/validate-twilio-setup.js`
