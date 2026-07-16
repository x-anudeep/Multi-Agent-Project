const express = require("express");
const path = require("path");
const agentsRoutes = require("./routes/agentsRoutes");
const integrationsRoutes = require("./routes/integrationsRoutes");
const ordersRoutes = require("./routes/ordersRoutes");
const intakeRoutes = require("./routes/intakeRoutes");
const reviewRoutes = require("./routes/reviewRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const registrationRoutes = require("./routes/registrationRoutes");
const { errorHandler } = require("./middleware/errorHandler");

function createApp() {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false, limit: "1mb" }));
  app.use(express.static(path.join(__dirname, "..", "public")));

  app.get("/health", (req, res) => {
    res.json({ status: "ok", service: "multi-agent-logistics-backend" });
  });

  // Page a caller's registration SMS links to; the page itself calls
  // /api/registration/:token to load/submit.
  app.get("/register/:token", (req, res) => {
    res.sendFile(path.join(__dirname, "..", "public", "register.html"));
  });

  app.use("/api/agents", agentsRoutes);
  app.use("/api/integrations", integrationsRoutes);
  // Must be mounted before /api/orders so "review-queue" isn't swallowed by
  // the /api/orders/:id route.
  app.use("/api/orders/review-queue", reviewRoutes);
  app.use("/api/orders", ordersRoutes);
  app.use("/api/intake", intakeRoutes);
  app.use("/api/dashboard", dashboardRoutes);
  app.use("/api/registration", registrationRoutes);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
