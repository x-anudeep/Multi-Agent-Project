const ordersRepository = require("../db/repositories/ordersRepository");
const { getOrder } = require("./orderService");
const { runLangChainQuotePipeline } = require("../agents/langchainAgentPipeline");

async function generateQuote(orderId) {
  const order = await getOrder(orderId);
  const pipeline = await runLangChainQuotePipeline(order);
  const { triage, routeCapacity, pricing, loadOptimization, review } = pipeline;

  if (!triage.valid) {
    const error = new Error(`Order is missing fields: ${triage.missingFields.join(", ")}`);
    error.status = 400;
    throw error;
  }

  if (!routeCapacity.capacityAvailable) {
    const error = new Error("No compatible vehicle capacity is currently available");
    error.status = 409;
    throw error;
  }

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
    orchestration: "langchain_runnable_pipeline",
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
