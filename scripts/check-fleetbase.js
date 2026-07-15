const { FleetbaseClient } = require("../src/services/fleetbaseClient");

async function main() {
  const client = new FleetbaseClient();
  const status = await client.status();
  console.log(JSON.stringify(status, null, 2));

  if (!status.reachable) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
