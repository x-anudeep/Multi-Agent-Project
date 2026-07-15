require("dotenv").config();

const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 3000),
  databaseUrl: process.env.DATABASE_URL || "",
  disableDuplicateCheck: process.env.DISABLE_DUPLICATE_CHECK === "true",
  fleetbase: {
    baseUrl: process.env.FLEETBASE_BASE_URL || "",
    apiKey: process.env.FLEETBASE_API_KEY || "",
    orderEndpoint: process.env.FLEETBASE_ORDER_ENDPOINT || "/orders"
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY || "",
    model: process.env.OPENAI_MODEL || "gpt-4o-mini"
  },
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID || "",
    authToken: process.env.TWILIO_AUTH_TOKEN || "",
    phoneNumber: process.env.TWILIO_PHONE_NUMBER || "",
    webhookUrl: process.env.TWILIO_WEBHOOK_URL || ""
  },
  imap: {
    email: process.env.OUTLOOK_EMAIL || "",
    password: process.env.OUTLOOK_PASSWORD || "",
    server: process.env.IMAP_SERVER || "imap-mail.outlook.com",
    pollingIntervalMs: Number(process.env.IMAP_POLLING_INTERVAL_MS || 300000) // Default: 5 minutes
  },
  pdf: {
    logoPath: process.env.PDF_LOGO_PATH || "",
    outputDir: process.env.PDF_OUTPUT_DIR || "./quotes"
  },
  smtp: {
    server: process.env.OUTLOOK_SMTP_SERVER || "smtp-mail.outlook.com",
    user: process.env.OUTLOOK_SMTP_USER || "",
    password: process.env.OUTLOOK_SMTP_PASSWORD || "",
    port: Number(process.env.OUTLOOK_SMTP_PORT || 587)
  }
};

module.exports = { env };
