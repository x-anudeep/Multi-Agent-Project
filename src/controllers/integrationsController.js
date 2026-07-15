const { FleetbaseClient } = require("../services/fleetbaseClient");

async function fleetbaseStatus(req, res, next) {
  try {
    const fleetbase = new FleetbaseClient();
    const status = await fleetbase.status();
    res.json({ data: status });
  } catch (error) {
    next(error);
  }
}

module.exports = { fleetbaseStatus };
