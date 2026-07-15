const express = require("express");
const intakeController = require("../controllers/intakeController");

const router = express.Router();

// Transcription intake endpoint
router.post("/transcription", intakeController.handleTranscription);

// Email intake endpoint
router.post("/email", intakeController.handleEmailIntake);

// Email polling control endpoints
router.post("/start-email-polling", intakeController.startEmailPolling);
router.post("/stop-email-polling", intakeController.stopEmailPolling);

// Intake status
router.get("/status", intakeController.getIntakeStatus);

module.exports = router;
