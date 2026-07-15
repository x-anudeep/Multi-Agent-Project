/**
 * Manual Review Service
 *
 * Handles the human-in-the-loop workflow for intake attempts that triage
 * flagged as low-confidence or incomplete (order_review_queue).
 */

const reviewQueueRepository = require("../db/repositories/reviewQueueRepository");
const { createOrder } = require("./orderService");
const quoteService = require("./quoteService");
const deliveryService = require("./deliveryService");

function notFound(message) {
  const error = new Error(message);
  error.status = 404;
  return error;
}

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

async function getReviewEntry(reviewId) {
  const entry = await reviewQueueRepository.findReviewEntryById(reviewId);
  if (!entry) throw notFound(`Review entry ${reviewId} not found`);
  return entry;
}

/**
 * List review queue entries, optionally filtered by status.
 * @param {string} [status]
 */
async function listReviewQueue(status) {
  return reviewQueueRepository.listReviewQueue(status ? { status } : {});
}

/**
 * Approve a review entry: create the order from the (human-corrected)
 * shipment details and link it back to the review entry.
 * @param {string} reviewId
 * @param {Object} overrides - Corrected/completed shipment + customer fields
 */
async function approveReviewEntry(reviewId, overrides = {}) {
  const entry = await getReviewEntry(reviewId);
  if (entry.status !== "pending") {
    throw badRequest(`Review entry ${reviewId} has already been ${entry.status}`);
  }

  const rawData = entry.rawData || {};
  const metadata = rawData.metadata || {};

  const order = await createOrder({
    customer: {
      name: overrides.customerName || "Unknown Customer",
      email: overrides.customerEmail || metadata.email || metadata.senderEmail || ""
    },
    shipment: {
      pickup: overrides.pickup || "",
      dropoff: overrides.dropoff || "",
      pickupDate: overrides.pickupDate || new Date().toISOString().split("T")[0],
      weight: overrides.weight || "",
      volume: overrides.volume || "",
      commodity: overrides.commodity || "general"
    },
    metadata: {
      source: rawData.source,
      reviewId,
      ...metadata
    }
  });

  const updated = await reviewQueueRepository.updateReviewEntry(reviewId, {
    status: "approved",
    reviewedAt: new Date().toISOString(),
    reviewedBy: overrides.reviewedBy || "manual_reviewer",
    orderId: order.id
  });

  // Auto-generate a quote now that a human has resolved the intake issue;
  // quoteService sends the PDF/email itself if it comes out approved.
  let quoteResult = null;
  try {
    quoteResult = await quoteService.generateQuote(order.id);
  } catch (error) {
    console.error("Automatic quote generation failed after review approval:", error.message);
  }

  return { order, reviewEntry: updated, quoteResult };
}

/**
 * Reject a review entry: no order is created.
 * @param {string} reviewId
 * @param {string} [notes]
 */
async function rejectReviewEntry(reviewId, notes) {
  const entry = await getReviewEntry(reviewId);
  if (entry.status !== "pending") {
    throw badRequest(`Review entry ${reviewId} has already been ${entry.status}`);
  }

  return reviewQueueRepository.updateReviewEntry(reviewId, {
    status: "rejected",
    reviewedAt: new Date().toISOString(),
    reviewedBy: "manual_reviewer",
    reviewNotes: notes || null
  });
}

/**
 * Resolve a customer_query ticket -- e.g. after a human has replied to the
 * customer's question directly. Unlike approve/reject, this never creates
 * an order: for these tickets the order already exists (the ticket was
 * raised from a reply to a quote already sent for it).
 * @param {string} reviewId
 * @param {string} [notes]
 */
async function resolveCustomerQuery(reviewId, notes) {
  const entry = await getReviewEntry(reviewId);
  if (entry.status !== "pending") {
    throw badRequest(`Review entry ${reviewId} has already been ${entry.status}`);
  }

  return reviewQueueRepository.updateReviewEntry(reviewId, {
    status: "resolved",
    reviewedAt: new Date().toISOString(),
    reviewedBy: "manual_reviewer",
    reviewNotes: notes || null
  });
}

/**
 * Retry/force delivery for an approved entry's order. Approving an entry
 * already auto-generates (and, if approved, auto-sends) a quote, so this is
 * for retrying a failed send or generating one if that step didn't run.
 * @param {string} reviewId
 */
async function sendNow(reviewId) {
  const entry = await getReviewEntry(reviewId);
  if (entry.status !== "approved" || !entry.orderId) {
    throw badRequest("Review entry must be approved (with an order) before it can be sent");
  }

  const existingQuotes = await quoteService.listQuotesForOrder(entry.orderId);
  if (existingQuotes.length === 0) {
    const quoteResult = await quoteService.generateQuote(entry.orderId);
    return { quote: quoteResult.quote, delivery: quoteResult.delivery };
  }

  const quote = existingQuotes[0];
  const delivery = await deliveryService.sendQuotePdf(entry.orderId, quote.id);
  return { quote, delivery };
}

module.exports = {
  listReviewQueue,
  getReviewEntry,
  approveReviewEntry,
  rejectReviewEntry,
  resolveCustomerQuery,
  sendNow
};
