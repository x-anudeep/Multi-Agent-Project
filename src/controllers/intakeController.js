/**
 * Intake Controller
 * 
 * Handles POST requests for speech transcriptions and email processing,
 * orchestrating the flow through order creation.
 */

const whisperService = require("../../automation/speech_processing/whisperService");
const orderIntakeService = require("../services/orderIntakeService");
const imapPoller = require("../../automation/email_parser/imapPoller");
const { getPool } = require("../db/pool");

/**
 * Handle transcription completion and trigger order creation
 * POST /api/intake/transcription
 */
async function handleTranscription(req, res, next) {
  try {
    const { recordingSid, callSid, callerPhone, recordingUrl } = req.body;

    if (!recordingUrl || !recordingSid) {
      return res.status(400).json({
        error: "Missing required fields: recordingUrl, recordingSid"
      });
    }

    console.log("Intake: Processing transcription request...");

    // Process the recording asynchronously
    // In production, this would be queued for async processing
    whisperService
      .processRecording(
        {
          recordingUrl,
          recordingSid,
          callSid,
          callerPhone,
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
      )
      .catch((error) => {
        console.error("Error processing recording:", error);
      });

    // Respond immediately
    res.status(202).json({
      status: "processing",
      message: "Transcription queued for processing",
      recordingSid
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Handle email intake and trigger order creation
 * POST /api/intake/email
 */
async function handleEmailIntake(req, res, next) {
  try {
    const { from, to, subject, text, html } = req.body;

    if (!text && !html) {
      return res.status(400).json({
        error: "Missing required fields: text or html"
      });
    }

    console.log("Intake: Processing email intake request...");

    const emailData = {
      from,
      to,
      subject,
      text,
      html,
      timestamp: new Date().toISOString()
    };

    // Process the email and create order
    const intakeResult = await orderIntakeService.processEmail(emailData);

    res.status(intakeResult.success ? 201 : 400).json(intakeResult);
  } catch (error) {
    next(error);
  }
}

/**
 * Start email polling
 * POST /api/intake/start-email-polling
 */
async function startEmailPolling(req, res, next) {
  try {
    console.log("Starting email polling...");

    // Define callback for when new email is found
    const onNewEmail = async (emailData) => {
      try {
        // Check for duplicate before processing
        const isDuplicate = await imapPoller.isDuplicateEmail(
          emailData.messageId,
          emailData.from,
          emailData.timestamp,
          getPool()
        );

        if (isDuplicate) {
          console.log("Email duplicate detected. Skipping.");
          return;
        }

        console.log("Processing email from polling...");
        const intakeResult = await orderIntakeService.processEmail(emailData);

        console.log("Email intake result:", {
          success: intakeResult.success,
          status: intakeResult.status,
          orderId: intakeResult.orderId
        });
      } catch (error) {
        console.error("Error processing email from polling:", error);
      }
    };

    // Start polling
    await imapPoller.startPolling(onNewEmail);

    res.json({
      status: "started",
      message: "Email polling started"
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Stop email polling
 * POST /api/intake/stop-email-polling
 */
function stopEmailPolling(req, res, next) {
  try {
    console.log("Stopping email polling...");
    imapPoller.stopPolling();

    res.json({
      status: "stopped",
      message: "Email polling stopped"
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get intake status/stats
 * GET /api/intake/status
 */
async function getIntakeStatus(req, res, next) {
  try {
    // TODO: Query database for intake statistics
    const status = {
      emailPollingActive: false, // TODO: Track polling state
      transcriptionsProcessed: 0, // TODO: Query DB
      ordersCreated: 0, // TODO: Query DB
      manualReviewQueue: 0 // TODO: Query DB
    };

    res.json(status);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  handleTranscription,
  handleEmailIntake,
  startEmailPolling,
  stopEmailPolling,
  getIntakeStatus
};
