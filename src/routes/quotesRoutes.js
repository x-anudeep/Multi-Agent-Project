const express = require("express");
const quotesController = require("../controllers/quotesController");

const router = express.Router({ mergeParams: true });

router.get("/", quotesController.listQuotes);
router.post("/", quotesController.createQuote);
router.post("/:quoteId/review/approve", quotesController.approveQuote);
router.post("/:quoteId/review/reject", quotesController.rejectQuote);

module.exports = router;
