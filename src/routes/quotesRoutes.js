const express = require("express");
const quotesController = require("../controllers/quotesController");

const router = express.Router({ mergeParams: true });

router.get("/", quotesController.listQuotes);
router.post("/", quotesController.createQuote);

module.exports = router;
