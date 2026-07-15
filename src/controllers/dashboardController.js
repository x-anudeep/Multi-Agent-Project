const dashboardService = require("../services/dashboardService");

async function getSummary(req, res, next) {
  try {
    const summary = await dashboardService.getSummary();
    res.json({ data: summary });
  } catch (error) {
    next(error);
  }
}

module.exports = { getSummary };
