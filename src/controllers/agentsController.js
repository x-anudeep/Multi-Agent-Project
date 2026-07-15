const agentService = require("../services/agentService");

async function triage(req, res, next) {
  try {
    const result = await agentService.triage(req.body);
    res.json({ data: result });
  } catch (error) {
    next(error);
  }
}

module.exports = { triage };
