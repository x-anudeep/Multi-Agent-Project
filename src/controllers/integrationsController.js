const { FleetbaseClient } = require("../services/fleetbaseClient");
const twilioVoiceHandler = require("../../automation/twilio/voiceWebhookHandler");
const { agentService } = require("../services/agentService");

async function fleetbaseStatus(req, res, next) {
  try {
    const fleetbase = new FleetbaseClient();
    const status = await fleetbase.status();
    res.json({ data: status });
  } catch (error) {
    next(error);
  }
}

/**
 * Handle inbound Twilio voice call webhook
 */
async function twilioVoiceWebhook(req, res, next) {
  try {
    await twilioVoiceHandler.handleInboundCall(req, res);
  } catch (error) {
    next(error);
  }
}

/**
 * Handle Twilio speech recognition result (Gather) webhook
 */
async function twilioSpeechResultWebhook(req, res, next) {
  try {
    await twilioVoiceHandler.handleSpeechResult(req, res);
  } catch (error) {
    next(error);
  }
}

/**
 * Handle Twilio recording completion webhook
 */
async function twilioRecordingWebhook(req, res, next) {
  try {
    await twilioVoiceHandler.handleRecordingComplete(req, res);
  } catch (error) {
    next(error);
  }
}

/**
 * Handle Twilio transcription completion webhook
 */
async function twilioTranscriptionWebhook(req, res, next) {
  try {
    await twilioVoiceHandler.handleTranscriptionComplete(req, res);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  fleetbaseStatus,
  twilioVoiceWebhook,
  twilioSpeechResultWebhook,
  twilioRecordingWebhook,
  twilioTranscriptionWebhook
};
