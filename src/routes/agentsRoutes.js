const express = require("express");
const agentsController = require("../controllers/agentsController");

const router = express.Router();

router.post("/triage", agentsController.triage);

module.exports = router;
