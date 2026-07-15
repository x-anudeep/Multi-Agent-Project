const express = require("express");
const ordersRoutes = require("./routes/ordersRoutes");
const { errorHandler } = require("./middleware/errorHandler");

function createApp() {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (req, res) => {
    res.json({ status: "ok", service: "multi-agent-logistics-backend" });
  });

  app.use("/api/orders", ordersRoutes);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
