/**
 * Twilio Inbound Voice Webhook Handler
 * 
 * Accepts inbound calls, triggers call recording, and queues
 * recording for speech-to-text processing.
 */

const twilio = require("twilio");
const { env } = require("../../src/config/env");
const whisperService = require("../speech_processing/whisperService");
const orderIntakeService = require("../../src/services/orderIntakeService");
const { triage } = require("../../src/services/agentService");

// Per-call conversation state, keyed by CallSid. A single Node process is
// fine for local/dev use; a multi-instance deployment would need shared state.
const callSessions = new Map();
const MAX_CONVERSATION_TURNS = 4;

const MISSING_FIELD_PROMPTS = {
  origin: "Where are you picking up the shipment from?",
  destination: "Where should the shipment be delivered to?",
  "weightKg or volumeM3": "What's the approximate weight in kilograms, or the volume in cubic meters?"
};

function describeMissingField(missingFields) {
  const field = missingFields && missingFields[0];
  return MISSING_FIELD_PROMPTS[field] || "Could you repeat your shipment details?";
}

/**
 * Build TwiML that asks a question and gathers the caller's spoken response.
 * @param {string} promptText - What to ask the caller before listening.
 * @param {string} fallbackText - What to say if no speech is detected at all.
 * @returns {twilio.twiml.VoiceResponse}
 */
function buildGatherResponse(promptText, fallbackText) {
  const response = new twilio.twiml.VoiceResponse();
  const gather = response.gather({
    input: "speech",
    action: `${env.twilio.webhookUrl}/api/integrations/twilio/speech-result`,
    method: "POST",
    speechTimeout: "auto",
    language: "en-US"
  });
  gather.say(promptText, { voice: "alice" });

  // Reached only if Gather times out with no speech detected at all.
  response.say(fallbackText, { voice: "alice" });
  response.hangup();

  return response;
}

/**
 * Handle inbound call webhook
 * @param {Object} req - Express request object with Twilio webhook data
 * @param {Object} res - Express response object
 */
async function handleInboundCall(req, res) {
  // Log the call
  console.log("Inbound call received:", {
    from: req.body.From,
    to: req.body.To,
    callSid: req.body.CallSid,
    timestamp: new Date().toISOString()
  });

  try {
    // Greet the caller, then use Twilio's own speech recognition to capture
    // shipment details as text. <Record> requires a paid account, so this
    // <Gather input="speech"> path is what runs on trial accounts too.
    const response = buildGatherResponse(
      "Thanks for calling our shipping center. Please describe your shipment after the tone, including pickup location, drop-off location, and weight or volume.",
      "We didn't catch that. Please call back and try again."
    );
    res.type("text/xml").send(response.toString());
  } catch (error) {
    console.error("Error handling inbound call:", error);
    const response = new twilio.twiml.VoiceResponse();
    response.say("An error occurred. Please try again later.");
    response.hangup();
    res.type("text/xml").send(response.toString());
  }
}

/**
 * Finalize a call: respond to Twilio immediately, then create the order
 * (or flag it for review) asynchronously from the accumulated transcript.
 */
function finalizeCall(res, { callSid, from, transcript, isComplete }) {
  const response = new twilio.twiml.VoiceResponse();
  response.say(
    isComplete
      ? "Thank you. We have everything we need and are preparing your quote now."
      : "Thanks for the details. A member of our team will follow up shortly to confirm your shipment.",
    { voice: "alice" }
  );
  response.hangup();
  res.type("text/xml").send(response.toString());

  callSessions.delete(callSid);

  if (!transcript) return;

  orderIntakeService
    .processTranscription({
      cleanedTranscript: transcript,
      callerPhone: from,
      timestamp: new Date().toISOString()
    })
    .then((intakeResult) => {
      console.log("Order intake result:", {
        success: intakeResult.success,
        status: intakeResult.status,
        orderId: intakeResult.orderId
      });
    })
    .catch((error) => console.error("Error processing speech intake:", error));
}

/**
 * Handle Twilio's speech recognition result from the Gather verb. Runs the
 * triage agent after every turn; if required fields are still missing, asks
 * a targeted follow-up question and gathers again instead of giving up.
 * @param {Object} req - Express request object with SpeechResult data
 * @param {Object} res - Express response object
 */
async function handleSpeechResult(req, res) {
  const { SpeechResult, Confidence, CallSid, From } = req.body;

  console.log("Speech result received:", {
    callSid: CallSid,
    from: From,
    confidence: Confidence,
    transcriptLength: SpeechResult ? SpeechResult.length : 0
  });

  const session = callSessions.get(CallSid) || { transcript: "", turns: 0 };
  if (SpeechResult) {
    session.transcript = session.transcript ? `${session.transcript} ${SpeechResult}` : SpeechResult;
  }
  session.turns += 1;
  callSessions.set(CallSid, session);

  let triageResult = null;
  try {
    if (session.transcript) {
      triageResult = await triage({ transcript: session.transcript, source: "twilio_voice" });
    }
  } catch (error) {
    console.error("Error running triage during call:", error);
  }

  const isComplete = Boolean(triageResult?.triage?.valid);
  const missingFields = triageResult?.triage?.missingFields || [];

  if (isComplete || session.turns >= MAX_CONVERSATION_TURNS) {
    finalizeCall(res, { callSid: CallSid, from: From, transcript: session.transcript, isComplete });
    return;
  }

  const response = buildGatherResponse(
    describeMissingField(missingFields),
    "We'll have a team member follow up with you shortly."
  );
  res.type("text/xml").send(response.toString());
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

  // Acknowledge Twilio immediately; transcription + order creation continue async.
  res.status(202).json({ status: "processing", recordingSid: RecordingSid });

  if (!RecordingUrl || !RecordingSid) {
    console.error("Recording webhook missing RecordingUrl/RecordingSid; skipping intake.");
    return;
  }

  try {
    await whisperService.processRecording(
      {
        recordingUrl: RecordingUrl,
        recordingSid: RecordingSid,
        callSid: CallSid,
        callerPhone: From,
        timestamp: new Date().toISOString()
      },
      async (transcriptionData) => {
        try {
          console.log("Transcription complete. Processing order intake...");
          const intakeResult = await orderIntakeService.processTranscription(transcriptionData);
          console.log("Order intake result:", {
            success: intakeResult.success,
            status: intakeResult.status,
            orderId: intakeResult.orderId
          });
        } catch (error) {
          console.error("Error processing transcription intake:", error);
        }
      }
    );
  } catch (error) {
    console.error("Error processing recording:", error);
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
  handleSpeechResult,
  handleRecordingComplete,
  handleTranscriptionComplete,
  generateCapabilityToken
};
