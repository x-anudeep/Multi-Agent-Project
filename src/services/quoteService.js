const ordersRepository = require("../db/repositories/ordersRepository");
const { getOrder } = require("./orderService");
const { runLangChainQuotePipeline } = require("../agents/langchainAgentPipeline");
const deliveryService = require("./deliveryService");

/**
 * If a quote comes out approved, immediately generate its PDF and email it.
 * Quotes still requiring manual review are left untouched (never auto-sent).
 * A delivery failure here doesn't fail quote creation/approval itself.
 */
async function maybeAutoSend(orderId, quote) {
  if (quote.status !== "approved") return null;

  try {
    return await deliveryService.sendQuotePdf(orderId, quote.id);
  } catch (error) {
    console.error("Auto-send failed for approved quote:", error);
    return { error: error.message };
  }
}

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

  const delivery = await maybeAutoSend(order.id, quote);

  return {
    quote,
    delivery,
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

async function getQuoteForOrder(orderId, quoteId) {
  await getOrder(orderId);
  const quote = await ordersRepository.findQuoteById(quoteId);
  if (!quote || quote.orderId !== orderId) {
    const error = new Error(`Quote ${quoteId} not found for order ${orderId}`);
    error.status = 404;
    throw error;
  }
  return quote;
}

/**
 * Manually approve a quote that quoteReviewAgent flagged as
 * requires_manual_review, allowing it to be emailed to the customer.
 */
async function approveQuote(orderId, quoteId, notes) {
  const quote = await getQuoteForOrder(orderId, quoteId);
  if (quote.status === "approved") return quote;

  if (quote.status === "rejected") {
    const error = new Error(`Quote ${quoteId} was already rejected and cannot be approved`);
    error.status = 400;
    throw error;
  }

  return ordersRepository.updateQuote(quoteId, {
    status: "approved",
    reviewNotes: [
      ...(quote.reviewNotes || []),
      { agent: "manual_reviewer", result: "approved", notes: notes || null, timestamp: new Date().toISOString() }
    ]
  });
}

/**
 * Manually reject a quote; it will never be emailed to the customer.
 */
async function rejectQuote(orderId, quoteId, notes) {
  const quote = await getQuoteForOrder(orderId, quoteId);
  if (quote.status === "rejected") return quote;

  return ordersRepository.updateQuote(quoteId, {
    status: "rejected",
    reviewNotes: [
      ...(quote.reviewNotes || []),
      { agent: "manual_reviewer", result: "rejected", notes: notes || null, timestamp: new Date().toISOString() }
    ]
  });
}

module.exports = {
  generateQuote,
  listQuotesForOrder,
  approveQuote,
  rejectQuote
};
