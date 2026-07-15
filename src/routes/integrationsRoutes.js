const express = require("express");
const integrationsController = require("../controllers/integrationsController");

const router = express.Router();

router.get("/fleetbase/status", integrationsController.fleetbaseStatus);

// Twilio voice integration endpoints
router.post("/twilio/voice-webhook", integrationsController.twilioVoiceWebhook);
router.post("/twilio/recording-webhook", integrationsController.twilioRecordingWebhook);
router.post("/twilio/transcription-webhook", integrationsController.twilioTranscriptionWebhook);

module.exports = router;
