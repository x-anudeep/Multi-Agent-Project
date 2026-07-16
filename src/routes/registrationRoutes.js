const express = require("express");
const registrationController = require("../controllers/registrationController");

const router = express.Router();

router.get("/:token", registrationController.getRegistration);
router.post("/:token", registrationController.submitRegistration);

module.exports = router;
