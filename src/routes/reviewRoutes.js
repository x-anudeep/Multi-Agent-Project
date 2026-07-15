const express = require("express");
const reviewController = require("../controllers/reviewController");

const router = express.Router();

router.get("/", reviewController.listReviewQueue);
router.get("/:reviewId", reviewController.getReviewEntry);
router.post("/:reviewId/approve", reviewController.approveReviewEntry);
router.post("/:reviewId/reject", reviewController.rejectReviewEntry);
router.post("/:reviewId/send-now", reviewController.sendNow);

module.exports = router;
