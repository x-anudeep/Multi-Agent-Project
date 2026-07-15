const { createApp } = require("./app");
const { env } = require("./config/env");

const app = createApp();

app.listen(env.port, () => {
  console.log(`Logistics backend listening on port ${env.port}`);
});
