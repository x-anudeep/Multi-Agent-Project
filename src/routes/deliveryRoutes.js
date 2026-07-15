const express = require("express");
const deliveryController = require("../controllers/deliveryController");

const router = express.Router();

router.post("/:orderId/quotes/:quoteId/send-pdf", deliveryController.sendQuotePdf);
router.get("/:orderId/delivery-status", deliveryController.getDeliveryStatus);
router.post("/:orderId/delivery/retry", deliveryController.retryDelivery);

module.exports = router;
