/**
 * Twilio Inbound Voice Webhook Handler
 * 
 * Accepts inbound calls, triggers call recording, and queues
 * recording for speech-to-text processing.
 */

const twilio = require("twilio");
const { env } = require("../../src/config/env");

/**
 * Handle inbound call webhook
 * @param {Object} req - Express request object with Twilio webhook data
 * @param {Object} res - Express response object
 */
async function handleInboundCall(req, res) {
  const response = new twilio.twiml.VoiceResponse();

  // Log the call
  console.log("Inbound call received:", {
    from: req.body.From,
    to: req.body.To,
    callSid: req.body.CallSid,
    timestamp: new Date().toISOString()
  });

  try {
    // Greet the caller and record the call
    response.say("Thank you for contacting our shipping center. Please hold while we record your shipment details.", {
      voice: "alice"
    });

    // Record the call with transcription webhook callback
    response.record({
      transcribeCallback: `${env.twilio.webhookUrl}/api/integrations/twilio/transcription-webhook`,
      transcribe: true,
      transcribeCallback: `${env.twilio.webhookUrl}/api/integrations/twilio/recording-complete`,
      maxLength: 600, // Max 10 minutes
      finishOnKey: "#", // Allow user to press # to end recording
      timeout: 3600 // Timeout after 1 hour
    });

    // Hangup after recording
    response.hangup();

    res.type("text/xml").send(response.toString());
  } catch (error) {
    console.error("Error handling inbound call:", error);
    response.say("An error occurred. Please try again later.");
    response.hangup();
    res.type("text/xml").send(response.toString());
  }
}

/**
 * Handle recording completion webhook
 * @param {Object} req - Express request object with recording data
 * @param {Object} res - Express response object
 */
async function handleRecordingComplete(req, res) {
  const { RecordingUrl, RecordingSid, CallSid, From } = req.body;

  console.log("Recording completed:", {
    callSid: CallSid,
    recordingSid: RecordingSid,
    recordingUrl: RecordingUrl,
    from: From,
    timestamp: new Date().toISOString()
  });

  try {
    // Queue the recording for speech-to-text processing
    const speechJob = {
      recordingUrl: RecordingUrl,
      recordingSid: RecordingSid,
      callSid: CallSid,
      callerPhone: From,
      timestamp: new Date().toISOString(),
      status: "queued",
      source: "twilio_voice"
    };

    // Store in database (to be implemented by calling service)
    // This will be called by transcription service
    console.log("Queued for speech processing:", speechJob);

    // TODO: Publish to message queue or store in DB for async processing
    // For now, just acknowledge receipt
    res.status(200).json({ status: "queued", recordingSid });
  } catch (error) {
    console.error("Error handling recording completion:", error);
    res.status(500).json({ error: "Failed to queue recording" });
  }
}

/**
 * Handle transcription completion webhook
 * @param {Object} req - Express request object with transcription data
 * @param {Object} res - Express response object
 */
async function handleTranscriptionComplete(req, res) {
  const { RecordingSid, CallSid, TranscriptionText } = req.body;

  console.log("Transcription completed:", {
    callSid: CallSid,
    recordingSid: RecordingSid,
    transcriptionLength: TranscriptionText ? TranscriptionText.length : 0,
    timestamp: new Date().toISOString()
  });

  try {
    // Store transcription (to be persisted by speech processing service)
    const transcriptionRecord = {
      recordingSid: RecordingSid,
      callSid: CallSid,
      rawTranscription: TranscriptionText,
      timestamp: new Date().toISOString(),
      status: "transcribed",
      source: "twilio_voice"
    };

    // TODO: Store in database and trigger order creation flow
    console.log("Transcription stored:", transcriptionRecord);

    res.status(200).json({ status: "stored", recordingSid });
  } catch (error) {
    console.error("Error handling transcription:", error);
    res.status(500).json({ error: "Failed to store transcription" });
  }
}

/**
 * Generate Twilio capability token for client-side SDK
 * @param {string} identity - Unique identifier for the user
 * @returns {string} Capability token
 */
function generateCapabilityToken(identity) {
  const capability = new twilio.jwt.ClientCapability({
    accountSid: env.twilio.accountSid,
    authToken: env.twilio.authToken
  });

  capability.addVoiceGrant({
    outgoingApplicationSid: env.twilio.applicationSid || "",
    incomingAllow: true
  });

  return capability.toJwt();
}

module.exports = {
  handleInboundCall,
  handleRecordingComplete,
  handleTranscriptionComplete,
  generateCapabilityToken
};
