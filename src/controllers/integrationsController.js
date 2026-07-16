const twilio = require("twilio");
const { FleetbaseClient } = require("../services/fleetbaseClient");
const twilioVoiceHandler = require("../../automation/twilio/voiceWebhookHandler");
const { agentService } = require("../services/agentService");
const registrationService = require("../services/registrationService");

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

/**
 * Handle an inbound SMS to the messaging number. Callers who couldn't be
 * matched to a CSV email are told (by voice) to text this number; replying
 * here -- rather than sending an unsolicited outbound message -- isn't
 * subject to the trial-account "predefined templates" restriction. Replies
 * only if there's a pending registration for the caller's number; otherwise
 * sends no message back.
 */
async function twilioSmsInboundWebhook(req, res, next) {
  try {
    const { From, Body } = req.body;
    console.log("Inbound SMS received:", { from: From, body: Body });

    const response = new twilio.twiml.MessagingResponse();
    const registration = await registrationService.getPendingRegistrationForPhone(From);

    if (registration) {
      const link = registrationService.buildLink(registration.token);
      response.message(
        `Your quote for order ${registration.orderId} is ready. Complete your registration here to receive it by email: ${link}`
      );
    }

    res.type("text/xml").send(response.toString());
  } catch (error) {
    next(error);
  }
}

module.exports = {
  fleetbaseStatus,
  twilioVoiceWebhook,
  twilioSpeechResultWebhook,
  twilioRecordingWebhook,
  twilioTranscriptionWebhook,
  twilioSmsInboundWebhook
};
