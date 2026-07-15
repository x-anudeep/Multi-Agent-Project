const express = require("express");
const integrationsController = require("../controllers/integrationsController");

const router = express.Router();

router.get("/fleetbase/status", integrationsController.fleetbaseStatus);

module.exports = router;
