const express = require("express");
const ordersController = require("../controllers/ordersController");
const quotesRoutes = require("./quotesRoutes");
const deliveryRoutes = require("./deliveryRoutes");

const router = express.Router();

router.get("/", ordersController.listOrders);
router.post("/", ordersController.createOrder);
router.get("/:id", ordersController.getOrder);
router.use("/:orderId/quotes", quotesRoutes);
router.use("/", deliveryRoutes);

module.exports = router;
