const express = require("express");
const path = require("path");
const ordersRoutes = require("./routes/ordersRoutes");
const { errorHandler } = require("./middleware/errorHandler");

function createApp() {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use(express.static(path.join(__dirname, "..", "public")));

  app.get("/health", (req, res) => {
    res.json({ status: "ok", service: "multi-agent-logistics-backend" });
  });

  app.use("/api/orders", ordersRoutes);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
