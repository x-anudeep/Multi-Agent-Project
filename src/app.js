const express = require("express");
const path = require("path");
const agentsRoutes = require("./routes/agentsRoutes");
const integrationsRoutes = require("./routes/integrationsRoutes");
const ordersRoutes = require("./routes/ordersRoutes");
const intakeRoutes = require("./routes/intakeRoutes");
const reviewRoutes = require("./routes/reviewRoutes");
const { errorHandler } = require("./middleware/errorHandler");

function createApp() {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false, limit: "1mb" }));
  app.use(express.static(path.join(__dirname, "..", "public")));

  app.get("/health", (req, res) => {
    res.json({ status: "ok", service: "multi-agent-logistics-backend" });
  });

  app.use("/api/agents", agentsRoutes);
  app.use("/api/integrations", integrationsRoutes);
  // Must be mounted before /api/orders so "review-queue" isn't swallowed by
  // the /api/orders/:id route.
  app.use("/api/orders/review-queue", reviewRoutes);
  app.use("/api/orders", ordersRoutes);
  app.use("/api/intake", intakeRoutes);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
