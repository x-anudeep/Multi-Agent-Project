const ordersRepository = require("../db/repositories/ordersRepository");
const { getOrder } = require("./orderService");
const { runTriageAgent } = require("../agents/triageAgent");
const { runRouteCapacityAgent } = require("../agents/routeCapacityAgent");
const { runPricingAgent } = require("../agents/pricingAgent");
const { runLoadOptimizationAgent } = require("../agents/loadOptimizationAgent");
const { runQuoteReviewAgent } = require("../agents/quoteReviewAgent");

async function generateQuote(orderId) {
  const order = await getOrder(orderId);
  const triage = runTriageAgent(order.normalizedRequest || order);

  if (!triage.valid) {
    const error = new Error(`Order is missing fields: ${triage.missingFields.join(", ")}`);
    error.status = 400;
    throw error;
  }

  const routeCapacity = runRouteCapacityAgent(order);
  if (!routeCapacity.capacityAvailable) {
    const error = new Error("No compatible vehicle capacity is currently available");
    error.status = 409;
    throw error;
  }

  const pricing = runPricingAgent(order, routeCapacity);
  const loadOptimization = runLoadOptimizationAgent(pricing, routeCapacity);
  const review = runQuoteReviewAgent(order, routeCapacity, loadOptimization);

  const quote = await ordersRepository.createQuote({
    orderId: order.id,
    vehicleId: loadOptimization.vehicleId,
    basePrice: pricing.basePrice,
    discountAmount: loadOptimization.discountAmount,
    finalPrice: loadOptimization.finalPrice,
    currency: pricing.currency,
    status: review.status,
    reviewNotes: [
      { agent: triage.agent, result: triage.nextAction },
      { agent: routeCapacity.agent, result: routeCapacity.nextAction },
      { agent: pricing.agent, result: pricing.nextAction },
      { agent: loadOptimization.agent, result: loadOptimization.reason },
      { agent: review.agent, result: review.nextAction, issues: review.issues }
    ]
  });

  return {
    quote,
    agents: {
      triage,
      routeCapacity,
      pricing,
      loadOptimization,
      review
    }
  };
}

async function listQuotesForOrder(orderId) {
  await getOrder(orderId);
  return ordersRepository.listQuotesByOrderId(orderId);
}

module.exports = {
  generateQuote,
  listQuotesForOrder
};
