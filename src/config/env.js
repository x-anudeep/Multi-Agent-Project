require("dotenv").config();

const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 3000),
  databaseUrl: process.env.DATABASE_URL || "",
  fleetbase: {
    baseUrl: process.env.FLEETBASE_BASE_URL || "",
    apiKey: process.env.FLEETBASE_API_KEY || "",
    orderEndpoint: process.env.FLEETBASE_ORDER_ENDPOINT || "/orders"
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY || "",
    model: process.env.OPENAI_MODEL || "gpt-4o-mini"
  }
};

module.exports = { env };
