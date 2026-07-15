const MINIMUM_MARGIN_PRICE = 225;
const MAX_ALLOWED_DISCOUNT_RATE = 0.15;

function validateBusinessRules(order, routeCapacityResult, optimizedQuote) {
  const issues = [];
  const vehicle = routeCapacityResult.selectedVehicle;

  if (!routeCapacityResult.capacityAvailable || !vehicle) {
    issues.push("No approved vehicle capacity is attached to the quote.");
  }

  if (optimizedQuote.finalPrice < MINIMUM_MARGIN_PRICE) {
    issues.push(`Final price must be at least ${MINIMUM_MARGIN_PRICE} USD.`);
  }

  if (optimizedQuote.discountRate > MAX_ALLOWED_DISCOUNT_RATE) {
    issues.push(`Discount rate exceeds ${MAX_ALLOWED_DISCOUNT_RATE * 100}%.`);
  }

  if (vehicle && order.weightKg > vehicle.remainingCapacity.weightKg) {
    issues.push("Shipment weight exceeds remaining vehicle capacity.");
  }

  if (vehicle && order.volumeM3 > vehicle.remainingCapacity.volumeM3) {
    issues.push("Shipment volume exceeds remaining vehicle capacity.");
  }

  return issues;
}

function runQuoteReviewAgent(order, routeCapacityResult, optimizedQuote) {
  const issues = validateBusinessRules(order, routeCapacityResult, optimizedQuote);

  return {
    agent: "quote_review",
    approved: issues.length === 0,
    issues,
    status: issues.length === 0 ? "approved" : "requires_manual_review",
    nextAction: issues.length === 0 ? "send_quote" : "human_review"
  };
}

module.exports = {
  runQuoteReviewAgent,
  validateBusinessRules,
  MINIMUM_MARGIN_PRICE,
  MAX_ALLOWED_DISCOUNT_RATE
};
