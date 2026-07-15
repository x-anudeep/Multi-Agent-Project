const {
  normalizeShipment,
  validateNormalizedShipment
} = require("../services/shipmentNormalizer");

function runTriageAgent(input) {
  const normalized = normalizeShipment(input);
  const validation = validateNormalizedShipment(normalized);

  return {
    agent: "triage",
    valid: validation.valid,
    missingFields: validation.missing,
    normalizedShipment: normalized,
    confidence: validation.valid ? 0.92 : 0.58,
    nextAction: validation.valid ? "route_capacity_check" : "request_missing_information"
  };
}

module.exports = { runTriageAgent };
