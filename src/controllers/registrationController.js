const registrationService = require("../services/registrationService");

async function getRegistration(req, res, next) {
  try {
    const registration = await registrationService.getRegistration(req.params.token);
    res.json({ data: { status: registration.status, phone: registration.phone } });
  } catch (error) {
    next(error);
  }
}

async function submitRegistration(req, res, next) {
  try {
    const { name, email, phone } = req.body;
    const result = await registrationService.completeRegistration(req.params.token, { name, email, phone });
    res.json({ data: result });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getRegistration,
  submitRegistration
};
